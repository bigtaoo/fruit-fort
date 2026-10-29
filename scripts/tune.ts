// Pacing with config overrides, for trying numbers before writing them into config.ts.
// Usage: npx tsx scripts/tune.ts '{"ECON":{"summonBase":25},"HERO":{"damage":8}}' [runs] [maxMinutes]

import * as config from '../src/sim/config';
import { World } from '../src/sim/world';
import { botAct } from '../src/sim/bot';

const over = JSON.parse(process.argv[2] ?? '{}') as Record<string, Record<string, unknown>>;
for (const [k, v] of Object.entries(over)) Object.assign((config as unknown as Record<string, object>)[k], v);
const runs = Number(process.argv[3] ?? 20);
const maxMin = Number(process.argv[4] ?? 30);
const rows: { wave: number; acts: number; late: number; stuck: number; cards: number; grabs: number; seen: number }[] = [];
for (let seed = 1; seed <= runs; seed++) {
  const w = new World({ seed });
  let stuck = 0;
  let acts = 0;
  let late = 0;
  let lateWaves = 0;
  while (!w.over && w.tick < maxMin * 60 * config.TICK_HZ) {
    if (w.tick % 15 === 0) botAct(w);
    if (w.tick % config.TICK_HZ === 0 && w.emptyCells().length === 0) {
      let move = false;
      for (let a = 0; a < 10 && !move; a++) for (let b = 0; b < 9 && !move; b++) move = w.canMerge(a, b) || w.canFeed(a, b);
      if (!move) stuck++;
    }
    for (const e of w.events) {
      if (['summon', 'merge', 'feed', 'move', 'sell', 'card', 'cast', 'grab'].includes(e.t)) {
        acts++;
        if (w.wave >= 12) late++;
      }
      if (e.t === 'wave' && e.wave > 12) lateWaves++;
    }
    w.events.length = 0;
    w.step();
  }
  rows.push({ wave: w.wave, acts: acts / Math.max(1, w.wave), late: late / Math.max(1, lateWaves), stuck, cards: w.upgrades, grabs: w.grabs, seen: w.happenings });
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const col = <K extends keyof (typeof rows)[0]>(k: K) => rows.map((r) => r[k]);
console.log(`waves min ${Math.min(...col('wave'))} median ${med(col('wave'))} max ${Math.max(...col('wave'))} | acts/wave ${avg(col('acts')).toFixed(1)} (from wave 12: ${avg(col('late')).toFixed(1)}) | stuck ${avg(col('stuck')).toFixed(0)} s/run | cards ${avg(col('cards')).toFixed(1)} | events ${avg(col('grabs')).toFixed(1)}/${avg(col('seen')).toFixed(1)}`);
