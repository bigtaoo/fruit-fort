// One bot run, logged wave by wave: what a player would feel (gold, wall, stats, idle time).
// Usage: npx tsx scripts/timeline.ts [seed] [hero]

import { World } from '../src/sim/world';
import { STAT_KEYS, TICK_HZ } from '../src/sim/config';
import { botAct } from '../src/sim/bot';
import { trainDps } from '../src/sim/combat';
import type { HeroKind } from '../src/sim/types';

const seed = Number(process.argv[2] ?? 1);
const w = new World({ seed, hero: process.argv[3] as HeroKind | undefined });
let wave = 0;
let waveT = 0;
let chew = 0; // enemy-seconds spent at the wall
let idle = 0; // seconds with gold for some stat and nothing bought
let buys: string[] = [];
let reverses = 0;
const maxTicks = 30 * 60 * TICK_HZ;
const levels = () => STAT_KEYS.map((k) => `${k}${w.lv[k]}`).join(' ');
while (!w.over && w.tick < maxTicks) {
  if (w.tick % 15 === 0) botAct(w);
  if (w.tick % TICK_HZ === 0 && STAT_KEYS.some((k) => w.canBuy(k))) idle++;
  w.step();
  chew += w.enemies.filter((e) => e.d <= 0).length / TICK_HZ;
  for (const e of w.events) {
    if (e.t === 'buy') buys.push(e.stat);
    if (e.t === 'reverse') reverses++;
    if (e.t === 'grab') buys.push(`[${e.kind}${e.stat ? ':' + e.stat : ''}]`);
    if (e.t === 'wave') {
      if (wave > 0) {
        console.log(
          `w${String(wave).padStart(2)} ${(w.time - waveT).toFixed(0).padStart(3)}s  gold ${Math.floor(w.gold).toString().padStart(4)}  wall ${Math.ceil(w.wallHp)}/${w.wallMax}  dps ${trainDps(w).toFixed(0).padStart(4)}  chew ${chew.toFixed(0).padStart(3)}  idle ${idle}s  rev ${reverses}  buys ${buys.join(',')}`,
        );
      }
      wave = e.wave;
      waveT = w.time;
      chew = 0;
      idle = 0;
      reverses = 0;
      buys = [];
    }
  }
  w.events.length = 0;
}
console.log(`END wave ${w.wave} at ${(w.time / 60).toFixed(1)} min, kills ${w.kills}, buys ${w.buys}, reverses ${w.reverses}, casts ${w.casts}, events ${w.grabs}/${w.happenings}; ${levels()}`);
