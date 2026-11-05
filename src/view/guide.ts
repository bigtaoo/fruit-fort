// The soft guide (§12): one pointing hand at a time, on the first five minutes and on each screen's
// first use. It never blocks input and never acts for the player. Two steps in level 1 hold the bugs
// outside the fence until the player acts (main.ts sets `World.holdAt`); everything else runs at
// full speed. A step done or skipped goes into the save and is not taught again.

import { STAT_KEYS } from '../sim/config';
import { LEVELS } from '../sim/levels';
import type { World } from '../sim/world';
import type { StatKey } from '../sim/types';
import {
  ALL_HEROES, endlessOpen, hasClaim, heroPrice, nextLevel, trainPrice, villagePrice, type Save,
} from '../meta/progress';
import { hasAchievement } from '../meta/achievements';
import type { Funnel } from '../platform/funnel';
import { t } from '../i18n';
import { el } from './dom';
import type { Rect } from './frame';
import { HAND_ICON } from './icons';
import type { VillageTab } from './village';

export type GuideScreen = 'battle' | 'result' | 'village';

/** Seconds a step must be possible before the hand comes. */
const SHOW_AFTER = 0.6;
/** Seconds after the player's last tap or key before a new hand comes. */
const REST = 2;
/** A hand that went away unanswered this many times is not shown again (§12.6). */
const IGNORE_LIMIT = 3;
/**
 * Until this many levels are cleared every idle hint comes after 3 s of quiet and keeps coming
 * (§12.6, owner 2026-11-05: before 1-5 is cleared no player waits more than 3 s for the next step).
 */
const EARLY = 5;
/** The quiet before an early idle hint; with SHOW_AFTER the hand is up 3 s after the last tap. */
const IDLE_EARLY = 3 - SHOW_AFTER;
/**
 * Unspent gold in an early fight: when it would buy the cheapest card this many times over, the hand
 * points at that card after RICH_AFTER seconds, taps or not (owner 2026-11-05: in the first five
 * levels a player sitting on gold should be shown where to spend it more often).
 */
const RICH = 2;
const RICH_AFTER = 1.5;
const TAU = Math.PI * 2;

/** Where the hand points: a page element, a point in the world, or the board's middle (tap anywhere). */
type Aim = { el: Element | null; last: boolean } | { x: number; z: number } | 'tap';

export interface Step {
  id: string;
  screen: GuideScreen;
  /** Bugs wait while this step is possible and not done; it can't be skipped. */
  hold?: boolean;
  /** An idle hint: comes after this many seconds without input, is never saved as done. */
  idle?: number;
  /** An idle hint that comes back however often it went unanswered. */
  nag?: boolean;
  /**
   * An idle hint that comes even while the player keeps tapping (turning the tank round), once its
   * `when` has held this many seconds: no quiet and no rest after a tap are needed.
   */
  eager?: number;
  /** i18n key of the line above the buttons (first five minutes only). */
  text?: Parameters<typeof t>[0];
  when(): boolean;
  aim(): Aim | null;
  /** A click on a button like this teaches the step, hand or not (the player found it alone). */
  learns?(b: HTMLElement): boolean;
}

export interface GuideHost {
  world(): World;
  save(): Save;
  /** The screen up now; null while nothing may be pointed at (loading, an ad, the pause menu). */
  screen(): GuideScreen | null;
  villageTab(): VillageTab;
  /** A HUD button: `stat:<key>`, `skill`, `speed`, `village`, `train`. */
  hudButton(name: string): HTMLElement | null;
  /** A world point on the page, in CSS pixels. */
  toScreen(x: number, y: number, z: number): { x: number; y: number };
  /** The playfield on the page. */
  board(): Rect;
  /** The guide's line; `title` goes above it (the bugs wait, while they do). */
  setText(text: string | null, title?: string | null): void;
  /** The save's guide list changed. */
  persist(): void;
  funnel: Funnel;
}

/** The nearest bug is in the back half of the ring, as seen from the tank's way of travel. */
export function bugBehind(w: World): boolean {
  let near = null;
  for (const e of w.enemies) if (e.hp > 0 && (!near || e.d < near.d)) near = e;
  if (!near) return false;
  const arc = ((((Math.atan2(near.z, near.x) - w.train.angle) * w.train.dir) % TAU) + TAU) % TAU;
  return arc > Math.PI;
}

