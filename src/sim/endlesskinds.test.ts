// §9.9 的三件事：Boss 轮换、波次口味、支援虫。这里只测它们自己的规则，以及一条底线 ——
// 章节关抽到的随机数一个没动。

import { describe, expect, it } from 'vitest';
import { Prng } from './rng';
import { bossKind, isBossWave, pickFlavor, planWave } from './waves';
import { FLAVOR, FLAVORS, flavorsAt, WAVES } from './wavedefs';
import { BOSS_KINDS, isBoss, WARDEN } from './config';
import { LEVELS } from './levels';
import { World } from './world';

describe('boss rotation (§9.9)', () => {
  it('每十波换一个，三个轮着来', () => {
    expect([10, 20, 30, 40, 50, 60].map((w) => bossKind(w))).toEqual(['boss', 'mole', 'queen', 'boss', 'mole', 'queen']);
  });

  it('一波出两个的时候，两个不一样', () => {
    expect(bossKind(40, 0)).not.toBe(bossKind(40, 1));
  });

  it('三个都算 Boss', () => {
    for (const k of BOSS_KINDS) expect(isBoss(k)).toBe(true);
    expect(isBoss('warden')).toBe(false);
  });

  it('章节关的 Boss 还是蝗虫王', () => {
    for (const lv of LEVELS) {
      const out = planWave(lv.waves, new Prng(7), { pool: lv.pool, fronts: lv.fronts, boss: true });
      expect(out.filter((s) => isBoss(s.kind)).map((s) => s.kind)).toEqual(['boss']);
    }
  });
});

describe('wave flavors (§9.9)', () => {
  it('门槛之前一个没有，之后才抽', () => {
    for (let w = 1; w < FLAVOR.from; w++) expect(pickFlavor(w, new Prng(w))).toBeNull();
    const rolled = Array.from({ length: 200 }, (_, i) => pickFlavor(30, new Prng(i))).filter(Boolean);
    expect(rolled.length).toBeGreaterThan(30);
    expect(rolled.length).toBeLessThan(200);
  });

  it('只抽那些虫种都已经出现了的口味', () => {
    for (const f of flavorsAt(FLAVOR.from)) for (const k of f.needs) expect(FLAVOR.from).toBeGreaterThanOrEqual(WAVES[`${k}From` as 'crowFrom'] ?? 0);
    expect(flavorsAt(999).length).toBe(FLAVORS.length);
  });

  it('口味把一波变成一种虫的天下', () => {
    // 平常的一波里乌鸦只占一成上下；只要有一波过了半数是乌鸦，那就是口味真的落地了。
    const shares = Array.from({ length: 60 }, (_, s) => {
      const out = planWave(41, new Prng(s), {});
      return out.filter((x) => x.kind === 'crow').length / out.length;
    });
    expect(Math.max(...shares)).toBeGreaterThan(0.5);
    expect(Math.min(...shares)).toBeLessThan(0.3);
  });

  it('Boss 波不加口味', () => {
    for (let w = FLAVOR.from; w < 80; w++) {
      if (!isBossWave(w)) continue;
      const out = planWave(w, new Prng(w), {});
      expect(out.some((s) => isBoss(s.kind))).toBe(true);
    }
  });
});

describe('warden (§9.9)', () => {
  it('护盾只挡子弹，而且只在它活着的时候挡', () => {
    const w = new World({ seed: 5 });
    const g = w.addEnemy('warden', 2, 0, -1, 0, 5, 100);
    const e = w.addEnemy('caterpillar', 2.5, 0, -1, 0, 5, 1000);
    e.armor = 0;
    w.step();
    expect(e.ward).toBeCloseTo(WARDEN.cut);
    const before = e.hp;
    w.shots.hit(w, e, 100);
    expect(before - e.hp).toBeCloseTo(100 * (1 - WARDEN.cut));
    g.hp = 0;
    w.step();
    expect(e.ward).toBe(0);
  });

  it('支援虫自己不吃别人的护盾', () => {
    const w = new World({ seed: 5 });
    w.addEnemy('warden', 2, 0, -1, 0, 5, 100);
    w.step();
    expect(w.enemies[0].ward).toBe(0);
  });
});

describe('chapter levels draw the same stream (§9.9)', () => {
  it('同一个种子，章节关的出怪表一字不差', () => {
    for (const lv of LEVELS) {
      for (const seed of [1, 2, 3]) {
        const a = planWave(3, new Prng(seed), { pool: lv.pool, fronts: lv.fronts, boss: false });
        const b = planWave(3, new Prng(seed), { pool: lv.pool, fronts: lv.fronts, boss: false });
        expect(a).toEqual(b);
        expect(a.some((s) => s.kind === 'warden' || isBoss(s.kind))).toBe(false);
      }
    }
  });
});
