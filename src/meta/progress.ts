// Out-of-run progress (§11): crystals, chapter level stars (§9.1), training (stat start levels),
// hero levels, village upgrades, and the daily reward / tasks / challenge. Plain data and functions, no DOM, so tests and the bot
// can drive it; store.ts persists it. Prices and purchases are in shop.ts, the daily in daily.ts, the
// level queries in chapter.ts.

import type { HeroKind, WagonKind } from '../sim/types';
import type { WorldOptions } from '../sim/world';
import { WAVES } from '../sim/wavedefs';
import { LEVELS } from '../sim/levels';
import { bossCount } from '../sim/waves';
import { START_WAGONS, bookWagons, normalizeWagons } from './wagonmeta';
import { PRICES, TRAIN_KEYS, type TrainKey, type VillageKey } from './shop';
import { TASKS, challengeOf, dayNumber, makeDaily, today, type Daily } from './daily';
import { starsOf } from './chapter';

export const ALL_HEROES: HeroKind[] = ['farmer', 'beekeeper', 'chef'];

/** One-off gift at the end of the very first run, so the first visit to the village can buy something. */
export const FIRST_RUN_BONUS = 40;

/** What a run is: a chapter level (its index in LEVELS), an endless run or the day's challenge. */
export type RunMode = number | 'endless' | 'challenge';

/** Level crystals per wave in the level (§9.1): the first clear, each new star, a replay win, and
 * per wave reached in a lost level. Replays pay about a fifth of the first clear, so farming a
 * level is slower than pushing on, and endless pays more once it opens. */
export const LEVEL_PAY = { first: 2, star: 1, replay: 0.6, loss: 1 };

export interface Save {
  /** 2 since 2026-11-15: multishot levels are half a target, so a v1 save's levels are doubled. */
  v: 1 | 2;
  /**
   * This player, as our own telemetry knows them (docs/telemetry/self-hosted.md §2.2): a random id, kept
   * as long as the save is. Nothing is derived from it and it goes nowhere but our own collector; on
   * Playgama the backend did this itself, and CrazyGames does not do it at all.
   */
  uid: string;
  /**
   * The day this save was made (`today()`), or '' for one made before the field existed. Retention — one of
   * CrazyGames' own gate metrics — cannot be computed without it: `runs` says the player has played, never
   * whether that was today or last week.
   */
  since: string;
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
  /**
   * The furthest wave a lost run reached per chapter level (runloop.md §2.4), 0 or missing = never
   * lost there. The loss card's "new best" is a run that got further than this.
   */
  reach: number[];
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
  /** Left from the pause menu (booked as a loss): not a try that got that far, so not in `Save.reach`. */
  bailed?: boolean;
}

/** A player id for a save that has none: 11 random chars, not derived from anything about the player. */
export function newPlayerId(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 7);
}

