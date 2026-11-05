// Off-screen threat markers: a bug still walking in from beyond the visible playfield (past the
// window's edge, behind the top bar or under the dock) shows as a chevron on the edge of the free
// area, pointing at it from the fort. Bugs are grouped by direction from the fort into a few fixed
// sectors, one chevron each: more bugs make it bigger, the nearest one's closeness makes it
// brighter and redder, and it fades out once the last of them walks into view.
//
// Cheap on a phone: the grouping runs ten times a second, not every frame, with no allocation; the
// chevrons are a fixed pool of DOM elements (one per sector, so each glides and fades on its own),
// moved by transform and faded by opacity with CSS transitions, so the compositor does the tweening
// and nothing repaints.

import * as THREE from 'three';
import type { Enemy } from '../sim/types';
import type { Board, Rect } from './frame';

/** Directions round the fort a chevron can stand for. */
export const SECTORS = 12;
/** A bug's middle this far (px) inside the free area's edge still counts as off-screen: half cut off. */
const EDGE = 18;
/** Room (px) between a chevron's middle and the area's edge or a HUD block. */
const MARGIN = 22;
/** Distance to the fence (world units) past which closeness no longer brightens a chevron. */
const FAR = 6;
/** Seconds between regroupings. */
const RATE = 0.1;

/** One sector's chevron: where it stands (px), the way it points (radians), and what it stands for. */
export interface Marker {
  on: boolean;
  x: number;
  y: number;
  angle: number;
  count: number;
  /** 0 far .. 1 at the fence, for the nearest bug in it. */
  near: number;
  boss: boolean;
}

/** Inside `r` shrunk by `inset` on every side. */
function inside(r: Rect, x: number, y: number, inset: number): boolean {
  return x >= r.x + inset && x <= r.x + r.w - inset && y >= r.y + inset && y <= r.y + r.h - inset;
}

/** Whether a point on the page is out of the player's view: off the free area, or under a HUD block. */
export function offBoard(board: Board, x: number, y: number): boolean {
  if (!inside(board.area, x, y, EDGE)) return true;
  for (const o of board.avoid) if (inside(o, x, y, 0)) return true;
  return false;
}

/**
 * Where a ray from (ox, oy) along the unit (dx, dy) leaves the free area (shrunk by MARGIN) or first
 * meets a HUD block (grown by MARGIN), whichever comes first; written into `out`.
 */
export function edgePoint(board: Board, ox: number, oy: number, dx: number, dy: number, out: { x: number; y: number }): void {
  const a = board.area;
  const x0 = a.x + MARGIN;
  const x1 = a.x + a.w - MARGIN;
  const y0 = a.y + MARGIN;
  const y1 = a.y + a.h - MARGIN;
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (x1 - ox) / dx);
  else if (dx < -1e-6) t = Math.min(t, (x0 - ox) / dx);
  if (dy > 1e-6) t = Math.min(t, (y1 - oy) / dy);
  else if (dy < -1e-6) t = Math.min(t, (y0 - oy) / dy);
  if (!isFinite(t)) t = 0;
  for (const o of board.avoid) {
    // Slab test against the grown block: where the ray gets in, if it does before leaving the area.
    const [lx, hx] = slab(ox, dx, o.x - MARGIN, o.x + o.w + MARGIN);
    const [ly, hy] = slab(oy, dy, o.y - MARGIN, o.y + o.h + MARGIN);
    const lo = Math.max(0, lx, ly);
    if (lo > 0 && lo <= Math.min(t, hx, hy)) t = lo;
  }
  t = Math.max(0, t);
  out.x = ox + dx * t;
  out.y = oy + dy * t;
}

const span: [number, number] = [0, 0];
/** The stretch of a ray (start `p`, step `d`) that lies between `a0` and `a1` on one axis. */
function slab(p: number, d: number, a0: number, a1: number): [number, number] {
  if (Math.abs(d) < 1e-6) {
    span[0] = p < a0 || p > a1 ? Infinity : -Infinity;
    span[1] = p < a0 || p > a1 ? -Infinity : Infinity;
  } else {
    span[0] = Math.min((a0 - p) / d, (a1 - p) / d);
    span[1] = Math.max((a0 - p) / d, (a1 - p) / d);
  }
  return span;
}

/**
 * Groups off-screen bugs by direction from the fort: reset, add each one, finish. The markers are
 * made once and reused, so a regrouping allocates nothing.
 */
export class ThreatGather {
  readonly markers: Marker[] = [];
  private sx = new Float64Array(SECTORS);
  private sy = new Float64Array(SECTORS);

  constructor() {
    for (let i = 0; i < SECTORS; i++) this.markers.push({ on: false, x: 0, y: 0, angle: 0, count: 0, near: 0, boss: false });
  }

  reset(): void {
    for (const m of this.markers) {
      m.count = 0;
      m.near = 0;
      m.boss = false;
    }
    this.sx.fill(0);
    this.sy.fill(0);
  }

