// Out-of-run progress (§11): crystals, chapter level stars (§9.1), training (stat start levels),
// hero levels, village upgrades, and the daily reward / tasks / challenge. Plain data and functions, no DOM, so tests and the bot
// can drive it; store.ts persists it.

import type { HeroKind, StatKey, WagonKind } from '../sim/types';
import type { RunMods, WorldOptions } from '../sim/world';
import { t } from '../i18n';
import { WAVES } from '../sim/config';
import { CHAPTER_SIZE, LEVELS, MODS, type ModId } from '../sim/levels';
import { START_WAGONS, bookWagons, normalizeWagons } from './wagonmeta';

export const ALL_HEROES: HeroKind[] = ['farmer', 'beekeeper', 'chef'];
export type VillageKey = 'wall' | 'gold';
/** Stats that can be trained; the wall has its own village building. */
export type TrainKey = Extract<StatKey, 'dmg' | 'spd' | 'crit' | 'multi' | 'range' | 'move' | 'gold'>;
export const TRAIN_KEYS: TrainKey[] = ['dmg', 'spd', 'crit', 'multi', 'range', 'move', 'gold'];

/** Prices in crystals. Hero level ups cost `step` x lv + `grow` x lv² at the current level, so
 * the first levels come fast and the last ones are long goals (§11 pacing table). */
