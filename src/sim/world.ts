// The whole run: state, player commands and the fixed 30 Hz step. No rendering here, so the
// same code runs in the browser, in tests and in the headless bot.

import { BEES, DT, ECON, ENEMIES, HAPPENINGS, HERO, HEROES, HP_GROWTH, JUICE, LOCUST, META, MOLD, REVIVE, STATS, STAT_KEYS, TRAIN, WALL_HP, WAVES } from './config';
import { approach, arcGap, trackPoint } from './board';
import { damageEnemy, killCharge, stepEnemies, stepProjectiles, stepTrain, trainDamage } from './combat';
import { Prng } from './rng';
import { planWave, type Spawn } from './waves';
import { levelMods, starsFor, type LevelDef } from './levels';
import type { Enemy, EnemyKind, Happening, HeroKind, Projectile, SimEvent, StatKey } from './types';

/** Out-of-run levels the run starts with (§11). Missing fields mean level 1 / no upgrade. */
export interface MetaBonus {
  /** Training: stat levels the run starts with (capped by the stat's max). */
  statLv?: Partial<Record<StatKey, number>>;
  heroLv?: number;
  /** Village upgrades: wall, start gold. */
  wall?: number;
  gold?: number;
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
  hero?: HeroKind;
  meta?: MetaBonus;
  mods?: RunMods;
  /** Play this level (§9.1) instead of an endless run. */
  level?: LevelDef;
}

export class World {
  readonly heroKind: HeroKind;
  readonly meta: MetaBonus;
  readonly mods: RunMods;
  readonly level: LevelDef | null;
  tick = 0;
  time = 0;
  gold = ECON.startGold;
  wallHp = WALL_HP;
  wallMax = WALL_HP;
  /** The hero's train on the ring: angle in radians (unbounded, so it interpolates), last tick's, direction, gun cooldown. */
  train = { angle: Math.PI / 2, prev: Math.PI / 2, dir: 1 as 1 | -1, shotT: 0 };
  /** Stat levels bought this run. */
  lv: Record<StatKey, number> = { dmg: 0, spd: 0, crit: 0, multi: 0, range: 0, move: 0, gold: 0, wall: 0 };
  buys = 0;
  reverses = 0;
  enemies: Enemy[] = [];
  enemyById = new Map<number, Enemy>();
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  /** Skill charge, seconds left on a lasting skill, and the bees' bite clock. */
  hero = { charge: 0, buffT: 0, biteT: 0 };
  /** The random event on the track, and when the next one is due (wave, then seconds into it). */
  happening: Happening | null = null;
  nextHappening: number = HAPPENINGS.firstWave;
  happenAt = -1;
  happenings = 0;
  grabs = 0;
  wave = 0;
  waveStart = 0;
  queue: Spawn[] = [];
  kills = 0;
  casts = 0;
  over = false;
  /** A level whose last wave was cleared; `over` is set too. */
  won = false;
  revived = false;
  nextId = 1;

  readonly critRng: Prng;
  private spawnRng: Prng;
  private eventRng: Prng;

  constructor(opts: WorldOptions = {}) {
    const seed = opts.seed ?? 1;
    this.heroKind = opts.hero ?? 'farmer';
    this.meta = opts.meta ?? {};
    this.level = opts.level ?? null;
    this.mods = { ...(this.level ? levelMods(this.level) : {}), ...opts.mods };
    for (const k of STAT_KEYS) this.lv[k] = Math.min(this.meta.statLv?.[k] ?? 0, STATS[k].max ?? Infinity);
    this.wallMax = this.wallHp = Math.round((WALL_HP + META.wall * (this.meta.wall ?? 0) + STATS.wall.per * this.lv.wall) * (this.mods.wallMul ?? 1));
    this.gold = ECON.startGold + META.gold * (this.meta.gold ?? 0) + (this.mods.startGold ?? 0);
    this.spawnRng = new Prng(seed * 2 + 1);
    this.critRng = new Prng(seed * 2 + 2);
    this.eventRng = new Prng(seed * 11 + 5);
  }

  // ---- queries --------------------------------------------------------------------------

  statCost(k: StatKey): number {
    const def = STATS[k];
    const off = this.heroKind === 'chef' ? 1 - JUICE.discount : 1;
    return Math.round(def.cost * Math.pow(def.growth, this.lv[k]) * off);
  }

  maxed(k: StatKey): boolean {
    const max = STATS[k].max;
    return max !== undefined && this.lv[k] >= max;
  }

  canBuy(k: StatKey): boolean {
    return !this.over && !this.maxed(k) && this.gold >= this.statCost(k);
  }

  /** Gold multiplier from the gold stat. */
  goldMul(): number {
    return 1 + STATS.gold.per * this.lv.gold;
  }

  /** Game over: no commands, no ticks. */
  busy(): boolean {
    return this.over;
  }

  /** Stars for a won level, from the fence left (§9.1); 0 otherwise. */
  stars(): number {
    return this.won ? starsFor(this.wallHp / this.wallMax) : 0;
  }

