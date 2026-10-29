import { describe, expect, it } from 'vitest';
import { World } from '../sim/world';
import { META, REVIVE, STATS, WALL_HP, ECON } from '../sim/config';
import {
  DAILY, FIRST_RUN_BONUS, canDouble, useDouble, buyTrain, buyHero, buyVillage, claimChallenge, claimDaily, claimTask, crystalsFor, finishRun,
  hasClaim, newSave, normalize, pickHero, rollDaily, runCrystals, worldOptions,
  LEVEL_PAY, endlessOpen, levelOpen, nextLevel, totalStars,
} from './progress';
import { CHAPTER_SIZE, LEVELS } from '../sim/levels';

describe('meta progress', () => {
  it('starts untrained, with the farmer and an empty wallet', () => {
    const s = newSave('2026-10-28');
    expect(Object.values(s.train).every((lv) => lv === 0)).toBe(true);
    expect(s.crystals).toBe(0);
    expect(s.hero).toBe('farmer');
    expect(s.daily.tasks.length).toBe(3);
    expect(new Set(s.daily.tasks.map((t) => t.kind)).size).toBe(3);
  });

  it('pays crystals by wave and books records and tasks', () => {
    const s = newSave('2026-10-28');
    const earned = finishRun(s, { wave: 12, kills: 200, grabs: 30, casts: 5, buys: 40 });
    expect(earned).toBe(crystalsFor(12) + FIRST_RUN_BONUS);
    expect(finishRun(s, { wave: 12, kills: 0, grabs: 0, casts: 0, buys: 0 })).toBe(crystalsFor(12));
    expect(s.best).toBe(12);
    for (let i = 0; i < 3; i++) expect(claimTask(s, i)).toBe(true);
    expect(s.crystals).toBe(earned + crystalsFor(12) + 3 * DAILY.task);
    expect(claimTask(s, 0)).toBe(false);
  });

  it('buys only what it can afford and caps levels', () => {
    const s = newSave();
    expect(buyTrain(s, 'dmg')).toBe(false);
    s.crystals = 10000;
    expect(buyTrain(s, 'dmg')).toBe(true);
    expect(s.train.dmg).toBe(1);
    for (let i = 0; i < 20; i++) buyTrain(s, 'multi');
    expect(s.train.multi).toBe(1);
    for (let i = 0; i < 20; i++) buyVillage(s, 'gold');
    expect(s.village.gold).toBe(5);
    expect(buyHero(s, 'chef')).toBe(true);
    expect(pickHero(s, 'chef')).toBe(true);
    expect(pickHero(s, 'beekeeper')).toBe(false);
  });

  it('daily resets on a new day and the challenge pays once', () => {
    const s = newSave('2026-10-28');
    expect(hasClaim(s)).toBe(true);
    expect(claimDaily(s)).toBe(true);
    expect(claimDaily(s)).toBe(false);
    finishRun(s, { wave: DAILY.challengeWave, kills: 0, grabs: 0, casts: 0, buys: 0 }, 'challenge');
    expect(claimChallenge(s)).toBe(true);
    expect(claimChallenge(s)).toBe(false);
    const next = normalize(JSON.parse(JSON.stringify(s)), '2026-10-29');
    expect(next.daily.claimed).toBe(false);
    expect(next.crystals).toBe(s.crystals);
  });

  it('doubles crystals at most three times a day', () => {
    const s = newSave('2026-10-28');
    for (let i = 0; i < DAILY.doubles; i++) {
      expect(canDouble(s)).toBe(true);
      useDouble(s);
    }
    expect(canDouble(s)).toBe(false);
    expect(canDouble(normalize(JSON.parse(JSON.stringify(s)), '2026-10-29'))).toBe(true);
  });

  it('rolls the daily over while the page stays open', () => {
    const s = newSave('2026-10-28');
    claimDaily(s);
    useDouble(s);
    s.daily.tasks[0].progress = 5;
    expect(rollDaily(s, '2026-10-28')).toBe(false);
    expect(s.daily.claimed).toBe(true);
    expect(rollDaily(s, '2026-10-29')).toBe(true);
    expect(s.daily.day).toBe('2026-10-29');
    expect(s.daily.claimed).toBe(false);
    expect(s.daily.tasks.every((t) => t.progress === 0)).toBe(true);
    expect(canDouble(s)).toBe(true);
    expect(hasClaim(s)).toBe(true);
  });

  it('a run lost before wave 1 books nothing but the first-run bonus', () => {
    const s = newSave('2026-10-28');
    expect(runCrystals(s, 0)).toBe(FIRST_RUN_BONUS);
    expect(finishRun(s, { wave: 0, kills: 0, grabs: 0, casts: 0, buys: 0 })).toBe(FIRST_RUN_BONUS);
    expect(s.best).toBe(0);
    expect(s.runs).toBe(1);
    expect(runCrystals(s, 0)).toBe(0);
  });

  it('repairs a bad save', () => {
    const s = normalize({ train: { dmg: 2, spd: -1, crit: 'x' }, hero: 'chef', crystals: 5 });
    expect(s.train).toMatchObject({ dmg: 2, spd: 0, crit: 0, multi: 0 });
    expect(s.hero).toBe('farmer');
    expect(s.crystals).toBe(5);
  });
});

