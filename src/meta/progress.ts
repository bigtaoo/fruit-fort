// Out-of-run progress (§11): crystals, chapter level stars (§9.1), training (stat start levels),
// hero levels, village upgrades, and the daily reward / tasks / challenge. Plain data and functions, no DOM, so tests and the bot
// can drive it; store.ts persists it.

import type { HeroKind, StatKey } from '../sim/types';
import type { RunMods, WorldOptions } from '../sim/world';
import { t } from '../i18n';
import { WAVES } from '../sim/config';
import { CHAPTER_SIZE, LEVELS, MODS, type ModId } from '../sim/levels';

export const ALL_HEROES: HeroKind[] = ['farmer', 'beekeeper', 'chef'];
export type VillageKey = 'wall' | 'gold';
/** Stats that can be trained; the wall has its own village building. */
export type TrainKey = Exclude<StatKey, 'wall'>;
export const TRAIN_KEYS: TrainKey[] = ['dmg', 'spd', 'crit', 'multi', 'range', 'move', 'gold'];

/** Prices in crystals. Hero level ups cost `step` x lv + `grow` x lv² at the current level, so
 * the first levels come fast and the last ones are long goals (§11 pacing table). */
export const PRICES = {
  /** Training: the next start level costs `step` x (lv + 1)², up to `max`. */
  train: {
    dmg: { step: 12, max: 10 },
    spd: { step: 20, max: 6 },
    crit: { step: 20, max: 6 },
    multi: { step: 400, max: 1 },
    range: { step: 30, max: 3 },
    move: { step: 20, max: 3 },
    gold: { step: 25, max: 5 },
  } as Record<TrainKey, { step: number; max: number }>,
  heroUnlock: { beekeeper: 120, chef: 150 } as Partial<Record<HeroKind, number>>,
  heroStep: 40,
  heroGrow: 10,
  heroMax: 5,
  /** Village: price per next level and the cap. */
  village: {
    wall: { step: 40, max: 5 },
    gold: { step: 30, max: 5 },
  } as Record<VillageKey, { step: number; max: number }>,
};

/** One-off gift at the end of the very first run, so the first visit to the village can buy something. */
export const FIRST_RUN_BONUS = 40;

/** `doubles`: rewarded ads that double a run's crystals, per day (§11). */
export const DAILY = { reward: 30, task: 20, challenge: 60, challengeWave: 10, doubles: 3 };

export type TaskKind = 'kills' | 'wave' | 'grabs' | 'casts' | 'buys';
const TASKS: { kind: TaskKind; goal: number }[] = [
  { kind: 'kills', goal: 150 },
  { kind: 'wave', goal: 12 },
  { kind: 'grabs', goal: 5 },
  { kind: 'casts', goal: 4 },
  { kind: 'buys', goal: 40 },
];

/** Daily challenge rules, an endless run under one level modifier; `id` names its text in i18n (challenge.<id>). */
export const CHALLENGES: { id: ModId; mods: RunMods }[] = (Object.keys(MODS) as ModId[]).map((id) => ({ id, mods: MODS[id] }));

/** What a run is: a chapter level (its index in LEVELS), an endless run or the day's challenge. */
export type RunMode = number | 'endless' | 'challenge';

/** Level crystals per wave in the level (§9.1): the first clear, each new star, a replay win, and
 * per wave reached in a lost level. Replays pay about a fifth of the first clear, so farming a
 * level is slower than pushing on, and endless pays more once it opens. */
export const LEVEL_PAY = { first: 2, star: 1, replay: 0.6, loss: 1 };

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
  /** Training: the level each stat starts a run with. */
  train: Record<TrainKey, number>;
  /** 0 = locked, otherwise the level. */
  heroes: Record<HeroKind, number>;
  village: Record<VillageKey, number>;
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
  /** Best stars per chapter level (index in LEVELS), 0 or missing = not cleared. */
  levels: number[];
}