/** Stats that kill bugs; a hint points at these first, as the cheapest card (gold, move) does not hold the fence. */
const FIGHT: StatKey[] = ['dmg', 'spd', 'crit', 'multi', 'range'];

/**
 * The stat to point at: `first` if it can be bought, else the cheapest fighting stat that can, else
 * the cheapest of any. A player who only buys what the hand shows wins level 1 this way (§12.8).
 */
function cheapest(w: World, first?: StatKey): StatKey | null {
  if (first && w.canBuy(first)) return first;
  let best: StatKey | null = null;
  for (const pool of [FIGHT, STAT_KEYS]) {
    for (const k of pool) if (w.canBuy(k) && (!best || w.statCost(k) < w.statCost(best))) best = k;
    if (best) return best;
  }
  return null;
}

/** Gold enough for the cheapest card RICH times over (each buy raises the price, so roughly). */
function rich(w: World): boolean {
  const k = cheapest(w);
  return k !== null && w.gold >= RICH * w.statCost(k);
}

/** The step table, in priority order; exported for the node tests. */
export function guideSteps(h: GuideHost): Step[] {
  const w = () => h.world();
  const s = () => h.save();
  const q = (sel: string) => document.querySelector(`#village ${sel}`);
  /** A village item: its page first when another page is open, then the item. Rewards opens from
   *  home, so from another page the way there is the home tab. */
  const onTab = (tab: VillageTab, sel: string): Aim => (h.villageTab() === tab ? { el: q(sel), last: true } : { el: q(`[data-a=tab][data-v=${tab}]`) ?? q('[data-a=tab][data-v=levels]'), last: false });
  const hud = (name: string): Aim => ({ el: h.hudButton(name), last: true });
  const card = (k: StatKey | null): Aim | null => (k ? hud(`stat:${k}`) : null);
  const data = (a: string, v?: string) => (b: HTMLElement) => b.dataset.a === a && (v === undefined || b.dataset.v === v);
  const happening = (kind: 'bug' | 'basket') => () => w().happening?.kind === kind;
  const atHappening = (): Aim | null => (w().happening ? { x: w().happening!.x, z: w().happening!.z } : null);
  const can = (p: number | null) => p !== null && s().crystals >= p;
  /** The first EARLY levels are not all cleared yet. */
  const rookie = () => nextLevel(s()) < EARLY;
  /** In a level (not endless or the challenge) while still a rookie. */
  const early = () => w().level !== null && rookie();
  /** Playing one of the first five levels (the SAFE ones), even on a replay after they are cleared. */
  const firstFive = () => !!w().level?.safe;
  // There is no start button: a tap on an open route node or Endless plays it (Village.press), so the
  // play steps point at the one lit gold, the level to play next.
  const play = { aim: (): Aim => onTab('levels', '.node.cur, .sbtn.cur'), learns: data('sel') };
  const lockedHero = () => ALL_HEROES.find((k) => !s().heroes[k] && can(heroPrice(s(), k)));
  // Once a bug was behind the tank, turning round stays the step for that run: the tank keeps
  // driving round, and the nearest bug would flick between behind and ahead.
  let turnRun: World | null = null;
  const turnNow = () => {
    if (turnRun !== w() && s().guide.includes('buy') && bugBehind(w())) turnRun = w();
    return turnRun === w();
  };
  return [
    // Level 1 (§12.2): buy, then turn round; the bugs wait for both.
    { id: 'buy', screen: 'battle', hold: true, text: 'guide.buy', when: () => cheapest(w(), 'dmg') !== null, aim: () => card(cheapest(w(), 'dmg')) },
    { id: 'reverse', screen: 'battle', hold: true, text: 'guide.reverse', when: turnNow, aim: () => 'tap' },
    { id: 'basket', screen: 'battle', when: happening('basket'), aim: atHappening },
    { id: 'cast', screen: 'battle', text: 'guide.cast', when: () => w().heroReady(), aim: () => hud('skill') },
    // Level 2 (§12.4).
    { id: 'goldbug', screen: 'battle', when: happening('bug'), aim: atHappening },
    { id: 'multi', screen: 'battle', when: () => s().runs >= 1 && w().canBuy('multi'), aim: () => card('multi') },
    // Level 3: the speed button, while nothing is near yet.
    { id: 'speed', screen: 'battle', when: () => s().runs >= 2 && w().time > 2 && w().time < 20 && !w().enemies.some((e) => e.d < 6), aim: () => hud('speed') },
    // The result card: a first win goes to the village (and so to visit ①), a first loss to training.
    { id: 'win', screen: 'result', when: () => w().won, aim: () => hud('village') },
    { id: 'lose', screen: 'result', when: () => !w().won && w().level !== null, aim: () => hud('train') },
    // Visit ① (§12.3).
    { id: 'v_train', screen: 'village', when: () => s().runs >= 1 && can(trainPrice(s(), 'dmg')), aim: () => onTab('train', '[data-a=buyTrain][data-v=dmg]'), learns: data('buyTrain') },
    { id: 'v_daily', screen: 'village', when: () => s().runs >= 1 && !s().daily.claimed, aim: () => onTab('rewards', '[data-a=daily]'), learns: data('daily') },
    { id: 'play1', screen: 'village', when: () => s().runs >= 1, ...play },
    // Visit ② (§12.5).
    { id: 'v_hero', screen: 'village', when: () => s().runs >= 2 && can(heroPrice(s(), s().hero)), aim: () => onTab('hero', `[data-a=buyHero][data-v=${s().hero}]`), learns: data('buyHero') },
    { id: 'v_wall', screen: 'village', when: () => s().runs >= 2 && can(villagePrice(s(), 'wall')), aim: () => onTab('train', '[data-a=buyVillage][data-v=wall]'), learns: data('buyVillage', 'wall') },
    { id: 'v_route', screen: 'village', when: () => s().runs >= 2 && nextLevel(s()) < LEVELS.length, aim: () => onTab('levels', '.node.cur'), learns: data('sel') },
    { id: 'play2', screen: 'village', when: () => s().runs >= 2, ...play },
    // Later (§12.6): each feature once, the first time it can be used.
    { id: 'l_ach', screen: 'village', when: () => hasAchievement(s()), aim: () => onTab('rewards', '[data-a=ach]:not([disabled])'), learns: data('ach') },
    { id: 'l_task', screen: 'village', when: () => s().daily.tasks.some((k) => !k.claimed && k.progress >= k.goal), aim: () => onTab('rewards', '[data-a=task]:not([disabled])'), learns: data('task') },
    { id: 'l_hero', screen: 'village', when: () => !!lockedHero(), aim: () => onTab('hero', `[data-a=buyHero][data-v=${lockedHero()}]`), learns: (b) => data('buyHero')(b) && !!b.dataset.v && !s().heroes[b.dataset.v as never] },
    { id: 'l_pick', screen: 'village', when: () => ALL_HEROES.some((k) => k !== s().hero && s().heroes[k] > 0) && s().hero === 'farmer', aim: () => onTab('hero', '[data-a=hero]:not([disabled])'), learns: data('hero') },
    { id: 'l_piggy', screen: 'village', when: () => can(villagePrice(s(), 'gold')), aim: () => onTab('train', '[data-a=buyVillage][data-v=gold]'), learns: data('buyVillage', 'gold') },
    { id: 'l_endless', screen: 'village', when: () => endlessOpen(s()), aim: () => onTab('levels', '.vside [data-v=endless]'), learns: data('sel', 'endless') },
    { id: 'l_challenge', screen: 'village', when: () => endlessOpen(s()) && s().guide.includes('l_endless'), aim: () => onTab('rewards', '[data-a=play][data-v=challenge]'), learns: data('play', 'challenge') },
    // Idle hints: until 1-5 is cleared gold piling up (twice the cheapest card) even while the player
    // keeps tapping, a charged skill left unused, gold left unspent, a result card
    // or the village left sitting, after IDLE_EARLY of quiet and however often they went unanswered,
    // so the first fights never sit idle; after that a longer one for gold in a fight, and from the
    // fourth run one in the village.
    { id: 'idle_rich', screen: 'battle', idle: 1, nag: true, eager: RICH_AFTER, when: () => (early() || firstFive()) && s().guide.includes('buy') && rich(w()), aim: () => card(cheapest(w())) },
    { id: 'idle_cast', screen: 'battle', idle: IDLE_EARLY, nag: true, when: () => early() && s().guide.includes('cast') && w().heroReady(), aim: () => hud('skill') },
    { id: 'idle_buy1', screen: 'battle', idle: IDLE_EARLY, nag: true, when: () => early() && s().guide.includes('buy') && cheapest(w()) !== null, aim: () => card(cheapest(w())) },
    { id: 'idle_buy', screen: 'battle', idle: 10, when: () => !early() && cheapest(w()) !== null, aim: () => card(cheapest(w())) },
    { id: 'idle_next', screen: 'result', idle: IDLE_EARLY, nag: true, when: () => rookie() && w().level !== null, aim: () => hud(w().won ? 'village' : 'train') },
    { id: 'idle_play1', screen: 'village', idle: IDLE_EARLY, nag: true, when: () => rookie() && s().runs >= 1, ...play },
    { id: 'idle_play', screen: 'village', idle: 20, when: () => !rookie() && s().runs >= 3 && !hasClaim(s()), ...play },
  ];
}

