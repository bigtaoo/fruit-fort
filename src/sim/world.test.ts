import { describe, expect, it } from 'vitest';
import { World, fruitValue } from './world';
import { botAct } from './bot';
import { CORNER_ORDER, CORNER_WAVES, ECON, ENEMIES, FEED, HAPPENINGS, HERO, JUICE, LOCUST, MOLD, WALL, WAVES } from './config';
import { speedMul } from './combat';
import { Prng } from './rng';
import { planWave } from './waves';
import { EDGE_CELLS, HERO_CELL, TRAY, approach, cellX, cellZ, neighbours } from './board';

function richWorld(): World {
  const w = new World({ seed: 7 });
  w.gold = 100000;
  return w;
}

describe('board', () => {
  it('opens with the four edge cells and an empty board', () => {
    const w = new World({ seed: 3 });
    expect(w.unlocked.filter(Boolean).length).toBe(4);
    for (const c of EDGE_CELLS) expect(w.unlocked[c]).toBe(true);
    expect(w.cells.filter(Boolean).length).toBe(0);
  });

  it('enemies from any angle stop on the square wall', () => {
    for (let i = 0; i < 16; i++) {
      const p = approach((i / 16) * Math.PI * 2 + 0.1);
      const x = p.x + p.dirX * p.d;
      const z = p.z + p.dirZ * p.d;
      expect(Math.max(Math.abs(x), Math.abs(z))).toBeCloseTo(WALL, 5);
    }
  });

  it('edges touch the hero, corners do not', () => {
    for (const c of EDGE_CELLS) expect(neighbours(c)).toContain(HERO_CELL);
    for (const c of CORNER_ORDER) expect(neighbours(c)).not.toContain(HERO_CELL);
  });
});

describe('summon', () => {
  it('keeps one price per summon level and draws kinds from the deck at random', () => {
    const w = richWorld();
    const gold = w.gold;
    expect(w.summon()).toBe(true);
    expect(w.gold).toBe(gold - ECON.summonBase);
    expect(w.summonCost()).toBe(ECON.summonBase);
    w.summonLevel = 2;
    expect(w.summonCost()).toBe(Math.round(ECON.summonBase * ECON.summonLevelMul));
    const firsts = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const v = new World({ seed });
      v.summon();
      firsts.add(v.cells.find(Boolean)!.kind);
    }
    expect(firsts.size).toBe(3);
  });

  it('fills the four edges, then the tray, then stops', () => {
    const w = richWorld();
    let n = 0;
    while (w.summon()) n++;
    expect(n).toBe(5);
    expect(w.tray).not.toBeNull();
    expect(w.events[w.events.length - 1]).toEqual({ t: 'summon', cell: TRAY });
    expect(w.canSummon()).toBe(false);
  });

  it('lets the tray fruit be dragged in, sold or swapped', () => {
    const w = richWorld();
    while (w.summon());
    const t = w.tray!;
    w.cells[1] = null;
    expect(w.drop(TRAY, 1)).toBe(true);
    expect(w.cells[1]).toBe(t);
    expect(w.tray).toBeNull();
    w.summon();
    const gold = w.gold;
    expect(w.sell(TRAY)).toBe(true);
    expect(w.gold).toBe(gold + ECON.sellBase);
    w.summon();
    const before = w.tray!;
    const c = EDGE_CELLS.find((x) => w.cells[x]!.kind !== before.kind)!;
    const board = w.cells[c];
    expect(w.drop(TRAY, c)).toBe(true);
    expect(w.cells[c]).toBe(before);
    expect(w.tray).toBe(board);
  });

  it('opens the corners at their waves', () => {
    const w = new World({ seed: 4 });
    const opened: number[] = [];
    while (w.wave < CORNER_WAVES[CORNER_WAVES.length - 1]) {
      for (const e of w.enemies) e.hp = 0;
      w.step();
      for (const e of w.events) if (e.t === 'unlock') opened.push(w.wave);
      w.events.length = 0;
    }
    expect(opened).toEqual(CORNER_WAVES);
    expect(CORNER_ORDER.every((c) => w.unlocked[c])).toBe(true);
  });

  it('uses the summon level', () => {
    const w = richWorld();
    w.summon();
    w.summonLevel = 2;
    w.summon();
    expect(w.cells.some((f) => f && f.level === 2)).toBe(true);
  });
});

