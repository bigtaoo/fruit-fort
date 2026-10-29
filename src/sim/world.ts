// The whole run: state, player commands and the fixed 30 Hz step. No rendering here, so the
// same code runs in the browser, in tests and in the headless bot.

import { CARD, CORNER_ORDER, BEES, DEFAULT_DECK, DT, ECON, ENEMIES, FEED, HAPPENINGS, HERO, HEROES, HP_GROWTH, JUICE, LEVEL_CAP, LOCUST, META, MOLD, CORNER_WAVES, REVIVE, WALL_HP, WAVES } from './config';
import { cardPool, type CardDef } from './cards';
import { EDGE_CELLS, HERO_CELL, TRAY, approach } from './board';
import { damageEnemy, fruitDamage, heroShoot, mergeBurst, stepEnemies, stepFruits, stepProjectiles } from './combat';
import { Prng } from './rng';
import { planWave, type Spawn } from './waves';
import type { Boost, Enemy, EnemyKind, Fruit, FruitKind, Happening, HeroKind, Projectile, SimEvent } from './types';

/** Exp a fruit of this level is worth, and what it takes to grow out of it: 1, 2, 4, 8... */
export function fruitValue(level: number): number {
  return Math.pow(2, level - 1);
}

/** Out-of-run levels the run starts with (§11). Missing fields mean level 1 / no upgrade. */
export interface MetaBonus {
  fruitLv?: Partial<Record<FruitKind, number>>;
  heroLv?: number;
  /** Village upgrades: wall, start gold, earlier corners. */
  wall?: number;
  gold?: number;
  corner?: number;
}

/** Daily challenge rules (§11). */
export interface RunMods {
  enemySpeed?: number;
  enemyHp?: number;
  startGold?: number;
  wallMul?: number;
}

export interface WorldOptions {
  seed?: number;
  deck?: FruitKind[];
  hero?: HeroKind;
  meta?: MetaBonus;
  mods?: RunMods;
}

export class World {
  readonly deck: FruitKind[];
  readonly heroKind: HeroKind;
  readonly meta: MetaBonus;
  readonly mods: RunMods;
  tick = 0;
  time = 0;
  gold = ECON.startGold;
  wallHp = WALL_HP;
  wallMax = WALL_HP;
  cells: (Fruit | null)[] = Array(9).fill(null);
  /** The summon that found the board full, waiting to be dragged in, fed or sold. */
  tray: Fruit | null = null;
  unlocked: boolean[] = Array(9).fill(false);
  summons = 0;
  summonLevel = 1;
  /** Card picks per fruit kind. */
  boost = {} as Record<FruitKind, Boost>;
  allSpeed = 0;
  goldLv = 0;
  upgrades = 0;
  /** The three cards on offer; the sim is paused until one is chosen. */
  draft: CardDef[] | null = null;
  enemies: Enemy[] = [];
  enemyById = new Map<number, Enemy>();
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  /** Skill charge, seconds left on a lasting skill, and the bees' bite clock. */
  hero = { charge: 0, buffT: 0, biteT: 0, shotT: 0 };
  /** The random event on the field, and when the next one is due (wave, then seconds into it). */
  happening: Happening | null = null;
  nextHappening: number = HAPPENINGS.firstWave;
  happenAt = -1;
  happenings = 0;
  grabs = 0;
  wave = 0;
  waveStart = 0;
  queue: Spawn[] = [];
  kills = 0;
  merges = 0;
  feeds = 0;
  casts = 0;
  over = false;
  revived = false;
  nextId = 1;

  private spawnRng: Prng;
  private summonRng: Prng;
  private cardRng: Prng;
  private eventRng: Prng;
  private pool: CardDef[];

  constructor(opts: WorldOptions = {}) {
    const seed = opts.seed ?? 1;
    this.deck = opts.deck ?? DEFAULT_DECK;
    this.heroKind = opts.hero ?? 'farmer';
    this.meta = opts.meta ?? {};
    this.mods = opts.mods ?? {};
    this.wallMax = this.wallHp = Math.round((WALL_HP + META.wall * (this.meta.wall ?? 0)) * (this.mods.wallMul ?? 1));
    this.gold = ECON.startGold + META.gold * (this.meta.gold ?? 0) + (this.mods.startGold ?? 0);
    this.spawnRng = new Prng(seed * 2 + 1);
    this.summonRng = new Prng(seed * 2 + 2);
    this.cardRng = new Prng(seed * 7 + 3);
    this.eventRng = new Prng(seed * 11 + 5);
    this.pool = cardPool(this.deck);
    for (const k of ['strawberry', 'coconut', 'watermelon', 'grape', 'lemon'] as FruitKind[]) {
      this.boost[k] = { dmg: 0, spd: 0, rng: 0, aoe: 0, aura: 0, slow: 0 };
    }
    for (const c of EDGE_CELLS) this.unlocked[c] = true;
  }


