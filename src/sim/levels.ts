// Chapter levels (§9.1): each level is a row of parameters for the wave generator in waves.ts,
// not a hand-placed spawn list. The last wave of a level is its boss; clearing it wins the level.

import type { EnemyKind } from './types';
import type { RunMods } from './world';

/** Level modifiers share their ids and text with the daily challenge rules (i18n challenge.<id>). */
export type ModId = 'rush' | 'tough' | 'poor' | 'paper';

export const MODS: Record<ModId, RunMods> = {
  rush: { enemySpeed: 1.3 },
  tough: { enemyHp: 1.3 },
  poor: { startGold: -20 },
  paper: { wallMul: 0.6 },
};

export interface LevelDef {
  /** Waves in the level; the last one is the boss. */
  waves: number;
  /** Enemy health multiplier on top of the endless curve. */
  hp: number;
  /** Enemy damage to the fence multiplier (1 when left out). */
  bite?: number;
  /** Kinds that can turn up (the boss's locusts and the mold's spores come with them). */
  pool: EnemyKind[];
  /** At most this many attack angles a wave, under the endless default. */
  fronts?: number;
  mods?: ModId[];
  /**
   * Wave 1's front, as an angle, instead of a random one. Level 1 (2026-11-06): from the far side, the
   * top of the screen in both orientations, where the tank drives to first; a random front often came
   * from a side a portrait screen does not show, and the first kill took ~7 s even for a quick player.
   */
  open?: number;
  /**
   * Wave 1's first LEAD_BUGS bugs come at once, already up to this far walked in, so the field is busy
   * when the loading screen lifts. Level 1 (2026-11-06): half the new players left within 10 s, and
   * the first bug used to reach the tank only ~5 s in.
   */
  lead?: number;
  /** Bugs a wave, times the endless count (1 when left out). */
  swarm?: number;
  /** Gaps between a wave's bugs, times the endless gap (1 when left out), in waves up to `paceTo`. */
  pace?: number;
  paceTo?: number;
  /**
   * From wave `from` to wave `to`, this share of the caterpillars come tough: `hp` times the health,
   * drawn bigger, paying double. Level 1 (2026-11-10): the user's test found waves 1-5 dull, no bug got
   * near the fence; one-hit bugs throughout, with a few that take two or three (not all, as 0.0.20 did).
   */
  tough?: { share: number; hp: number; from: number; to: number };
  /** The fence can't fall on this level: the bugs' bite fades below SAFE.from and stops at SAFE.floor. */
  safe?: boolean;
  /**
   * First wave a random event (a basket or a gold bug) can come in, instead of HAPPENINGS.firstWave.
   * Level 1 (2026-11-14): the first pickup sat behind wave 3, which only 52% of the players who
   * tapped ever reached, so `first_grab` stood at 40%. The hold freezes the event clock with the
   * wave clock, so a wave-1 event lands a few seconds after the tutorial lets go, not during it.
   */
  happenFrom?: number;
}

/**
 * The safety net of the first levels (2026-11-05): a player who buys too little still wins, only
 * later and with fewer stars. Waves come only once the field is nearly clear, so bugs a weak player
 * can't kill would chew on forever; a lower bite alone just puts the loss off to the boss wave.
 */
export const LEAD_BUGS = 3;

export const SAFE = {
  from: 0.5,
  floor: 0.15,
  /**
   * A boss still standing this many seconds into its wave loses its full health over `bossFade` more
   * (2026-11-06: a player who barely bought spent ~16 min on level 1's boss and 20-40 min in the sim;
   * the bot kills it in ~40 s and a player buying every 20 s in ~70 s, both untouched).
   */
  bossAfter: 75,
  bossFade: 60,
};

/** What a bite on the fence is multiplied by on this level, with the fence at `frac` of its max. */
export function biteMul(def: LevelDef | null, frac: number): number {
  if (!def) return 1;
  const bite = def.bite ?? 1;
  if (!def.safe) return bite;
  return bite * Math.min(1, Math.max(0, (frac - SAFE.floor) / (SAFE.from - SAFE.floor)));
}

const C: EnemyKind = 'caterpillar';
const ALL: EnemyKind[] = [C, 'beetle', 'crow', 'snail', 'mold'];