describe('merge', () => {
  it('merges two equal fruits into one a level higher', () => {
    const w = richWorld();
    w.cells[1] = w.newFruit('strawberry', 1);
    w.cells[3] = w.newFruit('strawberry', 1);
    const [a, b] = [1, 3];
    expect(w.drop(a, b)).toBe(true);
    expect(w.cells[a]).toBeNull();
    expect(w.cells[b]!.level).toBe(2);
  });

  it('swaps different fruits and moves into empty cells', () => {
    const w = richWorld();
    w.cells[1] = w.newFruit('strawberry', 1);
    const start = 1;
    const empty = EDGE_CELLS.find((c) => !w.cells[c])!;
    expect(w.drop(start, empty)).toBe(true);
    expect(w.cells[empty]!.kind).toBe('strawberry');
    expect(w.cells[start]).toBeNull();
  });

  it('refuses the hero cell and locked cells', () => {
    const w = richWorld();
    w.summon();
    const start = w.cells.findIndex((f) => f);
    expect(w.drop(start, HERO_CELL)).toBe(false);
    expect(w.drop(start, CORNER_ORDER[0])).toBe(false);
  });

  it('feeds a lower fruit into a higher one of its kind, keeping the exp', () => {
    const w = richWorld();
    w.cells[1] = w.newFruit('grape', 3);
    w.cells[3] = w.newFruit('grape', 1);
    w.cells[5] = w.newFruit('grape', 2);
    expect(w.canFeed(1, 3)).toBe(false);
    expect(w.drop(3, 1)).toBe(true);
    expect(w.cells[1]!.level).toBe(3);
    expect(w.cells[1]!.exp).toBeCloseTo(FEED.share);
    expect(w.events[w.events.length - 1]).toMatchObject({ t: 'feed', cell: 1, up: false });
    expect(w.drop(5, 1)).toBe(true);
    // A feed passes on only part of the fruit's worth: (1 + 2) * share; level 3 needs 4.
    expect(w.cells[1]!.exp).toBeCloseTo(3 * FEED.share);
    w.cells[1]!.exp = 4 - FEED.share / 2;
    w.cells[5] = w.newFruit('grape', 1);
    w.drop(5, 1);
    expect(w.cells[1]!.level).toBe(4);
    expect(w.cells[1]!.exp).toBeCloseTo(FEED.share / 2);
    expect(w.feeds).toBe(3);
  });

  it('carries fed exp through a merge and into the sell price', () => {
    const w = richWorld();
    w.cells[1] = w.newFruit('lemon', 2);
    w.cells[1]!.exp = 1;
    w.cells[3] = w.newFruit('lemon', 2);
    w.cells[3]!.exp = 1;
    expect(w.sellValue(1)).toBe(ECON.sellBase * (fruitValue(2) + 1));
    // 2 + 1 more exp on a level-2 fruit holding 1: two grow it, two are left.
    w.drop(1, 3);
    expect(w.cells[3]!.level).toBe(3);
    expect(w.cells[3]!.exp).toBe(2);
  });

  it('feeds from the tray', () => {
    const w = richWorld();
    w.cells[1] = w.newFruit('coconut', 4);
    w.tray = w.newFruit('coconut', 1);
    expect(w.drop(TRAY, 1)).toBe(true);
    expect(w.tray).toBeNull();
    expect(w.cells[1]!.exp).toBeCloseTo(FEED.share);
  });

  it('caps at level 7', () => {
    const w = richWorld();
    const [a, b] = [1, 3];
    w.cells[a] = w.newFruit('coconut', 7);
    w.cells[b] = w.newFruit('coconut', 7);
    expect(w.canMerge(a, b)).toBe(false);
  });
});

