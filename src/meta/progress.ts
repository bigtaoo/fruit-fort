// Out-of-run progress (§11): crystals, fruit and hero levels, village upgrades, the deck, and
// the daily reward / tasks / challenge. Plain data and functions, no DOM, so tests and the bot
// can drive it; store.ts persists it.

import type { FruitKind, HeroKind } from '../sim/types';
import type { RunMods, WorldOptions } from '../sim/world';
import { t } from '../i18n';
import { WAVES } from '../sim/config';

export const ALL_FRUITS: FruitKind[] = ['strawberry', 'coconut', 'watermelon', 'grape', 'lemon'];
export const ALL_HEROES: HeroKind[] = ['farmer', 'beekeeper', 'chef'];
export type VillageKey = 'wall' | 'gold' | 'corner';

/** Prices in crystals. Fruit and hero level ups cost `step` x lv + `grow` x lv² at the current
 * level, so the first levels come fast and the last ones are long goals (§11 pacing table). */
export const PRICES = {
  fruitUnlock: { grape: 60, lemon: 80 } as Partial<Record<FruitKind, number>>,
  fruitStep: 10,
  fruitGrow: 2,
  fruitMax: 10,
  heroUnlock: { beekeeper: 120, chef: 150 } as Partial<Record<HeroKind, number>>,
  heroStep: 40,
  heroGrow: 10,
  heroMax: 5,
  /** Village: price per next level and the cap. */
  village: {
    wall: { step: 40, max: 5 },
    gold: { step: 30, max: 5 },
    corner: { step: 120, max: 2 },
  } as Record<VillageKey, { step: number; max: number }>,
};

/** One-off gift at the end of the very first run, so the first visit to the village can buy something. */
export const FIRST_RUN_BONUS = 40;

/** `doubles`: rewarded ads that double a run's crystals, per day (§11). */
export const DAILY = { reward: 30, task: 20, challenge: 60, challengeWave: 10, doubles: 3 };

export type TaskKind = 'kills' | 'wave' | 'merges' | 'casts' | 'summons';
const TASKS: { kind: TaskKind; goal: number }[] = [
  { kind: 'kills', goal: 150 },
  { kind: 'wave', goal: 12 },
  { kind: 'merges', goal: 25 },
  { kind: 'casts', goal: 4 },
  { kind: 'summons', goal: 30 },
];

/** Daily challenge rules; `id` names its text in i18n (challenge.<id>). */
export const CHALLENGES: { id: 'rush' | 'tough' | 'poor' | 'paper'; mods: RunMods }[] = [
  { id: 'rush', mods: { enemySpeed: 1.3 } },
  { id: 'tough', mods: { enemyHp: 1.3 } },
  { id: 'poor', mods: { startGold: -20 } },
  { id: 'paper', mods: { wallMul: 0.6 } },
];

export interface Task {
  kind: TaskKind;
  goal: number;
  progress: number;
  claimed: boolean;
}

export interface Daily {
  day: string;
  claimed: boolean;
  tasks: Task[];
  /** Best wave in today's challenge, and whether its reward was taken. */
  challengeBest: number;
  challengeClaimed: boolean;
  /** Crystal doubles watched today; missing in saves from before it existed. */
  doubles?: number;
}

export interface Save {
  v: 1;
  crystals: number;
  /** 0 = locked, otherwise the level. */
  fruits: Record<FruitKind, number>;
  heroes: Record<HeroKind, number>;
  village: Record<VillageKey, number>;
  deck: FruitKind[];
  hero: HeroKind;
  runs: number;
  best: number;
  daily: Daily;
  /** Lifetime totals, for achievements. */
  kills: number;
  bosses: number;
  /** Days in a row the daily reward was taken, and the last such day. */
  streak: number;
  streakDay: string;
  /** Achievements whose reward was taken (achievements.ts). */
  ach: string[];
}

export interface RunStats {
  wave: number;
  kills: number;
  merges: number;
  casts: number;
  summons: number;
}

/** Local calendar day, the daily reset key. */
export function today(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The calendar day before a `today()` string. */
export function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return today(new Date(y, m - 1, d - 1));
}

