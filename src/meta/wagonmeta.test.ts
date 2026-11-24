import { describe, expect, it } from 'vitest';
import { claimAchievement } from './achievements';
import { finishRun, newSave, normalize, worldOptions } from './progress';
import { START_WAGONS, WAGON_PRICE, buyWagon, wagonPrice, wagonsMaxed } from './wagonmeta';
import { World } from '../sim/world';
import { WAGONS } from '../sim/cards';
import { LEVELS } from '../sim/levels';
import type { WagonKind } from '../sim/types';

const run = (wagons: { kind: WagonKind; lv: number }[]) => ({ wave: 3, kills: 0, grabs: 0, casts: 0, buys: 0, wagons });

describe('wagons out of the run (§10.1.12)', () => {
  it('a new save rides with four; old saves get them too, junk is dropped', () => {
    expect(newSave('2026-11-11').wagons).toEqual(START_WAGONS);
    const old = normalize({ crystals: 5 }, '2026-11-11');
    expect(old.wagons).toEqual(START_WAGONS);
    expect(old.wagonLv).toEqual({});
    expect(old.wagonFull).toBe(0);
    const bad = normalize({ wagons: ['magnet', 'nope'], wagonLv: { arc: 9, mine: 0, x: 2 }, wagonFull: -1 }, '2026-11-11');
    expect(bad.wagons).toEqual(['arc', 'missile', 'frost', 'plasma', 'magnet']);
    expect(bad.wagonLv).toEqual({ arc: WAGONS.maxLv });
    expect(bad.wagonFull).toBe(0);
  });

  it('the other two are bought with crystals, once', () => {
    const s = newSave('2026-11-11');
    expect(wagonPrice(s, 'arc')).toBeNull();
    s.crystals = WAGON_PRICE.magnet! - 1;
    expect(buyWagon(s, 'magnet')).toBe(false);
    s.crystals = WAGON_PRICE.mine! + WAGON_PRICE.magnet!;
    expect(buyWagon(s, 'magnet')).toBe(true);
    expect(buyWagon(s, 'mine')).toBe(true);
    expect(s.crystals).toBe(0);
    expect(buyWagon(s, 'mine')).toBe(false);
    expect(s.wagons).toEqual(['arc', 'missile', 'frost', 'plasma', 'mine', 'magnet']);
  });

  it('picks deal only unlocked wagons, and the first is still arc, missile, frost', () => {
    const s = newSave('2026-11-11');
    for (let seed = 1; seed < 30; seed++) {
      const w = new World({ ...worldOptions(s), seed, wagons: true, level: LEVELS[0] });
      w.time = WAGONS.firstAt;
      w.wg!.open(w);
      expect(w.wg!.offer!.opts.map((o) => o.kind).sort()).toEqual(['arc', 'frost', 'missile']);
      for (let n = 0; n < 8 && w.wg!.offer; n++) {
        for (const o of w.wg!.offer.opts) expect(['mine', 'magnet']).not.toContain(o.kind);
        w.wg!.pick(w, 0);
        w.wg!.open(w);
      }
    }
  });

  it('the book keeps best levels and the most Lv3 on one train; achievements read it', () => {
    const s = newSave('2026-11-11');
    expect(claimAchievement(s, 'wagonLv3')).toBe(false);
    finishRun(s, run([{ kind: 'arc', lv: 3 }, { kind: 'frost', lv: 2 }]));
    finishRun(s, run([{ kind: 'arc', lv: 1 }, { kind: 'missile', lv: 3 }, { kind: 'frost', lv: 3 }, { kind: 'plasma', lv: 3 }]));
    expect(s.wagonLv).toEqual({ arc: 3, frost: 3, missile: 3, plasma: 3 });
    expect(s.wagonFull).toBe(3);
    expect(wagonsMaxed(s)).toBe(4);
    expect(claimAchievement(s, 'wagonLv3')).toBe(true);
    expect(claimAchievement(s, 'wagonFull')).toBe(false);
    finishRun(s, run(['arc', 'missile', 'frost', 'plasma'].map((kind) => ({ kind: kind as WagonKind, lv: 3 }))));
    expect(claimAchievement(s, 'wagonFull')).toBe(true);
    expect(claimAchievement(s, 'wagonsAll')).toBe(false);
    expect(claimAchievement(s, 'wagonLv3All')).toBe(false);
  });
});
