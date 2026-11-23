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
  /**
   * 钻地虫 and 自爆虫 (§9.5), endless only by their `WAVES` gates. Both answer the same thing from
   * opposite ends: that nothing ever reaches the fence once the train kills at range. A digger cannot
   * be shot at all while it is under the ground, so it always arrives - its armour is the dirt, not a
   * number. A bomber is the fastest and flimsiest thing in the game and does not chew (`wallDps` 0):
   * it stands against the fence with its fuse lit and goes off `WAVES.bomber.fuse` seconds later for
   * `bomber.blast` of the whole pool at once, so it costs nothing if anything spends a shot on it in
   * time and a great deal if nothing does.
   */
  digger: { kind: 'digger', hp: 90, speed: 0.95, armor: 0, flying: false, wallDps: 5, gold: 12, charge: 1, size: 0.55, color: 0x7a5a3a },
  bomber: { kind: 'bomber', hp: 26, speed: 1.75, armor: 0, flying: false, wallDps: 0, gold: 5, charge: 1, size: 0.4, color: 0xd4622a },
  /**
   * 支援虫 (§9.9), endless only by `WAVES.wardenFrom`. The one bug in the game that is not trying to
   * reach the fence on its own account: it chews for almost nothing, and every bug within
   * `WARDEN.radius` of it takes `WARDEN.cut` less from every shot. It is the first enemy that makes
   * "which one do I kill first" a question - everything else is answered by `Shots` picking whatever
   * is nearest the fence, which is exactly the decision the late run did not have.
   */
  warden: { kind: 'warden', hp: 110, speed: 0.7, armor: 3, flying: false, wallDps: 1, gold: 16, charge: 2, size: 0.62, color: 0x3fb8a8 },
  boss: { kind: 'boss', hp: 900, speed: 0.45, armor: 3, flying: false, wallDps: 20, gold: 100, charge: 10, size: 1.3, color: 0xb0452a },
  /**
   * The other two bosses (§9.9). Health is within a tenth of the king's on purpose: the rotation is
   * meant to change the question, not the wall of hit points, so a run's length does not depend on
   * which boss the wave number happens to land on.
   */
  mole: { kind: 'mole', hp: 980, speed: 0.8, armor: 2, flying: false, wallDps: 22, gold: 100, charge: 10, size: 1.25, color: 0x6b4a2e },
  queen: { kind: 'queen', hp: 860, speed: 0.5, armor: 4, flying: false, wallDps: 18, gold: 100, charge: 10, size: 1.2, color: 0xc8982a },
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
export const HP_GROWTH_ENDLESS = { early: 1.19, late: 1.085, knee: 35 };

/**
 * Enemy health in endless, as a multiple of a bug's base. Two slopes, not one: measured 2026-11-15,
 * a single 1.16 left waves 25-45 taking 5-9% of the fence a band while the shop was still doubling
 * damage, so nothing reached the fence and the middle of the run was a formality. The early slope is
 * the levels' own 1.19, which is the slope the stats were balanced against; past `knee` it eases off,
 * because by then health has to stop racing a player who buys every wave or the run ends in minutes.
 * Levels never see this (they use HP_GROWTH), so the knee is free to be wherever endless needs it.
 */
export function endlessHp(wave: number): number {
  const { early, late, knee } = HP_GROWTH_ENDLESS;
  const w = wave - 1;
  return Math.pow(early, Math.min(w, knee)) * Math.pow(late, Math.max(0, w - knee));
}

/** Ground enemies close behind a snail are held to its pace, so they reach the wall in a clump. */
export const SNAIL = { radius: 1.6 };
/** A dying mold splits into spores, each with this share of the mold's full health. */
export const MOLD = { spores: 2, hpShare: 0.4, spacing: 0.4 };
/** The boss (locust king) calls a swarm every so often; each locust has this share of a boss's health. */
// 2026-11-17: `every` was 6. A level's last wave is its boss wave, and it was the one wave with a dead
// board - scripts/wavetime.ts (trained hand player) measured 17-27 s of a 42-58 s wave with two bugs or
// fewer on the field, 35-49% of it, on every level from 1-5 to 3-10: the escorts die, then one slow bug
// walks the field alone while the king's three locusts, called every 6 s, are shot the moment they land.
// That is the won-fight-you-quit shape the telemetry reads (docs/telemetry/2026-11-12-level1-pacing.md),
// sitting at the end of every level, right before the reward. Calling twice as often fills it (1-5:
// 21.6 s -> 4.6 s dead, 3-10: 26.6 -> 14.0) and costs no frames: peak bugs on the wave is unchanged,
// because they die as fast as they come. `every: 2` halves the dead time again but takes 3-10's fence
// from 28% to 9%, which is a difficulty change and not a pacing one.
export const LOCUST = { every: 3, count: 3, hpShare: 0.03, spread: 0.5 };
/**
 * 巨型鼹鼠 (§9.9): it comes in underground like a digger, surfaces `surfaceAt` short of the fence,
 * and from then on dives again every `every` seconds for `under` of them - untouchable while it is
 * down, and walking `dig` times its speed. The king asks "can you clear the adds"; the mole asks
 * "can you burst it in the window", which is the one question a pile of flat DPS does not answer.
 */
