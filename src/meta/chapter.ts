// Chapter levels (§9.1) in the save: a level's best stars, which levels are open, what the lobby
// card offers, and when endless opens. Plain functions, no DOM. Split from progress.ts.

import { CHAPTER_SIZE, LEVELS } from '../sim/levels';
import type { Save } from './progress';

export function starsOf(save: Save, i: number): number {
  return save.levels[i] ?? 0;
}

/** The first level not cleared yet; LEVELS.length once all are. Levels open one by one. */
export function nextLevel(save: Save): number {
  const i = LEVELS.findIndex((_, j) => starsOf(save, j) === 0);
  return i < 0 ? LEVELS.length : i;
}

export function levelOpen(save: Save, i: number): boolean {
  return i >= 0 && i < LEVELS.length && i <= nextLevel(save);
}

/**
 * What the lobby's level card and start button offer: the first level not cleared; with the
 * chapter done, the first level with the fewest stars while one lacks three; then endless.
 */
export function cardLevel(save: Save): number | 'endless' {
  const next = nextLevel(save);
  if (next < LEVELS.length) return next;
  const stars = LEVELS.map((_, i) => starsOf(save, i));
  const low = Math.min(...stars);
  if (low < 3) return stars.indexOf(low);
  return endlessOpen(save) ? 'endless' : LEVELS.length - 1;
}

/** Endless runs and the daily challenge open once chapter 1 is cleared. */
export function endlessOpen(save: Save): boolean {
  return starsOf(save, CHAPTER_SIZE - 1) > 0;
}

export function totalStars(save: Save): number {
  return save.levels.reduce((a, b) => a + b, 0);
}