export interface RunStats {
  wave: number;
  kills: number;
  /** Random events the train drove through. */
  grabs: number;
  casts: number;
  /** Stat levels bought. */
  buys: number;
  /** A level run's stars, 0 if it was lost. */
  stars?: number;
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
    train: { dmg: 0, spd: 0, crit: 0, multi: 0, range: 0, move: 0, gold: 0 },
    heroes: { farmer: 1, beekeeper: 0, chef: 0 },
    village: { wall: 0, gold: 0 },
    hero: 'farmer',
    runs: 0,
    best: 0,
    daily: makeDaily(day),
    kills: 0,
    bosses: 0,
    streak: 0,
    streakDay: '',
    ach: [],
    levels: [],
  };
}

/** Fill in anything an older or damaged save is missing; start a new day's daily if needed. */
export function normalize(raw: unknown, day = today()): Save {
  const base = newSave(day);
  if (!raw || typeof raw !== 'object') return base;
  // Fruits, the deck and the corner building belonged to the merge version: dropped.
  const { fruits: _f, deck: _d, ...s } = raw as Partial<Save> & { fruits?: unknown; deck?: unknown };
  const pick = <K extends string>(keys: K[], from: Record<K, number>, src?: Partial<Record<K, number>>) =>
    Object.fromEntries(keys.map((k) => [k, typeof src?.[k] === 'number' && src[k]! >= 0 ? src[k] : from[k]])) as Record<K, number>;
  const out: Save = {
    ...base,
    ...s,
    train: pick(TRAIN_KEYS, base.train, s.train),
    heroes: { ...base.heroes, ...s.heroes },
    village: pick(['wall', 'gold'], base.village, s.village),
    // A task kind from an older build (the merge game's merges/summons) restarts the day's tasks.
    daily: s.daily && s.daily.day === day && s.daily.tasks.every((t) => TASKS.some((k) => k.kind === t.kind)) ? s.daily : base.daily,
  };
  if (!out.heroes[out.hero]) out.hero = 'farmer';
  for (const k of ['kills', 'bosses', 'streak'] as const) if (typeof out[k] !== 'number' || !(out[k] >= 0)) out[k] = 0;
  if (typeof out.streakDay !== 'string') out.streakDay = '';
  out.ach = Array.isArray(out.ach) ? [...new Set(out.ach.filter((id) => typeof id === 'string'))] : [];
  out.levels = Array.isArray(out.levels) ? out.levels.slice(0, LEVELS.length).map((n) => (n >= 1 && n <= 3 ? Math.floor(n) : 0)) : [];
  return out;
}

/** Start a new day's daily if the calendar moved on since the save was loaded. True if it did. */
export function rollDaily(save: Save, day = today()): boolean {
  if (save.daily.day === day) return false;
  save.daily = makeDaily(day);
  return true;
}

/** What the next run starts with. A challenge run uses the day's rules and seed. */
export function worldOptions(save: Save, mode: RunMode = 'endless'): WorldOptions {
  const challenge = mode === 'challenge';
  return {
    hero: save.hero,
    meta: { statLv: { ...save.train }, heroLv: save.heroes[save.hero], ...save.village },
    mods: challenge ? challengeOf(save.daily.day).mods : undefined,
    seed: challenge ? dayNumber(save.daily.day) : undefined,
    level: typeof mode === 'number' ? LEVELS[mode] : undefined,
  };
}

// ---- chapter levels (§9.1) ----------------------------------------------------------------

export function starsOf(save: Save, i: number): number {
  return save.levels[i] ?? 0;
}

/** The first level not cleared yet; LEVELS.length once all are. Levels open one by one. */
export function nextLevel(save: Save): number {
  const i = LEVELS.findIndex((_, j) => starsOf(save, j) === 0);
  return i < 0 ? LEVELS.length : i;
}

export function levelOpen(save: Save, i: number): boolean {
  return i >= 0 && i < LEVELS.length && i <= nextLevel(save);
}

