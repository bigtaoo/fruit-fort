import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementOf, claimAchievement, hasAchievement } from './achievements';
import { bossesIn, buyFruit, claimDaily, dayBefore, finishRun, fruitPrice, heroPrice, newSave, normalize } from './progress';

const run = (wave: number, kills = 0) => ({ wave, kills, merges: 0, casts: 0, summons: 0 });

describe('achievements', () => {
  it('have unique ids and pay something', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.reward).toBeGreaterThan(0);
  });

  it('pay once, and only when done', () => {
    const s = newSave('2026-10-28');
    expect(hasAchievement(s)).toBe(false);
    expect(claimAchievement(s, 'wave10')).toBe(false);
    finishRun(s, run(12));
    expect(hasAchievement(s)).toBe(true);
    const before = s.crystals;
    expect(claimAchievement(s, 'wave10')).toBe(true);
    expect(s.crystals).toBe(before + achievementOf('wave10')!.reward);
    expect(claimAchievement(s, 'wave10')).toBe(false);
    expect(claimAchievement(s, 'wave20')).toBe(false);
    expect(claimAchievement(s, 'nope')).toBe(false);
  });

  it('count lifetime kills and bosses across runs', () => {
    const s = newSave('2026-10-28');
    finishRun(s, run(10, 600));
    expect(s.bosses).toBe(0);
    expect(claimAchievement(s, 'boss1')).toBe(false);
    finishRun(s, run(21, 500));
    expect(s.kills).toBe(1100);
    expect(s.bosses).toBe(2);
    expect(claimAchievement(s, 'boss1')).toBe(true);
    expect(claimAchievement(s, 'kills1k')).toBe(true);
    expect(bossesIn(0)).toBe(0);
    expect(bossesIn(11)).toBe(1);
  });

  it('read levels off the save', () => {
    const s = newSave('2026-10-28');
    s.crystals = 1e6;
    expect(claimAchievement(s, 'fruitsAll')).toBe(false);
    buyFruit(s, 'grape');
    buyFruit(s, 'lemon');
    expect(claimAchievement(s, 'fruitsAll')).toBe(true);
    s.heroes.chef = 3;
    expect(claimAchievement(s, 'chef3')).toBe(true);
    expect(claimAchievement(s, 'beekeeper3')).toBe(false);
  });

  it('count a daily-reward streak over consecutive days, and reset after a gap', () => {
    expect(dayBefore('2026-11-01')).toBe('2026-10-31');
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
    let s = newSave('2026-10-25');
    const days = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];
    for (const d of days) {
      s = normalize(JSON.parse(JSON.stringify(s)), d);
      expect(claimDaily(s)).toBe(true);
    }
    expect(s.streak).toBe(7);
    expect(claimAchievement(s, 'streak7')).toBe(true);
    s = normalize(JSON.parse(JSON.stringify(s)), '2026-11-02');
    claimDaily(s);
    expect(s.streak).toBe(1);
    // Claimed achievements stay claimed after the streak breaks.
    expect(s.ach).toContain('streak7');
  });
});

describe('save migration', () => {
  it('an M4 save gets the new fields and keeps everything else', () => {
    const old = { v: 1, crystals: 77, fruits: { strawberry: 4, coconut: 1, watermelon: 1, grape: 1, lemon: 0 }, heroes: { farmer: 2, beekeeper: 0, chef: 0 }, village: { wall: 1, gold: 0, corner: 0 }, deck: ['grape', 'coconut', 'watermelon'], hero: 'farmer', runs: 9, best: 23 };
    const s = normalize(old, '2026-10-28');
    expect(s).toMatchObject({ crystals: 77, runs: 9, best: 23, deck: ['grape', 'coconut', 'watermelon'], kills: 0, bosses: 0, streak: 0, streakDay: '', ach: [] });
    // Records from before achievements count straight away.
    expect(claimAchievement(s, 'wave20')).toBe(true);
    expect(claimAchievement(s, 'wave30')).toBe(false);
  });

  it('repairs broken achievement fields', () => {
    const s = normalize({ kills: 'lots', bosses: -3, streak: NaN, streakDay: 5, ach: ['wave10', 7, 'wave10'] }, '2026-10-28');
    expect(s.kills).toBe(0);
    expect(s.bosses).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.streakDay).toBe('');
    expect(s.ach).toEqual(['wave10']);
    expect(normalize({ ach: 'x' }).ach).toEqual([]);
  });

  it('round-trips through JSON with achievements claimed', () => {
    const s = newSave('2026-10-28');
    finishRun(s, run(12, 1200));
    claimAchievement(s, 'wave10');
    const back = normalize(JSON.parse(JSON.stringify(s)), '2026-10-28');
    expect(back.ach).toEqual(['wave10']);
    expect(back.kills).toBe(1200);
    expect(claimAchievement(back, 'wave10')).toBe(false);
  });
});

describe('prices', () => {
  it('fruit and hero levels get steeper and stop at the cap', () => {
    const s = newSave('2026-10-28');
    const fruit: number[] = [];
    s.crystals = 1e6;
    for (;;) {
      const p = fruitPrice(s, 'strawberry');
      if (p === null) break;
      fruit.push(p);
      buyFruit(s, 'strawberry');
    }
    expect(fruit.length).toBe(9);
    for (let i = 2; i < fruit.length; i++) expect(fruit[i] - fruit[i - 1]).toBeGreaterThan(fruit[i - 1] - fruit[i - 2]);
    expect(heroPrice(s, 'farmer')).toBeGreaterThan(0);
  });
});
