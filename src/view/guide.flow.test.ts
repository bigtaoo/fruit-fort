import { beforeEach, describe, expect, it } from 'vitest';
import { World } from '../sim/world';
import { newSave, worldOptions, type Save } from '../meta/progress';
import { Guide, type GuideScreen } from './guide';
import type { Funnel } from '../platform/funnel';

// The hand's timing and bookkeeping (Ã‚Â§12.7) against a few-line stand-in for the page: elements keep
// their class list and transform, the window and document keep their listeners.
interface Fake {
  className: string;
  style: Record<string, string>;
  dataset: Record<string, string>;
  innerHTML: string;
  textContent: string;
  classes: Set<string>;
  classList: { add(c: string): void; remove(c: string): void; toggle(c: string, on: boolean): void };
  rect: { left: number; top: number; width: number; height: number };
  setAttribute(k: string, v: string): void;
  appendChild(c: Fake): Fake;
  contains(c: unknown): boolean;
  closest(): Fake;
  getBoundingClientRect(): Fake['rect'];
}

function fake(dataset: Record<string, string> = {}, width = 80): Fake {
  const classes = new Set<string>();
  const e: Fake = {
    className: '', style: {}, dataset, innerHTML: '', textContent: '', classes,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => void (on ? classes.add(c) : classes.delete(c)) },
    setAttribute: (k, v) => void (e.style[`@${k}`] = v),
    rect: { left: 100, top: 300, width, height: 40 },
    appendChild: (c) => c,
    contains: (c) => c === e,
    closest: () => e,
    getBoundingClientRect: () => e.rect,
  };
  return e;
}

type Listener = (e?: unknown) => void;
let on: Record<string, Listener[]>;
let hand: Fake;
/** Elements in the order the guide made them: the hand's root, its ripple, its turning part. */
let made: Fake[];
/** The dimming's svg and path, made apart so they leave `made` as it was. */
let svg: Fake[];

beforeEach(() => {
  on = {};
  const listen = (type: string, fn: Listener) => (on[type] ??= []).push(fn);
  made = [];
  svg = [];
  (globalThis as Record<string, unknown>).window = { addEventListener: listen, innerWidth: 375, innerHeight: 812 };
  (globalThis as Record<string, unknown>).document = {
    body: fake(),
    createElement: () => (made.push(fake()), made[made.length - 1]),
    createElementNS: () => (svg.push(fake()), svg[svg.length - 1]),
    addEventListener: listen,
    querySelector: () => null,
  };
});

const fire = (type: string, e?: unknown) => on[type]?.forEach((f) => f(e));
const click = (b: Fake) => fire('click', { target: b });

interface Rig {
  g: Guide;
  w: World;
  s: Save;
  screen: GuideScreen | null;
  log: string[];
  text: (string | null)[];
  titles: (string | null | undefined)[];
  buttons: Record<string, Fake>;
  saved: number;
  /** Real seconds in small frames. */
  run(sec: number): void;
}

function rig(runs = 0, level: number | 'endless' = 0): Rig {
  const s = newSave('2026-11-03');
  s.runs = runs;
  const buttons: Record<string, Fake> = {};
  const r = { w: new World({ seed: 3, ...worldOptions(s, level) }), s, screen: 'battle', log: [], text: [], titles: [], buttons, saved: 0 } as unknown as Rig;
  const funnel = {
    guideShown: (id: string) => r.log.push(`+${id}`),
    guideEnd: (id: string, res: string) => r.log.push(`-${id}:${res}`),
  } as unknown as Funnel;
  r.g = new Guide({
    world: () => r.w,
    save: () => r.s,
    screen: () => r.screen,
    villageTab: () => 'train',
    hudButton: (name) => (buttons[name] ??= fake({ a: name })) as unknown as HTMLElement,
    toScreen: (x, _y, z) => ({ x: 187 + x * 20, y: 400 + z * 20 }),
    board: () => ({ x: 0, y: 0, w: 375, h: 812 }),
    setText: (t, title) => (r.text.push(t), r.titles.push(title)),
    persist: () => r.saved++,
    funnel,
  });
  hand = made[0];
  r.run = (sec) => {
    for (let i = 0; i < Math.round(sec / 0.1); i++) r.g.update(0.1);
  };
  return r;
}

const last = <T>(a: T[]): T => a[a.length - 1];
const shown = () => hand.classes.has('show');
/** The fingertip's page point, rounded. */
const at = () => hand.style.transform.match(/-?[\d.]+/g)!.map((n) => Math.round(+n));

describe('guide flow', () => {
  it('holds the bugs on level 1 until the first buy, and the hand comes after a short wait', () => {
    const r = rig();
    r.w.gold = 1e6;
    expect(r.g.holding()).toBe(true);
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
    expect(r.g.holding()).toBe(false);
  });

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

  it('an idle hint left unanswered three times is not shown again, but not before 1-5 is cleared', () => {
    const r = rig(3, 3);
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
    for (let i = 0; i < 5; i++) {
      one.w.gold = 1e6;
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
    r.s.guide.push('win', 'lose', 'v_train', 'v_daily', 'play1', 'v_hero', 'v_wall', 'v_route', 'play2');
    r.s.daily.claimed = true;
    r.screen = 'village';
    r.run(2.5);
    expect(r.log).toEqual([]);
    r.run(1);
    expect(r.log).toEqual(['+idle_play1']);
    r.screen = 'result';
    r.run(0.1);
    r.run(2.5);
    expect(last(r.log)).toBe('-idle_play1:left');
    r.run(1);
    expect(last(r.log)).toBe('+idle_next');
  });

  it('a higher step takes the hand from a lower one', () => {
    const r = rig(1, 1);
    r.s.guide.push('buy', 'cast', 'basket', 'multi');
    r.w.gold = 1e6;
    r.run(12);
    expect(last(r.log)).toBe('+idle_buy1');
    r.w.happening = { id: 1, kind: 'bug', x: 30, z: 0, t: 5, angle: 0 } as never;
    r.run(1);
    expect(r.log.slice(-1)).toEqual(['+goldbug']);
    // Off the board to the right: the hand sits at the edge and points that way.
    expect(at()).toEqual([339, 400]);
    r.w.happening = { id: 1, kind: 'bug', x: 2, z: 0, t: 5, angle: 0 } as never;
    r.run(0.1);
    expect(at()).toEqual([227, 400]);
    r.w.happening = null;
    r.run(0.1);
    // Still possible all along, the lower hint comes straight back.
    expect(r.log.slice(-2)).toEqual(['-goldbug:left', '+idle_buy1']);
    expect(r.s.guide).not.toContain('goldbug');
  });

  it('in the village another button skips the step; a button that teaches it learns it', () => {
    const r = rig(1, 'endless');
    r.screen = 'village';
    r.s.crystals = 1e6;
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