/** Chapter 1: one new bug every couple of levels, modifiers from level 5 on, level 10 the chapter boss. */
export const LEVELS: LevelDef[] = [
  // The first level is short and dense (2026-11-12, docs/telemetry/2026-11-12-level1-pacing.md). It used
  // to be ten waves and `pace` 1: the median player left at 3.4 min on wave 6-7 with the fence still at
  // 89-94%, so almost nobody ever saw a win. Measured, the back half was the problem: waves grew 24 s ->
  // 45 s while the share of time with a bug at the fence fell 74% -> 25%, longer and safer at once,
  // because a late wave is paced by the spawn belt (waveCount(10) x swarm 3 x spawnGap(10) = 44 s), not
  // by killing. So: `pace` 0.6 compresses the belt (a wave keeps every bug, every coin and every bit of
  // charge, they just come closer together: 12 -> 20 bugs on screen, first-minute kills 47 -> 49 and
  // buys 12 -> 13), `waves` 6 ends the level before the threat curve goes flat - the
  // decline is structural, bought dps outgrows the 1.19/wave health curve - and `bite` 0.7 leaves the
  // fence at ~62% instead of ~90%, which is also what makes 1-1's stars mean anything. A buying player
  // now wins in 2.7-3.4 min on the clock (3.2-3.4 min if they never tap the cards), inside the quit
  // point, and nobody lost in 120 runs. The fence left is 99% for the bot, 62% buying by hand, 57%
  // buying every 20 s, 15% never buying - 3/2/2/1 stars, where every policy used to end above 80%
  // and take three. SAFE still catches the never-buyer every run, as it did before (ending 17%);
  // what is new is the 20 s buyer dipping under 50% on 6 seeds in 30, which is the point of it.
  // Over the whole level the totals follow the wave count: kills 396 -> 183, buys 51 -> 34, gold left
  // 270 -> 221. The rate went the other way - 7.7 buys a minute -> 13 - and the crystals follow the
  // waves too (LEVEL_PAY: first clear 20+10/star -> 12+6/star), which scripts/meta.ts absorbs: still
  // 230 crystals in run 1 and chapter 1 cleared on run 10.
  // The bite is above 1-2..1-5's (0.4..0.7) on purpose: this level's bugs have a third of the health, so
  // what the ladder is really about - fence left at the end - still climbs. See levels.test.ts.
  // 0.0.20's lesson stands (2026-11-10): that one guessed its cause and checked it with bots only, and
  // the median stay fell 94 s -> 60 s. This one is measured against the live quit context in quit_*
  // (fence, bugs, gold, card, quiet) and against four buying policies, 30 seeds each.
  { waves: 6, hp: 0.33, swarm: 3, pace: 0.6, bite: 0.7, pool: [C], fronts: 1, safe: true, open: -Math.PI / 2, lead: 4, happenFrom: 1, tough: { share: 0.3, hp: 3, from: 2, to: 5 } },
  { waves: 10, hp: 0.9, bite: 0.4, pool: [C, 'beetle'], fronts: 1, safe: true },
  { waves: 10, hp: 1, bite: 0.5, pool: [C, 'beetle'], fronts: 2, safe: true },
  { waves: 10, hp: 1.05, bite: 0.6, pool: [C, 'beetle', 'crow'], fronts: 2, safe: true },
  { waves: 12, hp: 1, bite: 0.7, pool: [C, 'beetle', 'crow'], mods: ['rush'], safe: true },
  // 1-6..1-10 are winnable untrained too (2026-11-05): the climb comes from bugs, mods and waves,
  // not hp. A quick player clears them all; a slow one starts losing around 1-8 and should train.
  { waves: 12, hp: 1.02, bite: 0.8, pool: [C, 'beetle', 'crow', 'snail'] },
  { waves: 12, hp: 0.88, bite: 0.9, pool: [C, 'beetle', 'crow', 'snail'], mods: ['paper'] },
  { waves: 14, hp: 0.88, pool: [C, 'beetle', 'crow', 'snail', 'mold'] },
  { waves: 14, hp: 0.84, pool: [C, 'beetle', 'crow', 'snail', 'mold'], mods: ['poor'], fronts: 2 },
  { waves: 15, hp: 0.92, pool: [C, 'beetle', 'crow', 'snail', 'mold'] },
  // Chapter 2 (2026-11-04): no new bug, but each level its own mix (a pool without caterpillars
  // shares their slice among the rest), three fronts, and the modifiers two at a time.
  { waves: 12, hp: 4, pool: ALL, fronts: 3 },
  { waves: 12, hp: 4.5, pool: ['beetle', 'snail'] },
  { waves: 12, hp: 5, pool: [C, 'crow'], mods: ['rush'] },
  { waves: 14, hp: 5.5, pool: ALL, mods: ['tough'], fronts: 3 },
  { waves: 14, hp: 6, pool: ['crow', 'mold'] },
  { waves: 14, hp: 7, pool: ALL, mods: ['paper'], fronts: 3 },
  { waves: 15, hp: 8, pool: ['beetle', 'snail', 'mold'], mods: ['poor'] },
  { waves: 15, hp: 9, pool: ALL, mods: ['rush', 'tough'] },
  { waves: 15, hp: 10.5, pool: ['crow', 'snail', 'mold'], mods: ['paper', 'poor'], fronts: 3 },
  { waves: 18, hp: 12, pool: ALL, mods: ['tough'] },
];

export const CHAPTER_SIZE = 10;

/** "1-3" for the third level of chapter 1. */
export function levelName(i: number): string {
  return `${Math.floor(i / CHAPTER_SIZE) + 1}-${(i % CHAPTER_SIZE) + 1}`;
}

/** The run rules a level's modifiers add up to. */
export function levelMods(def: LevelDef): RunMods {
  const out: RunMods = {};
  for (const id of def.mods ?? []) Object.assign(out, MODS[id]);
  return out;
}

/** Stars for a won level from the fence left: 1, 2 at half, 3 at 80%. */
export function starsFor(wallFrac: number): number {
  return 1 + (wallFrac >= 0.5 ? 1 : 0) + (wallFrac >= 0.8 ? 1 : 0);
}
