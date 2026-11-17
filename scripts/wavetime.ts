// Where a level's minutes go, wave by wave: is the board empty, is anything near the fence, is the
// fence actually being chewed, and how long the fight stands still for a wagon pick. The summary adds
// what the player got out of it (kills, buys, gold left) and whether the fence ever needed the safety
// net (SAFE.from = 50%), across seeds, so a tuning can't look good on the median and lose on the tail.
// Usage: npx tsx scripts/wavetime.ts [levelIndex=0] [policy=hand|none|slow|bot] [seeds=10]
// TRAIN=1 plays it with the training a player would have arrived with (scripts/arriving.ts), which is
// the only honest way to read any level past the first - everything else here measures a fresh save.
import { World } from '../src/sim/world';
import { DT, LOCUST, STAT_KEYS } from '../src/sim/config';
import { botAct } from '../src/sim/bot';
import { newSave, worldOptions } from '../src/meta/progress';
import { arrivingAt } from './arriving';
import { LEVELS, SAFE } from '../src/sim/levels';
import type { StatKey } from '../src/sim/types';

// The run's own cards only: multi/range/move are training-only since 0.0.26 and never buyable here.
const cheapest = (w: World): StatKey | undefined => {
  const open = STAT_KEYS.filter((k) => !w.maxed(k));
  return open.length ? open.reduce((a, b) => (w.statCost(b) < w.statCost(a) ? b : a)) : undefined;
};
const buyOne = (w: World) => { const k = cheapest(w); return k ? w.buy(k) : false; };
type Pol = (w: World, t: number) => void;
const pols: Record<string, Pol> = {
  none: () => {},                                                            // never buys: the weakest player
  hand: (w, t) => { if (t % 30 === 0 && t * DT > 3) buyOne(w); },            // follows the hand, one buy a second
  slow: (w, t) => { if (t % Math.round(20 / DT) === 0 && t > 0) while (buyOne(w)) {} }, // empties the purse every 20 s
  bot: (w, t) => { if (t % 15 === 0) botAct(w); },
};

const lvIdx = Number(process.argv[2] ?? 0);
// Counterfactuals without editing levels.ts: WAVES=6 HP=2 SW=0.6 BITE=1 TOUGH=0.5 PAY=2 npx tsx scripts/wavetime.ts
const L = LEVELS[lvIdx];
if (process.env.WAVES) L.waves = +process.env.WAVES;
if (process.env.HP) L.hp = +process.env.HP;
if (process.env.SW) L.swarm = +process.env.SW;
if (process.env.BITE) L.bite = +process.env.BITE;
if (process.env.BOSS) L.boss = +process.env.BOSS;
// Global, not a level's: swept here to size the boss wave's dead tail.
if (process.env.LEVERY) (LOCUST as { every: number }).every = +process.env.LEVERY;
if (process.env.LCOUNT) (LOCUST as { count: number }).count = +process.env.LCOUNT;
if (process.env.LSHARE) (LOCUST as { hpShare: number }).hpShare = +process.env.LSHARE;
if (process.env.PACE) L.pace = +process.env.PACE;
if (process.env.TO) L.paceTo = +process.env.TO;
if (process.env.TOUGH && L.tough) L.tough = { ...L.tough, share: +process.env.TOUGH, to: +(process.env.TOUGHTO ?? L.tough.to) };
const polName = process.argv[3] ?? 'hand';
const seeds = Number(process.argv[4] ?? 10);
const pol = pols[polName];

interface Wave { t: number; empty: number; near: number; chew: number; peak: number }
interface Run { waves: Wave[]; total: number; stopped: number; fence: number; minFence: number; kills: number; buys: number; gold: number; picks: number; wagons: number; k60: number; b60: number; lost: boolean }
const runs: Run[] = [];