describe('hero shot', () => {
  it('shoots the enemy nearest the wall with nothing on the board', () => {
    const w = new World({ seed: 2 });
    const e = w.addEnemy('caterpillar', 4, 0, -1, 0, 2, 1000);
    for (let i = 0; i < 90; i++) w.step();
    expect(e.hp).toBeLessThan(1000);
    expect(w.cells.every((c) => !c)).toBe(true);
  });

  it('holds off the first wave alone', () => {
    const w = new World({ seed: 5 });
    while (w.wave < 2 && !w.over) w.step();
    expect(w.over).toBe(false);
  });
});

describe('random events', () => {
  function until(w: World, pred: () => boolean, max = 30 * 60 * 30): void {
    for (let i = 0; i < max && !pred(); i++) {
      for (const e of w.enemies) e.hp = Math.min(e.hp, 1);
      w.step();
    }
  }

  it('turn up from their first wave on, never with a boss, and fly off untapped', () => {
    const w = new World({ seed: 9 });
    const waves: number[] = [];
    let escaped = 0;
    until(w, () => {
      for (const e of w.events) {
        if (e.t === 'happen') waves.push(w.wave);
        if (e.t === 'escape') escaped++;
      }
      w.events.length = 0;
      return w.wave > 25;
    });
    expect(waves.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...waves)).toBeGreaterThanOrEqual(HAPPENINGS.firstWave);
    expect(waves.every((n) => n % WAVES.bossEvery !== 0)).toBe(true);
    expect(escaped).toBe(waves.length);
  });

  it('pay gold for the bug and a free fruit from the basket', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 6 && seen.size < 2; seed++) {
      const w = new World({ seed });
      until(w, () => !!w.happening);
      const kind = w.happening!.kind;
      const gold = w.gold;
      const summons = w.summons;
      expect(w.grab()).toBe(true);
      expect(w.happening).toBeNull();
      if (kind === 'bug') expect(w.gold).toBeGreaterThan(gold);
      else expect(w.cells.some(Boolean)).toBe(true);
      expect(w.summons).toBe(summons);
      seen.add(kind);
    }
    expect(seen.size).toBe(2);
  });
});

describe('upgrade cards', () => {
  it('deals three different cards, pauses the run and applies the pick', () => {
    const w = richWorld();
    expect(w.upgrade()).toBe(true);
    const hand = w.draft!;
    expect(hand).toHaveLength(3);
    expect(new Set(hand.map((c) => c.id)).size).toBe(3);
    const tick = w.tick;
    w.step();
    expect(w.tick).toBe(tick);
    expect(w.summon()).toBe(false);
    const wallMax = w.wallMax;
    const i = hand.findIndex((c) => c.id === 'wall');
    w.choose(i >= 0 ? i : 0);
    expect(w.draft).toBeNull();
    if (i >= 0) expect(w.wallMax).toBe(wallMax + 100);
    w.step();
    expect(w.tick).toBe(tick + 1);
  });

  it('costs more each time and only offers cards for the deck', () => {
    const w = richWorld();
    const costs: number[] = [];
    for (let n = 0; n < 12; n++) {
      costs.push(w.upgradeCost());
      w.upgrade();
      for (const c of w.draft!) if (c.kind) expect(w.deck).toContain(c.kind);
      w.choose(0);
    }
    for (let n = 1; n < costs.length; n++) expect(costs[n]).toBeGreaterThan(costs[n - 1]);
  });

  it('stops offering summon level at its cap', () => {
    const w = richWorld();
    w.summonLevel = 5;
    for (let n = 0; n < 30; n++) {
      w.upgrade();
      expect(w.draft!.some((c) => c.id === 'summonLevel')).toBe(false);
      w.choose(0);
    }
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
      return [w.wave, w.gold, w.wallHp, w.kills].join(',');
    };
    expect(play()).toBe(play());
  });

  it('loses when nobody defends', () => {
    const w = new World({ seed: 5 });
    w.cells.fill(null);
    for (let i = 0; i < 30 * 60 * 10 && !w.over; i++) w.step();
    expect(w.over).toBe(true);
  });

  it('a full hero charge waits for the player', () => {
    const w = new World({ seed: 2 });
    w.hero.charge = 20;
    for (let i = 0; i < 30 * 60; i++) w.step();
    expect(w.hero.charge).toBe(20);
    expect(w.hero.buffT).toBe(0);
    expect(w.cast()).toBe(true);
    expect(w.hero.charge).toBe(0);
  });
});

