// The run loop as a new player meets it (docs/design/runloop.md §2.4): levels in order from a fresh
// save, every run booked as the game books it, and the crystals spent only where the result card
// offers them - its training tiles (cardTrain: damage, then the cheapest other), as many as the purse
// buys. A lost level is played again. scripts/ladder.ts asks whether each level climbs; this one asks
// whether the loop turns: how many tries a level takes, how far the lost tries got, and the minutes.
//
// Usage: npx tsx scripts/loop.ts [policy=hand|slow] [seeds=12] [levels=8] [maxTries=6]
// TRAIN=0 never trains (the floor); TRAIN=loss trains only after a loss - the player who skips the
// tiles while winning and meets them on the loss card, which is the loop §2.4 is for.

import { World } from '../src/sim/world';
import { DT, STAT_KEYS } from '../src/sim/config';
import { pickCard } from '../src/sim/bot';
import { levelName } from '../src/sim/levels';
import type { StatKey } from '../src/sim/types';
import { finishRun, newSave, worldOptions, type Save } from '../src/meta/progress';
import { buyTrain, cardTrain, trainPrice } from '../src/meta/shop';

const policy = (process.argv[2] ?? 'hand') as 'hand' | 'slow';
const seeds = Number(process.argv[3] ?? 12);
const count = Number(process.argv[4] ?? 8);
const maxTries = Number(process.argv[5] ?? 6);
const train = process.env.TRAIN !== '0';
const onLoss = process.env.TRAIN === 'loss';

const cheapest = (w: World): StatKey | undefined => {
  const open = STAT_KEYS.filter((k) => !w.maxed(k));
  return open.length ? open.reduce((a, b) => (w.statCost(b) < w.statCost(a) ? b : a)) : undefined;
};
const buyOne = (w: World) => {
  const k = cheapest(w);
  return k ? w.buy(k) : false;
};
// The same two players as scripts/ladder.ts: `hand` buys a card every second, `slow` all it can every 20 s.
const act = (w: World, t: number) => {
  const offer = w.wg?.offer;
  if (offer) return void w.pickWagon(pickCard(offer.opts));
  if (policy === 'hand' ? t % 30 === 0 && t * DT > 3 : t % Math.round(20 / DT) === 0 && t > 0) {
    if (policy === 'hand') buyOne(w);
    else while (buyOne(w)) {}
  }
};

function play(save: Save, i: number, seed: number) {
  const w = new World({ ...worldOptions(save, i), seed });
  let t = 0;
  for (; t < 15 * 60 * 30 && !w.over; t++) {
    act(w, t);
    w.step();
    w.events.length = 0;
  }
  finishRun(save, { wave: w.wave, kills: w.kills, grabs: w.happenings.grabs, casts: w.casts, buys: w.buys, stars: w.stars(), wagons: w.wg?.list }, i);
  return { won: w.won, wave: w.wave, min: (t * DT) / 60, fence: w.wallHp / w.wallMax };
}

/** The card's tiles, bought while the purse lasts: damage first, then the cheapest other. */
function spend(save: Save): void {
  for (;;) {
    const k = cardTrain(save).find((x) => (trainPrice(save, x) ?? Infinity) <= save.crystals);
    if (!k || !buyTrain(save, k)) return;
  }
}

const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const rows: { tries: number[]; lostWaves: number[]; min: number[]; fence: number[]; stuck: number }[] = Array.from({ length: count }, () => ({ tries: [], lostWaves: [], min: [], fence: [], stuck: 0 }));

for (let s = 1; s <= seeds; s++) {
  const save = newSave('2026-11-18');
  let seed = s * 1000;
  for (let i = 0; i < count; i++) {
    let tries = 0;
    let mins = 0;
    let won = false;
    for (; tries < maxTries && !won; tries++) {
      const r = play(save, i, seed++);
      mins += r.min;
      won = r.won;
      if (!won) rows[i].lostWaves.push(r.wave);
      else rows[i].fence.push(r.fence);
      if (train && (!onLoss || !won)) spend(save);
    }
    rows[i].tries.push(tries);
    rows[i].min.push(mins);
    if (!won) {
      for (let j = i; j < count; j++) rows[j].stuck++;
      break;
    }
  }
}

console.log(`--- ${policy} player, ${!train ? 'never trains' : onLoss ? 'trains after a loss' : 'trains on the card'}, ${seeds} seeds, up to ${maxTries} tries ---`);
console.log('level   tries(med/max)  lost waves (med)  mins/level  fence won  stuck');
for (let i = 0; i < count; i++) {
  const r = rows[i];
  if (!r.tries.length) break;
  console.log(
    levelName(i).padEnd(8) +
      `${med(r.tries)}/${Math.max(...r.tries)}`.padStart(9) +
      `${r.lostWaves.length ? `${med(r.lostWaves)} (${r.lostWaves.length} lost)` : '-'}`.padStart(20) +
      `${med(r.min).toFixed(1)}`.padStart(12) +
      `${r.fence.length ? `${Math.round(med(r.fence) * 100)}%` : '-'}`.padStart(11) +
      `${r.stuck}`.padStart(7),
  );
}
