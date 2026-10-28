// Achievements (§11): long-term goals that each pay crystals once. Progress is read off the
// save (records, lifetime totals, levels), so nothing is tracked twice and old saves get credit
// for what they already did. The ids of the ones claimed live in `save.ach`.

import { t } from '../i18n';
import { ALL_FRUITS, PRICES, type Save } from './progress';

export interface Achievement {
  id: string;
  /** Shown in the village, in the current language. */
  text(): string;
  goal: number;
  reward: number;
  of(s: Save): number;
}

/** How many fruits are at `lv` or above. */
const fruitsAt = (s: Save, lv: number) => ALL_FRUITS.filter((k) => s.fruits[k] >= lv).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'wave10', text: () => t('ach.wave', { n: 10 }), goal: 10, reward: 30, of: (s) => s.best },
  { id: 'wave20', text: () => t('ach.wave', { n: 20 }), goal: 20, reward: 60, of: (s) => s.best },
  { id: 'wave30', text: () => t('ach.wave', { n: 30 }), goal: 30, reward: 100, of: (s) => s.best },
  { id: 'wave40', text: () => t('ach.wave', { n: 40 }), goal: 40, reward: 200, of: (s) => s.best },
  { id: 'boss1', text: () => t('ach.boss1'), goal: 1, reward: 40, of: (s) => s.bosses },
  { id: 'boss25', text: () => t('ach.bosses', { n: 25 }), goal: 25, reward: 150, of: (s) => s.bosses },
  { id: 'boss100', text: () => t('ach.bosses', { n: 100 }), goal: 100, reward: 300, of: (s) => s.bosses },
  { id: 'kills1k', text: () => t('ach.kills', { n: 1000 }), goal: 1000, reward: 50, of: (s) => s.kills },
  { id: 'kills10k', text: () => t('ach.kills', { n: 10000 }), goal: 10000, reward: 150, of: (s) => s.kills },
  { id: 'kills50k', text: () => t('ach.kills', { n: 50000 }), goal: 50000, reward: 300, of: (s) => s.kills },
  { id: 'runs10', text: () => t('ach.runs', { n: 10 }), goal: 10, reward: 40, of: (s) => s.runs },
  { id: 'runs50', text: () => t('ach.runs', { n: 50 }), goal: 50, reward: 150, of: (s) => s.runs },
  { id: 'runs100', text: () => t('ach.runs', { n: 100 }), goal: 100, reward: 300, of: (s) => s.runs },
  { id: 'fruitsAll', text: () => t('ach.fruitsAll'), goal: ALL_FRUITS.length, reward: 60, of: (s) => fruitsAt(s, 1) },
  { id: 'fruitMax', text: () => t('ach.fruitMax', { n: PRICES.fruitMax }), goal: 1, reward: 100, of: (s) => fruitsAt(s, PRICES.fruitMax) },
  { id: 'farmer3', text: () => t('ach.hero', { hero: t('hero.farmer.name'), n: 3 }), goal: 3, reward: 50, of: (s) => s.heroes.farmer },
  { id: 'beekeeper3', text: () => t('ach.hero', { hero: t('hero.beekeeper.name'), n: 3 }), goal: 3, reward: 50, of: (s) => s.heroes.beekeeper },
  { id: 'chef3', text: () => t('ach.hero', { hero: t('hero.chef.name'), n: 3 }), goal: 3, reward: 50, of: (s) => s.heroes.chef },
  { id: 'streak3', text: () => t('ach.streak', { n: 3 }), goal: 3, reward: 30, of: (s) => s.streak },
  { id: 'streak7', text: () => t('ach.streak', { n: 7 }), goal: 7, reward: 100, of: (s) => s.streak },
];

export function achievementOf(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function achievementDone(s: Save, a: Achievement): boolean {
  return a.of(s) >= a.goal;
}

export function achievementClaimed(s: Save, a: Achievement): boolean {
  return s.ach.includes(a.id);
}

/** Take an achievement's crystals; only once, and only when it is done. */
export function claimAchievement(s: Save, id: string): boolean {
  const a = achievementOf(id);
  if (!a || achievementClaimed(s, a) || !achievementDone(s, a)) return false;
  s.ach.push(id);
  s.crystals += a.reward;
  return true;
}

/** Any achievement done but not yet claimed, for the badge. */
export function hasAchievement(s: Save): boolean {
  return ACHIEVEMENTS.some((a) => achievementDone(s, a) && !achievementClaimed(s, a));
}
