// A greedy player for the headless sim and balance runs: tap events, merge whatever pairs up,
// cast when ready, then spend gold on summons and 强化, picking cards by a fixed score. A full
// board is no wall: the summon waits in the tray, and the bot feeds or sells to make room.

import { FRUITS, HAPPENINGS } from './config';
import type { CardDef } from './cards';
import { HERO_CELL, TRAY, cellX, cellZ } from './board';
import type { World } from './world';

/** A player needs a moment to see an event and tap it. */
const REACTION = 1.2;

export function botAct(w: World): void {
  if (w.draft) w.choose(bestCard(w, w.draft));
  const h = w.happening;
  if (h && (h.kind === 'bug' ? HAPPENINGS.bug.life : HAPPENINGS.basket.life) - h.t >= REACTION) w.grab();
  // The chef eats two fruits for its blast: a way out of a full board, not a free nuke.
  const castNow = w.heroKind === 'chef' ? w.emptyCells().length === 0 && w.enemies.length > 3 : w.enemies.length > 3;
  if (w.heroReady() && castNow) w.cast();
  mergeAll(w);
  clearTray(w);
  reposition(w);
  if (w.wallHp < w.wallMax * 0.35 && w.upgrade()) w.choose(bestCard(w, w.draft!));
  // 强化 first whenever it is the cheaper buy, so cards keep coming alongside summons.
  // A full board makes another summon a trip through the tray, so a card is the better buy.
  const full = w.emptyCells().length === 0;
  const fruits = w.cells.filter(Boolean).length;
  if ((full || (fruits >= 3 && w.upgradeCost() <= w.summonCost())) && w.upgrade()) w.choose(bestCard(w, w.draft!));
  if (full && w.gold < w.upgradeCost() + w.summonCost() && w.upgradeCost() < w.summonCost() * 3) return;
  if (w.canSummon()) {
    w.summon();
    mergeAll(w);
    clearTray(w);
    return;
  }
  // Keep a summon in reserve unless there is no room for one anyway.
  const reserve = w.hasRoom() ? w.summonCost() : 0;
  if (w.gold >= w.upgradeCost() + reserve && w.upgrade()) w.choose(bestCard(w, w.draft!));
}

/**
 * Empty the tray: into a free cell, merged or fed into its kind; failing that, feed the lowest
 * board fruit into its kind to make a cell, or sell whichever of the two is worth less.
 */
function clearTray(w: World): void {
  const t = w.tray;
  if (!t) return;
  const empty = w.emptyCells();
  if (empty.length > 0) {
    w.drop(TRAY, best(empty, (c) => reach(w, c, TRAY)));
    mergeAll(w);
    return;
  }
  const into = feedTarget(w, TRAY);
  if (into >= 0) {
    w.drop(TRAY, into);
    return;
  }
  for (const c of byLevel(w)) {
    const to = feedTarget(w, c);
    if (to < 0) continue;
    w.drop(c, to);
    w.drop(TRAY, c);
    return;
  }
  const low = byLevel(w)[0];
  if (low !== undefined && w.cells[low]!.level < t.level) {
    w.sell(low);
    w.drop(TRAY, low);
  } else {
    w.sell(TRAY);
  }
}

/** The best cell of the same kind this fruit can merge or feed into: the highest level. */
function feedTarget(w: World, from: number): number {
  let out = -1;
  for (let c = 0; c < 9; c++) {
    if (c === from || !(w.canMerge(from, c) || w.canFeed(from, c))) continue;
    if (out < 0 || w.cells[c]!.level > w.cells[out]!.level) out = c;
  }
  return out;
}

/** Board cells with a fruit, lowest level first. */
function byLevel(w: World): number[] {
  const cells = [...Array(9).keys()].filter((c) => w.cells[c]);
  return cells.sort((a, b) => w.cells[a]!.level - w.cells[b]!.level || a - b);
}

function best(cells: number[], score: (c: number) => number): number {
  let out = cells[0];
  for (const c of cells) if (score(c) > score(out)) out = c;
  return out;
}

/** Highest-scoring card: wall when hurt, summon level on schedule, else the fruits on the board. */
function bestCard(w: World, hand: CardDef[]): number {
  const strength = (k?: string) => {
    let s = 0;
    for (const f of w.cells) if (f && (!k || f.kind === k)) s += Math.pow(2, f.level - 1);
    return s;
  };
  const score = (c: CardDef): number => {
    if (c.id === 'wall') return w.wallHp < w.wallMax * 0.5 ? 1000 : 1;
    if (c.id === 'summonLevel') return w.summons >= 5 * w.summonLevel ? 500 : 0;
    if (c.id === 'gold') return w.wave < 8 ? 20 : 2;
    if (c.id === 'allSpeed') return strength() * 0.35;
    const mul = c.id.startsWith('dmg') ? 1 : c.id.startsWith('spd') ? 0.9 : 0.6;
    return strength(c.kind) * mul;
  };
  let best = 0;
  hand.forEach((c, i) => {
    if (score(c) > score(hand[best])) best = i;
  });
  return best;
}

function mergeAll(w: World): void {
  for (let a = 0; a < 9; a++) {
    for (let b = 0; b < 9; b++) {
      if (a !== b && a !== HERO_CELL && b !== HERO_CELL && w.canMerge(a, b)) {
        // Land the merge on the cell that reaches more of the enemies on the field.
        if (reach(w, a) > reach(w, b)) w.drop(b, a);
        else w.drop(a, b);
        a = -1;
        break;
      }
    }
  }
}

/** A fruit that reaches nothing while enemies are on the field moves to the empty cell that reaches the most. */
function reposition(w: World): void {
  if (w.enemies.length === 0) return;
  for (let c = 0; c < 9; c++) {
    if (!w.cells[c] || reach(w, c) > 0) continue;
    let best = -1;
    let bestN = 0;
    for (const e of w.emptyCells()) {
      const n = reach(w, e, c);
      if (n > bestN) [best, bestN] = [e, n];
    }
    if (best >= 0) {
      w.drop(c, best);
      return;
    }
  }
}

/** Enemies in range of `cell`, for the fruit standing there or, with `from`, the one standing at `from`. */
function reach(w: World, cell: number, from = cell): number {
  const f = w.fruitAt(from)!;
  const r = FRUITS[f.kind].range;
  return w.enemies.filter((e) => (e.x - cellX(cell)) ** 2 + (e.z - cellZ(cell)) ** 2 <= r * r).length;
}

