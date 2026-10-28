// A greedy player for the headless sim and balance runs: merge whatever pairs up, cast when
// ready, then spend gold on summons, summon level, the strongest fruit and the wall.

import { FRUITS } from './config';
import { HERO_CELL, cellX, cellZ } from './board';
import type { World } from './world';

export function botAct(w: World): void {
  if (w.heroReady() && w.enemies.length > 3) w.cast();
  mergeAll(w);
  if (w.wallHp < w.wallMax * 0.35) w.buyWall();
  const lvCost = w.summonLevelCost();
  if (lvCost !== null && w.gold >= lvCost && w.summons >= 6 * w.summonLevel) w.buySummonLevel();
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
  const kinds = w.deck.filter((k) => FRUITS[k].damage > 0);
  const best = kinds.sort((a, b) => w.powerCost(a) - w.powerCost(b))[0];
  if (best && w.gold >= w.powerCost(best) + w.summonCost()) w.buyPower(best);
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
