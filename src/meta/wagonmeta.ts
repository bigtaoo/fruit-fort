// Wagons out of the run (§10.1.12): a new save rides with four of the six; the other two are bought
// in the base with crystals, after which picks can deal them. The base's wagon book also keeps the
// best level each wagon reached and the most Lv3 wagons on one train, for its achievements.

import type { WagonKind } from '../sim/types';
import { WAGON_KINDS } from '../sim/wagons';
import { WAGONS } from '../sim/cards';
import type { Save } from './progress';

/** Unlocked from the start: the first pick's three (arc, missile, frost) and plasma. */
export const START_WAGONS: WagonKind[] = ['arc', 'missile', 'frost', 'plasma'];

/** Crystals to unlock the others. The magnet, the strongest so far, costs most. */
export const WAGON_PRICE: Partial<Record<WagonKind, number>> = { mine: 150, magnet: 300 };

/** The save's wagon fields, filled in for an older or damaged save. */
export function normalizeWagons(s: Save): void {
  const owned = Array.isArray(s.wagons) ? s.wagons.filter((k) => WAGON_KINDS.includes(k)) : [];
  s.wagons = WAGON_KINDS.filter((k) => START_WAGONS.includes(k) || owned.includes(k));
  const best = s.wagonLv && typeof s.wagonLv === 'object' ? s.wagonLv : {};
  s.wagonLv = Object.fromEntries(WAGON_KINDS.filter((k) => best[k]! >= 1).map((k) => [k, Math.min(WAGONS.maxLv, Math.floor(best[k]!))]));
  if (typeof s.wagonFull !== 'number' || !(s.wagonFull >= 0)) s.wagonFull = 0;
}

export function wagonOwned(s: Save, k: WagonKind): boolean {
  return s.wagons.includes(k);
}

/** What unlocking costs; null once owned. */
export function wagonPrice(s: Save, k: WagonKind): number | null {
  return wagonOwned(s, k) ? null : (WAGON_PRICE[k] ?? 0);
}

export function buyWagon(s: Save, k: WagonKind): boolean {
  const p = wagonPrice(s, k);
  if (p === null || s.crystals < p) return false;
  s.crystals -= p;
  // Kept in the book's order, so the list reads the same however they were bought.
  s.wagons = WAGON_KINDS.filter((x) => x === k || s.wagons.includes(x));
  return true;
}

/** Book the wagons a run ended with: each one's best level, and the most at Lv3 on one train. */
export function bookWagons(s: Save, list: readonly { kind: WagonKind; lv: number }[]): void {
  for (const g of list) s.wagonLv[g.kind] = Math.max(s.wagonLv[g.kind] ?? 0, g.lv);
  s.wagonFull = Math.max(s.wagonFull, list.filter((g) => g.lv >= WAGONS.maxLv).length);
}

/** How many kinds ever reached Lv3. */
export function wagonsMaxed(s: Save): number {
  return WAGON_KINDS.filter((k) => (s.wagonLv[k] ?? 0) >= WAGONS.maxLv).length;
}