describe('enemies', () => {
  /** A world with no waves coming, so a test owns every enemy on the field. */
  function quietWorld(): World {
    const w = new World({ seed: 4 });
    w.wave = 1;
    w.queue = [{ at: 1e9, kind: 'caterpillar', angle: 0 }];
    return w;
  }

  it('a snail holds the enemies just behind it to its pace', () => {
    const w = quietWorld();
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
    for (let i = 0; i < 30 * (LOCUST.every + 0.5); i++) w.step();
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
    const w = new World({ seed: 4, hero });
    w.wave = 1;
    w.queue = [{ at: 1e9, kind: 'caterpillar', angle: 0 }];
    w.hero.charge = HERO.chargeMax;
    return w;
  }

  it('only the farmer speeds the fruits up', () => {
    for (const hero of ['farmer', 'beekeeper'] as const) {
      const w = heroWorld(hero);
      w.cells[1] = w.newFruit('strawberry', 1);
      w.cast();
      expect(speedMul(w, 1) > 1).toBe(hero === 'farmer');
    }
  });

  it('beekeeper bees bite the enemies nearest the wall', () => {
    const w = heroWorld('beekeeper');
    const p = approach(0);
    const near = w.addEnemy('caterpillar', p.x, p.z, p.dirX, p.dirZ, 1, 1000);
    const far = [2, 3, 4].map((k) => w.addEnemy('caterpillar', p.x, p.z, p.dirX, p.dirZ, 5 * k, 1000));
    expect(w.cast()).toBe(true);
    w.step();
    expect(near.hp).toBeLessThan(1000);
    expect(far[2].hp).toBe(1000);
  });

  it('beekeeper poisons hits from fruits next to the hero only', () => {
    const w = heroWorld('beekeeper');
    w.cells[1] = w.newFruit('coconut', 1);
    const e = w.addEnemy('caterpillar', cellX(1), cellZ(1) - 1, 0, 1, 2, 1e6);
    for (let i = 0; i < 60; i++) w.step();
    expect(e.poisonT).toBeGreaterThan(0);
    const corner = heroWorld('beekeeper');
    corner.unlocked[0] = true;
    corner.cells[0] = corner.newFruit('coconut', 1);
    const e2 = corner.addEnemy('caterpillar', cellX(0), cellZ(0) - 1, 0, 1, 2, 1e6);
    for (let i = 0; i < 60; i++) corner.step();
    expect(e2.poisonT).toBe(0);
  });

  it('chef eats the two lowest fruits to hit everything, and sells for double', () => {
    const w = heroWorld('chef');
    w.cells[1] = w.newFruit('strawberry', 3);
    expect(w.cast()).toBe(false); // needs two fruits
    w.cells[3] = w.newFruit('coconut', 1);
    w.cells[5] = w.newFruit('watermelon', 2);
    const p = approach(2);
    const e = w.addEnemy('caterpillar', p.x, p.z, p.dirX, p.dirZ, p.d, 1e6);
    expect(w.cast()).toBe(true);
    expect(w.cells[1]?.level).toBe(3);
    expect(w.cells[3]).toBeNull();
    expect(w.cells[5]).toBeNull();
    expect(e.hp).toBeLessThan(1e6);
    expect(w.sellValue(1)).toBe(ECON.sellBase * 4 * JUICE.sellMul);
  });
});
