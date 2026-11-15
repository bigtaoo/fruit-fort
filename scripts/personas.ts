// Ten player personalities, played out in the headless sim against the real meta loop (§12.2, §9.1).
//
// scripts/bot.ts plays one policy: the sharp one. It answers "is the game winnable", which is not the
// question the telemetry keeps asking. The median player leaves at ~90 s with the fence at ~90% and the
// fight being WON (memory: playtime-goal), so what loses them is not difficulty, it is the stretches
// where their own way of playing has nothing to do. A policy that is bored is a policy that leaves, and
// every personality is bored by something different.
//
// So each persona here is a policy plus a patience: how it shops, whether it steers, whether it uses the
// hero, which wagon cards it likes, how long it will sit with nothing to do, and how many losses it
// takes. The run loop is the real World; the between-runs loop is the real progress.ts. What comes out
// is, per persona: how long they played, how far they got, and the reason they stopped.
//
// This is a model of leaving, not a measurement of it. Its worth is comparative: the same yardstick over
// ten ways of playing shows which stretches of the design are thin for whom. Treat a persona's minutes
// as a signal, never as a predicted retention number.
//
// Usage: npx tsx scripts/personas.ts [seeds=12] [maxMinutes=25] [persona-id]

import { World } from '../src/sim/world';
import { DT, HAPPENINGS, STAT_KEYS } from '../src/sim/config';
import { trainRange } from '../src/sim/combat';
import { LEVELS, levelName } from '../src/sim/levels';
import { TRAIN_KEYS, buyTrain, finishRun, newSave, nextLevel, trainPrice, worldOptions, type RunMode, type Save, type TrainKey } from '../src/meta/progress';
import type { StatKey, WagonOpt } from '../src/sim/types';

const seeds = Number(process.argv[2] ?? 12);
const maxMin = Number(process.argv[3] ?? 25);
const only = process.argv[4];

/** Seconds a village visit costs between two runs, charged to the play time like any other screen. */
const VILLAGE_S = 8;

type Steer = 'greedy' | 'event' | 'never' | 'wall';
type Cast = 'asap' | 'crowd' | 'never';

interface Persona {
  id: string;
  name: string;
  /** Seconds between seeing something and doing it. */
  react: number;
  /** Seconds between two of this player's taps, at their own pace. */
  pace: number;
  /** The stat they reach for out of what they can afford right now; null = they are saving. */
  shop: (w: World) => StatKey | null;
  steer: Steer;
  cast: Cast;
  /** Their taste in wagon cards, by kind. */
  card: Record<WagonOpt['kind'], number>;
  /** Seconds with nothing their policy would do and nothing at the fence, before they close the tab. */
  bore: number;
  /** Losses in a row before they stop. */
  losses: number;
  /** Do they spend crystals between runs, or just press play again? */
  spends: boolean;
  /** Do they replay a cleared level for the stars they missed? */
  replays?: boolean;
}

const ATTACK: Record<WagonOpt['kind'], number> = { arc: 5, missile: 4, plasma: 4, mine: 3, frost: 3, magnet: 2, skill: 1, repair: 1, gold: 1 };
const KEEP: Record<WagonOpt['kind'], number> = { gold: 5, repair: 5, magnet: 4, skill: 3, frost: 2, mine: 2, arc: 1, missile: 1, plasma: 1 };
const FLAT: Record<WagonOpt['kind'], number> = { arc: 1, missile: 1, plasma: 1, mine: 1, frost: 1, magnet: 1, skill: 1, repair: 1, gold: 1 };

/** The cheapest thing on the board they can afford. */
const cheapest = (w: World): StatKey | null => {
  let best: StatKey | null = null;
  for (const k of STAT_KEYS) if (w.canBuy(k) && (!best || w.statCost(k) < w.statCost(best))) best = k;
  return best;
};

/** Best value for the price, the way scripts/bot.ts weighs it. */
const value = (w: World): StatKey | null => {
  const weight: Partial<Record<StatKey, number>> = {
    dmg: 1, spd: 0.9, splash: 0.8, heavy: 0.6, crit: 0.6,
    gold: w.wave < 10 ? 0.8 : 0.2, wall: 0.3, wagon: 0.25 * (w.wg?.list.length ?? 0),
  };
  let best: StatKey | null = null;
  let bestScore = 0;
  for (const k of STAT_KEYS) {
    if (!w.canBuy(k)) continue;
    const score = (weight[k] ?? 0) / w.statCost(k);
    if (score > bestScore) [best, bestScore] = [k, score];
  }
  return best;
};

