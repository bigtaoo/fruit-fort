// A wagon at work (§10.1.11): each kind shows it in its own way, small and on its own body, so four
// wagons on the rail do not light up the board (hand test 2026-11-11: one big light and ring per
// wagon was too bright and all looked the same).
//   arc      sparks climb the coil as it charges; charged, little arcs crackle off the tip
//   missile  the rack empties on a launch and reloads warhead by warhead; a full rack glows armed
//   frost    the tank sheds cold mist that sinks to the ground, with glints of ice
//   plasma   the side nozzles spit embers with every pulse; the core flickers
//   mine     a lamp on the drum blinks faster as the next mine comes; a drop kicks up dust behind
//   magnet   gold sparks are pulled in between the poles
// The reload is read from the sim wagon's clock (`t` counts down, a jump up is a shot); the sim is unchanged.

import type * as THREE from 'three';
import { WAGONS } from '../sim/cards';
import type { WagonKind } from '../sim/types';
import type { Fx } from './fx';

/** What work needs of a car on the board. */
export interface WorkCar {
  kind: WagonKind;
  lv: number;
  group: THREE.Group;
  /** The sim wagon's reload clock last frame: a jump up means it just fired. */
  lastT: number;
  /** View clock of its last shot, for the kick and the flash. */
  shot: number;
}

/** Seconds a wagon's kick lasts when it fires. */
const KICK = 0.2;
/** The deck's top in model units: the kind's parts stand on it (makeWagon's `top`). */
const DECK = 0.28;

const reload = (k: WagonKind): number => (k === 'arc' || k === 'missile' || k === 'plasma' || k === 'mine' ? WAGONS[k].every : 0);
const rnd = (s = 1) => (Math.random() - 0.5) * s;

/** A point on the wagon's model (model units, nose +z) on the board. */
const P = { x: 0, y: 0, z: 0 };
function at(g: THREE.Group, x: number, y: number, z: number): typeof P {
  const s = g.scale.x;
  const c = Math.cos(g.rotation.y);
  const n = Math.sin(g.rotation.y);
  P.x = g.position.x + (x * c + z * n) * s;
  P.y = g.position.y + y * s;
  P.z = g.position.z + (-x * n + z * c) * s;
  return P;
}

/** Board-space size of a model-space direction's step, for velocities: the wagon's own scale and turn. */
function dir(g: THREE.Group, x: number, z: number): [number, number] {
  const c = Math.cos(g.rotation.y);
  const n = Math.sin(g.rotation.y);
  return [x * c + z * n, -x * n + z * c];
}

