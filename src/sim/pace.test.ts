// 换气：一波清完、下一波还没来的那口气（§9.8，sim/pace.ts）。它存在的理由是量出来的 ——
// 一局无尽里第 4 到第 51 波每波都是 17～26 秒，没有趋势，Boss 波和邻居一样长，`WAVES.callAt`
// 又让下一波在场上还剩两只的时候就开，所以从头到尾没有一个「清了」的落点。玩家的话是「游戏
// 没有节奏」。这一组测试钉的就是那口气：多长、Boss 波多长、钱在哪一刻结、引导按着的时候不插。

import { describe, expect, it } from 'vitest';
import { World } from './world';
import { DT, ECON } from './config';
import { WAVES, waveSurge } from './wavedefs';
import { LEVELS } from './levels';
import { planWave } from './waves';
import { Prng } from './rng';

/** 一个场面干净、下一波随时能开的世界：队列空、场上无虫、已经打完第 n 波。 */
function cleared(wave: number, opts: Record<string, unknown> = {}): World {
  const w = new World({ seed: 7, ...opts });
  w.wave = wave;
  w.spawner.queue = [];
  w.enemies = [];
  return w;
}

/** 从现在数到下一波开始用了几秒。 */
function untilNextWave(w: World, cap = 30): number {
  const from = w.wave;
  for (let i = 0; i < cap / DT; i++) {
    w.step();
    if (w.wave > from) return w.time;
  }
  throw new Error('下一波没来');
}

/** 那口气正好是 `secs` 长：帧是 DT 一格，所以落在一格之内就算准。 */
function breathIs(got: number, secs: number): void {
  expect(got).toBeGreaterThanOrEqual(secs);
  expect(got).toBeLessThan(secs + 2 * DT);
}

describe('换气 (§9.8)', () => {
  it('场清了也不立刻开下一波：先数完 WAVES.breath.base', () => {
    const w = cleared(3);
    breathIs(untilNextWave(w), WAVES.breath.base);
    expect(w.wave).toBe(4);
  });

  it('Boss 倒下之后那口气更长，这是一局里唯一一段真正的松', () => {
    // 看的是刚打完的那一波是不是 Boss 波（`World.waveBoss`，关卡的 WavePlan 能改这一点），
    // 不是下一波。
    const boss = cleared(WAVES.bossEvery);
    boss.waveBoss = true;
    const plain = cleared(WAVES.bossEvery);
    plain.waveBoss = false;
    breathIs(untilNextWave(boss), WAVES.breath.boss);
    breathIs(untilNextWave(plain), WAVES.breath.base);
  });

  it('这一波的金币结在那口气的第一帧，一波只结一次，总额和原来逐波给的一样', () => {
    const w = cleared(3);
    const gold = w.gold;
    w.step();
    const clear = w.events.filter((e) => e.t === 'clear');
    expect(clear).toHaveLength(1);
    // 原本是「第 n 波开始时给 base + n」，现在是「第 n-1 波清完时给 base + n」：同样的一笔。
    expect(w.gold - gold).toBeCloseTo((ECON.waveBonusBase + 4) * w.incomeMul());
    for (let i = 0; i < 20; i++) w.step();
    expect(w.events.filter((e) => e.t === 'clear')).toHaveLength(1);
  });

  it('引导按着虫子的时候不换气，但钱照结', () => {
    const w = cleared(1, { level: LEVELS[0] });
    w.holdAt = 3;
    const gold = w.gold;
    w.step();
    // 下一波立刻开：那一段的节拍归引导管，再插一口气只是对着空场等。
    expect(w.wave).toBe(2);
    expect(w.pace.breathing).toBe(false);
    // 跳过的只是那口气：这一波的钱和下拍照旧，否则一次 hold 就吞掉一波的收入。
    expect(w.events.filter((e) => e.t === 'clear')).toHaveLength(1);
    expect(w.gold - gold).toBeCloseTo((ECON.waveBonusBase + 2) * w.incomeMul());
  });

  it('卡条只在那口气里开：换气之外，攒满的马车选择等着', () => {
    const w = cleared(3, { wagons: true });
    const wg = w.wg!;
    wg.charge = wg.need();
    w.time = 999;
    wg.due(w);
    expect(wg.offer).toBeNull(); // 没在换气里
    w.pace.left = 1;
    wg.due(w);
    expect(wg.offer?.n).toBe(1);
  });
});

describe('波形 (§9.8)', () => {
  it('一波自己是一道弧：开头稀，结尾密，而平均不变', () => {
    const n = 20;
    const mul = [...Array(n)].map((_, i) => waveSurge(i, n));
    expect(mul[0]).toBeCloseTo(WAVES.surge.open);
    expect(mul[n - 1]).toBeCloseTo(WAVES.surge.close);
    // open + close = 2，所以倍率的均值是 1：一波还是原来那么长，挪的只是密度的位置。
    expect(mul.reduce((a, b) => a + b, 0) / n).toBeCloseTo(1, 2);
    // 一波只有一只的时候没有弧可言。
    expect(waveSurge(0, 1)).toBe(1);
  });

  it('排出来的一波，后半截明显比前半截挤', () => {
    const spawns = planWave(8, new Prng(2), { pool: ['caterpillar'] });
    const gaps = spawns.slice(1).map((s, i) => s.at - spawns[i].at);
    const half = Math.floor(gaps.length / 2);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(gaps.slice(0, half))).toBeGreaterThan(avg(gaps.slice(half)) * 1.5);
  });
});
