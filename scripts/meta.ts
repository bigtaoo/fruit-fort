// Long-term meta pacing (§11): bot players play many runs over several days, take the daily
// reward, tasks, challenge and achievements, and spend crystals between runs. Reports, per run,
// crystal income, best wave and what was bought; when each fruit, hero and village upgrade is
// unlocked or maxed; and dead zones (runs in a row with nothing affordable).
// The bot keeps the starting deck and the farmer, so only those levels make it stronger; it
// still buys everything else, power first (deck fruits, farmer, village), collection at 1.5x.
// Usage: npx tsx scripts/meta.ts [players] [runs] [runsPerDay] [doublesPerDay] [maxMinutes] [maxWave]

import { World } from '../src/sim/world';
import { TICK_HZ } from '../src/sim/config';
import { botAct } from '../src/sim/bot';
import {
  ALL_FRUITS, ALL_HEROES, PRICES, buyFruit, buyHero, buyVillage, claimChallenge, claimDaily, claimTask, finishRun,
  fruitPrice, heroPrice, newSave, normalize, villagePrice, worldOptions, type Save, type VillageKey,
} from '../src/meta/progress';
import { ACHIEVEMENTS, claimAchievement } from '../src/meta/achievements';

const players = Number(process.argv[2] ?? 12);
const runs = Number(process.argv[3] ?? 30);
const perDay = Number(process.argv[4] ?? 3);
const doublesPerDay = Number(process.argv[5] ?? 1);
const maxMin = Number(process.argv[6] ?? 30);
/** A casual player stand-in: the run ends at this wave (the sharp bot reaches 20+ from run 1). */
const maxWave = Number(process.argv[7] ?? Infinity);
const VILLAGE: VillageKey[] = ['wall', 'gold', 'corner'];

/** Every item that can be bought, with its price now (null = maxed) and whether it makes the bot stronger. */
function items(s: Save): { id: string; price: number | null; power: boolean; buy: () => boolean }[] {
  return [
    ...ALL_FRUITS.map((k) => ({ id: `${k}`, price: fruitPrice(s, k), power: s.deck.includes(k), buy: () => buyFruit(s, k) })),
    ...ALL_HEROES.map((h) => ({ id: `${h}`, price: heroPrice(s, h), power: s.hero === h, buy: () => buyHero(s, h) })),
    ...VILLAGE.map((k) => ({ id: `${k}`, price: villagePrice(s, k), power: true, buy: () => buyVillage(s, k) })),
  ];
}

function spend(s: Save, bought: string[]): number {
  let spent = 0;
  for (;;) {
    const opts = items(s).filter((o) => o.price !== null).sort((a, b) => a.price! * (a.power ? 1 : 1.5) - b.price! * (b.power ? 1 : 1.5));
    // Saves up for the best-scored item rather than spending on something worse.
    const o = opts[0];
    if (!o || o.price! > s.crystals) return spent;
    spent += o.price!;
    o.buy();
    bought.push(o.id);
  }
}

function claimAll(s: Save): number {
  const before = s.crystals;
  claimDaily(s);
  s.daily.tasks.forEach((_, i) => claimTask(s, i));
  claimChallenge(s);
  for (const a of ACHIEVEMENTS) if (claimAchievement(s, a.id)) achAt.get(a.id)!.push(s.runs);
  return s.crystals - before;
}

function totalLeft(s: Save): number {
  let sum = 0;
  const t = normalize(JSON.parse(JSON.stringify(s)), s.daily.day);
  t.crystals = 1e9;
  for (;;) {
    const o = items(t).find((x) => x.price !== null);
    if (!o) return sum;
    sum += o.price!;
    o.buy();
  }
}

