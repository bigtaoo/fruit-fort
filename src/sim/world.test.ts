import { describe, expect, it } from 'vitest';
import { World } from './world';
import { botAct } from './bot';
import { CORNER_ORDER, ECON, UNLOCK_EVERY, WALL } from './config';
import { EDGE_CELLS, HERO_CELL, approach, neighbours } from './board';

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
  it('raises the price and draws kinds from the deck at random', () => {
    const w = richWorld();
    const gold = w.gold;
    expect(w.summon()).toBe(true);
    expect(w.gold).toBe(gold - ECON.summonBase);
    expect(w.summonCost()).toBe(ECON.summonBase + ECON.summonStep);
    const firsts = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const v = new World({ seed });
      v.summon();
      firsts.add(v.cells.find(Boolean)!.kind);
    }
    expect(firsts.size).toBe(3);
  });

  it('opens a corner every few summons and stops when full', () => {
    const w = richWorld();
    let n = 0;
    while (w.summon()) n++;
    // 4 edges take 4 summons; summons unlock corners only every UNLOCK_EVERY.
    expect(n).toBe(4);
    for (let c = 0; c < 9; c++) if (c !== HERO_CELL && w.cells[c]) w.sell(c);
    for (let i = 0; i < UNLOCK_EVERY * 4; i++) {
      if (!w.summon()) {
        for (let c = 0; c < 9; c++) if (w.cells[c]) w.sell(c);
        w.summon();
      }
    }
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

  it('caps at level 7', () => {
    const w = richWorld();
    const [a, b] = [1, 3];
    w.cells[a] = w.newFruit('coconut', 7);
    w.cells[b] = w.newFruit('coconut', 7);
    expect(w.canMerge(a, b)).toBe(false);
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

  it('the hero buff casts itself after waiting full', () => {
    const w = new World({ seed: 2 });
    w.hero.charge = 20;
    for (let i = 0; i < 30 * 9; i++) w.step();
    expect(w.hero.charge).toBeLessThan(20);
  });
});
