// The whole run: state, player commands and the fixed 30 Hz step. No rendering here, so the
// same code runs in the browser, in tests and in the headless bot.

import { CORNER_ORDER, DEFAULT_DECK, DT, ECON, ENEMIES, HERO, HP_GROWTH, LEVEL_CAP, UNLOCK_EVERY, WALL_HP, WAVES } from './config';
import { EDGE_CELLS, HERO_CELL, approach } from './board';
import { mergeBurst, stepEnemies, stepFruits, stepProjectiles } from './combat';
import { Prng } from './rng';
import { planWave, type Spawn } from './waves';
import type { Enemy, Fruit, FruitKind, Projectile, SimEvent } from './types';

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
  wallBuys = 0;
  cells: (Fruit | null)[] = Array(9).fill(null);
  unlocked: boolean[] = Array(9).fill(false);
  summons = 0;
  summonLevel = 1;
  power: Record<FruitKind, number> = { strawberry: 0, coconut: 0, watermelon: 0, grape: 0, lemon: 0 };
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

  constructor(opts: WorldOptions = {}) {
    const seed = opts.seed ?? 1;
    this.deck = opts.deck ?? DEFAULT_DECK;
    this.spawnRng = new Prng(seed * 2 + 1);
    this.summonRng = new Prng(seed * 2 + 2);
    for (const c of EDGE_CELLS) this.unlocked[c] = true;
  }


  // ---- queries --------------------------------------------------------------------------

  summonCost(): number {
    return ECON.summonBase + ECON.summonStep * this.summons;
  }

  summonLevelCost(): number | null {
    return ECON.summonLevelCost[this.summonLevel - 1] ?? null;
  }

  powerCost(kind: FruitKind): number {
    return Math.round(ECON.powerBase * Math.pow(ECON.powerGrowth, this.power[kind]));
  }

  wallCost(): number {
    return Math.round(ECON.wallBase * Math.pow(ECON.wallGrowth, this.wallBuys));
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
    return !this.over && this.gold >= this.summonCost() && this.emptyCells().length > 0;
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
    if (this.over || from === to || to === HERO_CELL || !this.unlocked[to]) return false;
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
    if (this.over || !this.cells[cell]) return false;
    const gold = this.sellValue(cell);
    this.gold += gold;
    this.cells[cell] = null;
    this.events.push({ t: 'sell', cell, gold });
    return true;
  }

  buySummonLevel(): boolean {
    const cost = this.summonLevelCost();
    if (this.over || cost === null || this.gold < cost) return false;
    this.gold -= cost;
    this.summonLevel++;
    return true;
  }

  buyPower(kind: FruitKind): boolean {
    const cost = this.powerCost(kind);
    if (this.over || !this.deck.includes(kind) || this.gold < cost) return false;
    this.gold -= cost;
    this.power[kind]++;
    return true;
  }

  buyWall(): boolean {
    const cost = this.wallCost();
    if (this.over || this.gold < cost) return false;
    this.gold -= cost;
    this.wallBuys++;
    this.wallMax += ECON.wallAdd;
    this.wallHp = this.wallMax;
    return true;
  }

  cast(): boolean {
    if (this.over || !this.heroReady()) return false;
    this.hero.charge = 0;
    this.hero.fullFor = 0;
    this.hero.buffT = HERO.buffTime;
    this.events.push({ t: 'cast' });
    return true;
  }

  // ---- step -----------------------------------------------------------------------------

  step(): void {
    if (this.over) return;
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
    if (this.wave > 1) this.gold += ECON.waveBonusBase + this.wave;
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
      this.gold += def.gold;
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
