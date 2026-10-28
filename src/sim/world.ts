// The whole run: state, player commands and the fixed 30 Hz step. No rendering here, so the
// same code runs in the browser, in tests and in the headless bot.

import { CARD, CORNER_ORDER, DEFAULT_DECK, DT, ECON, ENEMIES, HERO, HP_GROWTH, LEVEL_CAP, UNLOCK_EVERY, WALL_HP, WAVES } from './config';
import { cardPool, type CardDef } from './cards';
import { EDGE_CELLS, HERO_CELL, approach } from './board';
import { mergeBurst, stepEnemies, stepFruits, stepProjectiles } from './combat';
import { Prng } from './rng';
import { planWave, type Spawn } from './waves';
import type { Boost, Enemy, Fruit, FruitKind, Projectile, SimEvent } from './types';

export interface WorldOptions {
  seed?: number;
  deck?: FruitKind[];
}

export class World {
  readonly deck: FruitKind[];
  tick = 0;
  time = 0;
  gold = ECON.startGold;
  wallHp = WALL_HP;
  wallMax = WALL_HP;
  cells: (Fruit | null)[] = Array(9).fill(null);
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
  hero = { charge: 0, fullFor: 0, buffT: 0 };
  wave = 0;
  waveStart = 0;
  queue: Spawn[] = [];
  kills = 0;
  over = false;
  nextId = 1;

  private spawnRng: Prng;
  private summonRng: Prng;
  private cardRng: Prng;
  private pool: CardDef[];

  constructor(opts: WorldOptions = {}) {
    const seed = opts.seed ?? 1;
    this.deck = opts.deck ?? DEFAULT_DECK;
    this.spawnRng = new Prng(seed * 2 + 1);
    this.summonRng = new Prng(seed * 2 + 2);
    this.cardRng = new Prng(seed * 7 + 3);
    this.pool = cardPool(this.deck);
    for (const k of ['strawberry', 'coconut', 'watermelon', 'grape', 'lemon'] as FruitKind[]) {
      this.boost[k] = { dmg: 0, spd: 0, rng: 0, aoe: 0, aura: 0, slow: 0 };
    }
    for (const c of EDGE_CELLS) this.unlocked[c] = true;
  }


  // ---- queries --------------------------------------------------------------------------

  summonCost(): number {
    const base = ECON.summonBase + ECON.summonStep * this.summons;
    return Math.round(base * Math.pow(ECON.summonLevelMul, this.summonLevel - 1));
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
    const f = this.cells[cell];
    return f ? ECON.sellBase * Math.pow(2, f.level - 1) : 0;
  }

  emptyCells(): number[] {
    const out: number[] = [];
    for (let c = 0; c < 9; c++) if (c !== HERO_CELL && this.unlocked[c] && !this.cells[c]) out.push(c);
    return out;
  }

  canSummon(): boolean {
    return !this.busy() && this.gold >= this.summonCost() && this.emptyCells().length > 0;
  }

  heroReady(): boolean {
    return this.hero.charge >= HERO.chargeMax;
  }

  // ---- commands -------------------------------------------------------------------------

  summon(): boolean {
    if (!this.canSummon()) return false;
    this.gold -= this.summonCost();
    const empty = this.emptyCells();
    const cell = empty[this.summonRng.int(empty.length)];
    this.cells[cell] = this.newFruit(this.summonRng.pick(this.deck), this.summonLevel);
    this.summons++;
    this.events.push({ t: 'summon', cell });
    if (this.summons % UNLOCK_EVERY === 0) {
      const corner = CORNER_ORDER.find((c) => !this.unlocked[c]);
      if (corner !== undefined) {
        this.unlocked[corner] = true;
        this.events.push({ t: 'unlock', cell: corner });
      }
    }
    return true;
  }

  canMerge(from: number, to: number): boolean {
    const a = this.cells[from];
    const b = this.cells[to];
    return !!a && !!b && from !== to && a.kind === b.kind && a.level === b.level && a.level < LEVEL_CAP;
  }

  /** Drag a fruit onto another cell: merge with a twin, move into an empty cell, or swap. */
  drop(from: number, to: number): boolean {
    if (this.busy() || from === to || to === HERO_CELL || !this.unlocked[to]) return false;
    const a = this.cells[from];
    if (!a) return false;
    const b = this.cells[to];
    if (this.canMerge(from, to)) {
      b!.level++;
      this.cells[from] = null;
      this.events.push({ t: 'merge', cell: to, level: b!.level });
      mergeBurst(this, to, b!);
      return true;
    }
    this.cells[to] = a;
    this.cells[from] = b;
    this.events.push({ t: 'move', from, to });
    return true;
  }

  sell(cell: number): boolean {
    if (this.busy() || !this.cells[cell]) return false;
    const gold = this.sellValue(cell);
    this.gold += gold;
    this.cells[cell] = null;
    this.events.push({ t: 'sell', cell, gold });
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
    this.hero.charge = 0;
    this.hero.fullFor = 0;
    this.hero.buffT = HERO.buffTime;
    this.events.push({ t: 'cast' });
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
    this.reap();
    this.stepHero();
    if (this.wallHp <= 0) {
      this.wallHp = 0;
      this.over = true;
      this.events.push({ t: 'over' });
    }
  }

  private stepHero(): void {
    const h = this.hero;
    if (h.buffT > 0) h.buffT = Math.max(0, h.buffT - DT);
    if (this.heroReady()) {
      h.fullFor += DT;
      if (h.fullFor >= HERO.autoCastAfter) this.cast();
    }
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
    this.queue = planWave(this.wave, this.spawnRng);
    this.events.push({ t: 'wave', wave: this.wave, boss: this.queue.some((s) => s.kind === 'boss') });
  }

  private spawn(s: Spawn): void {
    const def = ENEMIES[s.kind];
    const p = approach(s.angle);
    const hp = def.hp * Math.pow(HP_GROWTH, this.wave - 1);
    const e: Enemy = {
      id: this.nextId++, kind: s.kind, dirX: p.dirX, dirZ: p.dirZ, x: p.x, z: p.z, px: p.x, pz: p.z,
      hp, maxHp: hp, speed: def.speed, armor: def.armor, flying: def.flying,
      d: p.d, slowMul: 1, slowT: 0, corrode: 0, corrodeT: 0,
    };
    this.enemies.push(e);
    this.enemyById.set(e.id, e);
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
      this.hero.charge = Math.min(HERO.chargeMax, this.hero.charge + def.charge);
      this.enemyById.delete(e.id);
      this.events.push({ t: 'kill', x: e.x, z: e.z, kind: e.kind, gold: def.gold });
    }
    this.enemies = alive;
  }

  newFruit(kind: FruitKind, level: number): Fruit {
    return { id: this.nextId++, kind, level, cooldown: 0 };
  }
}