for (let seed = 1; seed <= seeds; seed++) {
  const save = process.env.TRAIN ? arrivingAt(lvIdx) : newSave('2026-11-06');
  const w = new World({ ...worldOptions(save, lvIdx), seed, wagons: process.env.WG !== '0' });
  const waves: Wave[] = [];
  let stopped = 0, minFence = 1, k60 = 0, b60 = 0;
  for (let t = 0; !w.over && t < 3600 / DT; t++) {
    pol(w, t);
    w.step();
    w.events.length = 0;
    minFence = Math.min(minFence, w.wallHp / w.wallMax);
    if (w.time <= 60) { k60 = w.kills; b60 = w.buys; }
    if (w.wg?.offer) { stopped += DT; continue; }
    const i = Math.max(1, w.wave) - 1;
    waves[i] ??= { t: 0, empty: 0, near: 0, chew: 0, peak: 0 };
    const cur = waves[i];
    const alive = w.enemies.filter((e) => e.hp > 0);
    cur.t += DT;
    cur.peak = Math.max(cur.peak, alive.length);
    if (alive.length <= 2) cur.empty += DT;
    if (alive.some((e) => e.d < 1)) cur.near += DT;
    if (alive.some((e) => e.d <= 0)) cur.chew += DT;
  }
  runs.push({ waves, total: w.time, stopped, fence: w.wallHp / w.wallMax, minFence, kills: w.kills, buys: w.buys, gold: Math.floor(w.gold), picks: w.wg?.picks ?? 0, wagons: w.wg?.list.length ?? 0, k60, b60, lost: w.wallHp <= 0 });
}

const srt = (xs: number[]) => [...xs].sort((a, b) => a - b);
const med = (xs: number[]) => (xs.length ? srt(xs)[xs.length >> 1] : 0);
const lo = (xs: number[]) => (xs.length ? srt(xs)[0] : 0);
const hi = (xs: number[]) => (xs.length ? srt(xs)[xs.length - 1] : 0);
const of = <K extends keyof Run>(k: K) => runs.map((r) => r.waves ? (r[k] as number) : 0);
const col = (i: number, f: (x: Wave) => number) => med(runs.map((r) => r.waves[i]).filter(Boolean).map(f));
const nWaves = Math.max(...runs.map((r) => r.waves.length));

console.log(`level ${lvIdx + 1} (index ${lvIdx})  policy ${polName}  ${seeds} seeds  [waves=${L.waves} hp=${L.hp} swarm=${L.swarm ?? 1} bite=${L.bite ?? 1} boss=${L.boss ?? 1}x locust=${LOCUST.every}s tough=${L.tough?.share ?? 0}@${L.tough?.to ?? '-'} pace=${L.pace ?? 1}@${L.paceTo ?? 'all'}]`);
console.log('wave |  secs | empty(<=2 bugs) | near fence | chewing | peak bugs');
for (let i = 0; i < nWaves; i++) {
  const t = col(i, (x) => x.t);
  if (!t) continue;
  const pc = (v: number) => `${((100 * v) / t).toFixed(0)}%`.padStart(4);
  console.log(
    `${String(i + 1).padStart(4)} | ${t.toFixed(1).padStart(5)} | ${pc(col(i, (x) => x.empty))} (${col(i, (x) => x.empty).toFixed(1)}s)`.padEnd(40) +
    `| ${pc(col(i, (x) => x.near))}`.padEnd(13) + `| ${pc(col(i, (x) => x.chew))}`.padEnd(10) + `| ${col(i, (x) => x.peak)}`,
  );
}
const tot = of('total'), fence = of('fence'), mf = of('minFence');
const netFired = runs.filter((r) => r.minFence < SAFE.from).length;
console.log(
  `\nlevel: ${(med(tot) / 60).toFixed(1)} min (${med(tot).toFixed(0)}s, ${lo(tot).toFixed(0)}-${hi(tot).toFixed(0)}), picks froze ${med(of('stopped')).toFixed(0)}s` +
  `\nfence: left ${(100 * med(fence)).toFixed(0)}% (worst seed ${(100 * lo(fence)).toFixed(0)}%), lowest it ever got ${(100 * lo(mf)).toFixed(0)}%, safety net fired in ${netFired}/${seeds}, lost ${runs.filter((r) => r.lost).length}/${seeds}` +
  `\nplayer: kills ${med(of('kills'))}, buys ${med(of('buys'))}, gold left ${med(of('gold'))}  |  by 60s: kills ${med(of('k60'))}, buys ${med(of('b60'))}
wagons: ${med(of('picks'))} picks (${lo(of('picks'))}-${hi(of('picks'))}), ${med(of('wagons'))} wagons on the train (${lo(of('wagons'))}-${hi(of('wagons'))})`,
);

// `World.time` stops while a card offer is up (world.ts:236 -> hold() does not advance it), so the
// level length above is fight time. The player's clock also carries the frozen seconds: the bot taps
// at once and pays ~3 s a run, a player who lets `autoPick` run out pays the full 10 s a pick.
const wall = med(tot) + med(of('stopped'));
console.log(`on the player's clock: ${(wall / 60).toFixed(1)} min if the cards are never tapped, ${((med(tot) + 2 * (med(of('stopped')) / 10)) / 60).toFixed(1)} min if tapped at once`);