  // ---- queries --------------------------------------------------------------------------

  summonCost(): number {
    return Math.round(ECON.summonBase * Math.pow(ECON.summonLevelMul, this.summonLevel - 1));
  }

  /** The fruit on a board cell or, for TRAY, the one in the tray. */
  fruitAt(cell: number): Fruit | null {
    return cell === TRAY ? this.tray : this.cells[cell] ?? null;
  }

  private put(cell: number, f: Fruit | null): void {
    if (cell === TRAY) this.tray = f;
    else this.cells[cell] = f;
  }

  upgradeCost(): number {
    const list = ECON.upgradeCost;
    const n = this.upgrades;
    return n < list.length ? list[n] : list[list.length - 1] + ECON.upgradeStep * (n - list.length + 1);
  }

  canUpgrade(): boolean {
    return !this.busy() && this.gold >= this.upgradeCost();
  }

  /** Gold multiplier from 金币收益 cards. */
  goldMul(): number {
    return 1 + CARD.gold * this.goldLv;
  }

  /** Game over or waiting on a card pick: no commands, no ticks. */
  busy(): boolean {
    return this.over || this.draft !== null;
  }

  sellValue(cell: number): number {
    const f = this.fruitAt(cell);
    const mul = this.heroKind === 'chef' ? JUICE.sellMul : 1;
    return f ? ECON.sellBase * (fruitValue(f.level) + f.exp) * mul : 0;
  }

  emptyCells(): number[] {
    const out: number[] = [];
    for (let c = 0; c < 9; c++) if (c !== HERO_CELL && this.unlocked[c] && !this.cells[c]) out.push(c);
    return out;
  }

  /** Somewhere for a new fruit to go: an empty cell, or else the tray. */
  hasRoom(): boolean {
    return this.emptyCells().length > 0 || !this.tray;
  }

  canSummon(): boolean {
    return !this.busy() && this.gold >= this.summonCost() && this.hasRoom();
  }

  heroReady(): boolean {
    return this.hero.charge >= HERO.chargeMax;
  }

  // ---- commands -------------------------------------------------------------------------

  summon(): boolean {
    if (!this.canSummon()) return false;
    this.gold -= this.summonCost();
    this.summons++;
    this.place(this.newFruit(this.summonRng.pick(this.deck), this.summonLevel));
    return true;
  }

  /** A new fruit into a random empty cell, or the tray when the board is full. */
  private place(f: Fruit): number {
    const empty = this.emptyCells();
    const cell = empty.length > 0 ? empty[this.summonRng.int(empty.length)] : TRAY;
    this.put(cell, f);
    this.events.push({ t: 'summon', cell });
    return cell;
  }

  canMerge(from: number, to: number): boolean {
    const a = this.fruitAt(from);
    const b = this.fruitAt(to);
    return !!a && !!b && from !== to && to !== TRAY && a.kind === b.kind && a.level === b.level && a.level < LEVEL_CAP;
  }

  /** A lower fruit fed into a higher one of its kind (§4 同种喂养). */
  canFeed(from: number, to: number): boolean {
    const a = this.fruitAt(from);
    const b = this.fruitAt(to);
    return !!a && !!b && from !== to && to !== TRAY && a.kind === b.kind && a.level < b.level && b.level < LEVEL_CAP;
  }