export const MOLE = { surfaceAt: 1.1, every: 7, under: 2.4, dig: 1.5 };
/**
 * 蜂后 (§9.9): every bug within `radius` of her walks `speed` times as fast, hers included. She is
 * slow herself, so the swarm arrives ahead of her and the wave reads as one shove rather than a
 * stream - and killing her is worth more than killing what is in front of the gun.
 */
export const QUEEN = { radius: 3.4, speed: 1.4 };
/** 支援虫 (§9.9): bugs within `radius` of a live warden take `cut` less from every shot. */
export const WARDEN = { radius: 2.2, cut: 0.45 };
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
  endlessGrowth: 1.03,
  /**
   * Endless only: from this card level on, the price climbs by `endlessPriceGrowth` a level instead
   * of the card's own `growth`. A card's price grows 1.3 a level while income grows 1.03 a wave, so
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
   *
   * 0.05 was too much, measured 2026-11-15. Through waves 16-30 the fence takes 1.3-2.5% a wave while
   * the player buys a wall about once a wave, so the bar was being topped up faster than the bugs
   * could pull it down and it climbed back to 91-95% - fifteen waves, roughly minutes 6 to 13, with
   * nothing to do. The bug side cannot fix that: ENEMIES[].wallDps is a constant while the fence pool
   * grows 1450 -> 5200 over a run, so every bug's bite is worth less as a share the longer the run
   * goes, and more or faster or tougher bugs just pay the player enough gold to cancel themselves out
   * (two doses tried, both no effect in the band). Healing is the one side with no income feedback.
   */
  endlessRepair: 0.02,

  /** Share of the fence the repair card gives back in endless; a level still gets the whole thing. */
  endlessCardRepair: 0.45,
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
  /*
   * A forward firing arc was tried here on 2026-11-21 and taken out again (§9.3). The idea was that
   * the gun should cover only what the train is driving at, say 120 degrees either side, so that the
   * one thing the player steers would be worth something: from a point on the track a gun of reach R
   * covers acos((2.55^2 + 4.19^2 - R^2) / (2 x 2.55 x 4.19)) / pi of the fence ring - 44% untrained,
   * 83% at the old trained reach - and at 83% there is no front the train is away from.
   *
   * Measured, it bought nothing where it was aimed and cost a great deal everywhere else. An endless
   * run on a maxed save ended at wave 86 with the arc and 89 without it, and the mid save ended at
   * wave 51 either way: late on the train has the reach and the bot drives at the pressure anyway, so
   * the arc almost never excludes a bug worth shooting. The chapter levels are the opposite - one
   * open front, a tight margin, 30 levels tuned against 44% coverage - and four tests failed at once,
   * among them a bot that could no longer clear 1-2. Cutting reach (STATS.range.per below) is the
   * same lever aimed properly: it scales with training, so it bites in endless and not in chapter 1.
   */
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
  /**
   * 0.4 -> 0.2 on 2026-11-21 (§9.3). At 0.4 a maxed player's reach was 4.5 + 2.0 = 6.5 against a
   * kill ring of 2.55 + 6.5 = 9.05 and a near spawn radius (SPAWN_NEAR) of 9: the train could hit a
   * bug on the tick it appeared, so nothing ever walked anywhere. Isolated on an `arrivingAt(19)`
   * save whose run ended around wave 81 with 46% of its fence, maxing this one training alone took
   * it to 88% -
   * a bigger single lever than dmg (83%), multi (73%) or spd (51%). At 0.2 the maxed reach is 5.5,
   * the kill ring 8.05, inside the spawn radius again, and the covered share of the fence ring falls
   * from 83% to 59%.
   */
  range: { cost: 0, growth: 1, per: 0.2, max: 5 },
  move: { cost: 0, growth: 1, per: 0.15, max: 6 },
};