/** Stable small number from a day string, for picking the day's tasks and challenge. */
export function dayNumber(day: string): number {
  let h = 7;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
  return h;
}

export function challengeOf(day: string): (typeof CHALLENGES)[number] {
  return CHALLENGES[dayNumber(day) % CHALLENGES.length];
}

function makeDaily(day: string): Daily {
  const n = dayNumber(day);
  const kinds = [...TASKS];
  const tasks: Task[] = [];
  for (let i = 0; i < 3; i++) {
    const t = kinds.splice((n >> (i * 3)) % kinds.length, 1)[0];
    tasks.push({ kind: t.kind, goal: t.goal, progress: 0, claimed: false });
  }
  return { day, claimed: false, tasks, challengeBest: 0, challengeClaimed: false };
}

export function taskText(task: Task): string {
  return t(`task.${task.kind}`, { n: task.goal });
}

export function newSave(day = today()): Save {
  return {
    v: 1,
    crystals: 0,
    fruits: { strawberry: 1, coconut: 1, watermelon: 1, grape: 0, lemon: 0 },
    heroes: { farmer: 1, beekeeper: 0, chef: 0 },
    village: { wall: 0, gold: 0, corner: 0 },
    deck: ['strawberry', 'coconut', 'watermelon'],
    hero: 'farmer',
    runs: 0,
    best: 0,
    daily: makeDaily(day),
    kills: 0,
    bosses: 0,
    streak: 0,
    streakDay: '',
    ach: [],
  };
}

/** Fill in anything an older or damaged save is missing; start a new day's daily if needed. */
export function normalize(raw: unknown, day = today()): Save {
  const base = newSave(day);
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<Save>;
  const out: Save = {
    ...base,
    ...s,
    fruits: { ...base.fruits, ...s.fruits },
    heroes: { ...base.heroes, ...s.heroes },
    village: { ...base.village, ...s.village },
    daily: s.daily && s.daily.day === day ? s.daily : base.daily,
  };
  const deck = (out.deck ?? []).filter((k) => out.fruits[k] > 0);
  out.deck = deck.length === 3 && new Set(deck).size === 3 ? deck : [...base.deck];
  if (!out.heroes[out.hero]) out.hero = 'farmer';
  for (const k of ['kills', 'bosses', 'streak'] as const) if (typeof out[k] !== 'number' || !(out[k] >= 0)) out[k] = 0;
  if (typeof out.streakDay !== 'string') out.streakDay = '';
  out.ach = Array.isArray(out.ach) ? [...new Set(out.ach.filter((id) => typeof id === 'string'))] : [];
  return out;
}

/** Start a new day's daily if the calendar moved on since the save was loaded. True if it did. */
export function rollDaily(save: Save, day = today()): boolean {
  if (save.daily.day === day) return false;
  save.daily = makeDaily(day);
  return true;
}

/** What the next run starts with. A challenge run uses the day's rules and seed. */
export function worldOptions(save: Save, challenge = false): WorldOptions {
  const fruitLv: Partial<Record<FruitKind, number>> = {};
  for (const k of ALL_FRUITS) if (save.fruits[k] > 0) fruitLv[k] = save.fruits[k];
  return {
    deck: [...save.deck],
    hero: save.hero,
    meta: { fruitLv, heroLv: save.heroes[save.hero], ...save.village },
    mods: challenge ? challengeOf(save.daily.day).mods : undefined,
    seed: challenge ? dayNumber(save.daily.day) : undefined,
  };
}

/** Crystals for reaching a wave: 4 a wave, plus 5 for every boss wave passed. */
export function crystalsFor(wave: number): number {
  return 4 * wave + 5 * Math.floor(wave / 5);
}

/** Bosses beaten in a run that reached `wave`: the next wave only starts once the boss is dead. */
export function bossesIn(wave: number): number {
  return Math.max(0, Math.floor((wave - 1) / WAVES.bossEvery));
}

/** What a run that reached `wave` pays, before it is booked (the first run carries the bonus). */
export function runCrystals(save: Save, wave: number): number {
  return crystalsFor(wave) + (save.runs === 0 ? FIRST_RUN_BONUS : 0);
}

