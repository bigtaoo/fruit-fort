// Does the meta curve pay? The question scripts/personas.ts leaves open.
//
// personas.ts measures where players stop (2-4, after ~55 minutes, with everyone losing six runs in a
// row). It does not say whether grinding would get them through, which is the difference between an
// honest wall and a dead end. This script asks three things of the same wall:
//
//   income  - crystals a run at the wall pays, and per minute of play
//   price   - crystals the next training level costs from there
//   power   - fence left at the wall for a given total spend on training
//
// Put together they answer: how many minutes of grinding buy one more level of the climb, and does
// the climb ever reach the top. A meta curve is working when a run's pay buys a noticeable share of
// the next step; it is broken when the step costs many runs and moves the fence by nothing.
//
// Usage: npx tsx scripts/payoff.ts [level=14] [seeds=6] [runs=40]

import { World } from '../src/sim/world';
import { DT, STAT_KEYS } from '../src/sim/config';
import { LEVELS, levelName } from '../src/sim/levels';
import type { StatKey } from '../src/sim/types';
import {
  DAILY, TRAIN_KEYS, buyTrain, claimDaily, claimTask, finishRun, newSave, nextLevel, rollDaily,
  trainPrice, worldOptions, type Save, type TrainKey,
} from '../src/meta/progress';

const wall = Number(process.argv[2] ?? 14) - 1;
const seeds = Number(process.argv[3] ?? 6);
const maxRuns = Number(process.argv[4] ?? 40);
/** Seconds a village visit costs between two runs, as scripts/personas.ts charges it. */
const VILLAGE_S = 8;
/** Runs a player gets through in one sitting before the day rolls over, as scripts/meta.ts assumes. */
const RUNS_A_DAY = 3;

const cheapest = (w: World): StatKey | undefined => {
  const open = STAT_KEYS.filter((k) => !w.maxed(k));
  return open.length ? open.reduce((a, b) => (w.statCost(b) < w.statCost(a) ? b : a)) : undefined;
};

/** A player who buys one cheap card a second: scripts/ladder.ts's `hand`, the middle of the field. */
function play(level: number, seed: number, save: Save) {
  const w = new World({ ...worldOptions(save, level), seed });
  for (let t = 0; t < 15 * 60 * 30 && !w.over; t++) {
    if (t % 30 === 0 && t * DT > 3) {
      const k = cheapest(w);
      if (k) w.buy(k);
    }
    w.step();
    w.events.length = 0;
  }
  return w;
}

/** Training, cheapest first, while the crystals last - scripts/personas.ts's `spend`. */
function spendCheap(save: Save): number {
  let bought = 0;
  for (;;) {
    let best: TrainKey | null = null;
    for (const k of TRAIN_KEYS) {
      const price = trainPrice(save, k);
      if (price !== null && price <= save.crystals && (!best || price < (trainPrice(save, best) ?? Infinity))) best = k;
    }
    if (!best || !buyTrain(save, best)) return bought;
    bought++;
  }
}

/** Damage first, then whatever is cheapest: what a player who reads the numbers would do. */
function spendDmg(save: Save): number {
  let bought = 0;
  for (;;) {
    const d = trainPrice(save, 'dmg');
    if (d !== null && d <= save.crystals) {
      buyTrain(save, 'dmg');
      bought++;
      continue;
    }
    const before = save.crystals;
    const n = spendCheap(save);
    if (!n || save.crystals === before) return bought + n;
    bought += n;
  }
}

/** A save that has just opened the wall level, trained the way it was earned. */
function atTheWall(seed: number, spend: (s: Save) => number): Save {
  const save = newSave('2026-11-15');
  for (let i = 0; i < wall; i++) {
    const w = play(i, seed * 97 + i, save);
    finishRun(save, { wave: w.wave, kills: w.kills, grabs: w.grabs, casts: w.casts, buys: w.buys, stars: w.stars() }, i);
    spend(save);
  }
  return save;
}

const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const trainLv = (s: Save) => sum(TRAIN_KEYS.map((k) => s.train[k]));

for (const [name, spend] of [['cheapest first', spendCheap], ['damage first', spendDmg]] as const) {
  console.log(`\n=== grinding ${levelName(wall)}, ${name}, ${seeds} players ===`);
  const lines: string[] = [];
  const broke: number[] = [];
  for (let s = 0; s < seeds; s++) {
    const save = atTheWall(s + 1, spend);
    const startLv = trainLv(save);
    let mins = 0;
    let day = 0;
    let run = 0;
    let won = -1;
    const fences: number[] = [];
    const waves: number[] = [];
    const pays: number[] = [];
    let fromDaily = 0;
    let fromRuns = 0;
    for (; run < maxRuns && won < 0; run++) {
      if (run % RUNS_A_DAY === 0) {
        day++;
        rollDaily(save, `2026-11-${String(15 + day).padStart(2, '0')}`);
        const beforeDay = save.crystals;
        if (claimDaily(save)) save.crystals += DAILY.reward; // the ad double, taken by a player who watches
        for (let i = 0; i < 3; i++) claimTask(save, i);
        fromDaily += save.crystals - beforeDay;
      }
      const i = Math.min(nextLevel(save), wall);
      const w = play(i, (s + 1) * 131 + run, save);
      const before = save.crystals;
      finishRun(save, { wave: w.wave, kills: w.kills, grabs: w.grabs, casts: w.casts, buys: w.buys, stars: w.stars() }, i);
      pays.push(save.crystals - before);
      fromRuns += save.crystals - before;
      mins += w.time / 60 + VILLAGE_S / 60;
      if (i === wall) {
        fences.push(w.wallHp / w.wallMax);
        waves.push(w.wave);
      }
      if (i === wall && w.won) won = run;
      spend(save);
    }
    const next = med(TRAIN_KEYS.map((k) => trainPrice(save, k)).filter((p): p is number => p !== null));
    lines.push(
      `  player ${s + 1}: train ${startLv} -> ${trainLv(save)} lv, pay ${med(pays)}/run, next step ${next}, ` +
      `wave ${waves.slice(0, 3).join('/')} -> ${waves.slice(-3).join('/')} of ${LEVELS[wall].waves}, ` +
      `runs paid ${fromRuns}, dailies paid ${fromDaily}, ` +
      (won >= 0 ? `cleared on run ${won + 1} (${mins.toFixed(0)} min)` : `still stuck after ${run} runs (${mins.toFixed(0)} min)`),
    );
    if (won >= 0) broke.push(mins);
  }
  console.log(lines.join('\n'));
  console.log(`  ${broke.length}/${seeds} got through, median ${broke.length ? med(broke).toFixed(0) + ' min of grinding' : '-'}`);
}
