// The guide's marks on the page (§12): the pointing hand, the dimming round a button the bugs wait
// for, and the "…" over each waiting bug. They draw only; guide.ts decides what and where.

import { el } from './dom';
import { HAND_ICON } from './icons';

/** The hand on the page: points with the fingertip, presses every 0.9 s, a cyan ripple at the tip. */
export class Hand {
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
export class Spot {
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
export class Waits {
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

