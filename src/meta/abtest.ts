import type { PlatformStorage, TrackData } from '../platform/types';
import type { RunMods } from '../sim/world';
import type { RunMode } from './progress';

/**
 * The running A/B split (docs/design/benchmark.md, opening-change lessons): one change per arm, on the same
 * traffic, every event tagged. `buy1` (2026-11-10, 0.0.21): does buying more often in the first minute keep
 * new players? Arm b plays level 1-1 with the reference game's economy (about 8 buys at the start instead of
 * 1-2, prices rising ~10% a level instead of 30-50%); arm a is the game as it is. Read it on players who
 * tapped: median time on page and the share who left within 45 s of their first buy, at 60+ such players
 * per arm.
 */
export const AB_TEST = 'buy1';
export type Arm = 'a' | 'b';

/** Arm b in level 1-1: 40 more starting gold (80), every card at 0.4 of its price, growth cut to 0.35 of it. */
export const CHEAP_BUY: RunMods = { startGold: 40, costMul: 0.4, costGrowth: 0.35 };

/** Storage key (in main.ts's preload). */
export const AB_KEY = 'ab';

/**
 * The arm kept in storage; a first-timer (no run booked yet) draws one at even odds and keeps it. A returning
 * player from before the test stays out (null): they already learned arm a, and mixing them in would blur it.
 */
export function pickArm(stored: string | null, runs: number, rand: () => number = Math.random): Arm | null {
  if (stored === `${AB_TEST}_a`) return 'a';
  if (stored === `${AB_TEST}_b`) return 'b';
  if (runs > 0) return null;
  return rand() < 0.5 ? 'a' : 'b';
}

/** Reads the arm, draws one for a first-timer and stores it. The storage key must be in the preload. */
export async function joinTest(storage: PlatformStorage, runs: number): Promise<Arm | null> {
  const stored = await storage.get(AB_KEY);
  const arm = pickArm(stored, runs);
  if (arm && stored !== `${AB_TEST}_${arm}`) void storage.set(AB_KEY, `${AB_TEST}_${arm}`);
  return arm;
}

/** The field every event carries: `ab: 'buy1_a' | 'buy1_b'`, nothing outside the test. */
export function armTag(arm: Arm | null): TrackData {
  return arm ? { ab: `${AB_TEST}_${arm}` } : {};
}

/** The run rules an arm adds: arm b's economy in level 1-1 only. */
export function armMods(arm: Arm | null | undefined, mode: RunMode): RunMods | undefined {
  return arm === 'b' && mode === 0 ? CHEAP_BUY : undefined;
}
