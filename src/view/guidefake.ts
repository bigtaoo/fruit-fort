// The stand-in page and the guide rig the guide's flow tests share (guide.flow.test.ts,
// guide.hold.test.ts). Split from guide.flow.test.ts.

import { World } from '../sim/world';
import { STAT_KEYS } from '../sim/config';
import { newSave, worldOptions, type Save } from '../meta/progress';
import { Guide } from './guide';
import type { GuideScreen } from './guidesteps';
import type { Funnel } from '../platform/funnel';

// The hand's timing and bookkeeping (§12.7) against a few-line stand-in for the page: elements keep
// their class list and transform, the window and document keep their listeners.
export interface Fake {
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
  closest(sel: string): Fake | null;
  getBoundingClientRect(): Fake['rect'];
}

export function fake(dataset: Record<string, string> = {}, width = 80): Fake {
  const classes = new Set<string>();
  const e: Fake = {
    className: '', style: {}, dataset, innerHTML: '', textContent: '', classes,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => void (on ? classes.add(c) : classes.delete(c)) },
    setAttribute: (k, v) => void (e.style[`@${k}`] = v),
    rect: { left: 100, top: 300, width, height: 40 },
    appendChild: (c) => c,
    contains: (c) => c === e,
    closest: (sel) => (sel.startsWith('.') && !classes.has(sel.slice(1)) ? null : e),
    getBoundingClientRect: () => e.rect,
  };
  return e;
}

type Listener = (e?: unknown) => void;

/** Gold for one of the cheapest card, not two. */
export const oneCard = (w: World) => Math.min(...STAT_KEYS.map((k) => w.statCost(k)));
export let on: Record<string, Listener[]>;
export let hand: Fake;
/** Elements in the order the guide made them: the hand's root, its ripple, its turning part. */
export let made: Fake[];
/** The dimming's svg and path, made apart so they leave `made` as it was. */
export let svg: Fake[];

/** Set up the stand-in window and document; each test file runs it before every test. */
export function fakePage(): void {
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
}

export const fire = (type: string, e?: unknown) => on[type]?.forEach((f) => f(e));
export const click = (b: Fake) => fire('click', { target: b });

export interface Rig {
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

export function rig(runs = 0, level: number | 'endless' = 0): Rig {
  const s = newSave('2026-11-03');
  s.runs = runs;
  const buttons: Record<string, Fake> = {};
  const r = { w: new World({ seed: 3, ...worldOptions(s, level) }), s, screen: 'battle', log: [], text: [], titles: [], buttons, saved: 0 } as unknown as Rig;
  const funnel = {
    guideShown: (id: string) => r.log.push(`+${id}`),
    guideEnd: (id: string, res: string) => r.log.push(`-${id}:${res}`),
    guideFreed: (id: string) => r.log.push(`-${id}:freed`),
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
  // A frame as main.ts runs it: the hold is asked first (with the fight's dt, which is what the
  // HOLD_TTL clock counts), then the hand is placed.
  r.run = (sec) => {
    for (let i = 0; i < Math.round(sec / 0.1); i++) {
      r.g.holding(0.1);
      r.g.update(0.1);
    }
  };
  return r;
}

export const last = <T>(a: T[]): T => a[a.length - 1];
export const shown = () => hand.classes.has('show');
/** The fingertip's page point, rounded. */
export const at = () => hand.style.transform.match(/-?[\d.]+/g)!.map((n) => Math.round(+n));