/** One stat and nothing else, for as long as it can still be bought. */
const only1 = (k: StatKey) => (w: World): StatKey | null => (w.canBuy(k) ? k : null);

/** Passes over the cheap cards and saves for a dear one: the priciest they can afford, nothing under
 * `floor`. Written as its own pass over the cards, not `value()` filtered, or the filter would throw
 * away the one card `value()` picked (dmg, the cheapest) and the hoarder would never buy at all. */
const dear = (floor: number) => (w: World): StatKey | null => {
  let best: StatKey | null = null;
  for (const k of STAT_KEYS) if (w.canBuy(k) && w.statCost(k) >= floor && (!best || w.statCost(k) > w.statCost(best))) best = k;
  return best;
};

const PERSONAS: Persona[] = [
  // 1. The sharp one: scripts/bot.ts's policy with a human's hands on it. The ceiling, not the median.
  { id: 'sharp', name: '数值型 min-maxer', react: 0.4, pace: 0.5, shop: value, steer: 'greedy', cast: 'crowd', card: ATTACK, bore: 90, losses: 5, spends: true, replays: true },
  // 2. Buys the first thing they can afford, every time, and never saves. The commonest real player.
  { id: 'tapper', name: '手快型 button masher', react: 0.5, pace: 0.6, shop: cheapest, steer: 'greedy', cast: 'asap', card: FLAT, bore: 25, losses: 2, spends: true },
  // 3. Damage and nothing else: the one-stat player every tower game has.
  { id: 'dmg', name: '莽夫型 damage only', react: 0.8, pace: 1.0, shop: only1('dmg'), steer: 'greedy', cast: 'asap', card: ATTACK, bore: 30, losses: 2, spends: true },
  // 4. Saves for the expensive thing and buys nothing in the meantime.
  { id: 'hoarder', name: '囤积型 hoarder', react: 1.0, pace: 1.5, shop: dear(25), steer: 'greedy', cast: 'crowd', card: KEEP, bore: 25, losses: 3, spends: true },
  // 5. Watches more than they tap: one action every few seconds, no steering, no hero.
  { id: 'idler', name: '摸鱼型 idler', react: 2.5, pace: 4.0, shop: cheapest, steer: 'never', cast: 'never', card: FLAT, bore: 20, losses: 1, spends: false },
  // 6. Slow hands, and parks on the fence side instead of chasing.
  { id: 'fumbler', name: '手残型 fumbler', react: 2.5, pace: 1.8, shop: cheapest, steer: 'wall', cast: 'asap', card: FLAT, bore: 30, losses: 2, spends: true },
  // 7. Chases every basket and gold bug and lets the fence look after itself.
  { id: 'explorer', name: '探索型 explorer', react: 0.8, pace: 1.0, shop: cheapest, steer: 'event', cast: 'crowd', card: KEEP, bore: 20, losses: 3, spends: true },
  // 8. Fence first, always: buys wall whenever it is on the board.
  { id: 'turtle', name: '守家型 turtle', react: 0.9, pace: 1.2, shop: (w) => (w.canBuy('wall') ? 'wall' : cheapest(w)), steer: 'greedy', cast: 'crowd', card: KEEP, bore: 35, losses: 3, spends: true },
  // 9. Takes gold and repair cards over weapons, and buys the economy stat.
  { id: 'collector', name: '收集型 collector', react: 0.9, pace: 1.1, shop: (w) => (w.canBuy('gold') ? 'gold' : cheapest(w)), steer: 'event', cast: 'crowd', card: KEEP, bore: 25, losses: 3, spends: true },
  // 10. Short fuse: leaves the moment the screen stops asking anything of them.
  { id: 'impatient', name: '急躁型 impatient', react: 0.4, pace: 0.5, shop: cheapest, steer: 'greedy', cast: 'asap', card: ATTACK, bore: 12, losses: 1, spends: true },
  // 11. One thumb on the buy button and nothing else: no steering, no hero, no cards.
  { id: 'onehand', name: '单手型 one-thumb', react: 1.0, pace: 1.2, shop: cheapest, steer: 'never', cast: 'never', card: FLAT, bore: 25, losses: 2, spends: true },
  // 12. Will not move on until the level has all three stars.
  { id: 'perfect', name: '完美型 completionist', react: 0.5, pace: 0.7, shop: value, steer: 'greedy', cast: 'crowd', card: ATTACK, bore: 45, losses: 4, spends: true, replays: true },
];

