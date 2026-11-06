// Endless run profile: a bot with full training plays to wave N; prints per-wave alive bugs, projectiles and sim step time.
import { World } from '../src/sim/world';
import { botAct } from '../src/sim/bot';
import { newSave, worldOptions } from '../src/meta/progress';
import { STAT_KEYS } from '../src/sim/config';
const save = newSave('2026-11-06');
for (const k of STAT_KEYS) (save.train as Record<string, number>)[k] = Number(process.argv[3] ?? 30);
const w = new World({ ...worldOptions(save, 'endless'), seed: 7 });
const until = Number(process.argv[2] ?? 46);
let ev = 0, wave = w.wave, maxE = 0, maxP = 0, ms = 0, steps = 0, worst = 0;
while (!w.over && w.wave <= until && w.time < 4000) {
  botAct(w);
  const t0 = performance.now();
  w.step();
  const d = performance.now() - t0;
  ms += d; steps++; worst = Math.max(worst, d);
  ev += w.events.length; w.events.length = 0;
  maxE = Math.max(maxE, w.enemies.length); maxP = Math.max(maxP, w.projectiles.length);
  if (w.wave !== wave) {
    if (wave % 5 === 0 || wave > 38) console.log(`wave ${wave}: t ${w.time.toFixed(0)} maxEnemies ${maxE} maxProj ${maxP} step avg ${(ms / steps).toFixed(3)} ms worst ${worst.toFixed(2)} gold ${w.gold.toFixed(0)} events/s ${(ev / steps * 30).toFixed(0)}`);
    wave = w.wave; maxE = maxP = 0; ms = steps = 0; worst = 0; ev = 0;
  }
}
console.log('end', w.wave, w.over, w.time.toFixed(0));
