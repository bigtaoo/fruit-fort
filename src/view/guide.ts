// The soft guide (§12): one pointing hand at a time, on the first five minutes and on each screen's
// first use. It never blocks input and never acts for the player. Two steps in level 1 hold the bugs
// outside the fence until the player acts (main.ts sets `World.holdAt`); everything else runs at
// full speed. A step done or skipped goes into the save and is not taught again.

import type { World } from '../sim/world';
import { t } from '../i18n';
import { Hand, Spot, Waits } from './guidemarks';
import { HOLD_TTL, SHOW_AFTER, guideSteps, type GuideHost, type GuideScreen, type Step } from './guidesteps';

/** Seconds after the player's last tap or key before a new hand comes. */
const REST = 2;
/** A hand that went away unanswered this many times is not shown again (§12.6). */
const IGNORE_LIMIT = 3;

/** The seconds of `when` an eager step needs before its hand comes, or null when it is not eager now. */
function eagerOf(s: Step): number | null {
  return typeof s.eager === 'function' ? s.eager() : (s.eager ?? null);
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
  /** Steps whose hand timed out (`ttl`), and until when they wait. */
  private cooling = new Map<string, number>();
  /** Hold steps whose HOLD_TTL ran out, and the run they ran out in: the bugs walk for the rest of it. */
  private freed = new Set<string>();
  private freedRun: World | null = null;
  /** Seconds of fight each hold step has kept the bugs waiting, this run. */
  private heldFor = new Map<string, number>();
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

  /**
   * Whether bugs must wait now: a hold step is possible and not learned yet. `dt` is the seconds of
   * fight since the last call, and 0 whenever the fight is not running (paused, an ad, the result
   * card) or when the caller only wants the answer — the HOLD_TTL clock runs on it, so a player who
   * pauses for a quarter of a minute does not come back to a tutorial that let go while they looked
   * away. Real seconds, not sim seconds: 12 s is a patience number, so x2 does not halve it.
   */
  holding(dt = 0): boolean {
    if (this.h.screen() !== 'battle') return false;
    const w = this.h.world();
    if (this.freedRun !== w) {
      this.freedRun = w;
      this.freed.clear();
      this.heldFor.clear();
    }
    // No bug left to wait (the tank shot the one that was waiting): the wave walks on, or the hold
    // would also stop the spawner and leave the player in an empty field.
    if (!w.enemies.some((e) => e.hp > 0)) return false;
    const step = this.steps.find((s) => s.hold && !this.known(s.id) && !this.freed.has(s.id) && s.when() && (!s.holdFrom || s.holdFrom()));
    if (!step) return false;
    const held = (this.heldFor.get(step.id) ?? 0) + dt;
    this.heldFor.set(step.id, held);
    if (held < HOLD_TTL) return true;
    // Waited out: the bugs walk on for the rest of the run and the step stays neither done nor skipped.
    this.freed.add(step.id);
    this.h.funnel.guideFreed(step.id, { run: this.h.save().runs });
    return false;
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
      const quiet = !s.idle || eagerOf(s) !== null || this.now?.step === s || still >= s.idle;
      const ok = screen === s.screen && this.open(s) && (this.cooling.get(s.id) ?? 0) <= this.time && s.when() && quiet;
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
    if (cur && cur.step.ttl && this.time - cur.at >= cur.step.ttl) {
      this.cooling.set(cur.step.id, this.time + (cur.step.cool ?? 0));
      this.since.delete(cur.step.id);
      if (best === cur.step) best = null;
    }
    if (cur && !this.since.has(cur.step.id)) this.end('left');
    // A higher step that is ready takes the hand; a new hand waits out the rest after a tap.
    if (best && best !== this.now?.step) {
      const eager = eagerOf(best);
      const rested = eager !== null || (this.time - this.lastInput >= REST && !this.down);
      const higher = !this.now || this.steps.indexOf(best) < this.steps.indexOf(this.now.step);
      if (higher && rested && this.time - bestAt >= (eager ?? SHOW_AFTER)) {
        if (this.now) {
          this.h.funnel.guideEnd(this.now.step.id, 'replaced');
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
    cur.el = aim.el;
    cur.last = aim.last;
    const r = aim.el?.getBoundingClientRect();
    if (!r || !r.width) return this.hand.hide();
    // The upper right: the palm falls off to the lower right, past a price in the card's middle
    // (from the middle it covered a stat card's price on a phone, both ways round). A route node is
    // smaller than the hand: point at its right edge, so its name and stars stay in sight.
    const node = aim.el?.closest('.node');
    this.atPoint(node ? r.right - 4 : r.left + r.width * 0.8, r.top + r.height * (node ? 0.4 : 0.3));
  }

  /** On a point: from below right, or from above when too near the bottom, mirrored near the right edge. */
  private atPoint(x: number, y: number): void {
    const below = y < window.innerHeight - 64;
    const flip = x > window.innerWidth - 56;
    this.hand.place(x, y, below ? -25 : 205, flip);
  }
}