/** The crit card raises the chance `per` a level up to `rateLevels` (50%), then the crit damage `dmgPer` a level. */
export const CRIT = { rateLevels: 10, dmgPer: 0.2 };
/** Bugs the heavy stat counts as big, besides tough ones. */
export const HEAVY_KINDS: EnemyKind[] = ['beetle', 'snail', 'mold', 'boss', 'mole', 'queen'];
/** The three bosses (§9.9): a boss wave is over when none of these is left, and each pays boss gold. */
export const BOSS_KINDS = ['boss', 'mole', 'queen'] as const;
export function isBoss(kind: EnemyKind): boolean {
  return kind === 'boss' || kind === 'mole' || kind === 'queen';
}
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


/**
 * Wagons (§10.1): kills charge the train with each bug's base gold; a full charge stops the fight for
 * a pick of three. `charge` is the first pick's cost, each later one costs `growth` times more.
 * Damage is a share of the train's shot (trainDamage), so damage cards feed the wagons too.
 */
export const WAGONS = {
  charge: 300,
  growth: 1.1,
  /**
   * No pick before this much fight (§12): a charge filled sooner waits till then.
   * 2026-11-21, 60 -> 25 (docs/telemetry/2026-11-21-0040.md).
   * 0.0.39's live read: a new player has tried everything the opening has by ~25 s (tap 11.1 s, buy
   * 15.6, cast 15.7, reverse 16.9, grab 25.3), and the next new thing was this pick at 60 s - 1-1's
   * wave 3 is at 53 s and its card at 76. The 39 players who cast but never reached wave 3 left at a
   * median 33 s, wave 2, fence 97%, last input 3 s before: a won fight with nothing coming. Measured
   * over 12 seeds buying by hand, 60 opened the first pick at exactly 60.0 s in 12/12 - the charge was
   * long full and this was the gate. At 25 the first pick comes at 25 s in 7/12 seeds and 47-52 s in
   * the rest, and 7/12 get a second at ~45-54 s, so the 25-53 s stretch has a beat in it.
   * `charge` 300 -> 200 would open a pick in every seed by 41 s, but it takes 1-2's "training gets the
   * player further" guard from +0.124 to -0.010 (levels.test.ts), so it was left alone.
   * `firstAt` was left at 60 on 2026-11-12 (wagons.md §10.1) for one reason: a pick froze the fight,
   * which was the thing 1-1 was being cured of. 0.0.36 (2026-11-17) removed the freeze, so that
   * reason is gone. Both constants are global - every level and endless - and serve one change: put
   * the first pick inside the stretch where players leave. `growth` 1.1 still spaces the later ones and
   * `max` 4 caps the train, so what moves is when a pick comes, not how many.
   * What this cost, and what it turned out not to cost: 1-1's "softer bugs get the player further"
   * guard - whether its health dial answers at all - fell from 0.221 to 0.116 against a 0.15 bar, the
   * only level to go under, and a wagon at 25 s is indeed free power in a 76 s level. But that guard
   * summed two seeds, and over twelve the same change moves the per-seed gap 0.102 -> 0.095, with no
   * seed of the twelve negative either way: the fall was seed 11 alone (0.138 -> 0.026). So 1-1's
   * difficulty was left where it is and the guard was widened to six seeds averaged (levels.test.ts,
   * 2026-11-21). The compensations tried before that measurement all failed anyway and are not worth
   * revisiting: `hp` 0.45 breaks the chapter's own ramp (levels.test.ts wants 1-1 under 0.6 x 1-2's
   * 0.58), `bite` 1.1 read backwards, and a fourth wave undoes 2026-11-12's shortening. See the
   * telemetry note.
   */
  firstAt: 25,
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
  /**
   * Reforges of a maxed wagon (§10.1.16, `ForgeKind`). A wagon at `maxLv` can be reforged three ways
   * and each way once, so the four wagons of a train hold up to ten more cards past the point where
   * everything is maxed - which is where an endless pick used to have nothing left but gold.
   *
   * `rate` is how much oftener the wagon acts (so also that much more damage over time), `damage`
   * what a reforged shot hits for, `wide` what reach and the number of bugs an attack takes are
   * multiplied by, and `slowCap` keeps a reforged frost from stopping a bug dead.
   *
   * The doses are what a card can still be felt at without undoing §9.2's whole point, which is that
   * an endless run ends. Measured on seed 1 of scripts/reach.ts, `arrivingAt(19)`, as the end of the
   * run: 46 waves / 15 min with no reforges at all, 63 / 22 at three tenths of these doses, 69 / 25
   * at a half, and 104 / 51 at the doses first written here (rate 1.5, damage 1.8, wide 1.5) - which
   * handed back everything the reach cut and the late bite had taken off and then some. A half it is.
   * On a save with every training maxed the same change is 84 -> 92 waves, so the layer is worth most
   * to the player who has not maxed his trainings, which is the player it is for. Bracket a new dose
   * (FORGE= in reach.ts), never extrapolate: 46 / 63 / 69 / 104 is not a line.
   */
  forge: { rate: 1.25, damage: 1.4, wide: 1.25, slowCap: 0.85 },
  /** A supply card's gold, in damage cards at today's price. */
  supplyGold: 2,
};

