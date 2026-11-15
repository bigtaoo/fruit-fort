// The chapter ladder: every level side by side, under one policy, with the training a player would
// actually have reached it with. scripts/wavetime.ts profiles one level deeply; this one asks the
// question that only shows up across levels — does the climb climb?
//
// What a level costs the player is the fence it takes, not its wave count (levels.test.ts says the
// same: "what the ladder is really about is how much fence a level costs"). A ladder is working when
// that cost rises: later levels should leave less fence, or the player is being asked for more time
// and not more skill, which is the shape players quit (docs/telemetry/2026-11-12-level1-pacing.md).
//
// Training matters to the question: a player arrives at 1-7 with six levels of crystals spent, so
// measuring every level untrained flatters the late ones. `trained` grows the stats the way
// scripts/meta.ts's bot actually buys them, one notch a level cleared.
//
// Usage: npx tsx scripts/ladder.ts [policy=hand|none|slow|bot] [seeds=10] [levels=10]

import { World } from '../src/sim/world';
import { DT, STAT_KEYS } from '../src/sim/config';
import { botAct } from '../src/sim/bot';
import { LEVELS, levelName, starsFor } from '../src/sim/levels';
import type { StatKey } from '../src/sim/types';
import {
  DAILY, LEVEL_PAY, TRAIN_KEYS, buyTrain, levelWeight, newSave, trainPrice, worldOptions,
  type Save, type TrainKey,
} from '../src/meta/progress';

const policy = (process.argv[2] ?? 'hand') as 'hand' | 'none' | 'slow' | 'bot';
const seeds = Number(process.argv[3] ?? 10);
const count = Math.min(Number(process.argv[4] ?? 10), LEVELS.length);

const cheapest = (w: World): StatKey | undefined => {
  const open = STAT_KEYS.filter((k) => !w.maxed(k));
  return open.length ? open.reduce((a, b) => (w.statCost(b) < w.statCost(a) ? b : a)) : undefined;
};
const buyOne = (w: World) => {
  const k = cheapest(w);
  return k ? w.buy(k) : false;
};

/** The four policies of scripts/wavetime.ts, so a number here can be compared with one from there. */
const pols: Record<string, (w: World, t: number) => void> = {
  none: () => {},
  hand: (w, t) => {
    if (t % 30 === 0 && t * DT > 3) buyOne(w);
  },
  slow: (w, t) => {
    if (t % Math.round(20 / DT) === 0 && t > 0) while (buyOne(w)) {}
  },
  bot: (w, t) => {
    if (t % 15 === 0) botAct(w);
  },
};

/**
 * What a player's training looks like by the time they open level `i`: the crystals every level
 * before it paid, spent cheapest first.
 *
 * It used to be a hand-written ratio (dmg i x 0.8, spd x 0.5, ...), which by 2-10 spent some 💎15000
 * on damage alone - more than the whole campaign pays - and never bought multishot at all. That
 * flattered the late levels on damage and starved them of the one stat that decides them: at 2-1,
 * multishot alone moves the fence from 10% to 59% (2026-11-15). Spending a real budget keeps this
 * script and scripts/need.ts answering the same question.
 */
function arrivingAt(i: number): Save {
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

function play(i: number, seed: number, save: Save) {
  // Through worldOptions, so the player measured here is the one who plays: hero, village and wagons
  // included. Building the world by hand left all three out (2026-11-15), and the gap showed - the
  // same level and budget lost 6/6 here and won in scripts/need.ts.
  const w = new World({ ...worldOptions(save, i), seed });
  const act = pols[policy];
  for (let t = 0; t < 15 * 60 * 30 && !w.over; t++) {
    act(w, t);
    w.step();
    w.events.length = 0;
  }
  return { fence: w.wallHp / w.wallMax, min: w.time / 60, won: w.won, wave: w.wave, buys: w.buys, gold: w.gold };
}

const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

for (const trained of [false, true]) {
  console.log(`\n--- ${policy} player, ${trained ? 'trained as they would arrive' : 'untrained'}, ${seeds} seeds ---`);
  console.log('level   fence  stars   mins  waves  buys  gold  lost');
  let prev: number | null = null;
  for (let i = 0; i < count; i++) {
    const save = trained ? arrivingAt(i) : newSave('2026-11-15');
    const rs = Array.from({ length: seeds }, (_, s) => play(i, s + 1, save));
    const f = med(rs.map((r) => r.fence));
    const lost = rs.filter((r) => !r.won).length;
    // An arrow the eye can follow: the ladder should be falling (less fence left each level).
    const arrow = prev === null ? ' ' : f < prev - 0.02 ? '↓' : f > prev + 0.02 ? '↑' : '=';
    prev = f;
    console.log(
      levelName(i).padEnd(7) +
        `${(f * 100).toFixed(0)}%`.padStart(5) +
        ` ${arrow}` +
        `${starsFor(f)}`.padStart(5) +
        `${med(rs.map((r) => r.min)).toFixed(1)}`.padStart(7) +
        `${med(rs.map((r) => r.wave))}`.padStart(7) +
        `${Math.round(med(rs.map((r) => r.buys)))}`.padStart(6) +
        `${Math.round(med(rs.map((r) => r.gold)))}`.padStart(6) +
        `${lost}/${seeds}`.padStart(7),
    );
  }
}