  /**
   * Drag a fruit onto another cell: merge with a twin, feed a bigger one of its kind, move into
   * an empty cell, or swap. The tray works as a cell here, except nothing merges into it.
   */
  drop(from: number, to: number): boolean {
    if (this.busy() || from === to || to === HERO_CELL) return false;
    if (to !== TRAY && !this.unlocked[to]) return false;
    const a = this.fruitAt(from);
    if (!a) return false;
    const b = this.fruitAt(to);
    const merge = this.canMerge(from, to);
    if (merge || this.canFeed(from, to)) {
      const was = b!.level;
      this.put(from, null);
      this.absorb(b!, (fruitValue(a.level) + a.exp) * (merge ? 1 : FEED.share));
      const up = b!.level > was;
      if (merge) {
        this.merges++;
        this.events.push({ t: 'merge', cell: to, level: b!.level });
      } else {
        this.feeds++;
        this.events.push({ t: 'feed', cell: to, level: b!.level, up });
      }
      // A level gained bursts at the new level; a feed that only fills the bar bursts at the eaten fruit's.
      mergeBurst(this, to, up ? b! : a);
      return true;
    }
    this.put(to, a);
    this.put(from, b);
    this.events.push({ t: 'move', from, to });
    return true;
  }

  /** Add exp to a fruit and level it up as far as it goes; exp past the cap is lost. */
  private absorb(f: Fruit, exp: number): void {
    f.exp += exp;
    while (f.level < LEVEL_CAP && f.exp >= fruitValue(f.level)) {
      f.exp -= fruitValue(f.level);
      f.level++;
    }
    if (f.level >= LEVEL_CAP) f.exp = 0;
  }

  sell(cell: number): boolean {
    if (this.busy() || !this.fruitAt(cell)) return false;
    const gold = this.sellValue(cell);
    this.gold += gold;
    this.put(cell, null);
    this.events.push({ t: 'sell', cell, gold });
    return true;
  }

  /** The player tapped the event on the field: gold for the bug, a free summon from the basket. */
  grab(): boolean {
    const h = this.happening;
    if (this.busy() || !h) return false;
    this.happening = null;
    this.grabs++;
    let gold = 0;
    let cell = -1;
    if (h.kind === 'bug') gold = Math.round((HAPPENINGS.bug.gold + HAPPENINGS.bug.goldPerWave * this.wave) * this.goldMul());
    else if (this.hasRoom()) cell = this.place(this.newFruit(this.summonRng.pick(this.deck), this.summonLevel));
    // Nowhere to put the basket's fruit: it pays out the summon's price instead.
    else gold = this.summonCost();
    this.gold += gold;
    this.events.push({ t: 'grab', kind: h.kind, x: h.x, z: h.z, gold, cell });
    return true;
  }

  /** Pay for 强化 and deal three different cards, weighted; the run pauses until choose(). */
  upgrade(): boolean {
    if (!this.canUpgrade()) return false;
    this.gold -= this.upgradeCost();
    this.upgrades++;
    const left = this.pool.filter((c) => !c.ok || c.ok(this));
    const hand: CardDef[] = [];
    while (hand.length < CARD.choices && left.length > 0) {
      let roll = this.cardRng.float() * left.reduce((s, c) => s + c.weight, 0);
      let i = 0;
      while (i < left.length - 1 && (roll -= left[i].weight) >= 0) i++;
      hand.push(left.splice(i, 1)[0]);
    }
    this.draft = hand;
    return true;
  }

  choose(index: number): boolean {
    const card = this.draft?.[index];
    if (!card) return false;
    card.apply(this);
    this.draft = null;
    this.events.push({ t: 'card', id: card.id });
    return true;
  }

  cast(): boolean {
    if (this.busy() || !this.heroReady()) return false;
    if (this.heroKind === 'chef' && !this.juice()) return false;
    this.hero.charge = 0;
    this.hero.buffT = HEROES[this.heroKind].time;
    this.hero.biteT = 0;
    this.casts++;
    this.events.push({ t: 'cast' });
    return true;
  }

  /** The fruits 榨汁 would eat: the lowest levels, the earliest cell first on a tie. */
  juiceCells(): number[] {
    const cells = [...Array(9).keys()].filter((c) => this.cells[c]);
    cells.sort((a, b) => this.cells[a]!.level - this.cells[b]!.level || a - b);
    return cells.slice(0, JUICE.eat);
  }

  /** Chef: eat the lowest fruits and hit every enemy with their juice. False if there are too few. */
  private juice(): boolean {
    const eat = this.juiceCells();
    if (eat.length < JUICE.eat) return false;
    let dmg = 0;
    for (const c of eat) {
      dmg += fruitDamage(this, this.cells[c]!) * JUICE.mul;
      this.cells[c] = null;
    }
    for (const e of this.enemies) damageEnemy(e, dmg);
    this.events.push({ t: 'juice', cells: eat });
    return true;
  }

