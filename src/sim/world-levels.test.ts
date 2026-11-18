// The level rules of the sim: wins, stars, guide holds, income, training, hits and the endless curves.
// Split from world.test.ts to stay under the 500-line limit.
import { describe, expect, it } from 'vitest';
import { World } from './world';
import { botAct } from './bot';
import { ECON, HP_GROWTH, HP_GROWTH_ENDLESS, STATS, endlessHp } from './config';
import { WAVES, waveSpeed } from './wavedefs';
import { Prng } from './rng';
import { planWave } from './waves';
import { approach, arcGap } from './board';
import { LEVELS, starsFor } from './levels';

/** A world with no waves coming, so a test owns every enemy on the field. */
function quietWorld(hero: 'farmer' | 'beekeeper' | 'chef' = 'farmer'): World {
  const w = new World({ seed: 4, hero });
  w.wave = 1;
  w.spawner.queue = [{ at: 1e9, kind: 'caterpillar', angle: 0 }];
  return w;
}

describe('levels (§9.1)', () => {
  it('a level ends in a win once its last wave is cleared, and the boss comes last', () => {
    const level = LEVELS[0];
    const w = new World({ seed: 3, level, meta: { statLv: { dmg: 5, spd: 3 } } });
    let bossAt = 0;
    let wins = 0;
    while (!w.over && w.tick < 20 * 60 * 30) {
      if (w.tick % 15 === 0) botAct(w);
      w.step();
      for (const e of w.events) if (e.t === 'win') wins++;
      if (!bossAt && w.enemies.some((e) => e.kind === 'boss')) bossAt = w.wave;
      w.events.length = 0;
    }
    expect(w.won).toBe(true);
    expect(wins).toBe(1);
    expect(w.wave).toBe(level.waves);
    expect(bossAt).toBe(level.waves);
    expect(w.stars()).toBe(starsFor(w.wallHp / w.wallMax));
    expect(w.revive()).toBe(false);
  });

  it('rates a run by the lowest the fence got, so a heal saves it without buying stars', () => {
    const w = new World({ seed: 1, level: LEVELS[0] });
    w.wallHp = w.wallMax * 0.1;
    w.step();
    expect(w.wallLow).toBeCloseTo(0.1);
    w.wallHp = w.wallMax; // what a repair card (or a revive) does
    w.step();
    (w as unknown as { won: boolean }).won = true;
    expect(w.wallHp / w.wallMax).toBe(1);
    expect(w.stars()).toBe(starsFor(0.1));
  });

  it('only bugs from the level pool turn up', () => {
    const rng = new Prng(5);
    const kinds = new Set<string>();
    for (let wave = 1; wave <= 30; wave++) for (const sp of planWave(wave, rng, { pool: ['beetle'], fronts: 1, boss: false })) kinds.add(sp.kind);
    expect([...kinds]).toEqual(['beetle']);
  });

  it("level 1's first wave comes from the far side (the top of the screen), later waves anywhere", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = new World({ seed, level: LEVELS[0] });
      while (!w.enemies.length) w.step();
      // Within the front's spread of straight up (-z).
      expect(arcGap(Math.atan2(w.enemies[0].z, w.enemies[0].x), -Math.PI / 2)).toBeLessThanOrEqual(WAVES.frontSpread + 1e-9);
    }
    const angles = Array.from({ length: 10 }, (_, i) => planWave(2, new Prng(i), { fronts: 1 })[0].angle);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(1);
  });

  it('stars go by the fence left', () => {
    // A quarter and 60% since 2026-11-15, down from half and 80%: see starsFor.
    expect([starsFor(0.1), starsFor(0.25), starsFor(0.59), starsFor(0.6), starsFor(1)]).toEqual([1, 2, 2, 3, 3]);
    expect(new World({ seed: 1 }).stars()).toBe(0);
  });
});

describe('guide hold', () => {
  it('bugs stop at holdAt and walk on once it is cleared', () => {
    const w = quietWorld();
    w.spawner.queue = [{ at: 0, kind: 'caterpillar', angle: 1 }, { at: 1e9, kind: 'caterpillar', angle: 0 }];
    w.train.angle = 1 + Math.PI;
    w.holdAt = 3;
    const hp = w.wallHp;
    for (let i = 0; i < 30 * 60; i++) w.step();
    expect(w.enemies[0].d).toBeCloseTo(3, 5);
    expect(w.wallHp).toBe(hp);
    w.holdAt = null;
    for (let i = 0; i < 30 * 60; i++) w.step();
    expect(w.wallHp).toBeLessThan(hp);
  });

  it('the wave waits during a hold: no new bugs come', () => {
    const w = quietWorld();
    w.spawner.queue = [{ at: 0, kind: 'caterpillar', angle: 1 }, { at: 5, kind: 'caterpillar', angle: 0 }];
    w.train.angle = 1 + Math.PI;
    w.holdAt = 3;
    for (let i = 0; i < 30 * 60; i++) w.step();
    expect(w.enemies.length).toBe(1);
    w.holdAt = null;
    for (let i = 0; i < 30 * 6; i++) w.step();
    expect(w.enemies.length).toBe(2);
  });
});


