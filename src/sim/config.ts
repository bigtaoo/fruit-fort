// Balance numbers and unit definitions. Grey-box values for M1; the sim and bot read only these.

import type { EnemyKind, FruitKind } from './types';

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

// Geometry, in world units. The 3x3 fort is centred on the origin; cell (r, c) sits at
// x = (c - 1) * CELL, z = (r - 1) * CELL. North is -z, east is +x.
export const CELL = 2;
/** Where walking enemies stop and start chewing the wall (half side of the square). */
export const WALL = 3.6;
/** Spawn radius along z and along x: off-screen in a landscape view, so the x sides are farther. */
export const SPAWN_NEAR = 12;
export const SPAWN_FAR = 15;

// Mid reaches the whole wall from any edge cell (enemies come from any angle); short covers its own
// side of the wall, corners included, so where a coconut stands still matters.
export const RANGE = { short: 4.2, mid: 7, long: 8 } as const;

export const LEVEL_CAP = 7;
export const LEVEL_DAMAGE_MUL = 2.1;
export const POWER_STEP = 0.25;

export interface FruitDef {
  kind: FruitKind;
  name: string;
  damage: number;
  interval: number;
  range: number;
  antiAir: boolean;
  /** Target the highest-HP enemy in range instead of the one nearest the wall. */
  heaviest?: boolean;
  splash?: number;
  splashCorner?: number;
  slow?: { mul: number; time: number };
  corrode?: { perLevel: number; time: number };
  /** Attack speed this fruit adds to adjacent fruits, at level 1 and per extra level. */
  aura?: { base: number; perLevel: number };
  color: number;
}

export const FRUITS: Record<FruitKind, FruitDef> = {
  strawberry: { kind: 'strawberry', name: '草莓', damage: 8, interval: 0.7, range: RANGE.mid, antiAir: true, color: 0xe8384f },
  coconut: { kind: 'coconut', name: '椰子', damage: 34, interval: 1.5, range: RANGE.short, antiAir: false, heaviest: true, color: 0x8a5a3b },
  watermelon: { kind: 'watermelon', name: '西瓜', damage: 13, interval: 1.3, range: RANGE.mid, antiAir: false, splash: 1.3, splashCorner: 2.0, color: 0x3fa34d },
  grape: { kind: 'grape', name: '葡萄', damage: 4, interval: 1.0, range: RANGE.mid, antiAir: true, aura: { base: 0.1, perLevel: 0.05 }, color: 0x7b3fa0 },
  lemon: { kind: 'lemon', name: '柠檬', damage: 6, interval: 1.1, range: RANGE.mid, antiAir: true, slow: { mul: 0.65, time: 2 }, corrode: { perLevel: 2, time: 3 }, color: 0xf2d230 },
};

export const DEFAULT_DECK: FruitKind[] = ['strawberry', 'coconut', 'watermelon'];

/** Strawberry seeds per volley. */
export function seedCount(level: number): number {
  return 1 + Math.floor(level / 2);
}

export interface EnemyDef {
  kind: EnemyKind;
  hp: number;
  speed: number;
  armor: number;
  flying: boolean;
  wallDps: number;
  gold: number;
  charge: number;
  size: number;
  color: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  caterpillar: { kind: 'caterpillar', hp: 26, speed: 1.1, armor: 0, flying: false, wallDps: 2, gold: 3, charge: 1, size: 0.45, color: 0xf0a030 },
  beetle: { kind: 'beetle', hp: 70, speed: 0.75, armor: 5, flying: false, wallDps: 4, gold: 5, charge: 1, size: 0.6, color: 0x3a4a8c },
  crow: { kind: 'crow', hp: 22, speed: 1.8, armor: 0, flying: true, wallDps: 2, gold: 3, charge: 1, size: 0.5, color: 0x222222 },
  boss: { kind: 'boss', hp: 900, speed: 0.45, armor: 3, flying: false, wallDps: 20, gold: 60, charge: 10, size: 1.3, color: 0xb0452a },
};

export const HP_GROWTH = 1.17;
/** Armor never cuts a hit below this share of its damage. */
export const ARMOR_FLOOR = 0.2;
export const PROJECTILE_SPEED = 14;

export const ECON = {
  startGold: 45,
  summonBase: 10,
  summonStep: 5,
  /** Sell refund for a level-1 fruit; doubles per level. */
  sellBase: 5,
  summonLevelCost: [80, 200, 450, 900, 1800, 3600],
  powerBase: 40,
  powerGrowth: 1.7,
  wallBase: 60,
  wallGrowth: 1.6,
  wallAdd: 100,
  waveBonusBase: 5,
};

export const WALL_HP = 1000;

/** Corners open in this order, one per this many summons. */
export const CORNER_ORDER = [0, 2, 6, 8];
export const UNLOCK_EVERY = 5;

export const HERO = {
  chargeMax: 20,
  autoCastAfter: 8,
  buffTime: 5,
  buffSpeed: 0.3,
};

export const MERGE_BURST = { mul: 2, radius: 2.0, reach: 8 };

export const WAVES = {
  firstDelay: 1.5,
  /** Next batch comes in once this few enemies are left and the queue is empty. */
  callAt: 2,
  bossEvery: 10,
  primaryShare: 0.6,
  /** Hidden fronts (attack angles) by wave: one up to wave 3, two up to 8, then three. */
  frontBands: [
    { upTo: 3, fronts: 1 },
    { upTo: 8, fronts: 2 },
  ],
  maxFronts: 3,
  /** Half width of the arc an enemy spreads over around its front, in radians. */
  frontSpread: 0.45,
  /** Fronts are at least this far apart, in radians. */
  frontGap: 1.2,
  /** From this wave on, this share of enemies comes from any angle at all. */
  scatterFrom: 9,
  scatterShare: 0.25,
  beetleFrom: 4,
  crowFrom: 6,
};

export function waveCount(wave: number): number {
  return 5 + Math.floor(wave * 1.5);
}

export function spawnGap(wave: number): number {
  return Math.max(0.35, 1.0 - wave * 0.03);
}
