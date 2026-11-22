// Does anything ever reach the fence? Per wave band, for a player who keeps buying: where bugs die
// (distance outside the fence), how many of them ever touch it, what the fence has left, and the
// stat levels reached - so a run here can be held against a real player's screenshot.
// Usage: npx tsx scripts/reach.ts [seeds=3] [untilWave=70]
import { World } from '../src/sim/world';
import { DT, STAT_KEYS, STATS, WAGONS, WALL, ENEMIES } from '../src/sim/config';
import { WAVES } from '../src/sim/wavedefs';
import { pickCard } from '../src/sim/bot';
import { worldOptions } from '../src/meta/progress';
import type { StatKey } from '../src/sim/types';
import { arrivingAt } from './arriving';
import { PRICES, TRAIN_KEYS } from '../src/meta/shop';

// RANGE=/BITE= override the two 2026-11-21 knobs in place, to tell their doses apart without
// touching config.ts (which another session is editing).
if (process.env.RANGE) STATS.range.per = Number(process.env.RANGE);
if (process.env.BITE) WAVES.biteLate.per = Number(process.env.BITE);
// The §9.5 kinds, to tell their doses apart: NODIG=/NOBOMB= keep one out of the run entirely, and
// SURFACE=/BLAST=/DIGS=/BOMBS= set how deep a digger comes up, what a bomber takes off the fence,
// and what share of a wave each one is.
if (process.env.NODIG) WAVES.diggerFrom = Infinity;
if (process.env.NOBOMB) WAVES.bomberFrom = Infinity;
if (process.env.SURFACE) WAVES.digger.surfaceAt = WAVES.digger.deepest = Number(process.env.SURFACE);
if (process.env.BLAST) WAVES.bomber.blast = Number(process.env.BLAST);
if (process.env.FUSE) WAVES.bomber.fuse = Number(process.env.FUSE);
if (process.env.DIGS) WAVES.mix.early.digger = WAVES.mix.late.digger = Number(process.env.DIGS);
if (process.env.BOMBS) WAVES.mix.early.bomber = WAVES.mix.late.bomber = Number(process.env.BOMBS);
// FORGE= scales every reforge dose by this fraction of its bonus (FORGE=0.5 halves all three),
// to bracket how much power the reforge layer may add before endless stops ending.
if (process.env.FORGE) {
  const f = Number(process.env.FORGE);
  const F = WAGONS.forge;
  F.rate = 1 + (F.rate - 1) * f;
  F.damage = 1 + (F.damage - 1) * f;
  F.wide = 1 + (F.wide - 1) * f;
}
const seeds = Number(process.argv[2] ?? 3);
const until = Number(process.argv[3] ?? 70);
const save = arrivingAt(Number(process.env.AT ?? 10));
// MAX=1: the save a developer who has cleared everything plays on - every training at its cap, hero
// level 5, village maxed. `arrivingAt(10)` is the player who just opened endless; the two are far
// apart, and the screenshot of wave 66 is the maxed one.
if (process.env.MAX) {
  const only = (process.env.ONLY ?? '').split(',').filter(Boolean) as typeof TRAIN_KEYS;
  for (const k of TRAIN_KEYS) if (!only.length || only.includes(k)) (save.train as Record<string, number>)[k] = PRICES.train[k].max;
  save.heroes[save.hero] = PRICES.heroMax;
  for (const k of Object.keys(PRICES.village) as (keyof typeof PRICES.village)[]) (save.village as Record<string, number>)[k] = PRICES.village[k].max;
}
const cheapest = (w: World): StatKey | undefined => {
  const open = STAT_KEYS.filter((k) => !w.maxed(k));
  return open.length ? open.reduce((a, b) => (w.statCost(b) < w.statCost(a) ? b : a)) : undefined;
};

