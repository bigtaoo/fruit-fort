import { describe, expect, it } from 'vitest';
import { World } from '../sim/world';
import { META, REVIVE, STATS, WALL_HP, ECON } from '../sim/config';
import {
  DAILY, FIRST_RUN_BONUS, PRICES, buyTrain, buyHero, buyVillage, claimChallenge, claimDaily, claimTask, crystalsFor, finishRun,
  cardLevel, hasClaim, newSave, normalize, pickHero, rollDaily, runCrystals, worldOptions,
  LEVEL_PAY, endlessOpen, levelOpen, levelWeight, nextLevel, totalStars, TASKS, type Save,
} from './progress';
import { CHAPTER_SIZE, LEVELS } from '../sim/levels';

describe('meta progress', () => {
  it('offers the next level, then the one shortest of stars, then endless', () => {
    const s = newSave('2026-10-28');
    expect(cardLevel(s)).toBe(0);
    s.levels = [3, 1, 2];
    expect(cardLevel(s)).toBe(3);
    s.levels = LEVELS.map((_, i) => (i === 4 || i === 7 ? 1 : 3));
    expect(cardLevel(s)).toBe(4);
    s.levels = LEVELS.map(() => 3);
    expect(cardLevel(s)).toBe('endless');
  });

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
    expect(s.train.multi).toBe(PRICES.train.multi.max);
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

  it('rolls the daily over while the page stays open', () => {
    const s = newSave('2026-10-28');
    claimDaily(s);
    s.daily.tasks[0].progress = 5;
    expect(rollDaily(s, '2026-10-28')).toBe(false);
    expect(s.daily.claimed).toBe(true);
    expect(rollDaily(s, '2026-10-29')).toBe(true);
    expect(s.daily.day).toBe('2026-10-29');
    expect(s.daily.claimed).toBe(false);
    expect(s.daily.tasks.every((t) => t.progress === 0)).toBe(true);
    expect(hasClaim(s)).toBe(true);
  });

  it('never asks for a wave the open level cannot reach', () => {
    // The wave task's goal is the best wave of one run, not a sum (2026-11-14). Levels run 6 to 12
    // waves since the reshape, so the written goal of 12 was impossible for everyone before 1-10.
    const written = TASKS.find((t) => t.kind === 'wave')!.goal;
    expect(written).toBeGreaterThan(LEVELS[0].waves);
    const fresh = newSave('2026-10-28');
    const goalOf = (s: Save) => s.daily.tasks.find((t) => t.kind === 'wave')?.goal;
    // Every day of a week offers the fresh player a goal they could reach on 1-1.
    let drawn = 0;
    for (let d = 0; d < 7; d++) {
      const g = goalOf(newSave(`2026-11-0${d + 1}`));
      if (g === undefined) continue;
      drawn++;
      expect(g).toBeLessThanOrEqual(LEVELS[0].waves);
    }
    expect(drawn).toBeGreaterThan(0);
    // Further in, the goal follows the level that is open...
    fresh.levels = LEVELS.map((_, i) => (i < 5 ? 3 : 0));
    rollDaily(fresh, '2026-10-29');
    const mid = goalOf(fresh);
    if (mid !== undefined) expect(mid).toBeLessThanOrEqual(LEVELS[5].waves);
    // ...and once endless is open, which has no end, the goal stands as written.
    fresh.levels = LEVELS.map(() => 3);
    rollDaily(fresh, '2026-10-30');
    const far = goalOf(fresh);
    if (far !== undefined) expect(far).toBe(written);
    // A repaired save gets the same treatment, not the new player's goal.
    const old = normalize({ ...fresh, daily: undefined }, '2026-10-31');
    const rep = goalOf(old);
    if (rep !== undefined) expect(rep).toBe(written);
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

  it('keeps the guide list and backfills it for a player from before it was saved', () => {
    expect(normalize({ guide: ['buy', 'buy', 3] }).guide).toEqual(['buy']);
    expect(normalize({}).guide).toEqual([]);
    const old = normalize({ runs: 5, heroes: { farmer: 1, beekeeper: 1, chef: 0 } });
    expect(old.guide).toEqual(expect.arrayContaining(['buy', 'reverse', 'play2', 'lose', 'l_hero']));
    expect(old.guide).not.toContain('l_piggy');
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
    // Start levels price the next buy from where they left the stat (2026-11-14), so three trained
    // levels of damage mean the fourth costs what a fourth costs.
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

  it('opens levels one by one, endless after chapter 1, then chapter 2', () => {
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
    // Chapter 2 follows on.
    expect(nextLevel(s)).toBe(CHAPTER_SIZE);
    expect(levelOpen(s, CHAPTER_SIZE)).toBe(true);
    expect(levelOpen(s, CHAPTER_SIZE + 1)).toBe(false);
    for (let i = CHAPTER_SIZE; i < LEVELS.length; i++) finishRun(s, run(LEVELS[i].waves, 1), i);
    expect(nextLevel(s)).toBe(LEVELS.length);
    expect(s.best).toBe(0);
  });

  it('pays the first clear, then each new star, then a replay share; a loss pays its waves', () => {
    const s = newSave('2026-10-28');
    s.runs = 1;
    // Every pay is counted in weighted waves since 2026-11-15: a wave of a level is worth as much as
    // the level is hard, so the same run on a later level pays more.
    const waves = LEVELS[2].waves;
    const n = waves * levelWeight(2);
    expect(levelWeight(2)).toBeGreaterThan(1);
    expect(finishRun(s, run(4, 0), 2)).toBe(LEVEL_PAY.loss * 4 * levelWeight(2));
    expect(finishRun(s, run(waves, 1), 2)).toBe(LEVEL_PAY.first * n + LEVEL_PAY.star * n);
    expect(finishRun(s, run(waves, 3), 2)).toBe(Math.round(LEVEL_PAY.replay * n) + 2 * LEVEL_PAY.star * n);
    expect(finishRun(s, run(waves, 2), 2)).toBe(Math.round(LEVEL_PAY.replay * n));
    // A run that did not clear never pays more than clearing would: on a cleared level the per-wave
    // loss pay passes the per-level replay pay partway through, and a pause-menu quit books as a loss.
    expect(finishRun(s, run(waves, 0), 2)).toBe(Math.round(LEVEL_PAY.replay * n));
    expect(finishRun(s, run(2, 0), 2)).toBe(LEVEL_PAY.loss * 2 * levelWeight(2));
    expect(s.levels[2]).toBe(3);
    expect(totalStars(s)).toBe(3);
    expect(s.bosses).toBe(3);
  });

  it('playing the campaign pays more than opening the daily screen', () => {
    // The whole point of weighting pay by the campaign position (2026-11-15). Pay used to be the
    // wave count alone: the 20 levels together paid 💎621 while one day of dailies paid 💎150, so a
    // player stuck on a level earned more by logging in and not playing than by playing. A game
    // that pays for turning up and not for playing has no reason to be played.
    let campaign = 0;
    for (let i = 0; i < LEVELS.length; i++) {
      const n = LEVELS[i].waves * levelWeight(i);
      campaign += LEVEL_PAY.first * n + LEVEL_PAY.star * n;
    }
    const day = DAILY.reward + 3 * DAILY.task + DAILY.challenge;
    expect(campaign).toBeGreaterThan(20 * day);
    // The climb pays for itself: within a chapter every level is worth more than the one before it.
    // Across the join it is worth more per wave but not per level, because a chapter opens with
    // shorter levels again - 1-10 runs 12 waves and 2-1 runs 10 - and that is fine: a first clear of
    // 2-1 pays 💎140 against 💎43 for replaying 1-10, so there is never a reason to go back.
    for (let i = 1; i < LEVELS.length; i++) {
      if (i % CHAPTER_SIZE === 0) {
        expect(levelWeight(i)).toBeGreaterThan(levelWeight(i - 1));
        continue;
      }
      expect(LEVELS[i].waves * levelWeight(i)).toBeGreaterThanOrEqual(LEVELS[i - 1].waves * levelWeight(i - 1));
    }
    expect(levelWeight(LEVELS.length - 1)).toBeGreaterThan(5 * levelWeight(0));
  });

  it('a level run uses the level, and old or broken saves get clean stars', () => {
    const s = newSave('2026-10-28');
    expect(new World(worldOptions(s, 4)).level).toBe(LEVELS[4]);
    expect(new World(worldOptions(s)).level).toBe(null);
    expect(normalize({ ...s, levels: undefined }, '2026-10-28').levels).toEqual([]);
    expect(normalize({ ...s, levels: [3, 9, -1, 2.5, 'x'] }, '2026-10-28').levels).toEqual([3, 0, 0, 2, 0]);
  });

  it('a damaged purse or daily is repaired, not thrown away', () => {
    const s = newSave('2026-10-28');
    s.crystals = 500;
    // Crystals that are not a number made every price affordable (NaN < price is false) and stayed
    // NaN once spent, so the field is reset like the other counters.
    const bad = normalize({ ...s, crystals: null, runs: 'x', best: NaN }, '2026-10-28');
    expect(bad.crystals).toBe(0);
    expect(bad.runs).toBe(0);
    expect(bad.best).toBe(0);
    expect(buyTrain(bad, 'dmg')).toBe(false);
    // A half-written daily threw here, and loadSave read the throw as an unreadable save: the
    // player lost their crystals and levels along with the day.
    const kept = normalize({ ...s, daily: { day: '2026-10-28', claimed: false, tasks: undefined } }, '2026-10-28');
    expect(kept.crystals).toBe(500);
    expect(kept.daily.tasks).toHaveLength(3);
    expect(normalize({ ...s, daily: { day: '2026-10-28', claimed: false, tasks: [null] } }, '2026-10-28').daily.tasks).toHaveLength(3);
  });
});

describe('save migration', () => {
  it('doubles a v1 save’s multishot levels, because a level is half a target now', () => {
    const old = normalize({ v: 1, train: { dmg: 3, spd: 0, crit: 0, multi: 2, range: 0, move: 0, gold: 0 } });
    expect(old.train.multi).toBe(4);
    expect(old.train.dmg).toBe(3);
    expect(old.v).toBe(2);
    // Running it twice must not double again.
    expect(normalize(old).train.multi).toBe(4);
  });
});
