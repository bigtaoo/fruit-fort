// The in-run cards with no cap (battle.md §4.1): crit past its chance cap, heavy, splash.

import { describe, expect, it } from 'vitest';
import { World } from './world';
import { CRIT, STATS, TRAIN } from './config';
import { critChance, critMul, damageEnemy, heavyMul, stepProjectiles } from './combat';

function bug(w: World, kind: 'caterpillar' | 'beetle' | 'boss', x: number, hp = 1000) {
  const e = w.addEnemy(kind, x, 0, -1, 0, 20, hp);
  e.armor = 0;
  return e;
}

describe('cards without a cap', () => {
  it('crit stops raising the chance at 50% and raises crit damage after', () => {
    const w = new World({ seed: 1 });
    w.lv.crit = CRIT.rateLevels;
    expect(critChance(w)).toBeCloseTo(0.5);
    expect(critMul(w)).toBe(TRAIN.critMul);
    w.lv.crit = CRIT.rateLevels + 3;
    expect(critChance(w)).toBeCloseTo(0.5);
    expect(critMul(w)).toBeCloseTo(TRAIN.critMul + 3 * CRIT.dmgPer);
  });

  it('heavy hits big bugs and bosses harder, the rest the same', () => {
    const w = new World({ seed: 1 });
    w.enemies.length = 0;
    w.lv.heavy = 2;
    const small = bug(w, 'caterpillar', 30);
    const big = bug(w, 'beetle', 32);
    const boss = bug(w, 'boss', 34);
    expect(heavyMul(w, small)).toBe(1);
    for (const e of [small, big, boss]) damageEnemy(w, e, 100);
    expect(small.hp).toBeCloseTo(900);
    expect(big.hp).toBeCloseTo(1000 - 100 * (1 + 2 * STATS.heavy.per));
    expect(boss.hp).toBeCloseTo(big.hp);
    small.tough = true;
    expect(heavyMul(w, small)).toBeCloseTo(1 + 2 * STATS.heavy.per);
  });

  it('splash hurts the bugs round a train shot, not the far ones', () => {
    const w = new World({ seed: 1 });
    w.enemies.length = 0;
    w.projectiles.length = 0;
    w.lv.splash = 2;
    const target = bug(w, 'caterpillar', 30);
    const near = bug(w, 'caterpillar', 30.8);
    const far = bug(w, 'caterpillar', 34);
    w.projectiles.push({ id: 999, kind: 'hero', x: 30, y: 1, z: 0, px: 30, py: 1, pz: 0, targetId: target.id, tx: 30, tz: 0, damage: 100, crit: false, poison: 0 });
    stepProjectiles(w);
    expect(target.hp).toBeCloseTo(900);
    expect(near.hp).toBeCloseTo(1000 - 100 * 2 * STATS.splash.per);
    expect(far.hp).toBe(1000);
    expect(w.events.some((e) => e.t === 'hit' && e.splash)).toBe(true);
  });
});
