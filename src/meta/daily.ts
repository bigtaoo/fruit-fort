// The daily (§11): the calendar day key, the day's reward, tasks and challenge, and claiming them.
// Plain data and functions, no DOM. Split from progress.ts.

import type { RunMods } from '../sim/world';
import { t } from '../i18n';
import { LEVELS, MODS, type ModId } from '../sim/levels';
import { endlessOpen, nextLevel } from './chapter';
import type { Save } from './progress';

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

export function makeDaily(day: string, save: Save | null = null): Daily {
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

/** Start a new day's daily if the calendar moved on since the save was loaded. True if it did. */
export function rollDaily(save: Save, day = today()): boolean {
  if (save.daily.day === day) return false;
  save.daily = makeDaily(day, save);
  return true;
}

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
