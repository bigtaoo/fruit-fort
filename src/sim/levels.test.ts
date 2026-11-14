import { describe, expect, it } from 'vitest';
import { World } from './world';
import { Prng } from './rng';
import { planWave } from './waves';
import { approach } from './board';
import { LEVELS, SAFE, biteMul } from './levels';
import type { LevelDef } from './levels';
import { HAPPENINGS, HERO, STAT_KEYS } from './config';

/**
 * A player who follows the hand, one cheap card a second, as `scripts/wavetime.ts`'s `hand` policy:
 * what the fence has left when they clear the level.
 */
function clearFence(level: LevelDef, seed: number): number {
  const w = new World({ seed, level });
  for (let t = 0; t < 12 * 60 * 30 && !w.over; t++) {
    if (t % 30 === 0 && t > 90) {
      const open = STAT_KEYS.filter((k) => !w.maxed(k));
      if (open.length) w.buy(open.reduce((a, b) => (w.statCost(b) < w.statCost(a) ? b : a)));
    }
    w.step();
  }
  expect(w.won).toBe(true);
  return w.wallHp / w.wallMax;
}

describe('tough bugs (LevelDef.tough)', () => {
  it('level 1 mixes a few tough caterpillars into waves 2-5 only: more health, double gold', () => {
    const t = LEVELS[0].tough!;
    const plan = planWave(3, new Prng(4), { pool: LEVELS[0].pool, swarm: 3, tough: t });
    const tough = plan.filter((s) => s.tough);
    expect(tough.length).toBeGreaterThan(0);
    expect(tough.length).toBeLessThan(plan.length / 2);
    expect(planWave(3, new Prng(4), { pool: LEVELS[0].pool, swarm: 3 }).some((s) => s.tough)).toBe(false);
    const w = new World({ seed: 2, level: LEVELS[0] });
    const seen = new Map<number, boolean>();
    let gold = 0;
    for (let i = 0; i < 30 * 400 && w.wave <= t.to + 1; i++) {
      w.step();
      for (const e of w.enemies) if (!seen.has(e.id)) seen.set(e.id, e.tough && w.wave >= t.from && w.wave <= t.to);
      for (const e of w.events) if (e.t === 'kill' && e.gold > gold) gold = e.gold;
      w.events.length = 0;
      for (const e of w.enemies) if (e.tough && !seen.has(-e.id)) {
        seen.set(-e.id, true);
        expect(w.wave).toBeGreaterThanOrEqual(t.from);
        expect(w.wave).toBeLessThanOrEqual(t.to);
      }
    }
    expect([...seen.values()].some(Boolean)).toBe(true);
    expect(gold).toBeGreaterThanOrEqual(12);
  });
});

describe('the first minute of a safe level', () => {
  it('the hero starts half charged, so the first cast comes early; endless starts at zero', () => {
    const safe = new World({ level: LEVELS[0], seed: 1 });
    expect(safe.hero.charge).toBe(Math.floor(HERO.chargeMax / 2));
    expect(safe.heroReady()).toBe(false);
    expect(new World({ seed: 1 }).hero.charge).toBe(0);
    expect(new World({ level: LEVELS[7], seed: 1 }).hero.charge).toBe(0);
  });

  it('1-1 can send a pickup in wave 1; the levels without happenFrom still wait for wave 3', () => {
    expect(LEVELS[0].happenFrom).toBe(1);
    expect(new World({ level: LEVELS[0], seed: 1 }).nextHappening).toBe(1);
    expect(new World({ level: LEVELS[1], seed: 1 }).nextHappening).toBe(HAPPENINGS.firstWave);
    // A run of 1-1 meets its first basket or gold bug well inside the first two waves.
    const w = new World({ level: LEVELS[0], seed: 3 });
    while (w.time < 60 && !w.happening) w.step();
    expect(w.happening).not.toBeNull();
    expect(w.wave).toBeLessThanOrEqual(2);
  });
});