  heroReady(): boolean {
    return this.hero.charge >= HERO.chargeMax;
  }

  trainPos(): { x: number; z: number } {
    return trackPoint(this.train.angle);
  }

  // ---- commands -------------------------------------------------------------------------

  buy(k: StatKey): boolean {
    if (!this.canBuy(k)) return false;
    this.gold -= this.statCost(k);
    this.buys++;
    this.levelUp(k);
    return true;
  }

  private levelUp(k: StatKey): void {
    this.lv[k]++;
    if (k === 'wall') {
      this.wallMax += STATS.wall.per;
      this.wallHp = Math.min(this.wallMax, this.wallHp + STATS.wall.per);
    }
    this.events.push({ t: 'buy', stat: k, level: this.lv[k] });
  }

  /** Turn the train round. */
  reverse(): boolean {
    if (this.busy()) return false;
    this.train.dir = this.train.dir === 1 ? -1 : 1;
    this.reverses++;
    this.events.push({ t: 'reverse' });
    return true;
  }

  cast(): boolean {
    if (this.busy() || !this.heroReady()) return false;
    this.hero.charge = 0;
    this.hero.buffT = HEROES[this.heroKind].time;
    this.hero.biteT = 0;
    this.casts++;
    if (this.heroKind === 'chef') this.juice();
    this.events.push({ t: 'cast' });
    return true;
  }

  /** Chef: hit every enemy with a big splash of juice. */
  private juice(): void {
    const dmg = trainDamage(this) * JUICE.mul;
    for (const e of this.enemies) damageEnemy(e, dmg);
    this.events.push({ t: 'juice' });
  }

  /** Once per run after the wall falls: wall back to half, the enemies at it blown away. */
  revive(): boolean {
    if (!this.over || this.revived || this.won) return false;
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
    stepTrain(this);
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

  /** Bring on the wave's event when it is due, crawl the bug along, let the train pick it up. */
  private stepHappening(): void {
    const h = this.happening;
    if (h) {
      h.t -= DT;
      if (h.kind === 'bug') {
        h.angle += h.turn * HAPPENINGS.bug.speed * DT;
        const p = trackPoint(h.angle);
        h.x = p.x;
        h.z = p.z;
      }
      if (arcGap(h.angle, this.train.angle) * TRAIN.radius <= TRAIN.pickup) this.grab(h);
      else if (h.t <= 0) {
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
    // Somewhere on the far half of the ring from the train, so getting there takes a choice.
    const angle = this.train.angle + Math.PI * (0.5 + rng.float());
    const p = trackPoint(angle);
    this.happening = {
      id: this.nextId++, kind, x: p.x, z: p.z,
      t: kind === 'bug' ? HAPPENINGS.bug.life : HAPPENINGS.basket.life, angle, turn: rng.float() < 0.5 ? -1 : 1,
    };
    this.happenings++;
    this.events.push({ t: 'happen', kind });
  }

  /** The train drove through the event: gold for the bug, a free stat level from the basket. */
  private grab(h: Happening): void {
    this.happening = null;
    this.grabs++;
    let gold = 0;
    let stat: StatKey | null = null;
    if (h.kind === 'bug') {
      gold = Math.round((HAPPENINGS.bug.gold + HAPPENINGS.bug.goldPerWave * this.wave) * this.goldMul());
      this.gold += gold;
    } else {
      stat = this.eventRng.pick(STAT_KEYS.filter((k) => !this.maxed(k)));
      this.levelUp(stat);
    }
    this.events.push({ t: 'grab', kind: h.kind, x: h.x, z: h.z, gold, stat });
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
    const lv = this.level;
    if (lv && this.wave >= lv.waves) {
      // The last wave: the level is won once the field is clear, swarms and spores too.
      if (this.enemies.length > 0) return;
      this.won = this.over = true;
      this.happening = null;
      this.events.push({ t: 'win' });
      return;
    }
    this.wave++;
    this.waveStart = this.time;
    if (this.wave > 1) this.gold += (ECON.waveBonusBase + this.wave) * this.goldMul();
    this.queue = planWave(this.wave, this.spawnRng, lv ? { pool: lv.pool, fronts: lv.fronts, boss: this.wave === lv.waves } : {});
    const boss = this.queue.some((s) => s.kind === 'boss');
    this.planHappening(boss);
    this.events.push({ t: 'wave', wave: this.wave, boss });
  }

  private spawn(s: Spawn): void {
    const p = approach(s.angle);
    const e = this.addEnemy(s.kind, p.x, p.z, p.dirX, p.dirZ, p.d, ENEMIES[s.kind].hp * Math.pow(HP_GROWTH, this.wave - 1) * (this.mods.enemyHp ?? 1) * (this.level?.hp ?? 1));
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
      this.hero.charge = Math.min(HERO.chargeMax, this.hero.charge + killCharge(this, e));
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
}
