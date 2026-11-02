import { describe, expect, it } from 'vitest';
import { edgePoint, offBoard, SECTORS, ThreatGather } from './threats';
import type { Board } from './frame';

// A phone upright: the free area under a 60 px top bar, the dock along the bottom cut off.
const PHONE: Board = { area: { x: 0, y: 60, w: 400, h: 540 }, avoid: [] };
// A wide window: the dock a block in the bottom right corner.
const WIDE: Board = { area: { x: 0, y: 60, w: 1000, h: 500 }, avoid: [{ x: 700, y: 200, w: 300, h: 360 }] };

const lit = (g: ThreatGather) => g.markers.filter((m) => m.on);

describe('offBoard', () => {
  it('counts a bug off the area, half cut off at its edge, or under a HUD block', () => {
    expect(offBoard(PHONE, 200, 300)).toBe(false);
    expect(offBoard(PHONE, -30, 300)).toBe(true);
    expect(offBoard(PHONE, 5, 300)).toBe(true);
    expect(offBoard(PHONE, 200, 40)).toBe(true);
    expect(offBoard(PHONE, 200, 650)).toBe(true);
    expect(offBoard(WIDE, 800, 400)).toBe(true);
    expect(offBoard(WIDE, 500, 400)).toBe(false);
  });
});

describe('edgePoint', () => {
  it('stops at the free area, short of its edge', () => {
    const p = { x: 0, y: 0 };
    edgePoint(PHONE, 200, 300, -1, 0, p);
    expect(p.x).toBeCloseTo(22);
    expect(p.y).toBeCloseTo(300);
    edgePoint(PHONE, 200, 300, 0, -1, p);
    expect(p.y).toBeCloseTo(82);
  });

  it('stops short of a HUD block in the way', () => {
    const p = { x: 0, y: 0 };
    edgePoint(WIDE, 400, 150, 1, 0, p);
    expect(p.x).toBeCloseTo(978);
    edgePoint(WIDE, 400, 400, 1, 0, p);
    expect(p.x).toBeCloseTo(678);
    expect(p.y).toBeCloseTo(400);
  });
});

describe('ThreatGather', () => {
  it('shows one chevron for a crowd from one side, pointing at it', () => {
    const g = new ThreatGather();
    g.reset();
    for (let i = 0; i < 5; i++) g.add(200, 300, -100, 290 + i * 5, 5, false);
    g.finish(PHONE, 200, 300);
    const on = lit(g);
    expect(on).toHaveLength(1);
    expect(on[0].count).toBe(5);
    expect(Math.abs(Math.cos(on[0].angle) + 1)).toBeLessThan(0.01);
    expect(on[0].x).toBeCloseTo(22, 0);
  });

  it('splits bugs from opposite sides, keeps the nearest and flags a boss', () => {
    const g = new ThreatGather();
    g.reset();
    g.add(200, 300, -100, 300, 5, false);
    g.add(200, 300, -100, 300, 1.5, true);
    g.add(200, 300, 500, 300, 6, false);
    g.finish(PHONE, 200, 300);
    const on = lit(g);
    expect(on).toHaveLength(2);
    const left = on.find((m) => m.x < 200)!;
    expect(left.boss).toBe(true);
    expect(left.near).toBeCloseTo(0.75);
    expect(on.find((m) => m.x > 200)!.near).toBeCloseTo(0);
  });

  it('starts every regrouping empty, with a marker per sector reused', () => {
    const g = new ThreatGather();
    const before = g.markers.slice();
    g.reset();
    g.add(0, 0, 10, 0, 1, true);
    g.finish(PHONE, 0, 0);
    g.reset();
    g.finish(PHONE, 0, 0);
    expect(lit(g)).toHaveLength(0);
    expect(g.markers).toHaveLength(SECTORS);
    expect(g.markers.every((m, i) => m === before[i])).toBe(true);
  });
});
