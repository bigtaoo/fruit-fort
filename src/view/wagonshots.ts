// The wagons' shots in flight (§10.1.13): a missile that looks like one, climbing off the rack and
// diving onto its bug in a smoke trail, and a mine lobbed high in a spin. The sim flies both flat at
// shot speed; only the drawn height (an arc over the flight) and the look are added here, so they
// land where and when the sim says.

import * as THREE from 'three';
import type { Projectile } from '../sim/types';
import type { Fx } from './fx';
import { glow } from './scifi';

const BLUE = 0x4f86ff;

/** Shared parts: a run fires hundreds of shots, and a removed mesh is not disposed. */
const PART = {
  body: new THREE.CylinderGeometry(0.06, 0.06, 0.34, 8).rotateX(Math.PI / 2),
  nose: new THREE.ConeGeometry(0.06, 0.14, 8).rotateX(Math.PI / 2).translate(0, 0, 0.24),
  fins: new THREE.BoxGeometry(0.22, 0.02, 0.08).translate(0, 0, -0.14),
  fins2: new THREE.BoxGeometry(0.02, 0.22, 0.08).translate(0, 0, -0.14),
  flame: new THREE.ConeGeometry(0.05, 0.22, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.27),
  mine: new THREE.CylinderGeometry(0.14, 0.17, 0.1, 10),
  lamp: new THREE.SphereGeometry(0.04, 6, 4).translate(0, 0.06, 0),
};
const MAT = {
  body: new THREE.MeshBasicMaterial({ color: 0xdfe8f5 }),
  nose: glow(BLUE, 1.6),
  fins: new THREE.MeshBasicMaterial({ color: BLUE }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  mine: new THREE.MeshBasicMaterial({ color: 0x8cff4a }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xff5038 }),
};

/** A wagon shot's mesh, or undefined for any other shooter's. Points down +z. */
export function wagonShot(p: Projectile): THREE.Object3D | undefined {
  if (p.kind === 'missile') {
    const g = new THREE.Group();
    for (const k of ['body', 'nose', 'fins', 'fins2', 'flame'] as const) g.add(new THREE.Mesh(PART[k], MAT[k === 'fins2' ? 'fins' : k]));
    g.scale.setScalar(1.3);
    g.userData.wagon = 'missile';
    return g;
  }
  if (p.kind === 'mine') {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(PART.mine, MAT.mine), new THREE.Mesh(PART.lamp, MAT.lamp));
    g.userData.wagon = 'mine';
    return g;
  }
  return undefined;
}

const prev = new THREE.Vector3();

/**
 * Lift a wagon shot onto its arc and turn it along its flight. `m.position` holds the sim's point
 * (flat); `ax, az` is where it is going. Height: from the rack, up over the middle, down on the bug.
 */
export function flyShot(fx: Fx, m: THREE.Object3D, ax: number, az: number, dt: number, clock: number): void {
  const u = m.userData;
  const left = Math.hypot(ax - m.position.x, az - m.position.z);
  if (u.d0 === undefined) u.d0 = Math.max(0.5, left);
  const q = Math.max(0, Math.min(1, 1 - left / u.d0));
  const mine = u.wagon === 'mine';
  const lift = (mine ? 1 + 0.25 * u.d0 : 0.6 + 0.3 * u.d0) * Math.sin(Math.PI * q);
  const y = (mine ? 1 - 0.9 * q : 1.1 - 0.6 * q) + lift;
  prev.set(u.px ?? m.position.x, u.py ?? y, u.pz ?? m.position.z);
  m.position.y = y;
  u.px = m.position.x;
  u.py = y;
  u.pz = m.position.z;
  if (mine) {
    m.rotation.x = clock * 9;
    m.rotation.z = clock * 6;
    if (dt > 0) fx.emit(m.position.x, y, m.position.z, 0, 0, 0, 0x8cff4a, 0.06, 0.18, 0);
    return;
  }
  // Nose along the flight: from last frame's point to this one (straight at the bug on the first).
  if (prev.distanceToSquared(m.position) > 1e-6) m.lookAt(m.position.x * 2 - prev.x, y * 2 - prev.y, m.position.z * 2 - prev.z);
  else m.lookAt(ax, 0.5, az);
  if (dt <= 0) return;
  const flame = m.children[4];
  flame.scale.set(1, 1, 0.8 + Math.random() * 0.5);
  // A thick trail: grey smoke that lingers and spreads, hot sparks at the nozzle.
  const tx = m.position.x - (m.position.x - prev.x) * 0.5;
  const tz = m.position.z - (m.position.z - prev.z) * 0.5;
  if (Math.random() < 0.6) fx.puff(tx, y, tz, 0xc4ccd8, { size: 0.28, grow: 2.2, life: 0.6, rise: 0.25, opacity: 0.4 });
  fx.emit(tx, y, tz, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, Math.random() < 0.5 ? 0xffc080 : 0xffffff, 0.06, 0.2, 0);
}
