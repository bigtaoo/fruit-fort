// Achievements (§11): long-term goals that each pay crystals once. Progress is read off the
// save (records, lifetime totals, levels), so nothing is tracked twice and old saves get credit
// for what they already did. The ids of the ones claimed live in `save.ach`.

import { ALL_FRUITS, PRICES, type Save } from './progress';

export interface Achievement {
  id: string;
  /** Shown as is; key into i18n at merge. */
  text: string;
  goal: number;
  reward: number;
  of(s: Save): number;
}

/** How many fruits are at `lv` or above. */
const fruitsAt = (s: Save, lv: number) => ALL_FRUITS.filter((k) => s.fruits[k] >= lv).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'wave10', text: '打到第 10 波', goal: 10, reward: 30, of: (s) => s.best },
  { id: 'wave20', text: '打到第 20 波', goal: 20, reward: 60, of: (s) => s.best },
  { id: 'wave30', text: '打到第 30 波', goal: 30, reward: 100, of: (s) => s.best },
  { id: 'wave40', text: '打到第 40 波', goal: 40, reward: 200, of: (s) => s.best },
  { id: 'boss1', text: '第一次击败蝗虫王', goal: 1, reward: 40, of: (s) => s.bosses },
  { id: 'boss25', text: '累计击败蝗虫王 25 次', goal: 25, reward: 150, of: (s) => s.bosses },
  { id: 'boss100', text: '累计击败蝗虫王 100 次', goal: 100, reward: 300, of: (s) => s.bosses },
  { id: 'kills1k', text: '累计消灭 1000 只害虫', goal: 1000, reward: 50, of: (s) => s.kills },
  { id: 'kills10k', text: '累计消灭 10000 只害虫', goal: 10000, reward: 150, of: (s) => s.kills },
  { id: 'kills50k', text: '累计消灭 50000 只害虫', goal: 50000, reward: 300, of: (s) => s.kills },
  { id: 'runs10', text: '出战 10 局', goal: 10, reward: 40, of: (s) => s.runs },
  { id: 'runs50', text: '出战 50 局', goal: 50, reward: 150, of: (s) => s.runs },
  { id: 'runs100', text: '出战 100 局', goal: 100, reward: 300, of: (s) => s.runs },
  { id: 'fruitsAll', text: '解锁全部水果', goal: ALL_FRUITS.length, reward: 60, of: (s) => fruitsAt(s, 1) },
  { id: 'fruitMax', text: `任一水果升到 Lv${PRICES.fruitMax}`, goal: 1, reward: 100, of: (s) => fruitsAt(s, PRICES.fruitMax) },
  { id: 'farmer3', text: '农夫小子升到 Lv3', goal: 3, reward: 50, of: (s) => s.heroes.farmer },
  { id: 'beekeeper3', text: '养蜂姑娘升到 Lv3', goal: 3, reward: 50, of: (s) => s.heroes.beekeeper },
  { id: 'chef3', text: '厨师升到 Lv3', goal: 3, reward: 50, of: (s) => s.heroes.chef },
  { id: 'streak3', text: '连续 3 天签到', goal: 3, reward: 30, of: (s) => s.streak },
  { id: 'streak7', text: '连续 7 天签到', goal: 7, reward: 100, of: (s) => s.streak },
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