/**
 * The tides of an endless run (§9.4, src/sim/tides.ts).
 *
 * Endless had one decision that mattered - which card to buy next - and after wave 20 the answer was
 * always the cheapest one, so the run turned into reading numbers. A tide is the other kind of
 * decision: every ten waves, three cards, each one a bargain. The bugs keep what the card gives them
 * for the rest of the run and the player is paid now, so the run has a shape the player chose, and
 * two runs from the same save stop being the same run.
 *
 * `from` 25 and `every` 10 puts a tide five waves off every boss (WAVES.bossEvery), so the boss wave,
 * its milestone (§9.6) and a tide never land together, and something happens every five waves.
 *
 * The presses multiply into `RunMods` and stack: four tides of `hardy` are 1.3^4 = 2.9x health on top
 * of the wave curve. They are deliberately bigger than one wave's worth of growth - a tide the player
 * cannot feel is a card not worth reading.
 */
export const TIDES = {
  from: 25,
  every: 10,
  /** Seconds before the clock takes the first card. The wagon pick's is 10; a tide reads longer. */
  autoPick: 14,
  cards: 3,
  /** What one tide multiplies, for the rest of the run. */
  press: { swift: 1.15, hardy: 1.3, gnaw: 1.4, swarm: 1.25 },
  /** Gold as a multiple of the damage card's price now, free stat levels, and the share of fence mended. */
  gift: { gold: 10, levels: 3, mend: 0.5 },
};

/**
 * The milestones of an endless run (§9.6, src/sim/miles.ts).
 *
 * This answers the plainest complaint the game has had: "even as the developer I am bored by wave 30,
 * and I keep going because nothing tells me to stop." An endless run had no punctuation in it and no
 * ending that was not a death - the only way out was the pause menu, which is behind a cog and reads
 * as giving up. A milestone is the punctuation: the wave after a boss wave, two cards, one of them
 * the way out.
 *
 * Walking away pays nothing extra and costs nothing: an endless run books for the wave it reached
 * whether the fence fell or the player left (meta/progress.ts, `crystalsFor`), so the card is not a
 * gamble and does not pretend to be one. What changes is that stopping becomes something the game
 * offered, taken at a high point and landing on the result card with its crystals and its training
 * tiles - instead of a player closing the tab in the middle of wave 34, which pays the same and
 * teaches them that the mode has no end worth reaching.
 *
 * `from` is 20, not 11, and that is the whole of the risk here: the card names the exit, and naming
 * it four minutes into someone's first endless run would be walking them out of a run they were
 * still enjoying, against the one number this game is judged on (average play time). 20 是报告厌烦
 * 的地方，也是第一种无尽专属虫（`WAVES.diggerFrom`）出现的那一波。The clock takes "go on" and never
 * the exit, so a player who is busy fighting is never walked out of their run by a timer.
 *
 * 2026-11-23，21 → 20（§9.8）：卡条现在只在换气里开（sim/pace.ts），所以 `from: 20` 不再是「第 20
 * 波打到一半」，而是**第 20 波的 Boss 倒下之后那段加长的换气**——一局真正的高点，也是「这里是个好
 * 的收手点」唯一说得通的时刻。原来的 21 配上换气会把它推到第 21 波清完，离 Boss 整整一波。
 */
export const MILES = {
  from: 20,
  /** Every boss wave (WAVES.bossEvery), so a milestone sits five waves off every tide. */
  every: 10,
  /** Seconds before the clock takes "go on". The tide's is 14; this card is two cards and shorter. */
  auto: 10,
};
