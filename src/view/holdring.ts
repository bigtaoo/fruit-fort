// The guide's hold (§12.2): the bugs stop outside the fence while the guide waits, and a dashed cyan
// circle on the ground there, so the player sees they are waiting.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from '../sim/world';
import type { Stage } from './scene';

/** Dashes round the hold ring, and how much of each step a dash fills. */
const HOLD_DASHES = 48;
const HOLD_FILL = 0.55;

/** A flat dashed ring of radius 1 lying at height `y`, in the guide's cyan. */
export function makeHoldRing(y: number): THREE.Mesh {
  const step = (Math.PI * 2) / HOLD_DASHES;
  const dashes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < HOLD_DASHES; i++) dashes.push(new THREE.RingGeometry(0.985, 1.015, 3, 1, i * step, step * HOLD_FILL));
  const mat = new THREE.MeshBasicMaterial({ color: 0x30d8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(mergeGeometries(dashes), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = y;
  ring.visible = false;
  ring.renderOrder = 1;
  return ring;
}

/**
 * The hold ring: fades in at `radius` while the guide holds the bugs (`on`), turns slowly and
 * breathes so it reads as waiting, and fades out once they walk on. `dt` in seconds.
 */
export function holdRing(stage: Stage, on: boolean, radius: number, dt: number, t: number): void {
  const ring = stage.hold;
  const state = ring.userData as { a?: number };
  const a = Math.min(1, Math.max(0, (state.a ?? 0) + (on ? dt / 0.4 : -dt / 0.3)));
  state.a = a;
  ring.visible = a > 0;
  if (!a) return;
  ring.rotation.z = t * 0.12;
  // Breathes deep and slow, a little wider on each breath, so it reads as waiting (§12.2).
  const b = Math.sin(t * 2.4);
  ring.scale.setScalar(radius * (1 + 0.015 * b));
  (ring.material as THREE.MeshBasicMaterial).opacity = a * (0.6 + 0.4 * b);
}

/** How close to the fence bugs come while the guide holds them (§12.2): the tank reaches them driving past. */
export const GUIDE_NEAR = 2;

/** Holds the bugs while the guide waits (§12.2); when they walk on, once a run, `onGo` says so. */
export class GuideHold {
  /** The guide held the bugs last frame, and the run whose banner already said they walk on. */
  private held = false;
  private wentOn: World | null = null;

  update(w: World, on: boolean, onGo: () => void): void {
    if (this.held && !on && !w.over && this.wentOn !== w) {
      this.wentOn = w;
      onGo();
    }
    this.held = on;
    w.holdAt = on ? GUIDE_NEAR : null;
  }
}