  /** Once per run after the wall falls: wall back to half, the enemies at it blown away. */
  revive(): boolean {
    if (!this.over || this.revived) return false;
    this.revived = true;
    this.over = false;
    this.wallHp = this.wallMax * REVIVE.wall;
    // Blown away, not killed: no gold or charge for them.
    for (const e of this.enemies) if (e.d <= REVIVE.clear && e.kind !== 'boss') this.enemyById.delete(e.id);
    this.enemies = this.enemies.filter((e) => this.enemyById.has(e.id));
    this.events.push({ t: 'revive' });
    return true;
  }

  // ---- step -----------------------------------------------------------------------------

  step(): void {
    if (this.busy()) return;
    this.tick++;
    this.time += DT;
    this.stepWaves();
    stepEnemies(this);
    stepFruits(this);
    stepProjectiles(this);
    this.stepTricks();
    this.reap();
    this.stepHero();
    this.stepHappening();
    if (this.wallHp <= 0) {
      this.wallHp = 0;
      this.over = true;
      this.events.push({ t: 'over' });
    }
  }

  private stepHero(): void {
    const h = this.hero;
    if ((h.shotT -= DT) <= 0) h.shotT = heroShoot(this) ? HERO.interval : 0;
    // A full charge waits for the player; it never casts on its own.
    if (h.buffT <= 0) return;
    h.buffT = Math.max(0, h.buffT - DT);
    if (this.heroKind !== 'beekeeper' || (h.biteT -= DT) > 0) return;
    h.biteT += BEES.every;
    // The bees go for whatever is closest to the wall, chewing ones first.
    const near = this.enemies.filter((e) => e.hp > 0).sort((a, b) => a.d - b.d || a.id - b.id);
    for (const e of near.slice(0, BEES.targets)) {
      e.hp -= e.maxHp * (e.kind === 'boss' ? BEES.bossBite : BEES.bite);
      this.events.push({ t: 'bite', x: e.x, z: e.z });
    }
  }

  /** Bring on the wave's event when it is due, fly the bug round, let an untapped one go. */
  private stepHappening(): void {
    const h = this.happening;
    if (h) {
      h.t -= DT;
      if (h.kind === 'bug') {
        const r = Math.hypot(h.x, h.z);
        h.angle += (h.turn * HAPPENINGS.bug.speed * DT) * Math.PI / 2;
        h.x = Math.cos(h.angle) * r;
        h.z = Math.sin(h.angle) * r;
      }
      if (h.t <= 0) {
        this.happening = null;
        this.events.push({ t: 'escape', kind: h.kind });
      }
      return;
    }
    if (this.happenAt < 0 || this.time - this.waveStart < this.happenAt) return;
    this.happenAt = -1;
    // Never while a boss is on the field: the player's hands are full.
    if (this.enemies.some((e) => e.kind === 'boss')) return;
    const rng = this.eventRng;
    const kind = rng.float() < HAPPENINGS.basketShare ? 'basket' : 'bug';
    const angle = rng.float() * Math.PI * 2;
    const [r0, r1] = HAPPENINGS.bug.radius;
    const r = kind === 'bug' ? r0 + rng.float() * (r1 - r0) : HAPPENINGS.basket.radius;
    this.happening = {
      id: this.nextId++, kind, x: Math.cos(angle) * r, z: Math.sin(angle) * r,
      t: kind === 'bug' ? HAPPENINGS.bug.life : HAPPENINGS.basket.life, angle, turn: rng.float() < 0.5 ? -1 : 1,
    };
    this.happenings++;
    this.events.push({ t: 'happen', kind });
  }

  /** At a wave's start: if an event is due and the wave has no boss, pick when it comes. */
  private planHappening(boss: boolean): void {
    if (this.wave < this.nextHappening || boss) return;
    const [g0, g1] = HAPPENINGS.gap;
    const [d0, d1] = HAPPENINGS.delay;
    this.nextHappening = this.wave + g0 + this.eventRng.int(g1 - g0 + 1);
    this.happenAt = d0 + this.eventRng.float() * (d1 - d0);
  }

