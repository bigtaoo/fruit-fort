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
  /** Kinds that can turn up (the boss's locusts and the mold's spores come with them). */
  pool: EnemyKind[];
  /** At most this many attack angles a wave, under the endless default. */
  fronts?: number;
  mods?: ModId[];
}

const C: EnemyKind = 'caterpillar';

/** Chapter 1: one new bug every couple of levels, modifiers from level 5 on, level 10 the chapter boss. */
export const LEVELS: LevelDef[] = [
  { waves: 5, hp: 0.8, pool: [C], fronts: 1 },
  { waves: 8, hp: 0.9, pool: [C, 'beetle'], fronts: 1 },
  { waves: 10, hp: 1, pool: [C, 'beetle'], fronts: 2 },
  { waves: 10, hp: 1.05, pool: [C, 'beetle', 'crow'], fronts: 2 },
  { waves: 12, hp: 1, pool: [C, 'beetle', 'crow'], mods: ['rush'] },
  { waves: 12, hp: 1.5, pool: [C, 'beetle', 'crow', 'snail'] },
  { waves: 12, hp: 1.5, pool: [C, 'beetle', 'crow', 'snail'], mods: ['paper'] },
  { waves: 14, hp: 1.9, pool: [C, 'beetle', 'crow', 'snail', 'mold'] },
  { waves: 14, hp: 2.1, pool: [C, 'beetle', 'crow', 'snail', 'mold'], mods: ['poor'], fronts: 2 },
  { waves: 15, hp: 3, pool: [C, 'beetle', 'crow', 'snail', 'mold'] },
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
