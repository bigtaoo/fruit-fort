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
/**
 * Endless only (§9.2). 1.19 a wave is what chapter levels are tuned around, but a chapter level is
 * over in 15 waves; an endless run is not, and compounded over 80 waves 1.19 does not make a climb,
 * it makes a wall. Measured 2026-11-15 from a save that had just cleared 1-10: at 1.19 the fence sits
 * above 70% to wave 49 and is gone by 58, which is what a player sees as "no pressure at all, then
 * dead". The same run at 1.14 slides 97 -> 92 -> 70 -> 53 -> 0 over waves 40-90 - a climb they can
 * feel getting steeper. Money cannot do this: raising income or cutting prices only slides the cliff
 * along the time axis (13 configs, same day), because multiplicative damage racing exponential health
 * is settled in the first 20 waves. The health curve is the only knob that changes the shape.
 */
export const HP_GROWTH_ENDLESS = 1.16;

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
  /**
   * Endless only: all income (kills, wave bonus, golden bug) grows this much a wave, so buying keeps
   * pace with enemy health (x1.19 a wave) and a late wave still clears in 10-20 s; without it the
   * run hit a wall of bullet sponges around wave 18. Chapter levels are tuned without it (§10).
   */
  endlessGrowth: 1.05,
  /**
   * Endless only: from this card level on, the price climbs by `endlessPriceGrowth` a level instead
   * of the card's own `growth`. A card's price grows 1.3 a level while income grows 1.05 a wave, so
   * at about a level every two waves the prices pull away at 1.086 a wave and the shop shuts. Seen
   * live 2026-11-15: at wave 81 the player had 166107 gold and the next damage level cost 1587063 -
   * from roughly wave 45 on they had not bought anything, because there was nothing they could buy.
   * A run with no purchase left in it is a run with nothing to do, however the fight is going.
   */
  priceEasyFrom: 20,
  endlessPriceGrowth: 1.28,
  /**
   * Endless only: the wall card heals this share of the full fence instead of the flat STATS.wall.per.
   * +150 is a third of a starting fence and 2% of a wave-80 one, so the only repair in the game stops
   * being a repair exactly when the fence starts coming down. As a share it stays the answer to "the
   * fence is going" for the whole run, which is the decision the late game was missing.
   */
  endlessRepair: 0.05,
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
 * dmg multiplies (x(1+per)^lv); the rest add up. `max` caps the level: of the run's cards none has
 * one since 0.0.26 (late in a run every card can still be bought, the price keeps it in check);
 * multi, range and move are raised by training only, and their `max` is the training cap.
 */
export interface StatDef {
  cost: number;
  growth: number;
  per: number;
  max?: number;
}

/** The run's eight cards, in dock order. */
export const STAT_KEYS: StatKey[] = ['dmg', 'spd', 'crit', 'heavy', 'splash', 'wagon', 'gold', 'wall'];
/** Every stat, the training-only ones too. */
export const ALL_STAT_KEYS: StatKey[] = [...STAT_KEYS, 'multi', 'range', 'move'];

export const STATS: Record<StatKey, StatDef> = {
  dmg: { cost: 20, growth: 1.3, per: 0.2 },
  spd: { cost: 25, growth: 1.35, per: 0.12 },
  /** Crit chance up to CRIT.rateLevels, crit damage after. */
  crit: { cost: 30, growth: 1.4, per: 0.05 },
  /** More damage to big bugs (HEAVY_KINDS, tough ones, the boss), from any source. */
  heavy: { cost: 35, growth: 1.35, per: 0.3 },
  /** The train's shots hurt every other bug within SPLASH.radius of the one hit by this share. */
  splash: { cost: 40, growth: 1.4, per: 0.15 },
  /** Every wagon's work: damage, frost's life, the magnet's gold. */
  wagon: { cost: 40, growth: 1.35, per: 0.15 },
  gold: { cost: 30, growth: 1.45, per: 0.15 },
  /** Max wall and a repair of the same amount. */
  wall: { cost: 25, growth: 1.3, per: 150 },
  /** Targets per volley, a fraction: a half level fires the extra shot every other volley (§4.4). */
  multi: { cost: 0, growth: 1, per: 0.5, max: 6 },
  range: { cost: 0, growth: 1, per: 0.4, max: 5 },
  move: { cost: 0, growth: 1, per: 0.15, max: 6 },
};

/** The crit card raises the chance `per` a level up to `rateLevels` (50%), then the crit damage `dmgPer` a level. */
export const CRIT = { rateLevels: 10, dmgPer: 0.2 };
/** Bugs the heavy stat counts as big, besides tough ones. */
export const HEAVY_KINDS: EnemyKind[] = ['beetle', 'snail', 'mold', 'boss'];
/** Splash round a train shot's target. */
export const SPLASH = { radius: 1.2 };

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

/**
 * Farmer, 浇水 (sci-fi 超载): the train attacks and drives faster while it lasts. No passive. The
 * drive (`move`) is for feel, so a new player sees the tank surge (2026-11-11); the base speed stays.
 */
