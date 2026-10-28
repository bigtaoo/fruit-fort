import { describe, expect, it } from 'vitest';
import { World } from '../sim/world';
import { META, REVIVE, WALL_HP, ECON } from '../sim/config';
import { fruitDamage } from '../sim/combat';
import {
  DAILY, FIRST_RUN_BONUS, canDouble, useDouble, buyFruit, buyHero, buyVillage, claimChallenge, claimDaily, claimTask, crystalsFor, finishRun,
  hasClaim, newSave, normalize, pickDeck, pickHero, rollDaily, runCrystals, worldOptions,
} from './progress';

describe('meta progress', () => {
  it('starts with three fruits, the farmer and an empty wallet', () => {
    const s = newSave('2026-10-28');
    expect(s.deck).toEqual(['strawberry', 'coconut', 'watermelon']);
    expect(s.fruits.grape).toBe(0);
    expect(s.hero).toBe('farmer');
    expect(s.daily.tasks.length).toBe(3);
    expect(new Set(s.daily.tasks.map((t) => t.kind)).size).toBe(3);
  });

  it('pays crystals by wave and books records and tasks', () => {
    const s = newSave('2026-10-28');
    const earned = finishRun(s, { wave: 12, kills: 200, merges: 30, casts: 5, summons: 40 });
    expect(earned).toBe(crystalsFor(12) + FIRST_RUN_BONUS);
    expect(finishRun(s, { wave: 12, kills: 0, merges: 0, casts: 0, summons: 0 })).toBe(crystalsFor(12));
    expect(s.best).toBe(12);
    for (let i = 0; i < 3; i++) expect(claimTask(s, i)).toBe(true);
    expect(s.crystals).toBe(earned + crystalsFor(12) + 3 * DAILY.task);
    expect(claimTask(s, 0)).toBe(false);
  });

  it('buys only what it can afford and caps levels', () => {
    const s = newSave();
    expect(buyFruit(s, 'grape')).toBe(false);
    s.crystals = 10000;
    expect(buyFruit(s, 'grape')).toBe(true);
    expect(s.fruits.grape).toBe(1);
    for (let i = 0; i < 20; i++) buyVillage(s, 'corner');
    expect(s.village.corner).toBe(2);
    expect(buyHero(s, 'chef')).toBe(true);
    expect(pickHero(s, 'chef')).toBe(true);
    expect(pickHero(s, 'beekeeper')).toBe(false);
  });

  it('deck picks replace the oldest and need the fruit unlocked', () => {
    const s = newSave();
    expect(pickDeck(s, 'lemon')).toBe(false);
    s.fruits.lemon = 1;
    expect(pickDeck(s, 'lemon')).toBe(true);
    expect(s.deck).toEqual(['coconut', 'watermelon', 'lemon']);
  });

  it('daily resets on a new day and the challenge pays once', () => {
    const s = newSave('2026-10-28');
    expect(hasClaim(s)).toBe(true);
    expect(claimDaily(s)).toBe(true);
    expect(claimDaily(s)).toBe(false);
    finishRun(s, { wave: DAILY.challengeWave, kills: 0, merges: 0, casts: 0, summons: 0 }, true);
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
    expect(finishRun(s, { wave: 0, kills: 0, merges: 0, casts: 0, summons: 0 })).toBe(FIRST_RUN_BONUS);
    expect(s.best).toBe(0);
    expect(s.runs).toBe(1);
    expect(runCrystals(s, 0)).toBe(0);
  });

  it('repairs a bad save', () => {
    const s = normalize({ deck: ['lemon', 'lemon'], hero: 'chef', crystals: 5 });
    expect(s.deck).toEqual(['strawberry', 'coconut', 'watermelon']);
    expect(s.hero).toBe('farmer');
    expect(s.crystals).toBe(5);
  });
});

describe('meta in the run', () => {
  it('applies fruit level, wall and start gold', () => {
    const s = newSave();
    s.fruits.strawberry = 3;
    s.village.wall = 2;
    s.village.gold = 1;
    const w = new World(worldOptions(s));
    expect(w.wallMax).toBe(WALL_HP + 2 * META.wall);
    expect(w.gold).toBe(ECON.startGold + META.gold);
    const plain = new World();
    const f = w.newFruit('strawberry', 1);
    expect(fruitDamage(w, f) / fruitDamage(plain, f)).toBeCloseTo(1 + 2 * META.fruitDmg, 5);
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