function dayString(n: number): string {
  const d = new Date(2026, 9, 1 + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Row { wave: number; min: number; income: number; spent: number; bank: number; bought: number; capped: boolean }
const rows: Row[][] = Array.from({ length: runs }, () => []);
/** Milestone -> run index (1-based) it was reached, per player. */
const milestones = new Map<string, number[]>();
const mark = (key: string, p: number, r: number) => {
  const a = milestones.get(key) ?? [];
  if (a.length === p) a.push(r);
  milestones.set(key, a);
};
const deadZones: number[] = [];
/** Achievement id -> run it was claimed, over all players. */
const achAt = new Map(ACHIEVEMENTS.map((a) => [a.id, [] as number[]]));
const sample: string[] = [];
const challengeRun = (r: number) => perDay > 1 && r % perDay === perDay - 1;
const startCost = totalLeft(newSave('2026-10-01'));

for (let p = 0; p < players; p++) {
  let save = newSave(dayString(0));
  let streak = 0;
  let longest = 0;
  let doubles = 0;
  for (let r = 0; r < runs; r++) {
    const day = Math.floor(r / perDay);
    if (r % perDay === 0) {
      save = normalize(JSON.parse(JSON.stringify(save)), dayString(day));
      doubles = 0;
    }
    const challenge = challengeRun(r);
    const before = save.crystals;
    const opts = worldOptions(save, challenge);
    const w = new World({ ...opts, seed: challenge ? opts.seed : p * 1000 + r });
    while (!w.over && w.tick < maxMin * 60 * TICK_HZ && w.wave <= maxWave) {
      if (w.tick % 15 === 0) botAct(w);
      w.step();
      w.events.length = 0;
    }
    w.wave = Math.min(w.wave, maxWave);
    const earned = finishRun(save, { wave: w.wave, kills: w.kills, merges: w.merges, casts: w.casts, summons: w.summons }, challenge);
    if (doubles < doublesPerDay) {
      doubles++;
      save.crystals += earned;
    }
    claimAll(save);
    const income = save.crystals - before;
    const bought: string[] = [];
    const spent = spend(save, bought);
    rows[r].push({ wave: w.wave, min: w.time / 60, income, spent, bank: save.crystals, bought: bought.length, capped: !w.over && w.wave < maxWave });
    if (p === 0) sample.push(`${r + 1}${challenge ? 'C' : ' '} w${String(w.wave).padStart(2)} +${String(income).padStart(3)} 💎 → ${bought.join(' ') || '—'} (left ${save.crystals})`);
    for (const k of ALL_FRUITS) {
      if (save.fruits[k] > 0) mark(`fruit ${k} unlock`, p, r + 1);
      if (save.fruits[k] >= 5) mark(`fruit ${k} Lv5`, p, r + 1);
      if (save.fruits[k] >= PRICES.fruitMax) mark(`fruit ${k} max`, p, r + 1);
    }
    for (const h of ALL_HEROES) {
      if (save.heroes[h] > 0) mark(`hero ${h} unlock`, p, r + 1);
      if (save.heroes[h] >= 3) mark(`hero ${h} Lv3`, p, r + 1);
      if (save.heroes[h] >= PRICES.heroMax) mark(`hero ${h} max`, p, r + 1);
    }
    for (const k of VILLAGE) if (save.village[k] >= PRICES.village[k].max) mark(`village ${k} max`, p, r + 1);
    const maxed = totalLeft(save) === 0;
    if (maxed) mark('EVERYTHING max', p, r + 1);
    // A dead zone only counts while something is still left to buy.
    streak = bought.length || maxed ? 0 : streak + 1;
    longest = Math.max(longest, streak);
  }
  deadZones.push(longest);
}

const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
console.log(`${players} players x ${runs} runs, ${perDay} runs/day (last of each day = challenge C), ${doublesPerDay} double/day, cap ${maxMin} min${maxWave < Infinity ? `, runs end at wave ${maxWave}` : ''}`);
console.log(`everything costs 💎${startCost}`);
console.log('run  wave (min–max)  minutes  income  spent  bank  buys  capped');
let cum = 0;
rows.forEach((xs, r) => {
  const ws = xs.map((x) => x.wave);
  cum += med(xs.map((x) => x.income));
  console.log(
    `${String(r + 1).padStart(3)}${challengeRun(r) ? 'C' : ' '} ${String(med(ws)).padStart(4)} (${Math.min(...ws)}–${Math.max(...ws)})`.padEnd(20) +
      `${med(xs.map((x) => x.min)).toFixed(1).padStart(6)}  ${String(med(xs.map((x) => x.income))).padStart(6)}  ${String(med(xs.map((x) => x.spent))).padStart(5)}  ${String(med(xs.map((x) => x.bank))).padStart(4)}  ${String(med(xs.map((x) => x.bought))).padStart(4)}  ${xs.filter((x) => x.capped).length}/${xs.length}  Σ${cum}`,
  );
});
console.log('\nmilestone: median run (players reaching it within the runs)');
/** Median run over all players, counting those who never got there as never. */
const medRun = (xs: number[]) => (xs.length > players >> 1 ? `run ${med([...xs, ...Array(players - xs.length).fill(Infinity)])}` : 'not reached (median)').padEnd(22) + `(${xs.length}/${players})`;
for (const [k, a] of [...milestones].sort((x, y) => med(x[1]) - med(y[1]))) console.log(`  ${k.padEnd(24)} ${medRun(a)}`);
console.log('\nachievements: median run claimed');
for (const a of ACHIEVEMENTS) console.log(`  ${a.id.padEnd(11)} 💎${String(a.reward).padStart(3)}  ${medRun(achAt.get(a.id)!)}`);
console.log(`\nlongest streak of runs without a purchase (before maxing): median ${med(deadZones)}, max ${Math.max(...deadZones)}`);
console.log('\nplayer 1:');
for (const l of sample) console.log('  ' + l);
