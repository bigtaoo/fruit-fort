// What each level asks of the wallet, against what the wallet holds.
//
// scripts/payoff.ts showed the 2-4 wall from the player's side: grinding there pays nothing and moves
// nothing. This one lines the whole ladder up against the economy: for every level, the smallest
// training spend that clears it (`needs`), and the crystals a player who cleared everything before it
// would be holding (`has`). A ladder is payable while `needs` stays under `has`; the first level where
// it does not is the wall, and the gap says how far off it is.
//
// Usage: npx tsx scripts/need.ts [from=11] [to=20] [seeds=3]

import { World } from '../src/sim/world';
import { DT, STAT_KEYS } from '../src/sim/config';
import { LEVELS, levelName } from '../src/sim/levels';
import type { StatKey } from '../src/sim/types';
import {
  DAILY, LEVEL_PAY, TRAIN_KEYS, buyTrain, levelWeight, newSave, trainPrice, worldOptions,
  type Save, type TrainKey,
} from '../src/meta/progress';

const from = Number(process.argv[2] ?? 11) - 1;
const to = Math.min(Number(process.argv[3] ?? 20), LEVELS.length);
const seeds = Number(process.argv[4] ?? 3);
/** Runs a player gets through in a day, so a level is worth that share of a day's dailies. */
const RUNS_A_DAY = 3;

function spendCheap(save: Save): void {
  for (;;) {
    let best: TrainKey | null = null;
    for (const k of TRAIN_KEYS) {
      const p = trainPrice(save, k);
      if (p !== null && p <= save.crystals && (!best || p < (trainPrice(save, best) ?? Infinity))) best = k;
    }
    if (!best || !buyTrain(save, best)) return;
  }
}

function withBudget(budget: number): Save {
  const save = newSave('2026-11-15');
  save.crystals = budget;
  spendCheap(save);
  return save;
}

/** The `hand` player of scripts/ladder.ts: one cheap card a second. */
function play(level: number, seed: number, save: Save) {
  const w = new World({ ...worldOptions(save, level), seed });
  for (let t = 0; t < 15 * 60 * 30 && !w.over; t++) {
    if (t % 30 === 0 && t * DT > 3) {
      const open = STAT_KEYS.filter((k) => !w.maxed(k));
      if (open.length) w.buy(open.reduce((a, b) => (w.statCost(b) < w.statCost(a) ? b : a)) as StatKey);
    }
    w.step();
    w.events.length = 0;
  }
  return w;
}

const wins = (level: number, budget: number) => {
  const save = withBudget(budget);
  let won = 0;
  for (let s = 0; s < seeds; s++) if (play(level, (s + 1) * 17, save).won) won++;
  return won === seeds;
};

/** Smallest budget (to the nearest 100) that clears the level on every seed, or null past the cap. */
function needs(level: number, cap = 12000): number | null {
  if (!wins(level, cap)) return null;
  let lo = 0;
  let hi = cap;
  while (hi - lo > 100) {
    const mid = Math.round((lo + hi) / 200) * 100;
    if (wins(level, mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Crystals a player has earned by the time `level` opens: every level before it, cleared with two
 * stars, plus the share of a day's dailies those runs took. */
function has(level: number): number {
  let total = 0;
  for (let i = 0; i < level; i++) {
    const n = LEVELS[i].waves * levelWeight(i);
    total += LEVEL_PAY.first * n + LEVEL_PAY.star * n;
    total += (DAILY.reward + 3 * DAILY.task) / RUNS_A_DAY;
  }
  return Math.round(total);
}

console.log('level   needs   has   margin   weight  pay/clear');
for (let i = from; i < to; i++) {
  const need = needs(i);
  const budget = has(i);
  const w = levelWeight(i);
  const pay = LEVEL_PAY.first * LEVELS[i].waves * w;
  const margin = need === null ? '  never' : `${budget - need > 0 ? '+' : ''}${budget - need}`;
  console.log(
    `${levelName(i).padEnd(6)} ${String(need ?? '>12000').padStart(6)} ${String(budget).padStart(5)} ${margin.padStart(8)}` +
    `   ${String(w).padStart(5)}  ${String(pay).padStart(6)}`,
  );
}
