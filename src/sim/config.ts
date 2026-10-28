// Balance numbers and unit definitions. Grey-box values for M1; the sim and bot read only these.

import type { EnemyKind, FruitKind, HeroKind } from './types';

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

export interface FruitDef {
  kind: FruitKind;
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
  strawberry: { kind: 'strawberry', damage: 8, interval: 0.7, range: RANGE.mid, antiAir: true, color: 0xe8384f },
  coconut: { kind: 'coconut', damage: 44, interval: 1.5, range: RANGE.short, antiAir: false, heaviest: true, color: 0x8a5a3b },
  watermelon: { kind: 'watermelon', damage: 13, interval: 1.3, range: RANGE.mid, antiAir: false, splash: 1.3, splashCorner: 2.0, color: 0x3fa34d },
  grape: { kind: 'grape', damage: 7, interval: 1.0, range: RANGE.mid, antiAir: true, aura: { base: 0.1, perLevel: 0.05 }, color: 0x7b3fa0 },
  lemon: { kind: 'lemon', damage: 10, interval: 1.1, range: RANGE.mid, antiAir: true, slow: { mul: 0.65, time: 2 }, corrode: { perLevel: 2, time: 3 }, color: 0xf2d230 },
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
  caterpillar: { kind: 'caterpillar', hp: 34, speed: 1.1, armor: 0, flying: false, wallDps: 2, gold: 6, charge: 1, size: 0.45, color: 0xf0a030 },
  beetle: { kind: 'beetle', hp: 70, speed: 0.75, armor: 5, flying: false, wallDps: 4, gold: 10, charge: 1, size: 0.6, color: 0x3a4a8c },
  crow: { kind: 'crow', hp: 22, speed: 1.8, armor: 0, flying: true, wallDps: 2, gold: 6, charge: 1, size: 0.5, color: 0x222222 },
  snail: { kind: 'snail', hp: 120, speed: 0.5, armor: 2, flying: false, wallDps: 6, gold: 14, charge: 2, size: 0.75, color: 0x8a6a4a },
  mold: { kind: 'mold', hp: 60, speed: 0.85, armor: 0, flying: false, wallDps: 3, gold: 6, charge: 1, size: 0.6, color: 0x6fae5a },
  spore: { kind: 'spore', hp: 0, speed: 1.2, armor: 0, flying: false, wallDps: 1.5, gold: 3, charge: 0, size: 0.32, color: 0x9ad07e },
  locust: { kind: 'locust', hp: 0, speed: 1.6, armor: 0, flying: false, wallDps: 1.5, gold: 2, charge: 0, size: 0.3, color: 0xb8c040 },
  boss: { kind: 'boss', hp: 900, speed: 0.45, armor: 3, flying: false, wallDps: 20, gold: 100, charge: 10, size: 1.3, color: 0xb0452a },
};

export const HP_GROWTH = 1.19;

/** Ground enemies close behind a snail are held to its pace, so they reach the wall in a clump. */
export const SNAIL = { radius: 1.6 };
/** A dying mold splits into spores, each with this share of the mold's full health. */
export const MOLD = { spores: 2, hpShare: 0.4, spacing: 0.4 };
/** The boss (locust king) calls a swarm every so often; each locust has this share of a boss's health. */
export const LOCUST = { every: 6, count: 3, hpShare: 0.03, spread: 0.5 };
/** Armor never cuts a hit below this share of its damage. */
export const ARMOR_FLOOR = 0.2;
export const PROJECTILE_SPEED = 14;

export const ECON = {
  startGold: 45,
  summonBase: 10,
  summonStep: 3,
  /** Summon price multiplier per summon level above 1: a higher floor costs more per fruit. */
  summonLevelMul: 1.6,
  /** Sell refund for a level-1 fruit; doubles per level. */
  sellBase: 5,
  /** 强化 price by purchase; past the list it grows by upgradeStep each time. */
  upgradeCost: [15, 25, 40, 60, 85, 115, 150],
  upgradeStep: 40,
  waveBonusBase: 5,
};

export const WALL_HP = 1000;

/** Out-of-run upgrades bought with crystals (§11), as they act inside a run. */
export const META = {
  /** Damage per fruit level above 1. */
  fruitDmg: 0.25,
  /** Skill charge per kill, per hero level above 1. */
  heroCharge: 0.15,
  /** Village: wall per level, start gold per level; corners open this many waves earlier per level. */
  wall: 200,
  gold: 10,
  corner: 1,
};

/** Revive (§11, one per run): the wall comes back to this share and enemies this close are blown away. */
export const REVIVE = { wall: 0.5, clear: 2.5 };

/** Upgrade card effects per pick (see cards.ts), and the draft itself. */
export const CARD = {
  choices: 3,
  dmg: 0.25,
  spd: 0.15,
  rng: 1,
  rngMax: 2,
  aoe: 0.25,
  aura: 0.05,
  slow: 1,
  allSpeed: 0.1,
  gold: 0.2,
  wallAdd: 100,
  summonLevelWeight: 0.6,
  summonLevelMax: 5,
};

/** Corners open in this order, at the start of these waves. */
export const CORNER_ORDER = [0, 2, 6, 8];
export const CORNER_WAVES = [3, 6, 9, 12];

/** Shared by every hero: kills to fill the skill. */
export const HERO = { chargeMax: 20 };

export interface HeroDef {
  kind: HeroKind;
  /** How long the skill keeps going after a cast; 0 for an instant one. */
  time: number;
  color: number;
}

export const HEROES: Record<HeroKind, HeroDef> = {
  farmer: { kind: 'farmer', time: 5, color: 0x3a6fd8 },
  beekeeper: { kind: 'beekeeper', time: 6, color: 0xe8b020 },
  chef: { kind: 'chef', time: 0, color: 0xf2f2f2 },
};

/** Farmer, 浇水: every fruit attacks faster while it lasts. No passive. */
export const WATER = { speed: 0.3 };
/** Beekeeper, 蜂群: every `every` s the bees bite the enemies nearest the wall for a share of their full health. */
export const BEES = { every: 0.5, targets: 3, bite: 0.05, bossBite: 0.012 };
/** Beekeeper passive: hits from fruits next to the hero leave poison, this share of the hit per second. */
export const POISON = { share: 0.1, time: 3 };
/** Chef, 榨汁: eats the two lowest fruits and hits every enemy for `mul` x their damage. Passive: sells refund `sellMul` x. */
export const JUICE = { eat: 2, mul: 8, sellMul: 2 };

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
  beetleFrom: 3,
  crowFrom: 5,
  snailFrom: 7,
  moldFrom: 11,
};

export function waveCount(wave: number): number {
  return 6 + Math.floor(wave * 1.5);
}

export function spawnGap(wave: number): number {
  return Math.max(0.35, 1.0 - wave * 0.03);
}