describe('income', () => {
  it('grows each wave in endless and stays flat in a chapter level', () => {
    const endless = new World({ seed: 3 });
    const level = new World({ seed: 3, level: LEVELS[0] });
    for (const w of [endless, level]) w.wave = 11;
    expect(endless.incomeMul()).toBeCloseTo(endless.goldMul() * ECON.endlessGrowth ** 10);
    expect(level.incomeMul()).toBe(level.goldMul());
  });
});

describe('training', () => {
  it('starts stats at the trained level, prices the next buy from there, and keeps the run caps', () => {
    const plain = new World({ seed: 3 });
    const trained = new World({ seed: 3, meta: { statLv: { dmg: 4, multi: 99, range: 2 } } });
    expect(trained.lv.dmg).toBe(4);
    // Since 2026-11-14 the price climbs from the level the player has, trained levels included: the
    // crystals bought the level, not also a discount on every buy after it (see World.statCost).
    expect(trained.statCost('dmg')).toBe(Math.round(STATS.dmg.cost * Math.pow(STATS.dmg.growth, 4)));
    expect(trained.statCost('dmg')).toBeGreaterThan(plain.statCost('dmg'));
    expect(trained.lv.multi).toBe(STATS.multi.max);
    expect(trained.lv.range).toBe(2);
    expect(trained.train.shots(trained)).toBeCloseTo(1 + STATS.multi.per * STATS.multi.max!);
    expect(trained.train.range(trained)).toBeCloseTo(plain.train.range(plain) + 2 * STATS.range.per);
  });

  it('spreads half a multishot level across volleys instead of stepping to a whole target', () => {
    const half = new World({ seed: 1, meta: { statLv: { multi: 1 } } });
    expect(half.train.shots(half)).toBeCloseTo(1.5);
    expect([0, 0, 0, 0].map(() => half.train.volley(half))).toEqual([1, 2, 1, 2]);
    const whole = new World({ seed: 1, meta: { statLv: { multi: 2 } } });
    expect([0, 0].map(() => whole.train.volley(whole))).toEqual([2, 2]);
  });
});

describe('hits', () => {
  it('count shots and bee bites but not poison ticking', () => {
    const w = quietWorld('beekeeper');
    const b = approach(0);
    const e = w.addEnemy('caterpillar', b.x, b.z, b.dirX, b.dirZ, b.d, 1e6);
    e.poison = 50;
    e.poisonT = 3;
    w.train.angle = Math.PI;
    w.hero.biteT = 1e9;
    for (let i = 0; i < 30; i++) w.step();
    expect(e.hp).toBeLessThan(1e6);
    expect(e.hits).toBe(0);
  });
});

// §9.2. Endless is the only mode that runs past WAVES.lateFrom, so the curves that bend there are
// endless-only without a level check - a fact worth a test, because it rests on no level being long.
describe('the endless curves', () => {
  it('no chapter level reaches the wave the endless curves bend at', () => {
    expect(Math.max(...LEVELS.map((l) => l.waves))).toBeLessThanOrEqual(WAVES.lateFrom);
  });

  it('health climbs at the levels own slope first, then eases off at the knee', () => {
    const { early, late, knee } = HP_GROWTH_ENDLESS;
    expect(early).toBe(HP_GROWTH);
    expect(endlessHp(1)).toBe(1);
    expect(endlessHp(knee + 1)).toBeCloseTo(Math.pow(early, knee));
    expect(endlessHp(knee + 11) / endlessHp(knee + 1)).toBeCloseTo(Math.pow(late, 10));
    // The point of the knee: at the knee the bugs are tougher than one slope would have made them,
    // and by the end of a long run they are not, or the shop would never catch up again.
    expect(endlessHp(knee + 1)).toBeGreaterThan(Math.pow(1.16, knee));
    expect(endlessHp(81)).toBeLessThan(Math.pow(1.16, 80));
  });

  it('bugs walk at their own speed until the gate, then faster, to a cap', () => {
    expect(waveSpeed(1)).toBe(1);
    expect(waveSpeed(WAVES.lateFrom)).toBe(1);
    expect(waveSpeed(WAVES.lateFrom + 10)).toBeCloseTo(1 + 10 * WAVES.speedLate.per);
    expect(waveSpeed(500)).toBe(WAVES.speedLate.cap);
  });

  it('the bot panics over a low fence only where buying one is the answer', () => {
    const first = (w: World) => {
      w.wallHp = w.wallMax * 0.1;
      w.gold = 5000;
      botAct(w);
      return w.events.find((e) => e.t === 'buy')?.stat;
    };
    // In a level the fence card hands back a flat 150, so a fence at 10% is what the gold is for.
    expect(first(new World({ seed: 7, level: LEVELS[0] }))).toBe('wall');
    // In endless the same buy moves the bar by ECON.endlessRepair, so the gold goes elsewhere.
    expect(first(new World({ seed: 7 }))).not.toBe('wall');
  });

  it('the repair card fills a level fence and only part of an endless one', () => {
    const fill = (w: World) => {
      w.wallHp = w.wallMax * 0.2;
      const opts = [{ kind: 'repair' as const, lv: 0 }];
      w.wg!.offer = { opts, t: 10, n: 1, def: 0 };
      w.pickWagon(0);
      return w.wallHp / w.wallMax;
    };
    expect(fill(new World({ seed: 7, level: LEVELS[0], wagons: true }))).toBe(1);
    expect(fill(new World({ seed: 7, wagons: true }))).toBeCloseTo(0.2 + ECON.endlessCardRepair);
  });
});
