// Every 3-fruit deck from the five fruits, 20 bot runs each: how far each one gets.
// Usage: npx tsx scripts/decks.ts [runs] [maxMinutes]

import { World } from '../src/sim/world';
import { TICK_HZ, FRUITS } from '../src/sim/config';
import { botAct } from '../src/sim/bot';
import type { FruitKind } from '../src/sim/types';

const runs = Number(process.argv[2] ?? 20);
const maxMin = Number(process.argv[3] ?? 20);
const kinds = Object.keys(FRUITS) as FruitKind[];
const decks: FruitKind[][] = [];
for (let a = 0; a < kinds.length; a++)
  for (let b = a + 1; b < kinds.length; b++) for (let c = b + 1; c < kinds.length; c++) decks.push([kinds[a], kinds[b], kinds[c]]);

const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const rows = decks.map((deck) => {
  const waves: number[] = [];
  const mins: number[] = [];
  for (let seed = 1; seed <= runs; seed++) {
    const w = new World({ seed, deck });
    while (!w.over && w.tick < maxMin * 60 * TICK_HZ) {
      if (w.tick % 15 === 0) botAct(w);
      w.step();
      w.events.length = 0;
    }
    waves.push(w.wave);
    mins.push(w.time / 60);
  }
  return { deck: deck.map((k) => FRUITS[k].name).join(''), min: Math.min(...waves), med: med(waves), max: Math.max(...waves), time: med(mins) };
});
rows.sort((a, b) => b.med - a.med);
for (const r of rows) console.log(`${r.deck}  waves ${r.min}/${r.med}/${r.max}  ${r.time.toFixed(1)} min`);
