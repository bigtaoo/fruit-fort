// The training a player actually has when they open a level, shared by every script that measures a
// level as it is really played (scripts/ladder.ts, scripts/wavetime.ts). Measuring every level
// untrained flatters the late ones; measuring with a hand-written ratio flatters whatever stat the
// ratio favours. This spends a real budget, cheapest first, so each script answers the same question.
import { LEVELS } from '../src/sim/levels';
import {
  DAILY, LEVEL_PAY, TRAIN_KEYS, buyTrain, levelWeight, newSave, trainPrice,
  type Save, type TrainKey,
} from '../src/meta/progress';

/**
 * What a player's training looks like by the time they open level `i`: the crystals every level
 * before it paid, spent cheapest first.
 *
 * It used to be a hand-written ratio (dmg i x 0.8, spd x 0.5, ...), which by 2-10 spent some 💎15000
 * on damage alone - more than the whole campaign pays - and never bought multishot at all. That
 * flattered the late levels on damage and starved them of the one stat that decides them: at 2-1,
 * multishot alone moves the fence from 10% to 59% (2026-11-15). Spending a real budget keeps the
 * scripts and scripts/need.ts answering the same question.
 */
export function arrivingAt(i: number): Save {
  const save = newSave('2026-11-15');
  for (let k = 0; k < i; k++) {
    const n = LEVELS[k].waves * levelWeight(k);
    // One clear with one star, plus the share of a day's dailies those runs took, as scripts/need.ts counts it.
    save.crystals += LEVEL_PAY.first * n + LEVEL_PAY.star * n + (DAILY.reward + 3 * DAILY.task) / 3;
  }
  for (;;) {
    let best: TrainKey | null = null;
    for (const k of TRAIN_KEYS) {
      const p = trainPrice(save, k);
      if (p !== null && p <= save.crystals && (!best || p < (trainPrice(save, best) ?? Infinity))) best = k;
    }
    if (!best || !buyTrain(save, best)) break;
  }
  return save;
}
