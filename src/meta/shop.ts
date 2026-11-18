// Crystal prices and the village's purchases: training (stat start levels), hero unlocks and levels,
// village upgrades. Plain data and functions, no DOM. Split from progress.ts.

import type { HeroKind, StatKey } from '../sim/types';
import type { Save } from './progress';

export type VillageKey = 'wall' | 'gold';
/** Stats that can be trained; the wall has its own village building. */
export type TrainKey = Extract<StatKey, 'dmg' | 'spd' | 'crit' | 'multi' | 'range' | 'move' | 'gold'>;
export const TRAIN_KEYS: TrainKey[] = ['dmg', 'spd', 'crit', 'multi', 'range', 'move', 'gold'];

/** Prices in crystals. Hero level ups cost `step` x lv + `grow` x lv² at the current level, so
 * the first levels come fast and the last ones are long goals (§11 pacing table). */
export const PRICES = {
  /** Training: the next start level costs `step` x (lv + 1)², up to `max`. Damage runs to 20, the
   * long crystal sink once everything else is maxed (levels 11-20 cost 💎1452-4800 each). */
  train: {
    dmg: { step: 12, max: 20 },
    spd: { step: 20, max: 6 },
    crit: { step: 20, max: 6 },
    // Multishot, range and train speed are raised only here since 0.0.26 (no card in the run), so
    // their caps are the stats' whole range: range to 750, move to 720.
    // Multishot used to be three whole targets at 💎120/480/1080, which made its first level a hidden
    // gate: at 1-9 dropping it alone took the fence 54% -> 7% and 0 losses to 5 of 10, while dropping
    // any other training cost 6-28 points and lost nothing (2026-11-15). Six half-target levels at
    // 💎40/160/360/640/1000/1440 reach the same ceiling (4 targets), but as a curve: the first level
    // is an early, affordable decision and no single buy decides a fight. The step was measured, not
    // guessed - at 💎18 the chapter flattens to a 50% fence throughout (no climb left), at 💎60 it
    // ends at 22% (1 star); 💎40 keeps the ladder falling 66% -> 39% with nothing lost (2026-11-15).
    multi: { step: 40, max: 6 },
    range: { step: 30, max: 5 },
    move: { step: 20, max: 6 },
    gold: { step: 25, max: 5 },
  } as Record<TrainKey, { step: number; max: number }>,
  heroUnlock: { beekeeper: 120, chef: 150 } as Partial<Record<HeroKind, number>>,
  heroStep: 40,
  heroGrow: 10,
  heroMax: 5,
  /** Village: price per next level and the cap. */
  village: {
    wall: { step: 40, max: 5 },
    gold: { step: 30, max: 5 },
  } as Record<VillageKey, { step: number; max: number }>,
};

// ---- prices and purchases (null price = maxed out) ----------------------------------------

export function trainPrice(save: Save, k: TrainKey): number | null {
  const p = PRICES.train[k];
  const lv = save.train[k];
  return lv >= p.max ? null : p.step * (lv + 1) ** 2;
}

export function heroPrice(save: Save, h: HeroKind): number | null {
  const lv = save.heroes[h];
  if (lv === 0) return PRICES.heroUnlock[h] ?? 0;
  return lv >= PRICES.heroMax ? null : PRICES.heroStep * lv + PRICES.heroGrow * lv * lv;
}

export function villagePrice(save: Save, key: VillageKey): number | null {
  const p = PRICES.village[key];
  const lv = save.village[key];
  return lv >= p.max ? null : p.step * (lv + 1) ** 2;
}

function pay(save: Save, price: number | null): boolean {
  if (price === null || save.crystals < price) return false;
  save.crystals -= price;
  return true;
}

export function buyTrain(save: Save, k: TrainKey): boolean {
  if (!pay(save, trainPrice(save, k))) return false;
  save.train[k]++;
  return true;
}

export function buyHero(save: Save, h: HeroKind): boolean {
  if (!pay(save, heroPrice(save, h))) return false;
  save.heroes[h]++;
  return true;
}

export function buyVillage(save: Save, key: VillageKey): boolean {
  if (!pay(save, villagePrice(save, key))) return false;
  save.village[key]++;
  return true;
}

export function pickHero(save: Save, h: HeroKind): boolean {
  if (save.heroes[h] === 0) return false;
  save.hero = h;
  return true;
}
