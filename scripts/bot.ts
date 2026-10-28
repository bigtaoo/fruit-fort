// Headless bot: plays runs with a simple greedy policy and prints how far each one got.
// Usage: npm run bot -- [runs] [maxMinutes]

import { World } from '../src/sim/world';
import { TICK_HZ } from '../src/sim/config';
import { botAct } from '../src/sim/bot';

const runs = Number(process.argv[2] ?? 20);
const maxMin = Number(process.argv[3] ?? 30);
const waves: number[] = [];
const mins: number[] = [];
for (let seed = 1; seed <= runs; seed++) {
  const w = new World({ seed });
  const maxTicks = maxMin * 60 * TICK_HZ;
  while (!w.over && w.tick < maxTicks) {
    if (w.tick % 15 === 0) botAct(w);
    w.step();
    w.events.length = 0;
  }
  waves.push(w.wave);
  mins.push(w.time / 60);
  console.log(`seed ${seed}: wave ${w.wave}, ${(w.time / 60).toFixed(1)} min, summons ${w.summons}, summonLv ${w.summonLevel}, levels [${w.cells.map((c) => (c ? c.kind[0] + c.level : '-')).join(' ')}]${w.over ? '' : ' (timeout)'}`);
}
waves.sort((a, b) => a - b);
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
console.log(`waves: min ${waves[0]}, median ${waves[waves.length >> 1]}, max ${waves[waves.length - 1]}; avg run ${avg(mins).toFixed(1)} min`);
