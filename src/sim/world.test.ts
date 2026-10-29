import { describe, expect, it } from 'vitest';
import { World } from './world';
import { botAct } from './bot';
import { ENEMIES, HAPPENINGS, HERO, JUICE, LOCUST, MOLD, STATS, STAT_KEYS, TRAIN, WALL, WAVES } from './config';
import { trainDamage, trainMove, trainRange, trainShots, trainSpeedMul } from './combat';
import { Prng } from './rng';
import { planWave } from './waves';
import { approach, arcGap, trackPoint } from './board';
import { LEVELS, starsFor } from './levels';

function richWorld(): World {
  const w = new World({ seed: 7 });
  w.gold = 1e9;
  return w;
}

/** A world with no waves coming, so a test owns every enemy on the field. */
function quietWorld(hero: 'farmer' | 'beekeeper' | 'chef' = 'farmer'): World {
  const w = new World({ seed: 4, hero });
  w.wave = 1;
  w.queue = [{ at: 1e9, kind: 'caterpillar', angle: 0 }];
  return w;
}

describe('board', () => {
  it('enemies from any angle stop on the square wall', () => {
    for (let i = 0; i < 16; i++) {
      const p = approach((i / 16) * Math.PI * 2 + 0.1);
      const x = p.x + p.dirX * p.d;
      const z = p.z + p.dirZ * p.d;
      expect(Math.max(Math.abs(x), Math.abs(z))).toBeCloseTo(WALL, 5);
    }
  });

  it('the track is a ring inside the wall', () => {
    for (let i = 0; i < 8; i++) {
      const p = trackPoint(i);
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(TRAIN.radius, 5);
    }
    expect(arcGap(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2, 5);
  });
});

describe('train', () => {
  it('drives round the ring and turns back on reverse', () => {
    const w = quietWorld();
    const a0 = w.train.angle;
    for (let i = 0; i < 30; i++) w.step();
    const moved = w.train.angle - a0;
    expect(moved).toBeCloseTo(trainMove(w) / TRAIN.radius, 2);
    expect(w.reverse()).toBe(true);
    expect(w.reverses).toBe(1);
    for (let i = 0; i < 30; i++) w.step();
    expect(w.train.angle).toBeCloseTo(a0, 2);
  });

  it('shoots an enemy in reach', () => {
    const w = quietWorld();
    const p = w.trainPos();
    const e = w.addEnemy('caterpillar', p.x * 1.3, p.z * 1.3, 0, 0, 3, 1e6);
    e.speed = 0;
    for (let i = 0; i < 30; i++) w.step();
    expect(e.hp).toBeLessThan(1e6);
  });

  it('holds off the first wave alone', () => {
    const w = new World({ seed: 5 });
    while (w.wave < 2 && !w.over) w.step();
    expect(w.over).toBe(false);
  });
});

describe('stats', () => {
  it('cost more each level and stop at their cap', () => {
    const w = richWorld();
    for (const k of STAT_KEYS) {
      const first = w.statCost(k);
      expect(first).toBe(STATS[k].cost);
      expect(w.buy(k)).toBe(true);
      expect(w.lv[k]).toBe(1);
      expect(w.statCost(k)).toBeGreaterThan(first);
    }
    while (w.buy('multi'));
    expect(w.lv.multi).toBe(STATS.multi.max);
    expect(w.maxed('multi')).toBe(true);
    expect(w.buys).toBe(STAT_KEYS.length + STATS.multi.max! - 1);
  });

  it('refuses without the gold', () => {
    const w = new World({ seed: 1 });
    w.gold = STATS.dmg.cost - 1;
    expect(w.buy('dmg')).toBe(false);
    expect(w.lv.dmg).toBe(0);
  });

  it('each stat changes what it says', () => {
    const w = richWorld();
    const before = { dmg: trainDamage(w), spd: trainSpeedMul(w), range: trainRange(w), shots: trainShots(w), move: trainMove(w), gold: w.goldMul() };
    for (const k of STAT_KEYS) w.buy(k);
    expect(trainDamage(w)).toBeCloseTo(before.dmg * (1 + STATS.dmg.per));
    expect(trainSpeedMul(w)).toBeCloseTo(before.spd + STATS.spd.per);
    expect(trainRange(w)).toBeCloseTo(before.range + STATS.range.per);
    expect(trainShots(w)).toBe(before.shots + 1);
    expect(trainMove(w)).toBeCloseTo(before.move * (1 + STATS.move.per));
    expect(w.goldMul()).toBeCloseTo(before.gold + STATS.gold.per);
  });

  it('the wall stat raises the max and repairs', () => {
    const w = richWorld();
    w.wallHp = 500;
    const max = w.wallMax;
    w.buy('wall');
    expect(w.wallMax).toBe(max + STATS.wall.per);
    expect(w.wallHp).toBe(500 + STATS.wall.per);
  });
});

describe('random events', () => {
  function until(w: World, pred: () => boolean, max = 30 * 60 * 30): void {
    for (let i = 0; i < max && !pred(); i++) {
      for (const e of w.enemies) e.hp = Math.min(e.hp, 1);
      w.step();
    }
  }

  it('turn up from their first wave on, never with a boss, and leave when missed', () => {
    const w = new World({ seed: 9 });
    const waves: number[] = [];
    let ended = 0;
    until(w, () => {
      for (const e of w.events) {
        if (e.t === 'happen') waves.push(w.wave);
        if (e.t === 'escape' || e.t === 'grab') ended++;
      }
      w.events.length = 0;
      return w.wave > 25;
    });
    expect(waves.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...waves)).toBeGreaterThanOrEqual(HAPPENINGS.firstWave);
    expect(waves.every((n) => n % WAVES.bossEvery !== 0)).toBe(true);
    expect(ended).toBe(waves.length);
  });

  it('the train picks them up: gold for the bug, a free level from the basket', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12 && seen.size < 2; seed++) {
      const w = new World({ seed });
      until(w, () => !!w.happening);
      const h = w.happening!;
      const gold = w.gold;
      const levels = STAT_KEYS.reduce((n, k) => n + w.lv[k], 0);
      // Park the train on the event.
      w.train.angle = w.train.prev = h.angle;
      w.step();
      expect(w.happening).toBeNull();
      expect(w.grabs).toBe(1);
      if (h.kind === 'bug') expect(w.gold).toBeGreaterThan(gold);
      else expect(STAT_KEYS.reduce((n, k) => n + w.lv[k], 0)).toBe(levels + 1);
      expect(w.buys).toBe(0);
      seen.add(h.kind);
    }
    expect(seen.size).toBe(2);
  });
});