type Row = { spawned: number; touched: number; killD: number[]; fence: number; secs: number; hp: number };
const rows = new Map<number, Row[]>();
let lastLv = '';
// Where each seed's run ended. One seed is not a reading: a run lives or dies at one dip (seed 1 of
// `arrivingAt(19)` is down to 9% fence around wave 40), so a change that only decides which side of
// that dip one seed lands on reads as a swing of twenty waves. Judge on the median of the lot.
const ends: { wave: number; mins: number }[] = [];

for (let s = 1; s <= seeds; s++) {
  const w = new World({ ...worldOptions(save, 'endless'), seed: s });
  let wave = w.wave, t0 = 0;
  let row: Row = { spawned: 0, touched: 0, killD: [], fence: 1, secs: 0, hp: 0 };
  const seen = new Map<number, number>();   // id -> last distance to fence
  const touched = new Set<number>();
  for (let t = 0; t < 90 * 60 * 30 && !w.over && w.wave <= until; t++) {
    const offer = w.wg?.offer;
    if (offer) w.pickWagon(pickCard(offer.opts));
    else if (t % 30 === 0 && t * DT > 3) { const k = cheapest(w); if (k) w.buy(k); }
    w.step();
    const alive = new Set<number>();
    for (const e of w.enemies) {
      alive.add(e.id);
      if (!seen.has(e.id)) row.spawned++;
      seen.set(e.id, e.d);
      if (e.d <= 0 && !touched.has(e.id)) { touched.add(e.id); row.touched++; }
    }
    for (const [id, d] of seen) if (!alive.has(id)) { if (!touched.has(id)) row.killD.push(d); seen.delete(id); touched.delete(id); }
    w.events.length = 0;
    if (w.wave !== wave) {
      row.secs = w.time - t0; t0 = w.time; row.fence = w.wallHp / w.wallMax;
      row.hp = w.enemies.length ? 0 : 0;
      if (!rows.has(wave)) rows.set(wave, []);
      rows.get(wave)!.push(row);
      row = { spawned: 0, touched: 0, killD: [], fence: 1, secs: 0, hp: 0 };
      wave = w.wave;
    }
  }
  lastLv = STAT_KEYS.map((k) => `${k}${(w.lv as Record<string, number>)[k]}`).join(' ');
  ends.push({ wave: w.wave, mins: w.time / 60 });
}

const mid = <T>(xs: T[], by: (x: T) => number) => [...xs].sort((a, b) => by(a) - by(b))[xs.length >> 1];
console.log(
  `${ends.length} seeds ended waves ${ends.map((e) => e.wave).join(' ')}` +
  `\n  median wave ${mid(ends, (e) => e.wave).wave} at ${mid(ends, (e) => e.mins).mins.toFixed(0)} min` +
  `\n  seed ${ends.length} stats: ${lastLv}\n`,
);

const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[xs.length >> 1] : NaN);
console.log('wave  secs  bugs  touched-fence  kill-dist(med)  killed-at-radius  fence%  cat-hp');
for (const [wave, rs] of [...rows].sort((a, b) => a[0] - b[0])) {
  if (wave % 5 && wave !== 1) continue;
  const kd = med(rs.flatMap((r) => r.killD));
  const touch = rs.reduce((a, r) => a + r.touched, 0), spawn = rs.reduce((a, r) => a + r.spawned, 0);
  console.log(
    String(wave).padStart(4) +
    med(rs.map((r) => r.secs)).toFixed(0).padStart(6) +
    String(Math.round(spawn / rs.length)).padStart(6) +
    `${touch}/${spawn} (${(100 * touch / spawn).toFixed(0)}%)`.padStart(15) +
    kd.toFixed(2).padStart(16) +
    (WALL + kd).toFixed(2).padStart(18) +
    (med(rs.map((r) => r.fence)) * 100).toFixed(0).padStart(8) +
    Math.round(ENEMIES.caterpillar.hp * (rs[0] ? 1 : 1)).toString().padStart(8),
  );
}
