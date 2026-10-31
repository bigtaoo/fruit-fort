// Pacing with config overrides, for trying numbers before writing them into config.ts.
// Usage: npx tsx scripts/tune.ts '{"ECON":{"startGold":30},"TRAIN":{"damage":10}}' [runs] [maxMinutes] [hero]
// Nested objects merge one level down, e.g. '{"STATS":{"dmg":{"cost":15}}}'.

import * as config from '../src/sim/config';
import { World } from '../src/sim/world';
import { botAct } from '../src/sim/bot';
import type { HeroKind } from '../src/sim/types';

const over = JSON.parse(process.argv[2] ?? '{}') as Record<string, Record<string, unknown>>;
for (const [k, v] of Object.entries(over)) {
  const target = (config as unknown as Record<string, Record<string, unknown>>)[k];
  for (const [kk, vv] of Object.entries(v)) {
    if (vv && typeof vv === 'object' && !Array.isArray(vv)) Object.assign(target[kk] as object, vv);
    else target[kk] = vv;
  }
}
const runs = Number(process.argv[3] ?? 20);
const maxMin = Number(process.argv[4] ?? 30);
const hero = process.argv[5] as HeroKind | undefined;
const rows: { wave: number; min: number; acts: number; late: number; buyGap: number; grabs: number; seen: number; lv: string }[] = [];
for (let seed = 1; seed <= runs; seed++) {
  const w = new World({ seed, hero });
  let acts = 0;
  let late = 0;
  let lateWaves = 0;
  while (!w.over && w.tick < maxMin * 60 * config.TICK_HZ) {
    if (w.tick % 15 === 0) botAct(w);
    for (const e of w.events) {
      if (e.t === 'buy' || e.t === 'reverse' || e.t === 'cast') {
        acts++;
        if (w.wave >= 12) late++;
      }
      if (e.t === 'wave' && e.wave > 12) lateWaves++;
    }
    w.events.length = 0;
    w.step();
  }
  const lv = config.STAT_KEYS.map((k) => `${k}${w.lv[k]}`).join(' ');
  rows.push({ wave: w.wave, min: w.time / 60, acts: acts / Math.max(1, w.wave), late: late / Math.max(1, lateWaves), buyGap: w.time / Math.max(1, w.buys), grabs: w.grabs, seen: w.happenings, lv });
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const col = <K extends 'wave' | 'min' | 'acts' | 'late' | 'buyGap' | 'grabs' | 'seen'>(k: K) => rows.map((r) => r[k]);
console.log(`waves min ${Math.min(...col('wave'))} median ${med(col('wave'))} max ${Math.max(...col('wave'))} | run ${med(col('min')).toFixed(1)} min | acts/wave ${avg(col('acts')).toFixed(1)} (from wave 12: ${avg(col('late')).toFixed(1)}) | a buy every ${avg(col('buyGap')).toFixed(1)} s | events ${avg(col('grabs')).toFixed(1)}/${avg(col('seen')).toFixed(1)}`);
console.log(`median run levels: ${rows.slice().sort((a, b) => a.wave - b.wave)[rows.length >> 1].lv}`);