  private stepWaves(): void {
    const t = this.time - this.waveStart;
    while (this.queue.length > 0 && this.queue[0].at <= t) this.spawn(this.queue.shift()!);
    if (this.queue.length > 0) return;
    if (this.wave === 0 && this.time < WAVES.firstDelay) return;
    if (this.enemies.some((e) => e.kind === 'boss')) return;
    if (this.wave > 0 && this.enemies.length > WAVES.callAt) return;
    this.wave++;
    this.waveStart = this.time;
    if (this.wave > 1) this.gold += (ECON.waveBonusBase + this.wave) * this.goldMul();
    const early = META.corner * (this.meta.corner ?? 0);
    const k = CORNER_WAVES.findIndex((w) => Math.max(1, w - early) === this.wave);
    if (k >= 0) {
      this.unlocked[CORNER_ORDER[k]] = true;
      this.events.push({ t: 'unlock', cell: CORNER_ORDER[k] });
    }
    this.queue = planWave(this.wave, this.spawnRng);
    const boss = this.queue.some((s) => s.kind === 'boss');
    this.planHappening(boss);
    this.events.push({ t: 'wave', wave: this.wave, boss });
  }

  private spawn(s: Spawn): void {
    const p = approach(s.angle);
    const e = this.addEnemy(s.kind, p.x, p.z, p.dirX, p.dirZ, p.d, ENEMIES[s.kind].hp * Math.pow(HP_GROWTH, this.wave - 1) * (this.mods.enemyHp ?? 1));
    if (s.kind === 'boss') e.trickT = LOCUST.every;
  }

  /** Put an enemy on the field walking towards the centre, `d` short of the wall. */
  addEnemy(kind: EnemyKind, x: number, z: number, dirX: number, dirZ: number, d: number, hp: number): Enemy {
    const def = ENEMIES[kind];
    const e: Enemy = {
      id: this.nextId++, kind, dirX, dirZ, x, z, px: x, pz: z,
      hp, maxHp: hp, speed: def.speed * (this.mods.enemySpeed ?? 1), armor: def.armor, flying: def.flying,
      d, slowMul: 1, slowT: 0, corrode: 0, corrodeT: 0, poison: 0, poisonT: 0, trickT: 0,
    };
    this.enemies.push(e);
    this.enemyById.set(e.id, e);
    return e;
  }

  /** Same line as the parent, `back` further out, so children follow it in to the wall. */
  private addBehind(kind: EnemyKind, p: Enemy, back: number, side: number, hp: number): Enemy {
    // Sideways shift is perpendicular to the walk, so it barely changes the distance to the wall.
    const x = p.x - p.dirX * back - p.dirZ * side;
    const z = p.z - p.dirZ * back + p.dirX * side;
    const len = Math.hypot(x, z);
    return this.addEnemy(kind, x, z, -x / len, -z / len, p.d + back, hp);
  }

  /** The locust king calls a swarm from where it stands. */
  private stepTricks(): void {
    for (const e of [...this.enemies]) {
      if (e.kind !== 'boss' || e.hp <= 0 || (e.trickT -= DT) > 0) continue;
      e.trickT = LOCUST.every;
      for (let i = 0; i < LOCUST.count; i++) {
        const side = (i - (LOCUST.count - 1) / 2) * LOCUST.spread;
        this.addBehind('locust', e, 0, side, e.maxHp * LOCUST.hpShare);
      }
      this.events.push({ t: 'trick', x: e.x, z: e.z });
    }
  }

  private reap(): void {
    if (!this.enemies.some((e) => e.hp <= 0)) return;
    const alive: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.hp > 0) {
        alive.push(e);
        continue;
      }
      const def = ENEMIES[e.kind];
      this.gold += def.gold * this.goldMul();
      this.kills++;
      this.hero.charge = Math.min(HERO.chargeMax, this.hero.charge + def.charge * (1 + META.heroCharge * ((this.meta.heroLv ?? 1) - 1)));
      this.enemyById.delete(e.id);
      this.events.push({ t: 'kill', x: e.x, z: e.z, kind: e.kind, gold: def.gold });
    }
    const dead = this.enemies.filter((e) => e.hp <= 0 && e.kind === 'mold');
    this.enemies = alive;
    for (const m of dead) {
      for (let i = 0; i < MOLD.spores; i++) {
        const side = (i - (MOLD.spores - 1) / 2) * MOLD.spacing;
        this.addBehind('spore', m, 0, side, m.maxHp * MOLD.hpShare);
      }
    }
  }

  newFruit(kind: FruitKind, level: number): Fruit {
    return { id: this.nextId++, kind, level, exp: 0, cooldown: 0 };
  }
}