describe('safe levels', () => {
  it('the first seven levels are safe, with a bite that climbs, and the rest are not', () => {
    // Seven since 2026-11-14, not five: the old edge turned 1-6 from a level nobody can lose into one
    // a player who never trains cannot win, in a single step.
    expect(LEVELS.slice(0, 7).every((l) => l.safe)).toBe(true);
    expect(LEVELS.slice(7).some((l) => l.safe)).toBe(false);
    // 1-2..1-5 bite harder one after the other. 1-1 is outside that ladder since 2026-11-12: it bites
    // 0.7, above 1-2's 0.4, but its bugs have a third of the health, so it stays much the softest level.
    // What the ladder is really about is how much fence a level costs, which the next lines measure.
    const bites = LEVELS.slice(1, 5).map((l) => biteMul(l, 1));
    expect(bites).toEqual([...bites].sort((a, b) => a - b));
    expect(LEVELS[0].hp).toBeLessThan(LEVELS[1].hp / 2);
    expect(clearFence(LEVELS[0], 3)).toBeGreaterThan(clearFence(LEVELS[1], 3) + 0.1);
    expect(biteMul(LEVELS[0], SAFE.floor)).toBe(0);
    expect(biteMul(LEVELS[0], (SAFE.floor + SAFE.from) / 2)).toBeCloseTo(biteMul(LEVELS[0], 1) / 2);
    // From 1-8 the net fades by thirds instead of being pulled away in one step (2026-11-14): each
    // level catches the player later and lower than the last, and from 2-4 on there is no net at all.
    // (Chapter 2 opens with a little of it back, the same way its health does; within a chapter it
    // only ever weakens.) A weaker net means more of the bite gets through down near the floor.
    const held = (i: number) => biteMul(LEVELS[i], 0.08) / biteMul(LEVELS[i], 1);
    for (const tail of [[7, 8, 9], [10, 11, 12]]) {
      const nets = tail.map(held);
      expect(nets).toEqual([...nets].sort((a, b) => a - b));
      expect(nets[0]).toBeLessThan(1);
    }
    expect(held(10)).toBeLessThan(held(9));
    expect(biteMul(LEVELS[13], 0.01)).toBe(biteMul(LEVELS[13], 1));
  });

  it('a player who never buys loses no safe level: the fence holds at the floor', () => {
    for (let i = 0; i < 5; i++) {
      const w = new World({ seed: 9, level: LEVELS[i] });
      for (let t = 0; t < 8 * 60 * 30 && !w.over; t++) w.step();
      expect(w.over && !w.won).toBe(false);
      expect(w.wallHp).toBeGreaterThanOrEqual(SAFE.floor * w.wallMax - 1e-6);
    }
  });
});

describe('level 1 opening and the stalled boss (2026-11-06)', () => {
  it('a swarm level sends that many times the bugs a wave, the boss wave half of them', () => {
    const one = planWave(3, new Prng(1), { pool: ['caterpillar'] });
    const three = planWave(3, new Prng(1), { pool: ['caterpillar'], swarm: 3 });
    expect(three).toHaveLength(one.length * 3);
    const boss = planWave(3, new Prng(1), { pool: ['caterpillar'], swarm: 3, boss: true });
    expect(boss.filter((s) => s.kind !== 'boss')).toHaveLength(Math.ceil(one.length * 3 / 2));
  });

  it('a paced wave keeps its bugs but closes their gaps by that much', () => {
    const one = planWave(2, new Prng(1), { pool: ['caterpillar'] });
    const half = planWave(2, new Prng(1), { pool: ['caterpillar'], pace: 0.5 });
    expect(half).toHaveLength(one.length);
    expect(half[half.length - 1].at).toBeCloseTo(one[one.length - 1].at / 2);
  });

  it('a level paces its waves up to paceTo and no further', () => {
    const lv = { ...LEVELS[0], pace: 0.5, paceTo: 3 };
    const paced = new World({ seed: 5, level: lv });
    const plain = new World({ seed: 5, level: { ...LEVELS[0], pace: undefined, paceTo: undefined } });
    const last = (w: World) => w.queue[w.queue.length - 1].at;
    for (const wave of [1, 3, 4]) {
      for (const w of [paced, plain]) {
        w.queue = [];
        w.enemies = [];
        w.wave = wave - 1;
        w.step();
        expect(w.wave).toBe(wave);
      }
      expect(last(paced)).toBeCloseTo(last(plain) * (wave <= 3 ? 0.5 : 1));
    }
  });

  it('level 1 starts with three bugs already walked in; level 2 waits and sends them from the edge', () => {
    const one = new World({ seed: 5, level: LEVELS[0] });
    one.step();
    one.step();
    const full = approach(LEVELS[0].open!).d;
    const ds = one.enemies.map((e) => e.d).sort((a, b) => a - b);
    expect(ds).toHaveLength(3);
    expect(ds[0]).toBeLessThan(full - 3);
    const two = new World({ seed: 5, level: LEVELS[1] });
    two.step();
    two.step();
    expect(two.enemies).toHaveLength(0);
  });

  it('on a safe level a boss left standing fades away, and its locusts die with it', () => {
    const w = new World({ seed: 6, level: LEVELS[0] });
    w.wave = LEVELS[0].waves;
    const boss = w.addEnemy('boss', 0, -30, 0, 1, 28, 1e5);
    w.addEnemy('locust', 1, -30, 0, 1, 28, 50);
    w.waveStart = w.time - SAFE.bossAfter + 1;
    for (let i = 0; i < 30; i++) w.step();
    expect(boss.hp).toBe(1e5);
    for (let t = 0; t < SAFE.bossFade + 2; t += 1) for (let i = 0; i < 30; i++) w.step();
    expect(w.enemies.some((e) => e.kind === 'boss' || e.kind === 'locust')).toBe(false);
  });

  // Both mercies follow the net, not `safe` (2026-11-14): a netted level cannot be lost at the fence,
  // so a boss its player cannot kill is a stalemate, not a fight. 2-4 is the first level with no net.
  it('on a level with no net the boss does not fade', () => {
    const w = new World({ seed: 6, level: LEVELS[13] });
    w.wave = LEVELS[13].waves;
    const boss = w.addEnemy('boss', 0, -30, 0, 1, 28, 1e5);
    w.waveStart = w.time - SAFE.bossAfter - 10;
    for (let i = 0; i < 30; i++) w.step();
    expect(boss.hp).toBe(1e5);
  });
});