/** The hand on the page: points with the fingertip, presses every 0.9 s, a cyan ripple at the tip. */
class Hand {
  private root: HTMLElement;
  private turn: HTMLElement;
  private shown = '';

  constructor() {
    this.root = el('div', 'ghand', document.body);
    el('i', '', this.root);
    this.turn = el('div', 'gturn', this.root);
    this.turn.innerHTML = HAND_ICON;
  }

  /** Fingertip at (x, y); `deg` turns the hand about the tip (0 = finger up), `flip` mirrors it. */
  place(x: number, y: number, deg: number, flip: boolean): void {
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(deg)},${flip}`;
    if (key === this.shown) return;
    this.shown = key;
    this.root.style.transform = `translate(${x}px, ${y}px)`;
    this.turn.style.transform = `${flip ? 'scaleX(-1) ' : ''}rotate(${deg}deg)`;
    this.root.classList.add('show');
  }

  hide(): void {
    this.root.classList.remove('show');
    this.shown = '';
  }
}

/** Rounded rectangle (x, y, w, h, corner) as an SVG path. */
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/**
 * While the bugs wait for a button: the page dims a little but for that button and the guide's
 * line, so the eye lands on what to press. Under the hand, never takes a click.
 */
class Spot {
  private root: SVGSVGElement;
  private path: SVGPathElement;
  private shown = '';

  constructor() {
    const ns = 'http://www.w3.org/2000/svg';
    this.root = document.createElementNS(ns, 'svg');
    this.root.classList.add('gspot');
    this.path = document.createElementNS(ns, 'path');
    this.path.setAttribute('fill-rule', 'evenodd');
    this.root.appendChild(this.path);
    document.body.appendChild(this.root);
  }

  /** Holes round these page rectangles (padded); none hides the dimming. */
  show(holes: DOMRect[]): void {
    if (!holes.length) {
      this.root.classList.remove('show');
      this.shown = '';
      return;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    const d = `M0 0H${W}V${H}H0Z` + holes.map((r) => roundRect(Math.round(r.left - 6), Math.round(r.top - 6), Math.round(r.width + 12), Math.round(r.height + 12), 14)).join('');
    if (d !== this.shown) {
      this.shown = d;
      this.root.setAttribute('viewBox', `0 0 ${W} ${H}`);
      this.path.setAttribute('d', d);
    }
    this.root.classList.add('show');
  }
}

/** A "…" over each bug the hold keeps waiting, so they read as waiting for the player, not stuck. */
class Waits {
  private pool: HTMLElement[] = [];

  show(points: { x: number; y: number }[]): void {
    while (this.pool.length < points.length) this.pool.push(el('div', 'gwait', document.body, '…'));
    this.pool.forEach((b, i) => {
      const p = points[i];
      b.classList.toggle('show', !!p);
      if (p) b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    });
  }
}

/** Bubbles at most: the nearest waiting bugs get one. */
const WAIT_BUBBLES = 6;

export class Guide {
  private readonly steps: Step[];
  private readonly hand = new Hand();
  private readonly spot = new Spot();
  private readonly waits = new Waits();
  /** The button pulsing while the bugs wait for it. */
  private pulsing: Element | null = null;
  private time = 0;
  private lastInput = -Infinity;
  private down = false;
  /** The screen last seen, and when it came: an idle hint counts its quiet from there too. */
  private screen: GuideScreen | null = null;
  private screenAt = 0;
  /** When each step last became possible (unbroken since). */
  private since = new Map<string, number>();
  /** Times a hand went away unanswered, per step. */
  private ignored = new Map<string, number>();
  private now: { step: Step; at: number; el: Element | null; last: boolean } | null = null;

  constructor(private readonly h: GuideHost) {
    this.steps = guideSteps(h);
    window.addEventListener('pointerdown', () => {
      this.down = true;
      this.lastInput = this.time;
    }, true);
    for (const type of ['pointerup', 'pointercancel'] as const) window.addEventListener(type, () => (this.down = false), true);
    window.addEventListener('keydown', () => (this.lastInput = this.time), true);
    // Before the button's own handler: the village redraws itself on a press.
    document.addEventListener('click', (e) => {
      const b = (e.target as Element).closest('button');
      if (b) this.pressed(b);
    }, true);
  }

  private known(id: string): boolean {
    return this.h.save().guide.includes(id);
  }

  /** Mark a step learned (done or skipped) in the save. */
  private learn(id: string): void {
    if (this.known(id)) return;
    this.h.save().guide.push(id);
    this.h.persist();
  }

  /** The player did what a step teaches (an event from the sim: buy, reverse, cast, grab). */
  done(id: string): void {
    if (this.now?.step.id === id) this.end('done');
    else if (!this.steps.find((s) => s.id === id)?.idle) this.learn(id);
  }

  private pressed(b: HTMLElement): void {
    const cur = this.now;
    if (cur && cur.el && (b === cur.el || cur.el.contains(b))) {
      if (cur.last) this.end('done');
      return;
    }
    for (const s of this.steps) if (!s.idle && s.learns?.(b) && !this.known(s.id)) {
      if (cur?.step === s) this.end('done');
      else this.learn(s.id);
    }
    // Another button with a hand up off the battlefield: that step is skipped (§12.7 rule 3).
    if (this.now && this.now.step.screen !== 'battle' && !this.now.step.hold) this.end('skipped');
  }

  /** Whether bugs must wait now: a hold step is possible and not learned yet. */
  holding(): boolean {
    if (this.h.screen() !== 'battle') return false;
    return this.steps.some((s) => s.hold && !this.known(s.id) && s.when());
  }

  private end(result: 'done' | 'skipped' | 'left'): void {
    const cur = this.now!;
    const id = cur.step.id;
    this.now = null;
    this.hand.hide();
    this.h.setText(null);
    this.held(null);
    this.h.funnel.guideEnd(id, result);
    if (result === 'left' && !cur.step.hold) {
      const n = (this.ignored.get(id) ?? 0) + 1;
      this.ignored.set(id, n);
      if (n >= IGNORE_LIMIT && !cur.step.idle) this.learn(id);
    } else if (result !== 'left' && !cur.step.idle) this.learn(id);
    // An answered idle hint may come again later; so may a done one, after the rest.
    this.since.delete(id);
  }

  private open(s: Step): boolean {
    return !(s.idle ? !s.nag && (this.ignored.get(s.id) ?? 0) >= IGNORE_LIMIT : this.known(s.id));
  }

  /** Per frame: pick the step to point at and place the hand. `dt` in real seconds. */
  update(dt: number): void {
    this.time += dt;
    const screen = this.h.screen();
    if (screen !== this.screen) {
      this.screen = screen;
      this.screenAt = this.time;
    }
    const still = this.time - Math.max(this.lastInput, this.screenAt);
    let best: Step | null = null;
    let bestAt = 0;
    for (const s of this.steps) {
      // An idle hint needs the quiet only to come; the tap that answers it must not end it first.
      const quiet = !s.idle || !!s.eager || this.now?.step === s || still >= s.idle;
      const ok = screen === s.screen && this.open(s) && s.when() && quiet;
      if (!ok) {
        this.since.delete(s.id);
        continue;
      }
      if (!this.since.has(s.id)) this.since.set(s.id, this.time);
      if (!best) {
        best = s;
        bestAt = this.since.get(s.id)!;
      }
    }
    const cur = this.now;
    if (cur && !this.since.has(cur.step.id)) this.end('left');
    // A higher step that is ready takes the hand; a new hand waits out the rest after a tap.
    if (best && best !== this.now?.step) {
      const rested = !!best.eager || (this.time - this.lastInput >= REST && !this.down);
      const higher = !this.now || this.steps.indexOf(best) < this.steps.indexOf(this.now.step);
      if (higher && rested && this.time - bestAt >= (best.eager ?? SHOW_AFTER)) {
        if (this.now) {
          this.now = null;
          this.h.setText(null);
        }
        this.now = { step: best, at: this.time, el: null, last: true };
        this.h.funnel.guideShown(best.id, { run: this.h.save().runs, wait: Math.round((this.time - bestAt) * 10) / 10 });
      }
    }
    if (this.now) this.point(this.now.step);
    else this.held(null);
    this.waiting();
  }

  /** Dim the page but for `target` and the guide's line, and pulse `target`; null ends both. */
  private held(target: Element | null): void {
    if (target !== this.pulsing) {
      this.pulsing?.classList.remove('gpulse');
      target?.classList.add('gpulse');
      this.pulsing = target;
    }
    const line = target && document.querySelector('#hud .hint.show');
    this.spot.show(target ? [target.getBoundingClientRect(), ...(line ? [line.getBoundingClientRect()] : [])] : []);
  }

  /** The "…" bubbles over the bugs the hold keeps waiting at the ring. */
  private waiting(): void {
    const w = this.h.world();
    const at = w?.holdAt;
    if (at === null || at === undefined || this.h.screen() !== 'battle') return this.waits.show([]);
    const near = w.enemies.filter((e) => e.hp > 0 && e.d <= at + 0.3).sort((a, b) => a.d - b.d).slice(0, WAIT_BUBBLES);
    this.waits.show(near.map((e) => this.h.toScreen(e.x, 1.1, e.z)));
  }

  private point(s: Step): void {
    const aim = s.aim();
    const cur = this.now!;
    cur.el = null;
    cur.last = true;
    const waits = !!s.hold && this.holding();
    this.h.setText(s.text ? t(s.text) : null, waits ? t('guide.wait') : null);
    const target = waits && aim && typeof aim === 'object' && 'el' in aim ? aim.el : null;
    this.held(target && (target as HTMLElement).offsetParent ? target : null);
    if (!aim) return this.hand.hide();
    if (aim === 'tap') {
      const b = this.h.board();
      return this.hand.place(b.x + b.w * 0.55, b.y + b.h * 0.55, -25, false);
    }
    if ('el' in aim) {
      cur.el = aim.el;
      cur.last = aim.last;
      const r = aim.el?.getBoundingClientRect();
      if (!r || !r.width) return this.hand.hide();
      // The upper right: the palm falls off to the lower right, past a price in the card's middle
      // (from the middle it covered a stat card's price on a phone, both ways round). A route node is
      // smaller than the hand: point at its right edge, so its name and stars stay in sight.
      const node = aim.el?.closest('.node');
      return this.atPoint(node ? r.right - 4 : r.left + r.width * 0.8, r.top + r.height * (node ? 0.4 : 0.3));
    }
    // A world point: follow it; off the board, sit at the board's edge and point its way.
    const p = this.h.toScreen(aim.x, 0.4, aim.z);
    const b = this.h.board();
    const m = 36;
    const x = Math.min(b.x + b.w - m, Math.max(b.x + m, p.x));
    const y = Math.min(b.y + b.h - m, Math.max(b.y + m, p.y));
    if (x === p.x && y === p.y) return this.atPoint(p.x, p.y);
    this.hand.place(x, y, (Math.atan2(p.y - y, p.x - x) * 180) / Math.PI + 90, false);
  }

  /** On a point: from below right, or from above when too near the bottom, mirrored near the right edge. */
  private atPoint(x: number, y: number): void {
    const below = y < window.innerHeight - 64;
    const flip = x > window.innerWidth - 56;
    this.hand.place(x, y, below ? -25 : 205, flip);
  }
}