/** Book a finished run: crystals, records, task progress. Returns the crystals earned. */
export function finishRun(save: Save, r: RunStats, challenge = false): number {
  const earned = runCrystals(save, r.wave);
  save.crystals += earned;
  save.runs++;
  save.best = Math.max(save.best, r.wave);
  save.kills += r.kills;
  save.bosses += bossesIn(r.wave);
  for (const t of save.daily.tasks) {
    t.progress = t.kind === 'wave' ? Math.max(t.progress, r.wave) : t.progress + r[t.kind];
  }
  if (challenge) save.daily.challengeBest = Math.max(save.daily.challengeBest, r.wave);
  return earned;
}

// ---- prices and purchases (null price = maxed out) ----------------------------------------

export function fruitPrice(save: Save, k: FruitKind): number | null {
  const lv = save.fruits[k];
  if (lv === 0) return PRICES.fruitUnlock[k] ?? 0;
  return lv >= PRICES.fruitMax ? null : PRICES.fruitStep * lv + PRICES.fruitGrow * lv * lv;
}

export function heroPrice(save: Save, h: HeroKind): number | null {
  const lv = save.heroes[h];
  if (lv === 0) return PRICES.heroUnlock[h] ?? 0;
  return lv >= PRICES.heroMax ? null : PRICES.heroStep * lv + PRICES.heroGrow * lv * lv;
}

export function villagePrice(save: Save, key: VillageKey): number | null {
  const p = PRICES.village[key];
  const lv = save.village[key];
  return lv >= p.max ? null : p.step * (lv + 1);
}

function pay(save: Save, price: number | null): boolean {
  if (price === null || save.crystals < price) return false;
  save.crystals -= price;
  return true;
}

export function buyFruit(save: Save, k: FruitKind): boolean {
  if (!pay(save, fruitPrice(save, k))) return false;
  save.fruits[k]++;
  return true;
}

export function buyHero(save: Save, h: HeroKind): boolean {
  if (!pay(save, heroPrice(save, h))) return false;
  save.heroes[h]++;
  return true;
}

export function buyVillage(save: Save, key: VillageKey): boolean {
  if (!pay(save, villagePrice(save, key))) return false;
  save.village[key]++;
  return true;
}

/** Put a fruit in the deck; it replaces the one picked longest ago. */
export function pickDeck(save: Save, k: FruitKind): boolean {
  if (save.fruits[k] === 0 || save.deck.includes(k)) return false;
  save.deck = [...save.deck.slice(1), k];
  return true;
}

export function pickHero(save: Save, h: HeroKind): boolean {
  if (save.heroes[h] === 0) return false;
  save.hero = h;
  return true;
}

// ---- daily --------------------------------------------------------------------------------

export function claimDaily(save: Save): boolean {
  if (save.daily.claimed) return false;
  save.daily.claimed = true;
  save.crystals += DAILY.reward;
  save.streak = save.streakDay === dayBefore(save.daily.day) ? save.streak + 1 : 1;
  save.streakDay = save.daily.day;
  return true;
}

export function claimTask(save: Save, i: number): boolean {
  const t = save.daily.tasks[i];
  if (!t || t.claimed || t.progress < t.goal) return false;
  t.claimed = true;
  save.crystals += DAILY.task;
  return true;
}

export function claimChallenge(save: Save): boolean {
  const d = save.daily;
  if (d.challengeClaimed || d.challengeBest < DAILY.challengeWave) return false;
  d.challengeClaimed = true;
  save.crystals += DAILY.challenge;
  return true;
}

export function canDouble(save: Save): boolean {
  return (save.daily.doubles ?? 0) < DAILY.doubles;
}

export function useDouble(save: Save): void {
  save.daily.doubles = (save.daily.doubles ?? 0) + 1;
}

/** Anything waiting to be claimed, for a badge on the village button. */
export function hasClaim(save: Save): boolean {
  const d = save.daily;
  return !d.claimed || d.tasks.some((t) => !t.claimed && t.progress >= t.goal) || (!d.challengeClaimed && d.challengeBest >= DAILY.challengeWave);
}
