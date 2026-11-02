// Where the fight goes on screen. The fence and a band of ground round it (an ellipse on the ground)
// is placed as big as it goes in the window below the top bar, clear of the HUD blocks (the stat
// dock), and as near the middle of that space as it can be, so the band of ground shows the same on
// every side rather than the fort being pushed into a corner beside a cut-away column.

import * as THREE from 'three';

/** A screen rectangle in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the HUD leaves the camera: the space below the top bar, and the HUD blocks inside it to keep clear of. */
export interface Board {
  area: Rect;
  avoid: Rect[];
}

/** An ellipse's place on screen: its centre and its scale against the size it was measured at. */
export interface Spot {
  x: number;
  y: number;
  s: number;
}

/**
 * The biggest copy of an ellipse with semi-axes `a` × `b` (px) that fits in `area` without touching
 * any `avoid` rect. Stretching the screen by a/b up and down makes the ellipse a circle of radius a,
 * so the room at a centre is just its distance to the nearest edge or block. Among centres within a
 * few percent of the best, the one nearest the middle of the area wins: a hair smaller and centred
 * reads better than the biggest wedged into a corner.
 */
export function placeEllipse(a: number, b: number, area: Rect, avoid: Rect[]): Spot {
  const k = a / b;
  const room = (x: number, y: number) => {
    let r = Math.min(x - area.x, area.x + area.w - x, (y - area.y) * k, (area.y + area.h - y) * k);
    for (const o of avoid) {
      const dx = Math.max(o.x - x, 0, x - o.x - o.w);
      const dy = Math.max(o.y - y, 0, y - o.y - o.h) * k;
      r = Math.min(r, Math.hypot(dx, dy));
    }
    return Math.max(0, r) / a;
  };
  const mx = area.x + area.w / 2;
  const my = area.y + area.h / 2;
  const spots: Spot[] = [{ x: mx, y: my, s: room(mx, my) }];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = area.x + (area.w * i) / N;
      const y = area.y + (area.h * j) / N;
      spots.push({ x, y, s: room(x, y) });
    }
  }
  const best = Math.max(...spots.map((p) => p.s));
  let pick = spots[0];
  let near = Infinity;
  for (const p of spots) {
    const d = Math.hypot(p.x - mx, p.y - my);
    if (p.s >= best * 0.97 && d < near) {
      near = d;
      pick = p;
    }
  }
  return pick;
}

const scratch = new THREE.Vector3();

/**
 * Set the camera (looking down at `pitch` onto the fort's middle) so the ground ellipse of
 * half-extents `across` × `deep` (world units) sits where placeEllipse puts it. The projected ring is
 * measured rather than guessed: in perspective the near side looms larger and the ring's middle
 * sits above the look point's. The size goes roughly as one over the distance, so a few passes
 * settle it; the last pass only measures, so the box matches where the camera ends up.
 * Returns the ellipse's centre and smaller semi-axis on screen, for the soft focus round it.
 */
export function frameCamera(camera: THREE.PerspectiveCamera, pitch: number, across: number, deep: number, w: number, h: number, board: Board): { x: number; y: number; r: number; dist: number } {
  camera.clearViewOffset();
  let dist = 30;
  let box = { x0: 0, x1: 0, y0: 0, y1: 0 };
  let spot: Spot = { x: w / 2, y: h / 2, s: 1 };
  for (let pass = 0; pass < 5; pass++) {
    camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      const p = scratch.set(Math.cos(t) * across, 0, Math.sin(t) * deep).project(camera);
      const px = ((p.x + 1) / 2) * w;
      const py = ((1 - p.y) / 2) * h;
      box = { x0: Math.min(box.x0, px), x1: Math.max(box.x1, px), y0: Math.min(box.y0, py), y1: Math.max(box.y1, py) };
    }
    if (pass === 4) break;
    // A little slack round the ellipse, so the band does not run hard into the screen's edge.
    spot = placeEllipse((box.x1 - box.x0) / 2, (box.y1 - box.y0) / 2, board.area, board.avoid);
    dist /= Math.max(0.05, spot.s * 0.98);
  }
  // Slide the picture so the middle of the ring's box lands on the spot.
  camera.setViewOffset(w, h, (box.x0 + box.x1) / 2 - spot.x, (box.y0 + box.y1) / 2 - spot.y, w, h);
  camera.updateProjectionMatrix();
  return { x: spot.x, y: spot.y, r: Math.min(box.x1 - box.x0, box.y1 - box.y0) / 2, dist };
}