/** The wagon's work this frame; returns the kick (0..1) of a shot just fired. */
export function work(fx: Fx, car: WorkCar, sim: { t: number; lv: number }, clock: number, dt: number, color: number): number {
  const every = reload(car.kind);
  const fired = every > 0 && sim.t > car.lastT + 0.05;
  car.lastT = sim.t;
  if (fired) car.shot = clock;
  // Charged share of the reload; frost and magnet work all the time.
  const k = every ? Math.min(1, Math.max(0, 1 - sim.t / every)) : 1;
  const since = clock - car.shot;
  const flash = since < KICK ? 1 - since / KICK : 0;
  const g = car.group;
  const tl = car.lv >= 3 ? 1.3 : 1;
  const live = dt > 0;
  switch (car.kind) {
    case 'arc': {
      // `at` reuses one point: keep the tip's own copy, the sparks below move it.
      const tip = { ...at(g, 0, DECK + 0.45 * tl, 0) };
      fx.hold(tip.x, tip.y, tip.z, 0.14 + 0.12 * k + 0.3 * flash, color, 0.2 + 0.25 * k + 0.4 * flash);
      if (fired) fx.puff(tip.x, tip.y, tip.z, 0xe0f8ff, { size: 0.45, grow: 1.4, life: 0.14, rise: 0, glow: true, opacity: 0.6 });
      if (!live) break;
      // Sparks run up the coil, more as it fills.
      if (Math.random() < dt * (2 + 10 * k) * (car.lv >= 2 ? 1.5 : 1)) {
        const p = at(g, rnd(0.2), DECK + Math.random() * 0.42 * tl, rnd(0.2));
        fx.emit(p.x, p.y, p.z, 0, 1.2, 0, Math.random() < 0.4 ? 0xffffff : color, 0.035, 0.16, 0, true);
      }
      // Charged: a little arc jumps off the tip now and then.
      if (k >= 1 && Math.random() < dt * 3) {
        const [vx, vz] = dir(g, rnd(1), rnd(1));
        const { x, y, z } = tip;
        for (let i = 1; i <= 4; i++) fx.emit(x + vx * 0.12 * i + rnd(0.06), y - 0.04 * i + rnd(0.06), z + vz * 0.12 * i + rnd(0.06), 0, 0, 0, i === 1 ? 0xffffff : color, 0.03, 0.1, 0, false);
      }
      break;
    }
    case 'missile': {
      // The rack empties on a launch and the reload loads it again, warhead by warhead (they slide
      // up out of their tubes); a full rack glows armed. The missiles themselves fly (units.ts).
      const heads = (g.userData.heads ?? []) as THREE.Object3D[];
      heads.forEach((h, i) => {
        const at0 = ((i + 1) / heads.length) * 0.9;
        const s = Math.max(0, Math.min(1, (k - at0 + 0.12) / 0.12));
        h.visible = s > 0;
        h.scale.setScalar(0.4 + 0.6 * s);
      });
      if (k >= 1) {
        const arm = 0.55 + 0.1 * Math.sin(clock * 6);
        for (const h of heads) {
          const p = at(g, h.position.x * tl, DECK + 0.32 * tl, 0.2 * tl);
          fx.hold(p.x, p.y, p.z, 0.1, 0x9cc0ff, arm);
        }
      }
      if (fired) {
        // Fire out of the tubes, smoke blown back over the deck.
        const f = at(g, 0, DECK + 0.4 * tl, 0.3 * tl);
        fx.puff(f.x, f.y, f.z, 0xe8f0ff, { size: 0.6, grow: 1.5, life: 0.16, rise: 0, glow: true, opacity: 0.9 });
        const p = at(g, 0, DECK + 0.1, -0.42);
        const [bx, bz] = dir(g, 0, -1);
        fx.puff(p.x, p.y, p.z, 0x8a96a6, { size: 0.7, grow: 2, life: 0.9, rise: 0.3, opacity: 0.45 });
        for (let i = 0; i < 6; i++) fx.emit(p.x, p.y, p.z, bx * 2.5 + rnd(1.2), 0.5 + rnd(0.6), bz * 2.5 + rnd(1.2), i % 3 ? 0x6f9cff : 0xffc080, 0.06, 0.25, 2);
      }
      break;
    }
    case 'frost': {
      if (!live) break;
      // Cold mist off the tank's ends, sinking to the rail.
      if (Math.random() < dt * 4) {
        const p = at(g, rnd(0.2), DECK + 0.1 * tl, (Math.random() < 0.5 ? -0.28 : 0.28) * tl);
        fx.puff(p.x, p.y, p.z, 0xe4f8ff, { size: 0.3, grow: 2, life: 1.1, rise: -0.25, opacity: 0.22 });
      }
      if (Math.random() < dt * 3) {
        const p = at(g, rnd(0.34), DECK + 0.16 * tl + rnd(0.3), rnd(0.5));
        fx.emit(p.x, p.y, p.z, 0, -0.2, 0, 0xffffff, 0.03, 0.3, 0, false);
      }
      break;
    }
    case 'plasma': {
      const core = at(g, 0, DECK + 0.24 * tl, 0);
      fx.hold(core.x, core.y, core.z, 0.16 + 0.08 * flash, color, 0.18 + 0.25 * flash);
      if (fired && live) {
        for (const s of [-1, 1]) {
          const p = at(g, s * 0.36 * tl, DECK + 0.1 * tl, 0);
          const [vx, vz] = dir(g, s * 1.6, rnd(0.8));
          fx.emit(p.x, p.y, p.z, vx, 0.3 + rnd(0.4), vz, Math.random() < 0.4 ? 0xffd070 : color, 0.045, 0.22, 0);
        }
      }
      break;
    }
    case 'mine': {
      // The lamp blinks faster as the next mine comes: once a second just after a drop, six at the end.
      const period = 1 - 0.83 * k;
      if ((clock % period) / period < 0.35 || flash > 0) {
        const p = at(g, 0, DECK + 0.23 * tl, 0.04 * tl);
        fx.hold(p.x, p.y, p.z, 0.12, 0xff5038, 0.75);
      }
      if (fired) {
        const p = at(g, 0, 0, -0.45);
        fx.puff(p.x, 0.15, p.z, 0x9aa4b0, { size: 0.5, grow: 1.6, life: 0.5, rise: 0.1, opacity: 0.35 });
      }
      break;
    }
    case 'magnet': {
      const c = at(g, 0, DECK + 0.12 * tl, 0);
      fx.hold(c.x, c.y, c.z, 0.16, color, 0.15 + 0.08 * Math.sin(clock * 2.5));
      if (live && Math.random() < dt * 3) {
        const a = Math.random() * Math.PI * 2;
        const r = WAGONS.magnet.reach[sim.lv - 1];
        fx.stream(c.x + Math.cos(a) * r, 0.4, c.z + Math.sin(a) * r, c.x, c.y, c.z, 0xffd84a, 1, 0.55, 0.045);
      }
      break;
    }
  }
  return every >= 1 ? flash : flash * 0.2;
}