describe('meta in the run', () => {
  it('applies training, wall and start gold', () => {
    const s = newSave();
    s.train.dmg = 3;
    s.train.range = 2;
    s.village.wall = 2;
    s.village.gold = 1;
    const w = new World(worldOptions(s));
    expect(w.lv).toMatchObject({ dmg: 3, range: 2, spd: 0, wall: 0 });
    // Start levels count as bought: the next one costs what level 4 would.
    expect(w.statCost('dmg')).toBe(Math.round(STATS.dmg.cost * Math.pow(STATS.dmg.growth, 3)));
    expect(w.buys).toBe(0);
    expect(w.wallMax).toBe(WALL_HP + 2 * META.wall);
    expect(w.gold).toBe(ECON.startGold + META.gold);
  });

  it('start levels never pass the stat cap', () => {
    const w = new World({ meta: { statLv: { multi: 9, wall: 2 } } });
    expect(w.lv.multi).toBe(STATS.multi.max);
    expect(w.wallMax).toBe(WALL_HP + 2 * STATS.wall.per);
  });

  it('challenge rules change the run', () => {
    const w = new World({ mods: { wallMul: 0.6, startGold: -20 } });
    expect(w.wallMax).toBe(600);
    expect(w.gold).toBe(ECON.startGold - 20);
  });

  it('revives once with half the wall', () => {
    const w = new World({ seed: 2 });
    w.wallHp = 0;
    w.over = true;
    w.addEnemy('beetle', 0, 4, 0, -1, 0, 50);
    expect(w.revive()).toBe(true);
    expect(w.over).toBe(false);
    expect(w.wallHp).toBe(w.wallMax * REVIVE.wall);
    expect(w.enemies.length).toBe(0);
    w.over = true;
    expect(w.revive()).toBe(false);
  });
});

describe('chapter levels (§9.1)', () => {
  const run = (wave: number, stars: number) => ({ wave, kills: 0, grabs: 0, casts: 0, buys: 0, stars });

  it('opens levels one by one and endless after the chapter', () => {
    const s = newSave('2026-10-28');
    expect(nextLevel(s)).toBe(0);
    expect(levelOpen(s, 0)).toBe(true);
    expect(levelOpen(s, 1)).toBe(false);
    finishRun(s, run(3, 0), 0);
    expect(levelOpen(s, 1)).toBe(false);
    finishRun(s, run(LEVELS[0].waves, 2), 0);
    expect(nextLevel(s)).toBe(1);
    expect(levelOpen(s, 1)).toBe(true);
    for (let i = 1; i < CHAPTER_SIZE; i++) {
      expect(endlessOpen(s)).toBe(false);
      finishRun(s, run(LEVELS[i].waves, 1), i);
    }
    expect(endlessOpen(s)).toBe(true);
    expect(nextLevel(s)).toBe(LEVELS.length);
    expect(s.best).toBe(0);
  });

  it('pays the first clear, then each new star, then a replay share; a loss pays its waves', () => {
    const s = newSave('2026-10-28');
    s.runs = 1;
    const n = LEVELS[2].waves;
    expect(finishRun(s, run(4, 0), 2)).toBe(LEVEL_PAY.loss * 4);
    expect(finishRun(s, run(n, 1), 2)).toBe(LEVEL_PAY.first * n + LEVEL_PAY.star * n);
    expect(finishRun(s, run(n, 3), 2)).toBe(Math.round(LEVEL_PAY.replay * n) + 2 * LEVEL_PAY.star * n);
    expect(finishRun(s, run(n, 2), 2)).toBe(Math.round(LEVEL_PAY.replay * n));
    expect(s.levels[2]).toBe(3);
    expect(totalStars(s)).toBe(3);
    expect(s.bosses).toBe(3);
  });

  it('a level run uses the level, and old or broken saves get clean stars', () => {
    const s = newSave('2026-10-28');
    expect(new World(worldOptions(s, 4)).level).toBe(LEVELS[4]);
    expect(new World(worldOptions(s)).level).toBe(null);
    expect(normalize({ ...s, levels: undefined }, '2026-10-28').levels).toEqual([]);
    expect(normalize({ ...s, levels: [3, 9, -1, 2.5, 'x'] }, '2026-10-28').levels).toEqual([3, 0, 0, 2, 0]);
  });
});
