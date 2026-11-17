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
// FROM=10 starts at a later level (0-based) and TRAINED=1 drops the untrained table, so one chapter can
// be tuned without paying for the chapters before it - the untrained run says nothing past 1-7 anyway.

import { World } from '../src/sim/world';
import { DT, STAT_KEYS } from '../src/sim/config';
import { botAct, pickCard } from '../src/sim/bot';
import { LEVELS, levelName, starsFor } from '../src/sim/levels';
import type { StatKey } from '../src/sim/types';
import { newSave, worldOptions, type Save } from '../src/meta/progress';
import { arrivingAt } from './arriving';

const policy = (process.argv[2] ?? 'hand') as 'hand' | 'none' | 'slow' | 'bot';
const seeds = Number(process.argv[3] ?? 10);
const from = Number(process.env.FROM ?? 0);
// HP="12:1.5,13:1.75" tries other health multipliers without editing levels.ts (0-based level index),
// so a chapter can be swept in one run the way chapter 3 was tuned.
for (const part of (process.env.HP ?? '').split(',').filter(Boolean)) {
  const [i, v] = part.split(':');
  LEVELS[Number(i)].hp = Number(v);
}
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
// A wagon pick stops the fight, so a policy that never takes a card leaves the 10 s clock to choose
// every one of them. `hand` and `slow` stand for people who are playing, and people tap the cards:
// measured 2026-11-15, choosing instead of waiting is worth some 40 points of fence a level, so the
// difference is not a detail. `none` is the floor - no input at all - and keeps the clock.
const pols: Record<string, (w: World, t: number) => void> = {
  none: () => {},
  hand: (w, t) => {
    const offer = w.wg?.offer;
    if (offer) return void w.pickWagon(pickCard(offer.opts));
    if (t % 30 === 0 && t * DT > 3) buyOne(w);
  },
  slow: (w, t) => {
    const offer = w.wg?.offer;
    if (offer) return void w.pickWagon(pickCard(offer.opts));
    if (t % Math.round(20 / DT) === 0 && t > 0) while (buyOne(w)) {}
  },
  bot: (w, t) => {
    if (t % 15 === 0) botAct(w);
  },
};

function play(i: number, seed: number, save: Save) {
  // Through worldOptions, so the player measured here is the one who plays: hero, village and wagons
  // included. Building the world by hand left all three out (2026-11-15), and the gap showed - the
  // same level and budget lost 6/6 here and won in scripts/need.ts.
  const w = new World({ ...worldOptions(save, i), seed });
  const act = pols[policy];
  let t = 0;
  // Counted in ticks, not `w.time`: the fight's clock stands still under a wagon pick, so the seconds
  // a player spends on the cards belong to their minutes even though the sim is not running.
  for (; t < 15 * 60 * 30 && !w.over; t++) {
    act(w, t);
    w.step();
    w.events.length = 0;
  }
  return { fence: w.wallHp / w.wallMax, min: (t * DT) / 60, won: w.won, wave: w.wave, buys: w.buys, gold: w.gold };
}

const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

for (const trained of process.env.TRAINED ? [true] : [false, true]) {
  console.log(`\n--- ${policy} player, ${trained ? 'trained as they would arrive' : 'untrained'}, ${seeds} seeds ---`);
  console.log('level   fence  stars   mins  waves  buys  gold  lost');
  let prev: number | null = null;
  for (let i = from; i < count; i++) {
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
