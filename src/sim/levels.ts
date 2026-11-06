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
  /** The fence can't fall on this level: the bugs' bite fades below SAFE.from and stops at SAFE.floor. */
  safe?: boolean;
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
  // The first level is long and soft (§12): ten waves so a new player gets several minutes of play,
  // and bugs that chew slowly. The first five can't be lost (SAFE) and their bite climbs gently.
  // Three times the bugs at a third of the health (2026-11-06): a quick player cleared it in ~3 min,
  // paced by how fast the bugs came, not by killing them; now ~6 min (bot), 7-8 min buying every
  // 20-60 s, and ~13 min for one who never buys, who is paced by the total health, about as before.
  { waves: 10, hp: 0.33, swarm: 3, bite: 0.3, pool: [C], fronts: 1, safe: true, open: -Math.PI / 2, lead: 4 },
  { waves: 10, hp: 0.9, bite: 0.4, pool: [C, 'beetle'], fronts: 1, safe: true },
  { waves: 10, hp: 1, bite: 0.5, pool: [C, 'beetle'], fronts: 2, safe: true },
  { waves: 10, hp: 1.05, bite: 0.6, pool: [C, 'beetle', 'crow'], fronts: 2, safe: true },
  { waves: 12, hp: 1, bite: 0.7, pool: [C, 'beetle', 'crow'], mods: ['rush'], safe: true },
  // 1-6..1-10 are winnable untrained too (2026-11-05): the climb comes from bugs, mods and waves,
  // not hp. A quick player clears them all; a slow one starts losing around 1-8 and should train.
  { waves: 12, hp: 1.1, bite: 0.8, pool: [C, 'beetle', 'crow', 'snail'] },
  { waves: 12, hp: 0.95, bite: 0.9, pool: [C, 'beetle', 'crow', 'snail'], mods: ['paper'] },
  { waves: 14, hp: 0.95, pool: [C, 'beetle', 'crow', 'snail', 'mold'] },
  { waves: 14, hp: 0.9, pool: [C, 'beetle', 'crow', 'snail', 'mold'], mods: ['poor'], fronts: 2 },
  { waves: 15, hp: 1, pool: [C, 'beetle', 'crow', 'snail', 'mold'] },
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