const TAU = Math.PI * 2;
const delta = (a: number, b: number): number => ((((b - a) % TAU) + Math.PI * 3) % TAU) - Math.PI;

/** Where this persona wants the train, or null if they would leave it alone. */
function goal(p: Persona, w: World): number | null {
  if (p.steer === 'never') return null;
  const h = w.happening;
  if (p.steer === 'event' && h && HAPPENINGS[h.kind].life - h.t >= p.react) return h.angle;
  let near: { x: number; z: number; d: number } | null = null;
  for (const e of w.enemies) if (e.hp > 0 && (!near || e.d < near.d)) near = e;
  if (!near) return null;
  if (p.steer !== 'wall') {
    const t = w.trainPos();
    if (Math.hypot(near.x - t.x, near.z - t.z) <= trainRange(w) - 0.3) return null;
  }
  return Math.atan2(near.z, near.x);
}

/** A bug close enough to the fence that the player is watching it, action or no action. */
const threatened = (w: World): boolean => w.enemies.some((e) => e.hp > 0 && e.d <= 1.5);

/** Anything this persona would reach for right now. */
function wants(p: Persona, w: World): boolean {
  if (w.wg?.offer) return true;
  if (p.cast !== 'never' && w.heroReady() && (p.cast === 'asap' || w.enemies.length > 3)) return true;
  if (p.shop(w)) return true;
  return goal(p, w) !== null;
}

/** One tap. Returns true when they actually did something. */
function act(p: Persona, w: World): boolean {
  const offer = w.wg?.offer;
  if (offer) {
    const score = (o: WagonOpt) => p.card[o.kind] + (o.lv > 1 ? 3 : 0);
    return w.pickWagon(offer.opts.reduce((b, o, j) => (score(o) > score(offer.opts[b]) ? j : b), 0));
  }
  if (p.cast !== 'never' && w.heroReady() && (p.cast === 'asap' || w.enemies.length > 3)) return w.cast();
  const want = p.shop(w);
  if (want) return w.buy(want);
  const target = goal(p, w);
  if (target !== null) {
    const d = delta(w.train.angle, target);
    if (Math.sign(d) !== w.train.dir && Math.abs(d) < Math.PI - 0.4) return w.reverse();
  }
  return false;
}

/** Between runs: training, cheapest first, while the crystals last. */
function spend(save: Save): void {
  for (;;) {
    let best: TrainKey | null = null;
    for (const k of TRAIN_KEYS) {
      const price = trainPrice(save, k);
      if (price !== null && price <= save.crystals && (!best || price < (trainPrice(save, best) ?? Infinity))) best = k;
    }
    if (!best || !buyTrain(save, best)) return;
  }
}

interface Stop {
  why: string;
  at: number;
  level: number;
  wave: number;
  fence: number;
}

interface Life {
  mins: number;
  levels: number;
  stars: number;
  runs: number;
  stop: Stop;
  longest: number;
  /** Seconds each level took, by level index, and the stars it gave. */
  spent: Map<number, number>;
  got: Map<number, number>;
  /** Fence left at the end of each level, 0..1. */
  left: Map<number, number>;
  /** Gold the player was sitting on at the end of each run, averaged. */
  idleGold: number;
}

