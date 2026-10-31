// Pacing over many bot runs: how far, how long, how often the player buys or turns the train,
// and what the first boss costs.
// Usage: npx tsx scripts/pacing.ts [runs] [maxMinutes] [hero]

import { World } from '../src/sim/world';
import { TICK_HZ, WAVES } from '../src/sim/config';
import { botAct } from '../src/sim/bot';
import type { HeroKind } from '../src/sim/types';

const runs = Number(process.argv[2] ?? 20);
const maxMin = Number(process.argv[3] ?? 20);
const hero = process.argv[4] as HeroKind | undefined;
const rows: { wave: number; min: number; buyEvery: number; turnEvery: number; boss: number }[] = [];
for (let seed = 1; seed <= runs; seed++) {
  const w = new World({ seed, hero });
  let wallAtBoss = 0;
  let boss = 0;
  while (!w.over && w.tick < maxMin * 60 * TICK_HZ) {
    if (w.tick % 15 === 0) botAct(w);
    w.step();
    for (const e of w.events) {
      if (e.t !== 'wave') continue;
      if (e.wave === WAVES.bossEvery) wallAtBoss = w.wallHp / w.wallMax;
      if (e.wave === WAVES.bossEvery + 1) boss = wallAtBoss - w.wallHp / w.wallMax;
    }
    w.events.length = 0;
  }
  rows.push({ wave: w.wave, min: w.time / 60, buyEvery: w.time / Math.max(1, w.buys), turnEvery: w.time / Math.max(1, w.reverses), boss });
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const col = <K extends keyof (typeof rows)[0]>(k: K) => rows.map((r) => r[k]);
console.log(`waves: min ${Math.min(...col('wave'))}, median ${med(col('wave'))}, max ${Math.max(...col('wave'))}`);
console.log(`run: median ${med(col('min')).toFixed(1)} min; a buy every ${avg(col('buyEvery')).toFixed(1)} s; a turn every ${avg(col('turnEvery')).toFixed(1)} s`);
console.log(`first boss costs ${(avg(col('boss')) * 100).toFixed(0)}% of the wall`);
