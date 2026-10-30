// Balance numbers and unit definitions. Grey-box values for M1; the sim and bot read only these.

import type { EnemyKind, FruitKind, HeroKind, StatKey } from './types';

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

// Geometry, in world units. The fort is centred on the origin; north is -z, east is +x.
// CELL is the old 3x3 grid step, still used to size the ground and the fence.
export const CELL = 2;
/** Where walking enemies stop and start chewing the fence (radius of the round fence). */
export const WALL = 3.6;
/**
 * Spawn radius: SPAWN_NEAR on the far side (-z), SPAWN_FAR along x (a landscape view is wide), and
 * SPAWN_FRONT more on the near side (+z), where a portrait view reaches down under the dock. Close
 * enough that the first bugs show a few seconds in; a far corner of the lawn may see one appear.
 */
export const SPAWN_NEAR = 9;
export const SPAWN_FAR = 12.5;
export const SPAWN_FRONT = 2;

// Fruit ranges from the merge version; the fruits now live on only in the village (§11).
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
  caterpillar: { kind: 'caterpillar', hp: 34, speed: 1.1, armor: 0, flying: false, wallDps: 2, gold: 6, charge: 1, size: 0.45, color: 0x4a2e26 },
  beetle: { kind: 'beetle', hp: 70, speed: 0.75, armor: 5, flying: false, wallDps: 4, gold: 10, charge: 1, size: 0.6, color: 0x3a4a8c },
  crow: { kind: 'crow', hp: 22, speed: 1.8, armor: 0, flying: true, wallDps: 2, gold: 6, charge: 1, size: 0.5, color: 0x2e3238 },
  snail: { kind: 'snail', hp: 120, speed: 0.5, armor: 2, flying: false, wallDps: 6, gold: 14, charge: 2, size: 0.75, color: 0x8a6a4a },
  mold: { kind: 'mold', hp: 60, speed: 0.85, armor: 0, flying: false, wallDps: 3, gold: 6, charge: 1, size: 0.6, color: 0x6fae5a },
  spore: { kind: 'spore', hp: 0, speed: 1.2, armor: 0, flying: false, wallDps: 1.5, gold: 3, charge: 0, size: 0.32, color: 0x9ad07e },
  locust: { kind: 'locust', hp: 0, speed: 1.6, armor: 0, flying: false, wallDps: 1.5, gold: 2, charge: 0, size: 0.3, color: 0xb8c040 },
  boss: { kind: 'boss', hp: 900, speed: 0.45, armor: 3, flying: false, wallDps: 20, gold: 100, charge: 10, size: 1.3, color: 0xb0452a },
};

/**
 * How far outside the fence a walking enemy stops: the body is about 1.3 × `size` long, so this
 * leaves its head half a body clear of the posts, and its bite lunges across the gap. Flyers hover
 * over the fence line.
 */
export function standOff(kind: EnemyKind): number {
  const def = ENEMIES[kind];
  return def.flying ? 0 : def.size * 1.3;
}

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
  startGold: 40,
  /** Gold at the start of every wave after the first: (base + wave) x the gold stat. */
  waveBonusBase: 5,
};

/**
 * The hero's train (§3): it circles a ring track inside the wall and shoots the enemies nearest
 * the wall within `range` of where it is. Speed is along the track, in units per second.
 */
export const TRAIN = {
  /** Small enough that the engine's corners (it is 1.9 long and 0.9 wide, straight on a curve) stay clear of the fence. */
  radius: 2.55,
  speed: 1.6,
  damage: 17,
  interval: 0.6,
  range: 4.5,
  critMul: 2,
  /** Damage per hero level above 1 (village). */
  perLevel: 0.15,
  /** A random event on the track is picked up when the train passes this close. */
  pickup: 0.9,
};

/**
 * Stats bought with gold in a run (§4). Level n costs cost x growth^n; each level adds `per`.
 * dmg multiplies (x(1+per)^lv); the rest add up. `max` caps the level.
 */
export interface StatDef {
  cost: number;
  growth: number;
  per: number;
  max?: number;
}

export const STAT_KEYS: StatKey[] = ['dmg', 'spd', 'crit', 'multi', 'range', 'move', 'gold', 'wall'];

export const STATS: Record<StatKey, StatDef> = {
  dmg: { cost: 20, growth: 1.3, per: 0.2 },
  spd: { cost: 25, growth: 1.35, per: 0.12, max: 15 },
  crit: { cost: 30, growth: 1.4, per: 0.05, max: 10 },
  multi: { cost: 120, growth: 2.5, per: 1, max: 3 },
  range: { cost: 30, growth: 1.5, per: 0.4, max: 5 },
  move: { cost: 20, growth: 1.4, per: 0.15, max: 6 },
  gold: { cost: 30, growth: 1.45, per: 0.15, max: 8 },
  /** Max wall and a repair of the same amount. */
  wall: { cost: 25, growth: 1.3, per: 150 },
};

export const WALL_HP = 1000;

/** Out-of-run upgrades bought with crystals (§11), as they act inside a run. */
export const META = {
  /** Skill charge per kill, per hero level above 1. */
  heroCharge: 0.15,
  /** Village: wall per level, start gold per level. */
  wall: 200,
  gold: 10,
};

/** Revive (§11, one per run): the wall comes back to this share and enemies this close are blown away. */
export const REVIVE = { wall: 0.5, clear: 2.5 };

/** Shared by every hero: kills to fill the skill. */
export const HERO = {
  chargeMax: 20,
};

/**
 * Random events (§4): one every `gap` waves, `delay` seconds into a wave that has no boss. Both sit
 * on the track and the train picks them up by driving through: the golden bug crawls along it and
 * pays gold, the basket gives a free level of a random stat. Bug speed is in radians per second.
 */
export const HAPPENINGS = {
  firstWave: 3,
  gap: [2, 3],
  delay: [4, 9],
  bug: { life: 7, speed: 0.15, gold: 15, goldPerWave: 3 },
  basket: { life: 10 },
  basketShare: 0.45,
};

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

/** Farmer, 浇水: the train attacks faster while it lasts. No passive. */
export const WATER = { speed: 0.5 };
/** Beekeeper, 蜂群: every `every` s the bees bite the enemies nearest the wall for a share of their full health. */
export const BEES = { every: 0.5, targets: 3, bite: 0.05, bossBite: 0.012 };
/** Beekeeper passive: every train hit leaves poison, this share of the hit per second. */
export const POISON = { share: 0.1, time: 3 };
/** Chef, 榨汁: hits every enemy for `mul` x one train shot. Passive: stats cost `discount` less. */
export const JUICE = { mul: 3, discount: 0.05 };

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
