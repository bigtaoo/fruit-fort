import { describe, expect, it } from 'vitest';
import { World } from './world';
import { botAct } from './bot';
import { CORNER_ORDER, ECON, UNLOCK_EVERY } from './config';
import { EDGE_CELLS, HERO_CELL, neighbours } from './board';

function richWorld(): World {
  const w = new World({ seed: 7 });
  w.gold = 100000;
  return w;
}

describe('board', () => {
  it('opens with the four edge cells and one strawberry', () => {
    const w = new World({ seed: 3 });
    expect(w.unlocked.filter(Boolean).length).toBe(4);
    for (const c of EDGE_CELLS) expect(w.unlocked[c]).toBe(true);
    const fruits = w.cells.filter(Boolean);
    expect(fruits.length).toBe(1);
    expect(fruits[0]!.kind).toBe('strawberry');
  });

  it('edges touch the hero, corners do not', () => {
    for (const c of EDGE_CELLS) expect(neighbours(c)).toContain(HERO_CELL);
    for (const c of CORNER_ORDER) expect(neighbours(c)).not.toContain(HERO_CELL);
  });
});

describe('summon', () => {
  it('raises the price and pairs the first summon with the starter', () => {
    const w = richWorld();
    const gold = w.gold;
    expect(w.summon()).toBe(true);
    expect(w.gold).toBe(gold - ECON.summonBase);
    expect(w.summonCost()).toBe(ECON.summonBase + ECON.summonStep);
    expect(w.cells.filter((f) => f?.kind === 'strawberry' && f.level === 1).length).toBe(2);
  });

  it('opens a corner every few summons and stops when full', () => {
    const w = richWorld();
    let n = 0;
    while (w.summon()) n++;
    // 4 edges hold the starter + 3 summons; summons unlock corners only every UNLOCK_EVERY.
    expect(n).toBe(3);
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
    w.buySummonLevel();
    w.summon();
    expect(w.cells.some((f) => f && f.level === 2)).toBe(true);
  });
});

describe('merge', () => {
  it('merges two equal fruits into one a level higher', () => {
    const w = richWorld();
    w.summon();
    const cells = w.cells.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
    const [a, b] = cells;
    expect(w.drop(a, b)).toBe(true);
    expect(w.cells[a]).toBeNull();
    expect(w.cells[b]!.level).toBe(2);
  });

  it('swaps different fruits and moves into empty cells', () => {
    const w = richWorld();
    const start = w.cells.findIndex((f) => f);
    const empty = EDGE_CELLS.find((c) => !w.cells[c])!;
    expect(w.drop(start, empty)).toBe(true);
    expect(w.cells[empty]!.kind).toBe('strawberry');
    expect(w.cells[start]).toBeNull();
  });

  it('refuses the hero cell and locked cells', () => {
    const w = richWorld();
    const start = w.cells.findIndex((f) => f);
    expect(w.drop(start, HERO_CELL)).toBe(false);
    expect(w.drop(start, CORNER_ORDER[0])).toBe(false);
  });

  it('caps at level 7', () => {
    const w = richWorld();
    w.summon();
    const [a, b] = w.cells.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
    w.cells[a]!.level = 7;
    w.cells[b]!.level = 7;
    expect(w.canMerge(a, b)).toBe(false);
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