/** One player, from a fresh save to the moment they stop. */
function live(p: Persona, seed: number): Life {
  const save = newSave('2026-11-14');
  let played = 0;
  let lost = 0;
  let longestBore = 0;
  let stop: Stop | null = null;
  const spent = new Map<number, number>();
  const got = new Map<number, number>();
  const left = new Map<number, number>();
  const golds: number[] = [];

  for (let run = 0; run < 60 && !stop && played < maxMin * 60; run++) {
    const next = nextLevel(save);
    // The completionist goes back for a level's missing stars before opening the next one.
    const i = p.replays && next > 0 && (save.levels[next - 1] ?? 0) < 3 && run % 3 === 2 ? next - 1 : Math.min(next, LEVELS.length - 1);
    const mode: RunMode = i;
    const w = new World({ ...worldOptions(save, mode), seed: seed * 97 + run });
    let actAt = 0;
    let bore = 0;
    // The player's own clock, not the fight's: `w.time` stands still under a wagon pick (World.hold),
    // so scheduling on it froze the persona too — they could never reach the cards, the 10 s auto-pick
    // chose for all twelve of them, and the seconds they spent staring went into nobody's play time.
    let clock = 0;

    while (!w.over && clock < 20 * 60) {
      bore = wants(p, w) || threatened(w) ? 0 : bore + DT;
      longestBore = Math.max(longestBore, bore);
      if (bore >= p.bore) {
        stop = { why: 'bored', at: played + clock, level: i, wave: w.wave, fence: w.wallHp / w.wallMax };
        break;
      }
      // A pick stops the fight but not the hand: it is the one thing they can do while frozen.
      if (clock >= actAt && (w.wg?.offer || !w.busy())) actAt = clock + (act(p, w) ? p.pace : p.react);
      w.step();
      w.events.length = 0;
      clock += DT;
    }
    played += clock + VILLAGE_S;
    if (stop) break;

    const stars = w.stars();
    if (!spent.has(i)) {
      spent.set(i, w.time);
      got.set(i, stars);
      left.set(i, w.wallHp / w.wallMax);
    }
    golds.push(w.gold);
    finishRun(save, { wave: w.wave, kills: w.kills, grabs: w.grabs, casts: w.casts, buys: w.buys, stars, wagons: w.wg?.list }, mode);
    if (stars > 0) lost = 0;
    else if (++lost >= p.losses) {
      stop = { why: 'lost out', at: played, level: i, wave: w.wave, fence: w.wallHp / w.wallMax };
      break;
    }
    if (p.spends) spend(save);
    if (nextLevel(save) >= LEVELS.length) {
      stop = { why: 'cleared all', at: played, level: i, wave: w.wave, fence: 1 };
      break;
    }
  }
  const levels = nextLevel(save);
  return {
    mins: played / 60,
    levels,
    stars: save.levels.reduce((a, b) => a + b, 0),
    runs: save.runs,
    longest: longestBore,
    stop: stop ?? { why: 'still playing', at: played, level: levels, wave: 0, fence: 1 },
    spent,
    got,
    left,
    idleGold: golds.length ? golds.reduce((a, b) => a + b, 0) / golds.length : 0,
  };
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

console.log(`${seeds} players each, ${maxMin} min cap\n`);
console.log('persona                    avg  median levels stars runs  why they stopped');
for (const p of PERSONAS) {
  if (only && p.id !== only) continue;
  const rows = Array.from({ length: seeds }, (_, s) => live(p, s + 1));
  const why = new Map<string, number>();
  for (const r of rows) why.set(r.stop.why, (why.get(r.stop.why) ?? 0) + 1);
  const reasons = [...why].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(
    `${p.name.padEnd(22)} ${avg(rows.map((r) => r.mins)).toFixed(1).padStart(5)}m ${med(rows.map((r) => r.mins)).toFixed(1).padStart(5)}m` +
      ` ${med(rows.map((r) => r.levels)).toString().padStart(5)} ${med(rows.map((r) => r.stars)).toString().padStart(5)} ${med(rows.map((r) => r.runs)).toString().padStart(4)}  ${reasons}`,
  );
  const stops = rows.filter((r) => r.stop.why === 'bored' || r.stop.why === 'lost out');
  if (stops.length) {
    const s = stops[0].stop;
    console.log(`${' '.repeat(22)}   e.g. ${levelName(s.level)} wave ${s.wave}, fence ${(s.fence * 100).toFixed(0)}%, at ${(s.at / 60).toFixed(1)} min; longest quiet ${med(rows.map((r) => r.longest)).toFixed(1)}s`);
  }
  // Minutes and stars per level, first visit only: a wall shows up here as a level that costs one
  // persona twice what it costs the rest.
  const cells: string[] = [];
  for (let i = 0; i < 10; i++) {
    const ts = rows.map((r) => r.spent.get(i)).filter((t): t is number => t !== undefined);
    if (!ts.length) continue;
    const st = rows.map((r) => r.got.get(i)).filter((s): s is number => s !== undefined);
    const lf = rows.map((r) => r.left.get(i)).filter((x): x is number => x !== undefined);
    cells.push(`${levelName(i)} ${(med(ts) / 60).toFixed(1)}m/${med(st)}★/${(med(lf) * 100).toFixed(0)}%`);
  }
  console.log(`${' '.repeat(22)}   ${cells.join('  ')}   gold left ${Math.round(avg(rows.map((r) => r.idleGold)))}`);
}