describe('run', () => {
  it('is deterministic for a seed', () => {
    const play = () => {
      const w = new World({ seed: 11 });
      for (let i = 0; i < 30 * 120; i++) {
        if (i % 15 === 0) botAct(w);
        w.step();
      }
      return [w.wave, w.gold, w.wallHp, w.kills, w.train.angle].join(',');
    };
    expect(play()).toBe(play());
  });

  it('loses when the player does nothing', () => {
    const w = new World({ seed: 5 });
    for (let i = 0; i < 30 * 60 * 20 && !w.over; i++) w.step();
    expect(w.over).toBe(true);
  });

  it('the bot gets well past the first boss', () => {
    const w = new World({ seed: 3 });
    for (let i = 0; i < 30 * 60 * 30 && !w.over; i++) {
      if (i % 15 === 0) botAct(w);
      w.step();
    }
    expect(w.wave).toBeGreaterThan(WAVES.bossEvery);
  });

  it('a full hero charge waits for the player', () => {
    const w = quietWorld();
    w.hero.charge = HERO.chargeMax;
    for (let i = 0; i < 30 * 60; i++) w.step();
    expect(w.hero.charge).toBe(HERO.chargeMax);
    expect(w.hero.buffT).toBe(0);
    expect(w.cast()).toBe(true);
    expect(w.hero.charge).toBe(0);
  });

  it('revives once with half the wall', () => {
    const w = new World({ seed: 5 });
    for (let i = 0; i < 30 * 60 * 20 && !w.over; i++) w.step();
    expect(w.revive()).toBe(true);
    expect(w.over).toBe(false);
    expect(w.wallHp).toBe(w.wallMax / 2);
    w.over = true;
    expect(w.revive()).toBe(false);
  });
});

