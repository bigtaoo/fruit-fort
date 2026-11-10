import { describe, expect, it } from 'vitest';
import { World } from './world';
import { Prng } from './rng';
import { planWave } from './waves';
import { approach } from './board';
import { LEVELS, SAFE, biteMul } from './levels';

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

describe('safe levels', () => {
  it('the first five levels are safe, with a bite that climbs, and the rest are not', () => {
    expect(LEVELS.slice(0, 5).every((l) => l.safe)).toBe(true);
    expect(LEVELS.slice(5).some((l) => l.safe)).toBe(false);
    const bites = LEVELS.slice(0, 5).map((l) => biteMul(l, 1));
    expect(bites).toEqual([...bites].sort((a, b) => a - b));
    expect(biteMul(LEVELS[0], SAFE.floor)).toBe(0);
    expect(biteMul(LEVELS[0], (SAFE.floor + SAFE.from) / 2)).toBeCloseTo(biteMul(LEVELS[0], 1) / 2);
    expect(biteMul(LEVELS[6], 0.01)).toBe(biteMul(LEVELS[6], 1));
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
    const plain = new World({ seed: 5, level: LEVELS[0] });
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

  it('outside the safe levels the boss does not fade', () => {
    const w = new World({ seed: 6, level: LEVELS[9] });
    w.wave = LEVELS[9].waves;
    const boss = w.addEnemy('boss', 0, -30, 0, 1, 28, 1e5);
    w.waveStart = w.time - SAFE.bossAfter - 10;
    for (let i = 0; i < 30; i++) w.step();
    expect(boss.hp).toBe(1e5);
  });
});
