// Chapter difficulty (§9.1): the bot plays every level with a given training, and reports how
// often it wins, the stars, how far a loss gets and how long a level takes.
// Usage: npx tsx scripts/levels.ts [runs] [trainLevel] [hero] [keys]
// trainLevel puts every trained stat in `keys` (comma list, default all) at that start level (capped
// by the stat), so 0 is a new player.

import { World } from '../src/sim/world';
import { TICK_HZ } from '../src/sim/config';
import { botAct } from '../src/sim/bot';
import { LEVELS, levelName } from '../src/sim/levels';
import { newSave, worldOptions } from '../src/meta/progress';
import { PRICES, TRAIN_KEYS, type TrainKey } from '../src/meta/shop';
import type { HeroKind } from '../src/sim/types';

const runs = Number(process.argv[2] ?? 20);
const train = Number(process.argv[3] ?? 0);
const hero = (process.argv[4] || undefined) as HeroKind | undefined;
const keys = process.argv[5]?.split(',') ?? TRAIN_KEYS;
// Through a save and `worldOptions`, so the player measured here is the one who plays (2026-11-15).
// Setting `meta` by hand left out the hero's level, the village and the wagons - the same hole that
// made scripts/ladder.ts answer for a player nobody plays; scripts/measure.test.ts now watches for it.
const save = newSave('2026-11-15');
for (const k of TRAIN_KEYS) save.train[k] = keys.includes(k) ? Math.min(train, PRICES.train[k].max) : 0;
if (hero) {
  save.hero = hero;
  save.heroes[hero] ||= 1;
}
const statLv = save.train;
const cost = TRAIN_KEYS.reduce((n, k) => n + Array.from({ length: statLv[k as TrainKey] }, (_, i) => PRICES.train[k].step * (i + 1) ** 2).reduce((a, b) => a + b, 0), 0);
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1] ?? 0;

console.log(`${runs} runs a level, training Lv${train} (${keys.join(',')}, ${cost} crystals)${hero ? `, ${hero}` : ''}`);
console.log('level waves  win%  stars(1/2/3)  loss wave  minutes');
LEVELS.forEach((level, i) => {
  let wins = 0;
  const stars = [0, 0, 0, 0];
  const lossWave: number[] = [];
  const min: number[] = [];
  for (let seed = 1; seed <= runs; seed++) {
    const w = new World({ ...worldOptions(save, i), seed: seed * 7 + i });
    while (!w.over && w.tick < 30 * 60 * TICK_HZ) {
      if (w.tick % 15 === 0) botAct(w);
      w.step();
      w.events.length = 0;
    }
    if (w.won) wins++;
    else lossWave.push(w.wave);
    stars[w.stars()]++;
    min.push(w.time / 60);
  }
  console.log(
    `${levelName(i).padEnd(5)} ${String(level.waves).padStart(5)}  ${String(Math.round((wins / runs) * 100)).padStart(4)}  ${`${stars[1]}/${stars[2]}/${stars[3]}`.padStart(12)}  ${(lossWave.length ? String(med(lossWave)) : '—').padStart(9)}  ${med(min).toFixed(1).padStart(7)}`,
  );
});