export const PRICES = {
  /** Training: the next start level costs `step` x (lv + 1)², up to `max`. Damage runs to 20, the
   * long crystal sink once everything else is maxed (levels 11-20 cost 💎1452-4800 each). */
  train: {
    dmg: { step: 12, max: 20 },
    spd: { step: 20, max: 6 },
    crit: { step: 20, max: 6 },
    // Multishot, range and train speed are raised only here since 0.0.26 (no card in the run), so
    // their caps are the stats' whole range: multi 💎400/1600/3600, range to 750, move to 720.
    multi: { step: 400, max: 3 },
    range: { step: 30, max: 5 },
    move: { step: 20, max: 6 },
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

export const DAILY = { reward: 30, task: 20, challenge: 60, challengeWave: 10 };

export type TaskKind = 'kills' | 'wave' | 'grabs' | 'casts' | 'buys';
export const TASKS: { kind: TaskKind; goal: number }[] = [
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
  /** Guide steps done or skipped (§12), never shown again. */
  guide: string[];
  /** Wagons a pick may deal (§10.1.12, wagonmeta.ts); the best level each reached, and the most at Lv3 in one run. */
  wagons: WagonKind[];
  wagonLv: Partial<Record<WagonKind, number>>;
  wagonFull: number;
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
  /** The wagons on the train at the end. */
  wagons?: readonly { kind: WagonKind; lv: number }[];
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

/**
 * The wave task asks for a wave the player can actually reach today (2026-11-14). Its goal is the
 * best wave of a run, not a sum, so "reach wave 12" is impossible for anyone whose levels are shorter
 * than that - and after the 2026-11-14 reshape (battle.md §9.1) that is every player before 1-10: the
 * chapter now runs 6 to 12 waves, where it used to run 10 to 15. One day in two drew a task that
 * could not be done. Endless has no end, so once it is open the goal stands as written.
 */
function waveGoal(save: Save | null, goal: number): number {
  if (save && endlessOpen(save)) return goal;
  // No save yet means a brand new player, whose only open level is 1-1 - the shortest of them all.
  const open = LEVELS[save ? Math.min(nextLevel(save), LEVELS.length - 1) : 0];
  return Math.min(goal, open.waves);
}

function makeDaily(day: string, save: Save | null = null): Daily {
  const n = dayNumber(day);
  const kinds = [...TASKS];
  const tasks: Task[] = [];
  for (let i = 0; i < 3; i++) {
    const t = kinds.splice((n >> (i * 3)) % kinds.length, 1)[0];
    tasks.push({ kind: t.kind, goal: t.kind === 'wave' ? waveGoal(save, t.goal) : t.goal, progress: 0, claimed: false });
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
    guide: [],
    wagons: [...START_WAGONS],
    wagonLv: {},
    wagonFull: 0,
  };
}

/**
 * A save from before the guide was saved (§12.8): the first five minutes are behind a player who
 * has played, and what they already did elsewhere is not taught again.
 */
function guideBackfill(s: Save): string[] {
  if (!s.runs) return [];
  const ids = ['buy', 'reverse', 'basket', 'cast', 'win', 'goldbug', 'multi', 'v_train', 'v_daily', 'play1', 'v_hero', 'v_wall', 'v_route', 'play2', 'speed'];
  if (s.runs > 2) ids.push('lose');
  if (s.ach.length) ids.push('l_ach');
  if (s.heroes.beekeeper || s.heroes.chef) ids.push('l_hero');
  if (s.village.gold) ids.push('l_piggy');
  return ids;
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
    // The task list is checked for being a list first: a half-written daily used to throw here, and
    // the throw was caught in loadSave as an unreadable save, which started the player over.
    daily:
      s.daily && s.daily.day === day && Array.isArray(s.daily.tasks) && s.daily.tasks.every((t) => t && TASKS.some((k) => k.kind === t.kind))
        ? s.daily
        : base.daily,
  };
  if (!out.heroes[out.hero]) out.hero = 'farmer';
  // Crystals, runs and best are checked like the rest: a crystals field that is not a number made
  // `save.crystals < price` false for every price, so a damaged save bought everything for nothing
  // and stayed NaN from then on.
  for (const k of ['crystals', 'runs', 'best', 'kills', 'bosses', 'streak'] as const) if (typeof out[k] !== 'number' || !(out[k] >= 0)) out[k] = 0;
  if (typeof out.streakDay !== 'string') out.streakDay = '';
  out.ach = Array.isArray(out.ach) ? [...new Set(out.ach.filter((id) => typeof id === 'string'))] : [];
  out.levels = Array.isArray(out.levels) ? out.levels.slice(0, LEVELS.length).map((n) => (n >= 1 && n <= 3 ? Math.floor(n) : 0)) : [];
  out.guide = Array.isArray(s.guide) ? [...new Set(s.guide.filter((id) => typeof id === 'string'))] : guideBackfill(out);
  normalizeWagons(out);
  // A fresh daily is built again once the save is repaired (2026-11-14): the wave task's goal depends
  // on which level is open, and `base` was made before the levels were read, as if by a new player.
  if (out.daily === base.daily) out.daily = makeDaily(day, out);
  return out;
}

/** Start a new day's daily if the calendar moved on since the save was loaded. True if it did. */
export function rollDaily(save: Save, day = today()): boolean {
  if (save.daily.day === day) return false;
  save.daily = makeDaily(day, save);
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
    wagons: true,
    wagonKinds: [...save.wagons],
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

/**
 * What the lobby's level card and start button offer: the first level not cleared; with the
 * chapter done, the first level with the fewest stars while one lacks three; then endless.
 */
export function cardLevel(save: Save): number | 'endless' {
  const next = nextLevel(save);
  if (next < LEVELS.length) return next;
  const stars = LEVELS.map((_, i) => starsOf(save, i));
  const low = Math.min(...stars);
  if (low < 3) return stars.indexOf(low);
  return endlessOpen(save) ? 'endless' : LEVELS.length - 1;
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
  const best = starsOf(save, i);
  const clear = best === 0 ? LEVEL_PAY.first * n : Math.round(LEVEL_PAY.replay * n);
  // A run that did not clear the level never pays more than clearing it would (2026-11-14). `loss` is
  // per wave and `replay` is per level, so on a cleared 10-wave level the loss pay passed the replay
  // pay at wave 7 — and since a quit from the pause menu books as a loss, bailing out one wave from
  // the end was worth more than finishing. The cap is the plain clear pay, without any new stars.
  if (stars === 0) return Math.min(Math.round(LEVEL_PAY.loss * wave), clear);
  const newStars = Math.max(0, stars - best);
  return clear + LEVEL_PAY.star * n * newStars;
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
  if (r.wagons) bookWagons(save, r.wagons);
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

/** Anything waiting to be claimed, for a badge on the village button. */
export function hasClaim(save: Save): boolean {
  const d = save.daily;
  return !d.claimed || d.tasks.some((t) => !t.claimed && t.progress >= t.goal) || (!d.challengeClaimed && d.challengeBest >= DAILY.challengeWave);
}
