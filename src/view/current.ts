// The current in the ground's seams (split out of terrain.ts): the idle pulse from the reactor, the
// flash on a skill, a boss or the win, the surge while a lasting skill runs, the odd arc between
// seams, and the calm while the village is up. The ice shader reads GROUND_CURRENT and GROUND_CALM.

import * as THREE from 'three';

/**
 * The current in the ground's seams, shared by reference with the ice shader: x is how far from the
 * fort the idle pulse's front is (off the board when none runs), y the whole web's flash (0..1), z
 * the time for the flicker. Driven by animateCurrent; nothing is redrawn, only these three numbers.
 */
export const GROUND_CURRENT = { value: new THREE.Vector3(-20, 0, 0) };
/** 0..1, how far the ground has quietened for the village (groundCalm): the painted scorches and
 *  wreckage fade and the crystals dim, so the chapter route's nodes stand on a calm field. */
export const GROUND_CALM = { value: 0 };
let crystalMat: THREE.MeshStandardMaterial | null = null;
let poolMat: THREE.MeshBasicMaterial | null = null;

/** How often an idle pulse runs out from the reactor (seconds, plus up to two more at random), and how long it takes. */
const PULSE_EVERY = 6;
const PULSE_TIME = 1.7;
/** A short arc between two seams now and then: seconds between (plus as much again at random), and how long one shows. */
const ARC_EVERY = 7;
const ARC_TIME = 0.13;
/** While a lasting skill runs the fort lends the hero its power: the web glows and shimmers the whole
 *  time, pulses run out back to back and quicker, and arcs crackle often. How bright the steady glow
 *  is, the pulse's gap and run (seconds), and the gap between arcs (plus as much again at random). */
const SURGE_GLOW = 0.4;
const SURGE_PULSE_EVERY = 0.75;
const SURGE_PULSE_TIME = 0.9;
const SURGE_ARC_EVERY = 0.3;
const current = { last: 0, flash: 0, surge: 0, on: false, calm: 0, calmOn: false, pulseAt: -99, pulseLen: PULSE_TIME, nextPulse: 2, arcAt: -99, nextArc: 4 };
let arc: THREE.Group | null = null;

/** The crystals' material and their pools of light, which dim while the village is up (makeCrystals). */
export function calmWith(crystal: THREE.MeshStandardMaterial, pool: THREE.MeshBasicMaterial): void {
  crystalMat = crystal;
  poolMat = pool;
}

/** Light the whole web of seams at once (a skill, a boss, the win); `k` is how bright, 0..1. */
export function groundFlash(k = 1): void {
  current.flash = Math.max(current.flash, k);
  current.nextArc = Math.min(current.nextArc, current.last + 0.05);
}

/** Whether a lasting skill is running (main.ts, every frame): the current surges while it is. */
export function groundSurge(on: boolean): void {
  if (on && !current.on) {
    // The first surge pulse and arc go at once, not after the idle gap.
    current.nextPulse = Math.min(current.nextPulse, current.last);
    current.nextArc = Math.min(current.nextArc, current.last + 0.05);
  }
  current.on = on;
}

/** Whether the village is up (main.ts, every frame): the ground's marks and crystals quieten while it is. */
export function groundCalm(on: boolean): void {
  current.calmOn = on;
}

/** Advance the current: the idle pulse, the flash fading, the surge, and the odd arc. `t` is the stage clock. */
export function animateCurrent(t: number): void {
  const c = current;
  const dt = Math.min(0.1, Math.max(0, t - c.last));
  c.last = t;
  c.flash = Math.max(0, c.flash - dt * 2.2);
  // In quickly, out a little slower, so the end of the skill is seen to drain away.
  c.surge = c.on ? Math.min(1, c.surge + dt * 4) : Math.max(0, c.surge - dt * 1.5);
  const calm = c.calmOn ? Math.min(1, c.calm + dt * 3) : Math.max(0, c.calm - dt * 3);
  if (calm !== c.calm) {
    c.calm = calm;
    GROUND_CALM.value = calm;
    if (crystalMat) crystalMat.emissiveIntensity = 0.75 * (1 - 0.6 * calm);
    if (poolMat) poolMat.opacity = 1 - 0.7 * calm;
  }
  if (t >= c.nextPulse) {
    c.pulseAt = t;
    c.pulseLen = c.on ? SURGE_PULSE_TIME : PULSE_TIME;
    c.nextPulse = t + (c.on ? SURGE_PULSE_EVERY : PULSE_EVERY + Math.random() * 2);
  }
  const p = (t - c.pulseAt) / c.pulseLen;
  GROUND_CURRENT.value.set(p < 1 ? 3.6 + p * 12 : -20, Math.max(c.flash * c.flash, c.surge * SURGE_GLOW), t);
  if (!arc) return;
  if (t >= c.nextArc) {
    c.arcAt = t;
    const gap = c.on ? SURGE_ARC_EVERY : ARC_EVERY;
    c.nextArc = t + gap + Math.random() * gap;
    strikeArc(arc);
  }
  const a = (t - c.arcAt) / ARC_TIME;
  arc.visible = a < 1;
  // It stutters while it shows, not a steady line.
  if (arc.visible) ((arc.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.random() < 0.3 ? 0.18 : 0.4;
}

/** The arc's two strips: a wide faint cyan halo under a thin white core, both lying on the ground. */
export function makeArc(): THREE.Group {
  const g = new THREE.Group();
  const mat = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  g.add(new THREE.Mesh(new THREE.BufferGeometry(), mat(0x30c8ff, 0.4)));
  g.add(new THREE.Mesh(new THREE.BufferGeometry(), mat(0xe8fbff, 0.75)));
  g.children[1].position.y = 0.005;
  g.visible = false;
  g.renderOrder = 2;
  arc = g;
  return g;
}

const ARC_POINTS = 8;
/** A new jagged path for the arc somewhere in the band round the fort, and its two strips along it. */
function strikeArc(g: THREE.Group): void {
  const a = Math.random() * Math.PI * 2;
  const r = 4.3 + Math.random() * 4;
  const x0 = Math.cos(a) * r;
  const z0 = Math.sin(a) * r;
  const d = a + Math.PI / 2 + (Math.random() - 0.5) * 1.2;
  const len = 1.5 + Math.random() * 1.3;
  const pts: [number, number][] = [];
  for (let i = 0; i < ARC_POINTS; i++) {
    const s = i / (ARC_POINTS - 1);
    const j = i === 0 || i === ARC_POINTS - 1 ? 0 : (Math.random() - 0.5) * 0.45;
    pts.push([x0 + Math.cos(d) * len * s - Math.sin(d) * j, z0 + Math.sin(d) * len * s + Math.cos(d) * j]);
  }
  strip(g.children[0] as THREE.Mesh, pts, 0.32);
  strip(g.children[1] as THREE.Mesh, pts, 0.07);
}

/** A flat strip `w` wide along `pts` at y 0.04. */
function strip(m: THREE.Mesh, pts: [number, number][], w: number): void {
  const pos = new Float32Array(pts.length * 6);
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[Math.max(0, i - 1)];
    const [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    // Thinner at the ends.
    const h = (w / 2) * (i === 0 || i === pts.length - 1 ? 0.3 : 1);
    const nx = (-(bz - az) / l) * h;
    const nz = ((bx - ax) / l) * h;
    pos.set([pts[i][0] + nx, 0.04, pts[i][1] + nz, pts[i][0] - nx, 0.04, pts[i][1] - nz], i * 6);
    if (i > 0) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
  }
  m.geometry.dispose();
  m.geometry = new THREE.BufferGeometry();
  m.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.geometry.setIndex(idx);
}
