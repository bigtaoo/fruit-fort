// §9.9 的三件事：Boss 轮换、波次口味、支援虫。这里只测它们自己的规则，以及一条底线 ——
// 章节关抽到的随机数一个没动。

import { describe, expect, it } from 'vitest';
import { Prng } from './rng';
import { bossKind, isBossWave, pickFlavor, planWave, type Spawn } from './waves';
import { FLAVOR, FLAVORS, flavorsAt, kindFrom, WAVES } from './wavedefs';
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
    // 光看得出 Boss 是没用的 —— 口味加不加，Boss 都在。要看的是组合：口味一落地就是过半的一
    // 色虞（上面那条测的就是这个），Boss 波的每一个种子都不该到那个份额。
    for (const w of [40, 50, 60]) {
      expect(isBossWave(w)).toBe(true);
      for (let seed = 0; seed < 60; seed++) {
        const out = planWave(w, new Prng(seed), {});
        expect(out.some((s) => isBoss(s.kind))).toBe(true);
        const small = out.filter((s) => !isBoss(s.kind));
        const share = (k: string) => small.filter((s) => s.kind === k).length / small.length;
        for (const k of ['crow', 'beetle', 'mold', 'digger', 'warden']) expect(share(k)).toBeLessThan(0.5);
      }
    }
  });

  it('门槛是当场读的，NOWARD= 这类开关关得死', () => {
    // scripts/reach.ts 是在 import 求值之后才改 WAVES.*From 的。这里照样改一次：靠支援虫的口味
    // 必须立刻消失，否则量出来的剂量里还混着本该被关掉的那个虫。
    const was = WAVES.wardenFrom;
    try {
      expect(flavorsAt(999).some((f) => f.needs.includes('warden'))).toBe(true);
      WAVES.wardenFrom = Infinity;
      expect(kindFrom('warden')).toBe(Infinity);
      expect(flavorsAt(999).some((f) => f.needs.includes('warden'))).toBe(false);
    } finally {
      WAVES.wardenFrom = was;
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
  // 每一关的整张出怪表（每一波 x 三个种子，连角度、提前量、精英标记都算进去）挤成一个散列。
  // 这些值是从 §9.9 之前的那个提交（59759f7）跑出来的 —— 跟自己比证明不了任何事，跟改动之
  // 前比才行。只要新种子排错了位置、或者章节关路径上多摔了一个随机数，这里就是红的。
  const GOLDEN = ['0142d0e4', '4888fbdd', 'b2f0a91e', '8bb4c2f5', '674da09c', '8983b94a', '803bf3f5', '119fc9a6', '601327f4', 'd8a464fa', '601327f4', '6d4e7d5c', 'b37e96f0', 'bdbcae4d', '46958264', '7cc48126', '55cb7cd6', '99e82a41', 'fbf0b6ec', 'eb269b0f', 'e8ab5933', '7502535c', '2790380a', 'eb269b0f', 'a772baf8', '9d5c9d06', '9518d2b6', '9d5c9d06', 'f350b5b3', '9d5c9d06'];

  const sig = (xs: Spawn[]) =>
    xs.map((s) => `${s.kind}@${s.at.toFixed(4)}@${s.angle.toFixed(5)}@${s.lead ?? 0}@${s.tough ?? 0}`).join('|');
  const hash = (s: string) => {
    let a = 5381;
    for (let i = 0; i < s.length; i++) a = ((a * 33) ^ s.charCodeAt(i)) >>> 0;
    return a.toString(16).padStart(8, '0');
  };

  it('章节关的出怪表跟 §9.9 之前一字不差', () => {
    expect(LEVELS.length).toBe(GOLDEN.length);
    LEVELS.forEach((lv, i) => {
      const parts: string[] = [];
      for (let w = 1; w <= lv.waves; w++)
        for (const seed of [1, 2, 3])
          parts.push(sig(planWave(w, new Prng(seed), { pool: lv.pool, fronts: lv.fronts, boss: w === lv.waves, swarm: lv.swarm, pace: lv.pace, tough: lv.tough })));
      expect(hash(parts.join('#'))).toBe(GOLDEN[i]);
    });
  });

  it('章节关里没有 §9.9 的新虫', () => {
    for (const lv of LEVELS)
      for (let w = 1; w <= lv.waves; w++)
        for (const seed of [1, 2, 3]) {
          const out = planWave(w, new Prng(seed), { pool: lv.pool, fronts: lv.fronts, boss: w === lv.waves, swarm: lv.swarm, pace: lv.pace, tough: lv.tough });
          expect(out.some((s) => s.kind === 'warden' || s.kind === 'mole' || s.kind === 'queen')).toBe(false);
        }
  });
});
