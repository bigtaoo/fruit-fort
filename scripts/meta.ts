// M4 acceptance (§15): does the second run go clearly further than the first? Bot players play
// several runs in a row, spending crystals between runs on the cheapest upgrade that helps.
// Usage: npx tsx scripts/meta.ts [players] [runs] [maxMinutes]

import { World } from '../src/sim/world';
import { TICK_HZ } from '../src/sim/config';
import { botAct } from '../src/sim/bot';
import { buyFruit, buyVillage, finishRun, fruitPrice, newSave, villagePrice, worldOptions, type Save, type VillageKey } from '../src/meta/progress';

const players = Number(process.argv[2] ?? 12);
const runs = Number(process.argv[3] ?? 4);
const maxMin = Number(process.argv[4] ?? 30);

/** Cheapest first among the deck's fruit levels and the village; stops when nothing fits. */
function spend(s: Save): void {
  for (;;) {
    const opts: { price: number; buy: () => boolean }[] = [];
    for (const k of s.deck) {
      const p = fruitPrice(s, k);
      if (p !== null) opts.push({ price: p, buy: () => buyFruit(s, k) });
    }
    for (const k of ['wall', 'gold', 'corner'] as VillageKey[]) {
      const p = villagePrice(s, k);
      if (p !== null) opts.push({ price: p, buy: () => buyVillage(s, k) });
    }
    opts.sort((a, b) => a.price - b.price);
    if (!opts.length || opts[0].price > s.crystals) return;
    opts[0].buy();
  }
}

const waves: number[][] = Array.from({ length: runs }, () => []);
for (let p = 1; p <= players; p++) {
  const save = newSave('2026-10-28');
  for (let r = 0; r < runs; r++) {
    const w = new World({ ...worldOptions(save), seed: p * 100 + r });
    while (!w.over && w.tick < maxMin * 60 * TICK_HZ) {
      if (w.tick % 15 === 0) botAct(w);
      w.step();
      w.events.length = 0;
    }
    waves[r].push(w.wave);
    finishRun(save, { wave: w.wave, kills: w.kills, merges: w.merges, casts: w.casts, summons: w.summons });
    spend(save);
  }
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
waves.forEach((xs, r) => console.log(`run ${r + 1}: median wave ${med(xs)} (${Math.min(...xs)}–${Math.max(...xs)})`));