  /** A bug at (x, y) on the page, the fort's middle at (ox, oy), `d` world units from the fence. */
  add(ox: number, oy: number, x: number, y: number, d: number, boss: boolean): void {
    const dx = x - ox;
    const dy = y - oy;
    const len = Math.hypot(dx, dy);
    // NaN too (a canvas with no size yet projects nowhere): one bad point must not stop the frame.
    if (!(len >= 1e-3)) return;
    const turn = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5 / SECTORS;
    const i = ((Math.floor(turn * SECTORS) % SECTORS) + SECTORS) % SECTORS;
    const m = this.markers[i];
    m.count++;
    m.near = Math.max(m.near, 1 - Math.min(1, Math.max(0, d) / FAR));
    m.boss ||= boss;
    this.sx[i] += dx / len;
    this.sy[i] += dy / len;
  }

  /** Point each sector with bugs at their mean direction, on the edge of the free area. */
  finish(board: Board, ox: number, oy: number): void {
    for (let i = 0; i < SECTORS; i++) {
      const m = this.markers[i];
      m.on = m.count > 0;
      if (!m.on) continue;
      m.angle = Math.atan2(this.sy[i], this.sx[i]);
      edgePoint(board, ox, oy, Math.cos(m.angle), Math.sin(m.angle), m);
    }
  }
}

const v = new THREE.Vector3();
const GLIDE = 'transform 0.12s linear,opacity 0.3s ease-out';
const FADE = 'opacity 0.3s ease-out';

/** The chevrons on the page, fed from the world a few times a second. */
export class Threats {
  private gather = new ThreatGather();
  private els: HTMLElement[] = [];
  private shown: string[] = [];
  private tween: string[] = [];
  private wait = 0;

  constructor(parent: HTMLElement, before: Element | null) {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;';
    for (let i = 0; i < SECTORS; i++) {
      const e = document.createElement('div');
      // A chevron pointing along +x, its tip on its middle's right; drawn once, then only moved. The
      // dark halo goes on the holder: a clip-path would cut the chevron's own shadow off.
      e.style.cssText =
        'position:absolute;left:-14px;top:-14px;width:28px;height:28px;opacity:0;will-change:transform,opacity;' +
        'filter:drop-shadow(0 0 1.5px #1a0505) drop-shadow(0 0 4px rgba(20,0,0,0.7));';
      const shape = document.createElement('div');
      shape.style.cssText =
        'width:100%;height:100%;background:linear-gradient(90deg,#ffc83a,#ff3424);' +
        'clip-path:polygon(18% 0,100% 50%,18% 100%,0 82%,50% 50%,0 18%);';
      e.appendChild(shape);
      root.appendChild(e);
      this.els.push(e);
      this.shown.push('');
      this.tween.push('');
    }
    parent.insertBefore(root, before);
  }

  /**
   * Regroup the bugs (every RATE seconds) and move the chevrons. `hide` puts them all away (the
   * village, a finished run).
   */
  update(enemies: readonly Enemy[], camera: THREE.Camera, board: Board | null, dt: number, hide: boolean): void {
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = RATE;
    const g = this.gather;
    g.reset();
    if (board && !hide) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      v.set(0, 0, 0).project(camera);
      const ox = ((v.x + 1) / 2) * w;
      const oy = ((1 - v.y) / 2) * h;
      for (const e of enemies) {
        if (e.d <= 0) continue;
        v.set(e.x, 0.3, e.z).project(camera);
        const x = ((v.x + 1) / 2) * w;
        const y = ((1 - v.y) / 2) * h;
        if (offBoard(board, x, y)) g.add(ox, oy, x, y, e.d, e.kind === 'boss');
      }
      g.finish(board, ox, oy);
    }
    for (let i = 0; i < SECTORS; i++) {
      const m = g.markers[i];
      const e = this.els[i];
      if (!m.on) {
        if (this.shown[i] !== '') {
          e.style.opacity = '0';
          this.shown[i] = '';
        }
        continue;
      }
      const s = m.boss ? 1.6 : 0.8 + 0.15 * Math.min(m.count - 1, 4);
      const tf = `translate(${m.x.toFixed(0)}px,${m.y.toFixed(0)}px) rotate(${m.angle.toFixed(2)}rad) scale(${s.toFixed(2)})`;
      const op = (0.8 + 0.2 * m.near).toFixed(2);
      // A chevron coming back after fading jumps to its place rather than gliding in from its old one.
      const tr = this.shown[i] === '' ? FADE : GLIDE;
      if (this.tween[i] !== tr) e.style.transition = this.tween[i] = tr;
      if (this.shown[i] !== tf) e.style.transform = tf;
      if (e.style.opacity !== op) e.style.opacity = op;
      this.shown[i] = tf;
    }
  }
}