export const WATER = { speed: 0.5, move: 0.5 };
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
  /** Hidden fronts (attack angles) by wave: one up to wave 3, two up to 8, three up to 25, then four. */
  frontBands: [
    { upTo: 3, fronts: 1 },
    { upTo: 8, fronts: 2 },
    { upTo: 25, fronts: 3 },
  ],
  maxFronts: 4,
  /**
   * Tries `pickFronts` gives each new front before it settles for the roomiest angle it drew. Four
   * fronts `frontGap` apart barely fit on a circle (4 x 1.2 < 2 pi), so rejection sampling alone can
   * run for a very long time; the cap keeps a wave's plan O(1).
   */
  frontTries: 60,
  /** Half width of the arc an enemy spreads over around its front, in radians. */
  frontSpread: 0.55,
  /** Each enemy takes the best of this many angles: the one furthest from the last `spreadRecall` in. */
  spreadTries: 4,
  spreadRecall: 5,
  /** Fronts are at least this far apart, in radians. */
  frontGap: 1.2,
  /** From this wave on, this share of enemies comes from any angle at all. */
  scatterFrom: 9,
  scatterShare: 0.25,
  beetleFrom: 3,
  crowFrom: 5,
  snailFrom: 7,
  moldFrom: 11,
  /**
   * The wave past which an endless run stops looking like a chapter level (§9.2). No chapter level
   * runs longer than 15 waves, so every curve keyed on this is endless-only by construction - no
   * `this.level ?` gate, and nothing in chapters 1 and 2 moves. Only HP_GROWTH cannot be written this
   * way, because it compounds from wave 1; that one is gated in World.spawn.
   */
  lateFrom: 15,
  /**
   * What turns up, early and late. The shares used to be these four constants flat, with the last
   * threshold at `moldFrom: 11` - so from wave 11 to wave 81 the composition of a wave never changed
   * once, only the health bar and the head count. Seventy waves of the identical picture is the
   * boredom players report, and it is also why the run has no texture: the only thing that ever moved
   * was a number. Past `lateFrom` the mix walks to `late` over `mixOver` waves, trading the cheap fast
   * bugs for armored and heavy ones, so the late game asks a different question from the early game.
   * Caterpillars take whatever share is left.
   */
  mix: {
    early: { crow: 0.15, snail: 0.08, mold: 0.15, beetle: 0.25 },
    late: { crow: 0.17, snail: 0.22, mold: 0.2, beetle: 0.31 },
    mixOver: 40,
  },
  /**
   * Endless elites: past `from`, this share of the bugs comes tough - `hp` times the health, drawn
   * bigger, paying double. Levels drive the same flag through `WavePlan.tough` and are untouched.
   */
  elite: { from: 20, share: 0.04, per: 0.006, cap: 0.3, hp: 3 },
  /** Past these waves a boss wave brings this many bosses instead of one. */
  bossBands: [
    { from: 40, bosses: 2 },
    { from: 70, bosses: 3 },
  ],
  /** `scatterShare` walks to this by `lateFrom + mix.mixOver`: late waves come from everywhere. */
  scatterLate: 0.45,
};

/**
 * Bugs in a wave. Past `WAVES.lateFrom` the slope doubles, so an endless wave late on puts twice as
 * many bugs on the board as the old curve did. On its own this is a length knob, not a shape one
 * (measured 2026-11-15: twice the bugs moved the death from wave 58 to 62 and the run from 27 to 46
 * minutes, because gold comes from kills and more bugs pay for themselves) - it is in for the density,
 * and `spawnGap`'s lower late floor is what pays the minutes back.
 */
export function waveCount(wave: number): number {
  const late = Math.max(0, wave - WAVES.lateFrom);
  return 6 + Math.floor(wave * 1.5 + late * 1.5);
}

/**
 * Seconds between two bugs. The floor is what a wave's pace settles at; chapter levels scale this by
 * `WavePlan.pace` and none of them runs past `WAVES.lateFrom`, so they keep the 0.35 floor they were
 * tuned with. Endless keeps falling to a much tighter belt, which is what buys back the minutes the
 * doubled head count costs.
 */
export function spawnGap(wave: number): number {
  return Math.max(wave <= WAVES.lateFrom ? 0.35 : 0.1, 1.0 - wave * 0.03);
}

/**
 * Wagons (§10.1): kills charge the train with each bug's base gold; a full charge stops the fight for
 * a pick of three. `charge` is the first pick's cost, each later one costs `growth` times more.
 * Damage is a share of the train's shot (trainDamage), so damage cards feed the wagons too.
 */
export const WAGONS = {
  charge: 300,
  growth: 1.1,
  /** No pick in the first minute (§12): a charge filled sooner waits till then. */
  firstAt: 60,
  /** Seconds of fight after any pick before a charge can open the next, so two never come back to back. */
  apart: 20,
  /** Seconds before the clock picks for the player (the `def` card, `fallback()`). */
  autoPick: 10,
  max: 4,
  maxLv: 3,
  /** Track distance from the engine's centre to the first wagon's, and between wagons. */
  first: 1.9,
  gap: 1.3,
  arc: { every: 2.5, targets: [3, 4, 4], mul: [0.6, 0.8, 0.8], stun: 0.6 },
  missile: { every: 3, count: [1, 2, 2], mul: 2, splash: 0.8, splashMul: 0.5, reach: 6 },
  frost: { every: 0.35, slow: [0.35, 0.5, 0.5], life: [4, 6, 6], radius: 0.9, out: 4.15, frail: 1.25 },
  plasma: { every: 0.25, reach: 3, perSec: [2.5, 4, 4], burn: 3 },
  mine: { every: 4, count: [1, 2, 2], radius: 1, mul: 2, linger: 3, touch: 0.6 },
  magnet: { gold: [0.2, 0.35, 0.35], reach: [2, 3, 3] },
  /** A supply card's gold, in damage cards at today's price. */
  supplyGold: 2,
};
