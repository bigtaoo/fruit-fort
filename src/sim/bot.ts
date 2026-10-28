// A greedy player for the headless sim and balance runs: merge whatever pairs up, cast when
// ready, then spend gold on summons and 强化, picking cards by a fixed score.

import { FRUITS } from './config';
import type { CardDef } from './cards';
import { HERO_CELL, cellX, cellZ } from './board';
import type { World } from './world';

export function botAct(w: World): void {
  if (w.draft) w.choose(bestCard(w, w.draft));
  if (w.heroReady() && w.enemies.length > 3) w.cast();
  mergeAll(w);
  if (w.wallHp < w.wallMax * 0.35 && w.upgrade()) w.choose(bestCard(w, w.draft!));
  if (w.canSummon()) {
    w.summon();
    mergeAll(w);
    return;
  }
  // Board full and nothing merges: sell the lowest fruit if summoning would pay off.
  if (w.emptyCells().length === 0 && w.gold >= w.summonCost() * 2) {
    const low = lowestCell(w);
    if (low >= 0 && w.cells[low]!.level < w.summonLevel + 1) {
      w.sell(low);
      return;
    }
  }
  if (w.gold >= w.upgradeCost() + w.summonCost() && w.upgrade()) w.choose(bestCard(w, w.draft!));
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
    if (c.id === 'summonLevel') return w.summons >= 5 * w.summonLevel ? 500 : 3;
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

function reach(w: World, cell: number): number {
  const f = w.cells[cell]!;
  const r = FRUITS[f.kind].range;
  return w.enemies.filter((e) => (e.x - cellX(cell)) ** 2 + (e.z - cellZ(cell)) ** 2 <= r * r).length;
}

function lowestCell(w: World): number {
  let best = -1;
  for (let c = 0; c < 9; c++) {
    const f = w.cells[c];
    if (f && (best < 0 || f.level < w.cells[best]!.level)) best = c;
  }
  return best;
}