/** Endless runs and the daily challenge open once chapter 1 is cleared. */
export function endlessOpen(save: Save): boolean {
  return starsOf(save, CHAPTER_SIZE - 1) > 0;
}

export function totalStars(save: Save): number {
  return save.levels.reduce((a, b) => a + b, 0);
}

/** Crystals a level run pays: first clear, plus each star above the best so far, or a replay
 * win's share, or the waves reached when lost. */
export function levelCrystals(save: Save, i: number, wave: number, stars: number): number {
  const n = LEVELS[i].waves;
  if (stars === 0) return Math.round(LEVEL_PAY.loss * wave);
  const best = starsOf(save, i);
  const newStars = Math.max(0, stars - best);
  return (best === 0 ? LEVEL_PAY.first * n : Math.round(LEVEL_PAY.replay * n)) + LEVEL_PAY.star * n * newStars;
}

/** Crystals for reaching a wave: 4 a wave, plus 5 for every boss wave passed. */
export function crystalsFor(wave: number): number {
  return 4 * wave + 5 * Math.floor(wave / 5);
}

/** Bosses beaten in a run that reached `wave`: the next wave only starts once the boss is dead. */
export function bossesIn(wave: number): number {
  return Math.max(0, Math.floor((wave - 1) / WAVES.bossEvery));
}

/** What a run that reached `wave` pays, before it is booked (the first run carries the bonus).
 * `stars` is a level run's result, 0 if lost. */
export function runCrystals(save: Save, wave: number, mode: RunMode = 'endless', stars = 0): number {
  const pay = typeof mode === 'number' ? levelCrystals(save, mode, wave, stars) : crystalsFor(wave);
  return pay + (save.runs === 0 ? FIRST_RUN_BONUS : 0);
}

/** Book a finished run: crystals, records, level stars, task progress. Returns the crystals earned.
 * `best` is the endless record; a won level counts its boss. */
export function finishRun(save: Save, r: RunStats, mode: RunMode = 'endless'): number {
  const stars = r.stars ?? 0;
  const earned = runCrystals(save, r.wave, mode, stars);
  save.crystals += earned;
  save.runs++;
  save.kills += r.kills;
  if (typeof mode === 'number') {
    if (stars > 0) save.bosses++;
    while (save.levels.length <= mode) save.levels.push(0);
    save.levels[mode] = Math.max(save.levels[mode], stars);
  } else {
    save.best = Math.max(save.best, r.wave);
    save.bosses += bossesIn(r.wave);
  }
  const challenge = mode === 'challenge';
  for (const t of save.daily.tasks) {
    t.progress = t.kind === 'wave' ? Math.max(t.progress, r.wave) : t.progress + r[t.kind];
  }
  if (challenge) save.daily.challengeBest = Math.max(save.daily.challengeBest, r.wave);
  return earned;
}

// ---- prices and purchases (null price = maxed out) ----------------------------------------

export function trainPrice(save: Save, k: TrainKey): number | null {
  const p = PRICES.train[k];
  const lv = save.train[k];
  return lv >= p.max ? null : p.step * (lv + 1) ** 2;
}

export function heroPrice(save: Save, h: HeroKind): number | null {
  const lv = save.heroes[h];
  if (lv === 0) return PRICES.heroUnlock[h] ?? 0;
  return lv >= PRICES.heroMax ? null : PRICES.heroStep * lv + PRICES.heroGrow * lv * lv;
}

export function villagePrice(save: Save, key: VillageKey): number | null {
  const p = PRICES.village[key];
  const lv = save.village[key];
  return lv >= p.max ? null : p.step * (lv + 1) ** 2;
}

function pay(save: Save, price: number | null): boolean {
  if (price === null || save.crystals < price) return false;
  save.crystals -= price;
  return true;
}

export function buyTrain(save: Save, k: TrainKey): boolean {
  if (!pay(save, trainPrice(save, k))) return false;
  save.train[k]++;
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
