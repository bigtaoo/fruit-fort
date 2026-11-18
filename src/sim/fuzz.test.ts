// Many runs, random commands: the invariants that must hold whatever the player does. A sim step is
// ~0.004 ms (scripts/endless-prof.ts), so thousands of runs are cheap, and a rule broken on one seed
// in a hundred is the kind of bug a hand-written case never meets.
// The checks are plain comparisons that return a message, not expect() calls: an expect per rule per
// tick cost 130 s for what now takes under two.

import { describe, expect, it } from 'vitest';
import { World } from './world';
import { botAct } from './bot';
import { DT, HERO, STAT_KEYS, WALL } from './config';
import { LEVELS } from './levels';
import { WAGON_KINDS } from './wagons';
import { Prng } from './rng';
import { newSave, worldOptions } from '../meta/progress';
import type { StatKey } from './types';

/** main.ts's GUIDE_NEAR: how far from the fence the guide's hold stops the bugs. */
const GUIDE_NEAR = 2;

/**
 * Everything that must be true of a world after any step; the first rule broken, or null. `prev` is
 * each bug's distance to the fence before the step (empty where the caller does not track it).
 */
const NO_PREV = new Map<number, number>();
function broken(w: World, prev: Map<number, number> = NO_PREV): string | null {
  if (!Number.isFinite(w.gold) || w.gold < 0) return `gold is ${w.gold}`;
  if (!Number.isFinite(w.wallHp) || w.wallHp > w.wallMax + 1e-6 || w.wallHp < 0) return `wallHp is ${w.wallHp} of ${w.wallMax}`;
  if (!(w.hero.charge >= 0 && w.hero.charge <= HERO.chargeMax)) return `charge is ${w.hero.charge}`;
  if (!Number.isFinite(w.train.angle)) return `train angle is ${w.train.angle}`;
  // The id map and the list are the same set: a projectile looks its target up by id.
  if (w.enemyById.size !== w.enemies.length) return `enemyById has ${w.enemyById.size} for ${w.enemies.length} bugs`;
  for (const e of w.enemies) {
    if (w.enemyById.get(e.id) !== e) return `bug ${e.id} is not in enemyById`;
    if (!Number.isFinite(e.x) || !Number.isFinite(e.z) || !Number.isFinite(e.d)) return `bug ${e.kind} is at ${e.x},${e.z} d ${e.d}`;
    // A bug walks in to the fence and stops; it never walks through the fort.
    if (e.d < -1e-6) return `bug ${e.kind} is ${-e.d} past the fence`;
    // The guide's hold (onboarding.md 12.2): while it is on, no bug walks nearer the fence than
    // holdAt. One already inside it stands where it is — a mold's spores are born at their mold's
    // distance, so a hold that comes on mid-fight can have bugs inside it from the start.
    const was = prev.get(e.id);
    if (w.holdAt !== null && was !== undefined && e.d < Math.min(was, w.holdAt) - 1e-6) return `bug ${e.kind} walked from ${was} to ${e.d} under a hold at ${w.holdAt}`;
    if (Math.hypot(e.x, e.z) < WALL - 1e-6) return `bug ${e.kind} is inside the fort, at ${Math.hypot(e.x, e.z)}`;
    if (!Number.isFinite(e.hp)) return `bug ${e.kind} hp is ${e.hp}`;
    if (e.speed < 0) return `bug ${e.kind} speed is ${e.speed}`;
  }
  for (const p of w.shots.list) if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.damage)) return `a ${p.kind} is at ${p.x},${p.z} for ${p.damage}`;
  // A pick of wagons is a choice: one card is no choice, and more than four never fit the dock.
  const n = w.wg?.offer?.opts.length;
  if (n !== undefined && (n < 2 || n > 4)) return `${n} cards on offer`;
  return null;
}

