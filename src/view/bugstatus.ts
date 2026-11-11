// What the wagons do to a bug, shown on the bug (§10.1.13): the sim's status clocks, drawn.
//   slowed (frost)        the body frosts over ice blue, ice crystals drop off it, cold mist at its feet
//   frail (frost Lv3)     white ice glints flash on it: it takes more damage
//   stunned (arc Lv3)     a ring of sparks circles over its head, now and then a crackle
//   burning (plasma Lv3)  a magenta glow on the body, embers rising off it: the train's next shot crits
//   poisoned (beekeeper)  green bubbles, as before
// The tint fades in and out over a fifth of a second (frost is renewed every tick it stands in a
// patch, so it would flicker at the patch's edge otherwise). Picture only; the sim is unchanged.

import type { Enemy } from '../sim/types';
import type { Fx } from './fx';

const ICE = 0xd8f4ff;
const ICE_DEEP = 0x8fd6ff;
const SPARK = 0xe6d8ff;
const ARC = 0xa77bff;
const EMBER = 0xff4fd2;
const EMBER_HOT = 0xffd070;
/** Seconds the tint takes to come or go. */
const FADE = 0.2;

/** A bug on screen, as status needs it. */
export interface StatusView {
  x: number;
  y: number;
  z: number;
  /** Its back's height, and its footprint's radius (model units at size 1). */
  tall: number;
  size: number;
  /** Eased status tint, -1 (burning) .. 1 (chilled). */
  tint: number;
}

/** Draw the bug's statuses this frame; returns the tint for its body. */
export function bugStatus(fx: Fx, e: Enemy, v: StatusView, clock: number, dt: number): number {
  const chilled = e.slowT > 0 && e.slowMul < 1;
  const burning = e.burnT > 0;
  // Burning shows over chilled: it is the one that changes the next shot.
  const want = burning ? -1 : chilled ? 1 : 0;
  const step = dt / FADE;
  v.tint += Math.max(-step, Math.min(step, want - v.tint));
  if (dt <= 0) return v.tint;
  const r = v.size * 0.45 + 0.15;
  const rnd = () => (Math.random() - 0.5) * 2 * r;
  if (chilled) {
    // Ice crystals dropping off its back, and a little cold mist round its feet.
    if (Math.random() < dt * 7) fx.emit(v.x + rnd(), v.y + v.tall * (0.5 + Math.random() * 0.5), v.z + rnd(), 0, -0.4, 0, Math.random() < 0.5 ? ICE : ICE_DEEP, 0.05, 0.45, 3, false);
    if (Math.random() < dt * 2.5) fx.puff(v.x + rnd() * 0.6, v.y + 0.12, v.z + rnd() * 0.6, ICE, { size: r * 1.4, grow: 1.4, life: 0.7, rise: 0.05, opacity: 0.22 });
  }
  if (e.frailT > 0 && Math.random() < dt * 5) {
    // A shard catching the light: pops out, does not shrink.
    fx.emit(v.x + rnd(), v.y + v.tall * (0.3 + Math.random() * 0.7), v.z + rnd(), 0, 0.2, 0, 0xffffff, 0.07, 0.18, 0, false);
  }
  if (e.stunT > 0) {
    // Three sparks round over its head, each leaving a short trail: a ring that turns.
    const hy = v.y + v.tall + 0.22;
    const rr = r * 0.7 + 0.1;
    for (let i = 0; i < 3; i++) {
      const a = clock * 9 + (i * Math.PI * 2) / 3 + e.id;
      fx.emit(v.x + Math.cos(a) * rr, hy + Math.sin(a * 2) * 0.04, v.z + Math.sin(a) * rr, 0, 0, 0, i ? ARC : SPARK, 0.05, 0.12, 0);
    }
    if (Math.random() < dt * 6) fx.emit(v.x + rnd(), v.y + v.tall * 0.6, v.z + rnd(), rnd() * 3, 1.5, rnd() * 3, SPARK, 0.04, 0.15, 0);
  }
  if (burning && Math.random() < dt * 12) {
    fx.emit(v.x + rnd() * 0.7, v.y + v.tall * 0.6, v.z + rnd() * 0.7, rnd() * 0.4, 1.2 + Math.random(), rnd() * 0.4, Math.random() < 0.35 ? EMBER_HOT : EMBER, 0.06, 0.45, -0.5);
  }
  if (e.poisonT > 0 && Math.random() < dt * 8) fx.emit(v.x + (Math.random() - 0.5) * 0.4, v.y + 0.4, v.z, 0, 1.2, 0, 0x8ee04a, 0.07, 0.6, -1, false);
  return v.tint;
}
