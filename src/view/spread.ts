// A light, view-only shove between bugs: the sim lets them walk through each other, so a wave piles
// into one dark lump with its HP bars stacked. Each bug is drawn nudged off the neighbours it
// overlaps, a little and eased, so a clump reads as separate bugs. The sim never sees it.

import { ENEMIES } from '../sim/config';
import type { Enemy } from '../sim/types';

/** On-screen size of a bug: a flat bit on top lifts the small ones most, so the smallest bug still reads. */
// Small bugs get the most: a mite has to read as a bug, not a dot, from the game camera.
export const bodyScale = (size: number): number => size * 1.3 + 0.32;

/** The furthest a bug is drawn from where the sim has it: enough to part a clump, not to mislead. */
const MAX_NUDGE = 0.3;
/** Past this many bugs the all-pairs check is skipped and the nudges ease back to none. */
const MAX_BUGS = 160;

export interface Nudged {
  sx: number;
  sz: number;
}

let pushX = new Float32Array(64);
let pushZ = new Float32Array(64);

/** Ease each bug's drawn nudge (`sx`, `sz` on its view) towards pushing it clear of its neighbours. */
export function spreadBugs(enemies: readonly Enemy[], views: Map<number, Nudged>, dt: number): void {
  const n = enemies.length;
  if (pushX.length < n) {
    pushX = new Float32Array(n * 2);
    pushZ = new Float32Array(n * 2);
  }
  pushX.fill(0, 0, n);
  pushZ.fill(0, 0, n);
  if (n <= MAX_BUGS) {
    for (let i = 0; i < n; i++) {
      const a = enemies[i];
      // Flyers are drawn high above the rest, so they never look stacked on a walker.
      if (a.flying) continue;
      const ra = bodyScale(ENEMIES[a.kind].size) * 0.4;
      for (let j = i + 1; j < n; j++) {
        const b = enemies[j];
        if (b.flying) continue;
        const reach = ra + bodyScale(ENEMIES[b.kind].size) * 0.4;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= reach * reach) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) {
          // Exactly on top of each other: part them along a direction fixed by their ids.
          dx = Math.cos(a.id * 2.4 + b.id);
          dz = Math.sin(a.id * 2.4 + b.id);
          d = 1;
        }
        const k = ((reach - Math.sqrt(d2)) * 0.5) / d;
        pushX[i] -= dx * k;
        pushZ[i] -= dz * k;
        pushX[j] += dx * k;
        pushZ[j] += dz * k;
      }
    }
  }
  const ease = Math.min(1, dt * 4);
  for (let i = 0; i < n; i++) {
    const e = enemies[i];
    const v = views.get(e.id);
    if (!v) continue;
    let px = pushX[i];
    let pz = pushZ[i];
    if (e.d <= 0) {
      // At the wall only slide along it: a push into the wall would sink it into the pylons.
      const inward = px * e.dirX + pz * e.dirZ;
      px -= inward * e.dirX;
      pz -= inward * e.dirZ;
    }
    const len = Math.hypot(px, pz);
    if (len > MAX_NUDGE) {
      px *= MAX_NUDGE / len;
      pz *= MAX_NUDGE / len;
    }
    v.sx += (px - v.sx) * ease;
    v.sz += (pz - v.sz) * ease;
  }
}