/** Play a world out with random commands, checking after every step. Returns the ticks it took. */
function play(w: World, rng: Prng, maxTicks: number, where: string): number {
  let ticks = 0;
  while (!w.over && ticks < maxTicks) {
    // A player who mashes everything: buys, reverses, casts and takes cards at random.
    if (w.wg?.offer) w.pickWagon(rng.int(w.wg.offer.opts.length));
    else {
      if (rng.float() < 0.05) w.buy(STAT_KEYS[rng.int(STAT_KEYS.length)] as StatKey);
      if (rng.float() < 0.01) w.reverse();
      if (rng.float() < 0.05) w.cast();
      if (rng.float() < 0.002) w.revive();
    }
    w.step();
    w.events.length = 0;
    const bad = broken(w);
    if (bad) expect.fail(`${where} tick ${ticks} (${(ticks * DT).toFixed(1)} s): ${bad}`);
    ticks++;
  }
  return ticks;
}

describe('fuzz', () => {
  it('every level holds the sim invariants under random play', () => {
    for (let i = 0; i < LEVELS.length; i++) {
      for (let seed = 1; seed <= 6; seed++) {
        const save = newSave('2026-11-14');
        const w = new World({ ...worldOptions(save, i), seed });
        const ticks = play(w, new Prng(seed * 31 + i), 40_000, `level ${i + 1} seed ${seed}`);
        // Every level ends one way or the other well inside 40 000 ticks (22 min of fight).
        expect(w.over, `level ${i + 1} seed ${seed} never ended (${(ticks * DT).toFixed(0)} s)`).toBe(true);
      }
    }
  });

  it('an endless run holds them with every stat trained to the cap', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const save = newSave('2026-11-14');
      for (const k of STAT_KEYS) (save.train as Record<string, number>)[k] = 30;
      const w = new World({ ...worldOptions(save, 'endless'), seed });
      play(w, new Prng(seed * 17), 30_000, `endless seed ${seed}`);
    }
  });

  it('every hero, held bugs and any set of unlocked wagons hold them', () => {
    const heroes = ['farmer', 'beekeeper', 'chef'] as const;
    for (let seed = 1; seed <= 12; seed++) {
      const rng = new Prng(seed * 101 + 7);
      const save = newSave('2026-11-14');
      for (const k of STAT_KEYS) (save.train as Record<string, number>)[k] = rng.int(12);
      // A level, a random hero, and only some wagon kinds unlocked, as a run partway through the base is.
      const i = rng.int(LEVELS.length);
      const kinds = WAGON_KINDS.filter(() => rng.float() < 0.6);
      const prev = new Map<number, number>();
      const w = new World({ ...worldOptions(save, i), seed, hero: heroes[rng.int(heroes.length)], wagons: true, wagonKinds: kinds.length ? kinds : undefined });
      let ticks = 0;
      while (!w.over && ticks < 40_000) {
        // The guide's hold goes on and off as a hand comes up and is answered (main.ts holdBugs).
        if (rng.float() < 0.004) w.holdAt = w.holdAt === null ? GUIDE_NEAR : null;
        if (w.wg?.offer) w.pickWagon(rng.int(w.wg.offer.opts.length));
        else if (rng.float() < 0.08) w.buy(STAT_KEYS[rng.int(STAT_KEYS.length)] as StatKey);
        else if (rng.float() < 0.05) w.cast();
        prev.clear();
        for (const e of w.enemies) prev.set(e.id, e.d);
        w.step();
        w.events.length = 0;
        const bad = broken(w, prev);
        if (bad) expect.fail(`hero seed ${seed} level ${i + 1} tick ${ticks}: ${bad}`);
        ticks++;
      }
    }
  });

  it('the bot plays every level out without breaking them', () => {
    for (let i = 0; i < LEVELS.length; i++) {
      const save = newSave('2026-11-14');
      const w = new World({ ...worldOptions(save, i), seed: 3 });
      let ticks = 0;
      while (!w.over && ticks++ < 40_000) {
        botAct(w);
        w.step();
        w.events.length = 0;
      }
      const bad = broken(w);
      if (bad) expect.fail(`bot level ${i + 1}: ${bad}`);
      expect(w.over, `bot never finished level ${i + 1}`).toBe(true);
    }
  });
});
