// The level-1 hold (§12.2): when the bugs wait for the player, how long (HOLD_TTL), and the bubbles over
// the ones waiting. Split from guide.flow.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import { bugBehind, HOLD_TTL, SHOW_KILLS } from './guidesteps';
import { at, fakePage, last, made, rig, shown } from './guidefake';

beforeEach(fakePage);

describe('guide hold', () => {
  it('holds the bugs on level 1 until the first buy, and the hand comes after a short wait', () => {
    const r = rig();
    r.w.gold = 1e6;
    // Nothing to hold before the first bug: the wave must be free to send it.
    expect(r.g.holding()).toBe(false);
    while (!r.w.enemies.length) r.w.step();
    // The opening show: the first bugs walk in and die before the hold starts.
    expect(r.g.holding()).toBe(false);
    r.w.kills = SHOW_KILLS;
    expect(r.g.holding()).toBe(true);
    // The tank shot the bug that waited: the field is empty, so the hold lets the next one come.
    const bugs = r.w.enemies;
    r.w.enemies = [];
    expect(r.g.holding()).toBe(false);
    r.w.enemies = bugs;
    r.screen = 'result';
    expect(r.g.holding()).toBe(false);
    r.screen = 'battle';
    r.run(0.3);
    expect(r.log).toEqual([]);
    r.run(0.5);
    expect(r.log).toEqual(['+buy']);
    expect(shown()).toBe(true);
    expect(last(r.text)).toBeTruthy();
    // Held, the line says why the bugs stand still.
    expect(last(r.titles)).toBeTruthy();
    expect(at()).toEqual([164, 312]);
    r.g.done('buy');
    expect(r.log).toEqual(['+buy', '-buy:done']);
    expect(r.s.guide).toContain('buy');
    expect(r.saved).toBe(1);
    expect(shown()).toBe(false);
    expect(last(r.text)).toBeNull();
    // Bought: the bugs wait on only for the turn, and only with one behind the tank.
    expect(r.g.holding()).toBe(bugBehind(r.w));
  });

  it('a hold lets the bugs walk after HOLD_TTL, hand still up, for the rest of the run', () => {
    const r = rig();
    r.w.gold = 1e6;
    while (!r.w.enemies.length) r.w.step();
    r.w.kills = SHOW_KILLS;
    r.run(0.8);
    expect(r.log).toEqual(['+buy']);
    expect(r.g.holding()).toBe(true);
    r.run(HOLD_TTL - 1);
    expect(r.g.holding()).toBe(true);
    r.run(1.1);
    // The bugs walk on, the hand stays up and the step is neither done nor skipped.
    expect(r.g.holding()).toBe(false);
    expect(shown()).toBe(true);
    expect(r.s.guide).not.toContain('buy');
    expect(r.log).toEqual(['+buy', '-buy:freed']);
    // It does not come back for this run, even with a fresh bug at the ring.
    r.w.kills = SHOW_KILLS + 1;
    r.run(1);
    expect(r.g.holding()).toBe(false);
  });

  it('the hold clock counts the fight, not the hand: no hand needed, and a pause does not spend it', () => {
    const r = rig();
    r.w.gold = 1e6;
    while (!r.w.enemies.length) r.w.step();
    r.w.kills = SHOW_KILLS;
    // A player who keeps tapping is never rested enough for a hand (REST), so `update` would never
    // start a clock hung off it. The bugs still wait, so the deadline still runs.
    for (let i = 0; i < Math.round((HOLD_TTL - 1) / 0.1); i++) expect(r.g.holding(0.1)).toBe(true);
    expect(r.log).toEqual([]);
    // Paused, in an ad or on the result card the caller passes 0: the deadline waits with the fight.
    for (let i = 0; i < 100; i++) expect(r.g.holding(0)).toBe(true);
    for (let i = 0; i < 12; i++) r.g.holding(0.1);
    expect(r.g.holding()).toBe(false);
    expect(r.log).toEqual(['-buy:freed']);
  });

  it('a hold that has not started yet spends none of its deadline', () => {
    const r = rig();
    r.w.gold = 1e6;
    while (!r.w.enemies.length) r.w.step();
    // Before `holdFrom` (SHOW_KILLS kills or SHOW_TIME seconds) the hand may already be up, but the
    // bugs are not waiting, so the deadline has not begun.
    r.run(HOLD_TTL + 5);
    expect(r.log).toEqual(['+buy']);
    r.w.kills = SHOW_KILLS;
    expect(r.g.holding(0.1)).toBe(true);
  });

  it('while held, a bubble stands over each bug at the ring and goes when the hold does', () => {
    const r = rig();
    r.w.holdAt = 3;
    r.w.addEnemy('caterpillar', 3, 0, 0, 0, 3, 100);
    r.w.addEnemy('caterpillar', 12, 0, 0, 0, 12, 100);
    r.run(0.1);
    const bubbles = () => made.filter((e) => e.className === 'gwait' && e.classes.has('show'));
    expect(bubbles().length).toBe(1);
    r.w.holdAt = null;
    r.run(0.1);
    expect(bubbles().length).toBe(0);
  });
});
