// What is new in an endless wave? The curve scripts (ladder, endless-prof) measure pressure; this one
// measures novelty - per wave: how long it ran, which bug kinds were on the field, how many wagon picks
// have happened and how many of them were a real choice, how many stat cards were bought, and the build
// the player is carrying. Read it to find the wave after which two lines in a row are identical: that is
// the wave the run stops telling the player anything (2026-11-21: wave 21-22, see battle.md 9.3).
// Usage: npx tsx scripts/novelty.ts [seeds=5] [untilWave=45]
import { World } from '../src/sim/world';
import { DT } from '../src/sim/config';
import { pickCard } from '../src/sim/bot';
import { STAT_KEYS } from '../src/sim/config';
import { worldOptions } from '../src/meta/progress';
import type { StatKey } from '../src/sim/types';
import { arrivingAt } from './arriving';

const seeds = Number(process.argv[2] ?? 5);
const until = Number(process.argv[3] ?? 45);
const save = arrivingAt(10);

const cheapest = (w: World): StatKey | undefined => {
  const open = STAT_KEYS.filter((k) => !w.maxed(k));
  return open.length ? open.reduce((a, b) => (w.statCost(b) < w.statCost(a) ? b : a)) : undefined;
};

type Row = { secs: number; kinds: Set<string>; buys: Set<string>; nbuys: number; offers: number; choices: number; fence: number; picks: number; build: string };
const rows: Map<number, Row[]> = new Map();

for (let s = 1; s <= seeds; s++) {
  const w = new World({ ...worldOptions(save, 'endless'), seed: s });
  let wave = w.wave, t0 = 0;
  let row: Row = { secs: 0, kinds: new Set(), buys: new Set(), nbuys: 0, offers: 0, choices: 0, fence: 1, picks: 0, build: '' };
  for (let t = 0; t < 60 * 60 * 30 && !w.over && w.wave <= until; t++) {
    const offer = w.wg?.offer;
    if (offer) { row.offers++; if (offer.opts.length >= 2) row.choices++; w.pickWagon(pickCard(offer.opts)); }
    else if (t % 30 === 0 && t * DT > 3) { const k = cheapest(w); if (k && w.buy(k)) { row.buys.add(k); row.nbuys++; } }
    w.step();
    for (const e of w.enemies) row.kinds.add(e.tough ? e.kind + '+' : e.kind);
    w.events.length = 0;
    if (w.wave !== wave) {
      row.secs = w.time - t0; t0 = w.time; row.fence = w.wallHp / w.wallMax;
      row.picks = w.wg?.picks ?? 0;
      row.build = (w.wg?.list ?? []).map((g: { kind: string; lv: number }) => `${g.kind[0]}${g.lv}`).sort().join('');
      if (!rows.has(wave)) rows.set(wave, []);
      rows.get(wave)!.push(row);
      row = { secs: 0, kinds: new Set(), buys: new Set(), nbuys: 0, offers: 0, choices: 0, fence: 1, picks: 0, build: '' };
      wave = w.wave;
    }
  }
}

const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1] ?? 0;
console.log('wave  secs  kinds-on-field          picks choice/offer  buys  distinct-cards  fence  build');
for (const [wave, rs] of [...rows].sort((a, b) => a[0] - b[0])) {
  const kinds = [...new Set(rs.flatMap((r) => [...r.kinds]))].sort().join(',');
  const cards = [...new Set(rs.flatMap((r) => [...r.buys]))].sort().join(',');
  console.log(
    String(wave).padStart(4) +
    String(med(rs.map((r) => r.secs)).toFixed(0)).padStart(6) + '  ' +
    kinds.padEnd(24) +
    String(med(rs.map((r) => r.picks))).padStart(5) +
    `  ${rs.reduce((a, r) => a + r.choices, 0)}/${rs.reduce((a, r) => a + r.offers, 0)}`.padEnd(14) +
    String(med(rs.map((r) => r.nbuys))).padStart(5) + '  ' +
    cards.padEnd(16) +
    (med(rs.map((r) => r.fence)) * 100).toFixed(0).padStart(5) + '  ' +
    (rs[0]?.build ?? ''),
  );
}