export function newSave(day = today()): Save {
  return {
    v: 2,
    uid: newPlayerId(),
    since: day,
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
    reach: [],
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
  const ids = ['buy', 'reverse', 'basket', 'cast', 'win', 'r_train', 'win3', 'goldbug', 'multi', 'v_train', 'v_daily', 'play1', 'v_hero', 'v_wall', 'v_route', 'play2', 'speed'];
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
  // A v1 save bought whole multishot targets at 💎120 each; a level is half a target now, so doubling
  // keeps what the player paid for (PRICES.train.multi) instead of quietly halving their train's fire.
  if (out.v !== 2) {
    out.train.multi = Math.min(PRICES.train.multi.max, out.train.multi * 2);
    out.v = 2;
  }
  // Crystals, runs and best are checked like the rest: a crystals field that is not a number made
  // `save.crystals < price` false for every price, so a damaged save bought everything for nothing
  // and stayed NaN from then on.
  for (const k of ['crystals', 'runs', 'best', 'kills', 'bosses', 'streak'] as const) if (typeof out[k] !== 'number' || !(out[k] >= 0)) out[k] = 0;
  if (typeof out.streakDay !== 'string') out.streakDay = '';
  // A save from before these fields gets an id now, but not a first-seen day: it was not made today, and
  // guessing today would count every returning player as new. '' means "has played, since when unknown".
  if (typeof out.uid !== 'string' || !out.uid) out.uid = newPlayerId();
  // Read from the raw save, not from `out`: `out` inherited a new save's today, and a save that reaches
  // here is one that already existed.
  out.since = typeof s.since === 'string' ? s.since : '';
  out.ach = Array.isArray(out.ach) ? [...new Set(out.ach.filter((id) => typeof id === 'string'))] : [];
  out.levels = Array.isArray(out.levels) ? out.levels.slice(0, LEVELS.length).map((n) => (n >= 1 && n <= 3 ? Math.floor(n) : 0)) : [];
  out.reach = Array.isArray(out.reach) ? out.reach.slice(0, LEVELS.length).map((n) => (typeof n === 'number' && n >= 0 ? Math.floor(n) : 0)) : [];
  out.guide = Array.isArray(s.guide) ? [...new Set(s.guide.filter((id) => typeof id === 'string'))] : guideBackfill(out);
  normalizeWagons(out);
  // A fresh daily is built again once the save is repaired (2026-11-14): the wave task's goal depends
  // on which level is open, and `base` was made before the levels were read, as if by a new player.
  if (out.daily === base.daily) out.daily = makeDaily(day, out);
  return out;
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

// ---- chapter level pay (§9.1) -------------------------------------------------------------

/**
 * What a wave of this level is worth, against a wave of 1-1 (2026-11-15). Pay used to be the wave
 * count alone, so the whole 20-level campaign paid 💎621 while one day of logging in paid 💎150 -
 * `scripts/payoff.ts` measured a player stuck on 2-4 earning 💎71 from 25 runs of playing and 💎540
 * from the daily screen, against a 💎225 next training level. A game that pays for logging in and
 * not for playing has no reason to be played.
 *
 * The weight follows the level's place in the campaign, not its health multiplier: difficulty is
 * made of health, mods and fronts together, so a late level that leans on mods instead of health is
 * still late, and pay has to rise with the climb rather than with one of its ingredients.
 */
export function levelWeight(i: number): number {
  return Math.max(1, Math.round(1 + i * 0.6));
}

/** The waves a level pays for: its own count, or `pay` where a level was cut shorter than its pay (levels.ts). */
export function payWaves(i: number): number {
  return LEVELS[i].pay ?? LEVELS[i].waves;
}

export function levelCrystals(save: Save, i: number, wave: number, stars: number): number {
  const n = payWaves(i) * levelWeight(i);
  const best = starsOf(save, i);
  const clear = best === 0 ? LEVEL_PAY.first * n : Math.round(LEVEL_PAY.replay * n);
  // A run that did not clear the level never pays more than clearing it would (2026-11-14). `loss` is
  // per wave and `replay` is per level, so on a cleared 10-wave level the loss pay passed the replay
  // pay at wave 7 — and since a quit from the pause menu books as a loss, bailing out one wave from
  // the end was worth more than finishing. The cap is the plain clear pay, without any new stars.
  // A level that pays for more waves than it has pays each of its waves in proportion.
  if (stars === 0) return Math.min(Math.round(((LEVEL_PAY.loss * wave * payWaves(i)) / LEVELS[i].waves) * levelWeight(i)), clear);
  const newStars = Math.max(0, stars - best);
  return clear + LEVEL_PAY.star * n * newStars;
}

/** Crystals for reaching a wave: 4 a wave, plus 5 for every boss wave passed. */
export function crystalsFor(wave: number): number {
  return 4 * wave + 5 * Math.floor(wave / 5);
}

/**
 * Bosses beaten in a run that reached `wave`: the next wave only starts once the boss is dead, so
 * every boss wave strictly before this one was cleared. Counting waves is not counting bosses -
 * from `WAVES.bossBands` a late boss wave sends two, then three (§9.2), so a run to wave 80 kills
 * eleven and used to be booked for seven. `bossCount` is read rather than copied: moving a band
 * moves the achievement with it.
 */
export function bossesIn(wave: number): number {
  let n = 0;
  for (let w = WAVES.bossEvery; w < wave; w += WAVES.bossEvery) n += bossCount(w);
  return n;
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
    if (stars === 0 && !r.bailed) {
      while (save.reach.length <= mode) save.reach.push(0);
      save.reach[mode] = Math.max(save.reach[mode], r.wave);
    }
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