describe('enemies', () => {
  it('a snail holds the enemies just behind it to its pace', () => {
    const w = quietWorld();
    w.train.shotT = 1e9;
    const p = approach(0);
    const snail = w.addEnemy('snail', p.x, p.z, p.dirX, p.dirZ, p.d, 1e6);
    const tail = w.addEnemy('caterpillar', p.x + 1, p.z, p.dirX, p.dirZ, p.d + 1, 1e6);
    const free = w.addEnemy('caterpillar', p.x + 5, p.z, p.dirX, p.dirZ, p.d + 5, 1e6);
    for (let i = 0; i < 30; i++) w.step();
    expect(p.d - snail.d).toBeCloseTo(ENEMIES.snail.speed, 1);
    expect(p.d + 1 - tail.d).toBeCloseTo(ENEMIES.snail.speed, 1);
    expect(p.d + 5 - free.d).toBeCloseTo(ENEMIES.caterpillar.speed, 1);
  });

  it('a mold splits into spores when it dies', () => {
    const w = quietWorld();
    const p = approach(1);
    const mold = w.addEnemy('mold', p.x, p.z, p.dirX, p.dirZ, p.d, 100);
    mold.hp = 0;
    w.step();
    const spores = w.enemies.filter((e) => e.kind === 'spore');
    expect(spores.length).toBe(MOLD.spores);
    for (const s of spores) expect(s.maxHp).toBeCloseTo(100 * MOLD.hpShare);
  });

  it('the boss calls locusts on a timer', () => {
    const w = new World({ seed: 6 });
    w.wave = 9;
    w.enemies.length = 0;
    for (let i = 0; i < 30 * 30 && !w.enemies.some((e) => e.kind === 'boss'); i++) {
      w.step();
      for (const e of w.enemies) if (e.kind !== 'boss') e.hp = 0;
    }
    expect(w.wave).toBe(10);
    w.train.shotT = 1e9;
    for (let i = 0; i < 30 * (LOCUST.every + 0.5); i++) {
      w.train.shotT = 1e9;
      w.step();
    }
    expect(w.enemies.filter((e) => e.kind === 'locust').length).toBeGreaterThanOrEqual(LOCUST.count);
  });

  it('snails and molds join the mix at their waves', () => {
    const kinds = (wave: number) => new Set(Array.from({ length: 20 }, (_, i) => planWave(wave, new Prng(i)).map((s) => s.kind)).flat());
    expect(kinds(WAVES.snailFrom - 1).has('snail')).toBe(false);
    expect(kinds(WAVES.snailFrom).has('snail')).toBe(true);
    expect(kinds(WAVES.moldFrom - 1).has('mold')).toBe(false);
    expect(kinds(WAVES.moldFrom).has('mold')).toBe(true);
  });
});

describe('heroes', () => {
  function heroWorld(hero: 'farmer' | 'beekeeper' | 'chef'): World {
    const w = quietWorld(hero);
    w.hero.charge = HERO.chargeMax;
    return w;
  }

  it('only the farmer speeds the train up', () => {
    for (const hero of ['farmer', 'beekeeper'] as const) {
      const w = heroWorld(hero);
      w.cast();
      expect(trainSpeedMul(w) > 1).toBe(hero === 'farmer');
    }
  });

  it('beekeeper bees bite the enemies nearest the wall', () => {
    const w = heroWorld('beekeeper');
    w.train.shotT = 1e9;
    const p = approach(0);
    const near = w.addEnemy('caterpillar', p.x, p.z, p.dirX, p.dirZ, 1, 1000);
    const far = [2, 3, 4].map((k) => w.addEnemy('caterpillar', p.x, p.z, p.dirX, p.dirZ, 5 * k, 1000));
    expect(w.cast()).toBe(true);
    w.step();
    expect(near.hp).toBeLessThan(1000);
    expect(far[2].hp).toBe(1000);
  });

  it('beekeeper train hits poison, the farmer ones do not', () => {
    for (const hero of ['beekeeper', 'farmer'] as const) {
      const w = quietWorld(hero);
      const p = w.trainPos();
      const e = w.addEnemy('caterpillar', p.x * 1.3, p.z * 1.3, 0, 0, 3, 1e6);
      e.speed = 0;
      for (let i = 0; i < 60; i++) w.step();
      expect(e.poisonT > 0, hero).toBe(hero === 'beekeeper');
    }
  });

  it('chef juice hits everything, and the chef pays less for stats', () => {
    const w = heroWorld('chef');
    const a = approach(2);
    const b = approach(5);
    const e1 = w.addEnemy('caterpillar', a.x, a.z, a.dirX, a.dirZ, a.d, 1e6);
    const e2 = w.addEnemy('caterpillar', b.x, b.z, b.dirX, b.dirZ, b.d, 1e6);
    expect(w.cast()).toBe(true);
    expect(e1.hp).toBeCloseTo(1e6 - trainDamage(w) * JUICE.mul);
    expect(e2.hp).toBeLessThan(1e6);
    expect(w.statCost('dmg')).toBe(Math.round(STATS.dmg.cost * (1 - JUICE.discount)));
  });
});

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

  it('only bugs from the level pool turn up', () => {
    const rng = new Prng(5);
    const kinds = new Set<string>();
    for (let wave = 1; wave <= 30; wave++) for (const sp of planWave(wave, rng, { pool: ['beetle'], fronts: 1, boss: false })) kinds.add(sp.kind);
    expect([...kinds]).toEqual(['beetle']);
  });

  it('stars go by the fence left', () => {
    expect([starsFor(0.1), starsFor(0.5), starsFor(0.79), starsFor(0.8), starsFor(1)]).toEqual([1, 2, 2, 3, 3]);
    expect(new World({ seed: 1 }).stars()).toBe(0);
  });
});
