// The hand's timing and bookkeeping (§12.7): when it comes, what ends it, which step outranks which,
// and where it points. The stand-in page and the rig are in guidefake.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import { HERO } from '../sim/config';
import { CAST_COOL, CAST_TTL } from './guidesteps';
import { at, click, fake, fakePage, fire, last, made, oneCard, rig, shown } from './guidefake';

beforeEach(fakePage);

describe('guide flow', () => {
  it('a sim event learns a step that had no hand yet, and a tap on the pointed button ends it', () => {
    const r = rig();
    r.g.done('cast');
    expect(r.s.guide).toEqual(['cast']);
    r.g.done('cast');
    expect(r.saved).toBe(1);
    r.w.gold = 1e6;
    r.run(1);
    click(r.buttons['stat:dmg']);
    expect(r.log).toEqual(['+buy', '-buy:done']);
  });

  it('waits out the rest after a tap, and while a finger is down', () => {
    const r = rig();
    r.w.gold = 1e6;
    r.run(0.5);
    fire('pointerdown');
    r.run(2.5);
    expect(r.log).toEqual([]);
    fire('pointerup');
    r.run(0.2);
    expect(r.log).toEqual(['+buy']);
    fire('keydown');
    expect(r.log).toEqual(['+buy']);
  });

  it('an idle hint left unanswered three times is not shown again, but not on a safe level', () => {
    // 1-8, the first level past the SAFE ones: on a safe level the eager one-buy hand fires too and
    // would double the log.
    const r = rig(3, 7);
    r.s.levels = [3, 3, 3, 3, 3];
    r.s.guide.push('buy', 'cast', 'multi', 'speed');
    for (let i = 0; i < 3; i++) {
      r.w.gold = 1e6;
      r.run(9.5);
      expect(r.log.length).toBe(i * 2);
      r.run(1.5);
      expect(last(r.log)).toBe('+idle_buy');
      // A tap does not end it; the gold running out does.
      fire('pointerdown');
      fire('pointerup');
      r.run(0.5);
      expect(last(r.log)).toBe('+idle_buy');
      r.w.gold = 0;
      r.run(0.1);
      expect(last(r.log)).toBe('-idle_buy:left');
    }
    r.w.gold = 1e6;
    r.run(20);
    expect(r.log.length).toBe(6);
    expect(r.s.guide).not.toContain('idle_buy');
    // Level 1: after 3 s of quiet, every time.
    const one = rig();
    one.s.guide.push('buy', 'cast');
    // 1-1 starts the hero full; an empty one keeps idle_cast out of the way.
    one.w.hero.charge = 0;
    for (let i = 0; i < 5; i++) {
      // One card's worth: more would be gold piling up, which makes idle_buy1 eager instead.
      one.w.gold = oneCard(one.w);
      one.run(2.5);
      expect(one.log).toHaveLength(i * 2);
      one.run(1.5);
      expect(last(one.log)).toBe('+idle_buy1');
      fire('pointerdown');
      fire('pointerup');
      one.w.gold = 0;
      one.run(0.1);
      expect(last(one.log)).toBe('-idle_buy1:left');
    }
  });

  it('before 1-5 is cleared, the village and the result card point on within 3 s of quiet', () => {
    const r = rig(7, 1);
    r.s.levels = [2];
    r.s.guide.push('r_train', 'win', 'lose', 'v_train', 'v_daily', 'play1', 'v_hero', 'v_wall', 'v_route', 'play2');
    r.s.daily.claimed = true;
    r.screen = 'village';
    r.run(2.5);
    expect(r.log).toEqual([]);
    r.run(1);
    expect(r.log).toEqual(['+idle_play1']);
    r.screen = 'result';
    r.run(0.1);
    expect(last(r.log)).toBe('-idle_play1:left');
    // 1-1..1-3 (runloop.md §2.2): the card points on without waiting for quiet (after the rest
    // that follows a hand leaving).
    r.run(2.5);
    expect(last(r.log)).toBe('+idle_next');
  });

  it('before 1-5 is cleared, gold piling up brings the one buy hand even while the player keeps tapping', () => {
    const r = rig(1, 1);
    r.s.guide.push('buy', 'cast', 'basket', 'multi', 'speed');
    const tap = () => {
      fire('pointerdown');
      fire('pointerup');
    };
    // One card's worth while tapping every half second: no hand.
    r.w.gold = oneCard(r.w);
    for (let i = 0; i < 10; i++) {
      tap();
      r.run(0.5);
    }
    expect(r.log).toEqual([]);
    // Twice the cheapest card: the hand comes within 1.5 s, taps or not, and stays while they go on.
    r.w.gold = 1e6;
    for (let i = 0; i < 3; i++) {
      tap();
      r.run(0.5);
    }
    r.run(0.3);
    expect(r.log).toEqual(['+idle_buy1']);
    tap();
    r.run(1);
    expect(r.log).toEqual(['+idle_buy1']);
  });

  it('a replay of a safe level after it is cleared still brings the eager buy hint; 1-8 does not', () => {
    for (const [level, want] of [[4, ['+idle_buy1']], [7, []]] as const) {
      const r = rig(8, level);
      r.s.levels = [3, 3, 2, 2, 1];
      r.s.guide.push('buy', 'cast', 'basket', 'multi', 'speed');
      r.w.gold = 1e6;
      for (let i = 0; i < 4; i++) {
        fire('pointerdown');
        fire('pointerup');
        r.run(0.5);
      }
      expect(r.log).toEqual(want);
    }
  });

  it('a higher step takes the hand from a lower one', () => {
    const r = rig(1, 1);
    r.s.guide.push('buy', 'cast', 'basket', 'multi');
    r.w.gold = oneCard(r.w);
    r.run(12);
    expect(last(r.log)).toBe('+idle_buy1');
    r.w.happenings.now = { id: 1, kind: 'bug', x: 30, z: 0, t: 5, angle: 0 } as never;
    r.run(1);
    expect(r.log.slice(-1)).toEqual(['+goldbug']);
    // A pickup is not tappable: the hand goes away and a line takes over.
    expect(shown()).toBe(false);
    expect(last(r.text)).toContain('turn round');
    r.w.happenings.now = null;
    r.run(0.1);
    // Still possible all along, the lower hint comes straight back.
    expect(r.log.slice(-2)).toEqual(['-goldbug:left', '+idle_buy1']);
    expect(r.s.guide).not.toContain('goldbug');
  });

  it('a gold bug already taught gets an idle hand when no card can be bought, and gives way to one', () => {
    const r = rig(1, 1);
    r.s.guide.push('buy', 'cast', 'basket', 'multi', 'goldbug');
    r.w.gold = 0;
    r.w.happenings.now = { id: 1, kind: 'bug', x: 2, z: 0, t: 30, angle: 0 } as never;
    r.run(12);
    expect(last(r.log)).toBe('+idle_pick');
    r.w.gold = oneCard(r.w);
    r.run(1);
    expect(r.log.slice(-2)).toEqual(['-idle_pick:replaced', '+idle_buy1']);
  });

  it('the skill hand steps aside after a while, so the buy hint gets its turn, and comes back later', () => {
    const r = rig(1, 1);
    r.s.guide.push('buy', 'basket', 'multi');
    r.w.gold = oneCard(r.w);
    r.w.hero.charge = HERO.chargeMax;
    r.run(1);
    expect(last(r.log)).toBe('+cast');
    r.run(CAST_TTL);
    expect(r.log).toContain('-cast:left');
    r.run(4);
    expect(last(r.log)).toBe('+idle_buy1');
    r.run(CAST_COOL);
    expect(r.log.slice(-2)).toEqual(['-idle_buy1:replaced', '+cast']);
    expect(r.s.guide).not.toContain('cast');
  });

  it('in the village another button skips the step; a button that teaches it learns it', () => {
    const r = rig(1, 'endless');
    r.screen = 'village';
    r.s.crystals = 1e6;
    r.s.levels = [1, 1, 1];
    r.run(1);
    expect(r.log).toEqual(['+v_train']);
    // The item is not on the page here: no hand, but the step stands.
    expect(shown()).toBe(false);
    click(fake({ a: 'daily' }));
    expect(r.log).toEqual(['+v_train', '-v_train:skipped']);
    expect(r.s.guide).toEqual(['v_daily', 'v_train']);
    r.run(3);
    expect(last(r.log)).toBe('+play1');
    r.screen = null;
    r.run(0.1);
    expect(last(r.log)).toBe('-play1:left');
  });

  it('turning round is tap-anywhere, near the bottom the hand points down, near the right it mirrors', () => {
    const r = rig();
    r.s.guide.push('buy');
    const a = r.w.train.angle + Math.PI * 1.5 * r.w.train.dir;
    r.w.addEnemy('caterpillar', Math.cos(a) * 9, Math.sin(a) * 9, 0, 0, 3, 100);
    r.run(1);
    expect(r.log).toEqual(['+reverse']);
    expect(at()).toEqual([206, 447]);
    r.g.done('reverse');
    r.w.hero.charge = 1e9;
    r.run(3);
    expect(last(r.log)).toBe('+cast');
    r.buttons.skill.rect = { left: 330, top: 790, width: 40, height: 20 };
    r.run(0.1);
    expect(at()).toEqual([362, 796]);
    expect(made[2].style.transform).toBe('scaleX(-1) rotate(205deg)');
  });

});
