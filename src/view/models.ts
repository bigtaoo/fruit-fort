// Procedural low-poly stand-ins for the art list (§16): toon-shaded fruits with faces, the pest
// army, the three heroes and the farm props. Built from primitives so the first package stays tiny;
// a real modelled asset can replace any builder later without touching the sim.
//
// Conventions: every model faces +z (towards the camera), stands on y = 0 and is about one unit
// across, so callers scale it by the unit's size. Parts that animate are tagged in userData.

import * as THREE from 'three';
import { ENEMIES, FRUITS } from '../sim/config';
import type { EnemyKind, FruitKind, HeroKind } from '../sim/types';

// --- Materials -------------------------------------------------------------------------------

/** Three-band toon ramp shared by every lit material. */
const RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const toonCache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: number, opts: { emissive?: number; map?: THREE.Texture; opacity?: number } = {}): THREE.MeshToonMaterial {
  const key = `${color}:${opts.emissive ?? 0}:${opts.map?.id ?? -1}:${opts.opacity ?? 1}`;
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: RAMP, emissive: opts.emissive ?? 0, map: opts.map ?? null });
    if (opts.opacity !== undefined && opts.opacity < 1) {
      m.transparent = true;
      m.opacity = opts.opacity;
      m.depthWrite = false;
    }
    toonCache.set(key, m);
  }
  return m;
}

const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x2b1d14, side: THREE.BackSide });

/** Hide every outline at once (low quality, §15.6): the hull meshes stay but are skipped. */
export function setOutlines(on: boolean): void {
  OUTLINE.visible = on;
}

/** A toon mesh with an inverted-hull outline; `line` 0 skips the outline for tiny parts. */
function part(geo: THREE.BufferGeometry, mat: THREE.Material, line = 0.05): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  if (line > 0) {
    const o = new THREE.Mesh(geo, OUTLINE);
    o.scale.setScalar(1 + line);
    m.add(o);
  }
  return m;
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

/** Faceted copy of a geometry: split vertices so each face gets its own normal. */
function faceted(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

function lerpColor(a: number, b: number, k: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
}

// --- Shared geometry -------------------------------------------------------------------------

const sphere = new THREE.SphereGeometry(1, 16, 12);
const lowSphere = new THREE.SphereGeometry(1, 10, 8);
const cone = new THREE.ConeGeometry(1, 1, 10);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const box = new THREE.BoxGeometry(1, 1, 1);
const WHITE = 0xffffff;
const BLACK = 0x1a1410;

function ball(r: number, color: number, line = 0.05, geo = sphere): THREE.Mesh {
  const m = part(geo, toon(color), line);
  m.scale.setScalar(r);
  return m;
}

/** Two cartoon eyes on the +z face of a body, centred at (0, y, z). */
function eyes(g: THREE.Object3D, y: number, z: number, spread: number, size: number): void {
  for (const s of [-1, 1]) {
    const white = at(ball(size, WHITE, 0.12), s * spread, y, z);
    const pupil = at(ball(0.55, BLACK, 0), 0, 0.05, 0.6);
    white.add(pupil);
    g.add(white);
  }
}

// --- Fruits ----------------------------------------------------------------------------------

/** Ripeness tier by level (§16.1): 1-2 green, 3-5 ripe, 6-7 golden. */
export function ripeness(level: number): 0 | 1 | 2 {
  return level <= 2 ? 0 : level <= 5 ? 1 : 2;
}

function fruitColor(kind: FruitKind, tier: number): number {
  const c = FRUITS[kind].color;
  return tier === 0 ? lerpColor(c, 0x9ccc4a, 0.45) : c;
}

function fruitMat(kind: FruitKind, tier: number, map?: THREE.Texture): THREE.MeshToonMaterial {
  return toon(map ? (tier === 0 ? 0xc8f0a0 : WHITE) : fruitColor(kind, tier), { emissive: tier === 2 ? 0x4a3300 : 0, map });
}

const strawberryGeo = new THREE.LatheGeometry(
  [[0, 0], [0.12, 0.05], [0.3, 0.25], [0.43, 0.52], [0.45, 0.72], [0.36, 0.9], [0.18, 0.98], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y)),
  14,
);

let melonMap: THREE.CanvasTexture | null = null;
function melonStripes(): THREE.CanvasTexture {
  if (melonMap) return melonMap;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7ccf6a';
  g.fillRect(0, 0, 64, 4);
  g.fillStyle = '#2f7a30';
  for (let i = 0; i < 8; i++) g.fillRect(i * 8, 0, 4, 4);
  melonMap = new THREE.CanvasTexture(c);
  melonMap.colorSpace = THREE.SRGBColorSpace;
  return melonMap;
}

function leaves(g: THREE.Object3D, y: number, n: number, len: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const leaf = part(cone, toon(0x3d9a3a), 0.08);
    leaf.scale.set(0.09, len, 0.05);
    leaf.position.set(Math.cos(a) * len * 0.45, y, Math.sin(a) * len * 0.45);
    leaf.rotation.set(0, -a, Math.PI / 2 - 0.35);
    g.add(leaf);
  }
}

function buildFruitBody(kind: FruitKind, tier: number): THREE.Group {
  const g = new THREE.Group();
  const mat = fruitMat(kind, tier, kind === 'watermelon' ? melonStripes() : undefined);
  switch (kind) {
    case 'strawberry': {
      g.add(part(strawberryGeo, mat));
      const seed = toon(0xffe27a);
      for (let i = 0; i < 18; i++) {
        const y = 0.2 + (i % 6) * 0.12;
        const a = i * 2.4;
        const r = y < 0.5 ? 0.12 + y * 0.6 : 0.43;
        const s = at(part(lowSphere, seed, 0), Math.cos(a) * r, y, Math.sin(a) * r);
        s.scale.setScalar(0.03);
        g.add(s);
      }
      leaves(g, 0.98, 5, 0.32);
      eyes(g, 0.6, 0.4, 0.13, 0.08);
      break;
    }
    case 'coconut': {
      const b = at(part(faceted(new THREE.IcosahedronGeometry(1, 1)), mat), 0, 0.46, 0);
      b.scale.setScalar(0.46);
      g.add(b);
      for (const [x, z] of [[-0.08, -0.06], [0.08, -0.06], [0, 0.08]]) g.add(at(ball(0.045, 0x3a2414, 0), x, 0.92, z));
      eyes(g, 0.5, 0.42, 0.14, 0.08);
      break;
    }
    case 'watermelon': {
      const b = at(part(sphere, mat), 0, 0.45, 0);
      b.scale.set(0.58, 0.45, 0.5);
      b.rotation.z = Math.PI / 2; // stripes run end to end
      g.add(b);
      const stem = at(part(cyl, toon(0x6b4a2a), 0), 0, 0.92, 0);
      stem.scale.set(0.03, 0.1, 0.03);
      g.add(stem);
      eyes(g, 0.5, 0.45, 0.15, 0.08);
      break;
    }
    case 'grape': {
      const spots: [number, number, number][] = [[0, 0.22, 0.04]];
      for (let i = 0; i < 3; i++) spots.push([Math.cos(i * 2.1 + 0.5) * 0.18, 0.46, Math.sin(i * 2.1 + 0.5) * 0.18]);
      for (let i = 0; i < 4; i++) spots.push([Math.cos(i * 1.57) * 0.26, 0.72, Math.sin(i * 1.57) * 0.26]);
      for (const [x, y, z] of spots) {
        const berry = at(part(sphere, mat, 0.06), x, y, z);
        berry.scale.setScalar(0.17);
        g.add(berry);
      }
      const front = at(new THREE.Group(), 0, 0.5, 0.3);
      eyes(front, 0, 0, 0.1, 0.07);
      g.add(front);
      const stem = at(part(cyl, toon(0x6b4a2a), 0), 0, 0.95, 0);
      stem.scale.set(0.03, 0.18, 0.03);
      g.add(stem);
      leaves(g, 0.92, 2, 0.28);
      break;
    }
    case 'lemon': {
      const b = at(part(sphere, mat), 0, 0.42, 0);
      b.scale.set(0.55, 0.4, 0.42);
      g.add(b);
      for (const s of [-1, 1]) {
        const nub = at(part(cone, mat, 0.04), s * 0.58, 0.42, 0);
        nub.scale.set(0.1, 0.14, 0.1);
        nub.rotation.z = -s * Math.PI / 2;
        g.add(nub);
      }
      eyes(g, 0.48, 0.38, 0.14, 0.08);
      break;
    }
  }
  return g;
}

const GOLD = 0xf2c230;

/** A fruit at its level: the body by ripeness tier, a crown from level 5 and a halo at 7. */
export function makeFruitModel(kind: FruitKind, level: number): THREE.Group {
  const g = buildFruitBody(kind, ripeness(level));
  if (level >= 5) {
    const crown = at(new THREE.Group(), 0, 1.02, 0);
    const band = part(new THREE.CylinderGeometry(0.18, 0.16, 0.08, 10), toon(GOLD, { emissive: 0x403000 }), 0.06);
    crown.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = at(part(cone, toon(GOLD, { emissive: 0x403000 }), 0), Math.cos(a) * 0.15, 0.1, Math.sin(a) * 0.15);
      spike.scale.set(0.05, 0.12, 0.05);
      crown.add(spike);
    }
    g.add(crown);
  }
  if (level >= 7) {
    const halo = at(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 24), toon(0xfff3a0, { emissive: 0x806000 })), 0, 1.35, 0);
    halo.rotation.x = Math.PI / 2;
    halo.userData.spin = true;
    g.add(halo);
  }
  return g;
}

// --- Enemies ---------------------------------------------------------------------------------

function caterpillar(color: number): THREE.Group {
  const g = new THREE.Group();
  const segs: THREE.Object3D[] = [];
  const alt = lerpColor(color, 0xfff080, 0.4);
  for (let i = 0; i < 5; i++) {
    const s = at(ball(0.3, i % 2 ? alt : color), 0, 0.3, -0.85 + i * 0.32);
    g.add(s);
    segs.push(s);
  }
  const head = at(ball(0.36, color), 0, 0.42, 0.75);
  g.add(head);
  segs.push(head);
  eyes(g, 0.52, 1.02, 0.14, 0.1);
  for (const s of [-1, 1]) {
    const ant = at(part(cyl, toon(BLACK), 0), s * 0.12, 0.85, 0.7);
    ant.scale.set(0.02, 0.3, 0.02);
    ant.rotation.z = s * 0.4;
    g.add(ant);
  }
  g.userData.segs = segs;
  return g;
}

function beetle(color: number): THREE.Group {
  const g = new THREE.Group();
  const shell = at(part(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(color)), 0, 0.15, -0.05);
  shell.scale.set(0.5, 0.45, 0.6);
  g.add(shell);
  const seam = at(new THREE.Mesh(box, toon(lerpColor(color, BLACK, 0.5))), 0, 0.42, -0.05);
  seam.scale.set(0.03, 0.06, 1.0);
  g.add(seam);
  const head = at(ball(0.24, lerpColor(color, BLACK, 0.4)), 0, 0.25, 0.58);
  g.add(head);
  const horn = at(part(cone, toon(lerpColor(color, BLACK, 0.4)), 0.05), 0, 0.42, 0.75);
  horn.scale.set(0.07, 0.3, 0.07);
  horn.rotation.x = 0.6;
  g.add(horn);
  eyes(g, 0.32, 0.76, 0.11, 0.07);
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) for (const z of [-0.3, 0, 0.3]) {
    const leg = at(part(cyl, toon(BLACK), 0), s * 0.5, 0.1, z);
    leg.scale.set(0.035, 0.3, 0.035);
    leg.rotation.z = s * 1.1;
    g.add(leg);
    legs.push(leg);
  }
  g.userData.legs = legs;
  return g;
}

function crow(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = at(ball(1, color), 0, 0, 0);
  body.scale.set(0.35, 0.3, 0.55);
  g.add(body);
  const head = at(ball(0.25, color), 0, 0.2, 0.5);
  g.add(head);
  const beak = at(part(cone, toon(0xf0a020), 0.06), 0, 0.17, 0.8);
  beak.scale.set(0.08, 0.22, 0.08);
  beak.rotation.x = Math.PI / 2;
  g.add(beak);
  eyes(g, 0.28, 0.68, 0.11, 0.07);
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = at(new THREE.Group(), s * 0.25, 0.1, 0);
    const wing = at(part(box, toon(lerpColor(color, 0x555566, 0.3)), 0.06), s * 0.4, 0, 0);
    wing.scale.set(0.8, 0.05, 0.45);
    pivot.add(wing);
    pivot.userData.side = s;
    g.add(pivot);
    wings.push(pivot);
  }
  const tail = at(part(box, toon(color), 0.06), 0, 0.05, -0.6);
  tail.scale.set(0.3, 0.04, 0.3);
  g.add(tail);
  g.userData.wings = wings;
  return g;
}

function snail(color: number): THREE.Group {
  const g = new THREE.Group();
  const foot = at(part(new THREE.CapsuleGeometry(0.22, 1.0, 4, 10), toon(0xd9c08a)), 0, 0.2, 0.05);
  foot.rotation.x = Math.PI / 2;
  foot.scale.set(1, 1, 0.8);
  g.add(foot);
  const shell = at(ball(0.48, color), 0, 0.62, -0.18);
  g.add(shell);
  const swirl = at(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 20), toon(lerpColor(color, 0xf0d0a0, 0.5))), 0.42, 0.62, -0.18);
  swirl.rotation.y = Math.PI / 2;
  g.add(swirl);
  const swirl2 = at(swirl.clone(), -0.42, 0.62, -0.18);
  g.add(swirl2);
  for (const s of [-1, 1]) {
    const stalk = at(part(cyl, toon(0xd9c08a), 0), s * 0.1, 0.5, 0.62);
    stalk.scale.set(0.035, 0.4, 0.035);
    stalk.rotation.z = s * 0.25;
    g.add(stalk);
    const eye = at(ball(0.08, WHITE, 0.12), s * 0.15, 0.72, 0.64);
    eye.add(at(ball(0.55, BLACK, 0), 0, 0, 0.6));
    g.add(eye);
  }
  return g;
}

function mold(color: number): THREE.Group {
  const g = new THREE.Group();
  const blobs: THREE.Object3D[] = [];
  for (const [x, y, z, r] of [[0, 0.45, 0, 0.45], [0.3, 0.3, -0.1, 0.3], [-0.32, 0.28, -0.05, 0.28], [0.1, 0.75, -0.15, 0.28], [-0.15, 0.25, 0.3, 0.22]]) {
    const b = at(ball(r, blobs.length % 2 ? lerpColor(color, 0xe0f0c0, 0.3) : color), x, y, z);
    g.add(b);
    blobs.push(b);
  }
  eyes(g, 0.55, 0.42, 0.14, 0.09);
  g.userData.blobs = blobs;
  return g;
}

function spore(color: number): THREE.Group {
  const g = new THREE.Group();
  const b = at(ball(0.5, color), 0, 0.5, 0);
  g.add(b);
  eyes(g, 0.62, 0.45, 0.16, 0.12);
  g.userData.blobs = [b];
  return g;
}

function locust(color: number, crown: boolean): THREE.Group {
  const g = new THREE.Group();
  const body = at(part(new THREE.CapsuleGeometry(0.2, 0.8, 4, 10), toon(color)), 0, 0.35, -0.05);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const head = at(ball(0.24, lerpColor(color, 0xffffff, 0.15)), 0, 0.45, 0.55);
  g.add(head);
  eyes(g, 0.52, 0.74, 0.12, 0.08);
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const thigh = at(part(box, toon(lerpColor(color, BLACK, 0.25)), 0.05), s * 0.25, 0.45, -0.35);
    thigh.scale.set(0.08, 0.5, 0.12);
    thigh.rotation.x = -0.9;
    g.add(thigh);
    legs.push(thigh);
    const wing = at(part(box, toon(0xe8f0c0, { opacity: 0.75 }), 0), s * 0.12, 0.58, -0.25);
    wing.scale.set(0.18, 0.02, 0.8);
    wing.rotation.z = s * 0.25;
    g.add(wing);
  }
  if (crown) {
    const c = at(new THREE.Group(), 0, 0.68, 0.55);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = at(part(cone, toon(GOLD, { emissive: 0x403000 }), 0.05), Math.cos(a) * 0.13, 0.08, Math.sin(a) * 0.13);
      spike.scale.set(0.06, 0.18, 0.06);
      c.add(spike);
    }
    g.add(c);
  }
  g.userData.legs = legs;
  return g;
}

/** An enemy model one unit long; scale it by the enemy's size. */
export function makeEnemyModel(kind: EnemyKind): THREE.Group {
  const color = ENEMIES[kind].color;
  switch (kind) {
    case 'caterpillar': return caterpillar(color);
    case 'beetle': return beetle(color);
    case 'crow': return crow(color);
    case 'snail': return snail(color);
    case 'mold': return mold(color);
    case 'spore': return spore(color);
    case 'locust': return locust(color, false);
    case 'boss': return locust(color, true);
  }
}

/** Per-frame procedural animation: wiggle, walk, flap, wobble. `t` is a running clock, `seed` varies the phase. */
export function animateEnemy(g: THREE.Object3D, t: number, seed: number, chewing: boolean): void {
  const ph = t * (chewing ? 14 : 8) + seed;
  const d = g.userData;
  if (d.segs) (d.segs as THREE.Object3D[]).forEach((s, i) => (s.position.y = (i === d.segs.length - 1 ? 0.42 : 0.3) + Math.max(0, Math.sin(ph - i * 0.9)) * 0.1));
  if (d.legs) (d.legs as THREE.Object3D[]).forEach((l, i) => (l.rotation.x = (l.userData.base ??= l.rotation.x) + Math.sin(ph + i * 1.7) * 0.35));
  if (d.wings) for (const w of d.wings as THREE.Object3D[]) w.rotation.z = w.userData.side * Math.sin(t * 16 + seed) * 0.7;
  if (d.blobs) (d.blobs as THREE.Object3D[]).forEach((b, i) => {
    const base = (b.userData.r ??= b.scale.x);
    const k = 1 + Math.sin(ph * 0.7 + i) * 0.08;
    b.scale.set(base * k, base / k, base * k);
  });
  // Chewing enemies nod into the wall.
  g.rotation.x = chewing ? Math.max(0, Math.sin(ph)) * 0.25 : 0;
}

// --- Heroes ----------------------------------------------------------------------------------

const SKIN = 0xf5c99b;

/** A chibi hero about 1.6 tall: body, head with eyes, arms, and the job's hat. */
export function makeHeroModel(kind: HeroKind): THREE.Group {
  const g = new THREE.Group();
  const outfit = { farmer: 0x3a6fd8, beekeeper: 0xe8b020, chef: 0xf4f4f4 }[kind];
  const body = at(part(new THREE.CylinderGeometry(0.3, 0.42, 0.75, 14), toon(outfit)), 0, 0.38, 0);
  g.add(body);
  const head = at(ball(0.34, SKIN), 0, 1.0, 0);
  g.add(head);
  eyes(g, 1.04, 0.3, 0.12, 0.075);
  const cheeks = toon(0xf09a8a);
  for (const s of [-1, 1]) {
    const ch = at(new THREE.Mesh(sphere, cheeks), s * 0.2, 0.93, 0.26);
    ch.scale.set(0.06, 0.035, 0.03);
    g.add(ch);
  }
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = at(new THREE.Group(), s * 0.34, 0.62, 0);
    const arm = at(part(new THREE.CapsuleGeometry(0.08, 0.3, 4, 8), toon(outfit)), 0, -0.2, 0);
    pivot.add(arm);
    pivot.add(at(ball(0.09, SKIN, 0.06), 0, -0.42, 0));
    pivot.rotation.z = s * 0.25;
    pivot.userData.side = s;
    g.add(pivot);
    arms.push(pivot);
  }
  g.userData.arms = arms;
  if (kind === 'farmer') {
    const straw = toon(0xe8c547);
    const brim = at(part(cyl, straw), 0, 1.25, 0);
    brim.scale.set(0.58, 0.04, 0.58);
    const top = at(part(new THREE.CylinderGeometry(0.24, 0.3, 0.22, 12), straw), 0, 1.36, 0);
    const band = at(new THREE.Mesh(cyl, toon(0xc0392b)), 0, 1.29, 0);
    band.scale.set(0.305, 0.06, 0.305);
    const straps = at(new THREE.Mesh(box, toon(0x2a4f9a)), 0, 0.55, 0.3);
    straps.scale.set(0.34, 0.3, 0.05);
    g.add(brim, top, band, straps);
  } else if (kind === 'beekeeper') {
    const brim = at(part(cyl, toon(WHITE)), 0, 1.24, 0);
    brim.scale.set(0.62, 0.04, 0.62);
    const top = at(part(new THREE.CylinderGeometry(0.3, 0.34, 0.2, 12), toon(WHITE)), 0, 1.34, 0);
    const veil = at(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.35, 16, 1, true), toon(0xffffff, { opacity: 0.35 })), 0, 1.06, 0);
    const stripe = at(new THREE.Mesh(cyl, toon(0x2b2b2b)), 0, 0.42, 0);
    stripe.scale.set(0.37, 0.08, 0.37);
    g.add(brim, top, veil, stripe);
  } else {
    const hatMat = toon(WHITE);
    const band = at(part(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 14), hatMat), 0, 1.33, 0);
    const puff = at(ball(0.36, WHITE), 0, 1.6, 0);
    puff.scale.set(0.38, 0.28, 0.38);
    const scarf = at(new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 6, 16), toon(0xd8402f)), 0, 0.74, 0);
    scarf.rotation.x = Math.PI / 2;
    g.add(band, puff, scarf);
  }
  return g;
}

/** Idle sway, and arms up while the skill runs. */
export function animateHero(g: THREE.Object3D, t: number, casting: boolean): void {
  g.position.y = Math.abs(Math.sin(t * (casting ? 8 : 2))) * (casting ? 0.12 : 0.04);
  for (const a of (g.userData.arms ?? []) as THREE.Object3D[]) {
    const s = a.userData.side as number;
    a.rotation.z = casting ? s * (2.6 + Math.sin(t * 12) * 0.2) : s * (0.25 + Math.sin(t * 2) * 0.06);
  }
}

// --- Farm props ------------------------------------------------------------------------------

export function makeTree(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const trunk = at(part(cyl, toon(0x7a5230)), 0, 0.6, 0);
  trunk.scale.set(0.18, 1.2, 0.18);
  g.add(trunk);
  const leafColor = [0x4f9e3a, 0x5aae44, 0x3f8a34][Math.floor(rng() * 3)];
  if (rng() < 0.5) {
    for (let i = 0; i < 3; i++) {
      const c = at(part(cone, toon(leafColor)), 0, 1.3 + i * 0.5, 0);
      c.scale.set(0.9 - i * 0.22, 0.9, 0.9 - i * 0.22);
      g.add(c);
    }
  } else {
    for (const [x, y, z, r] of [[0, 1.6, 0, 0.75], [0.4, 1.35, 0.1, 0.5], [-0.35, 1.4, -0.1, 0.5]]) g.add(at(ball(r, leafColor, 0.04, lowSphere), x, y, z));
  }
  return g;
}

export function makeRock(rng: () => number): THREE.Mesh {
  const r = part(faceted(new THREE.DodecahedronGeometry(1, 0)), toon(0x9a9a92));
  r.scale.set(0.4 + rng() * 0.4, 0.3 + rng() * 0.25, 0.4 + rng() * 0.3);
  r.position.y = 0.15;
  r.rotation.y = rng() * 6;
  return r;
}

export function makeBush(rng: () => number, flowers: boolean): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(at(ball(0.35 + rng() * 0.15, 0x4c9a3c, 0.04, lowSphere), (i - 1) * 0.35, 0.3, rng() * 0.2));
  if (flowers) {
    const c = [0xff7aa8, 0xffe066, 0xffffff][Math.floor(rng() * 3)];
    for (let i = 0; i < 6; i++) g.add(at(ball(0.07, c, 0), (rng() - 0.5) * 1, 0.55 + rng() * 0.15, 0.2 + rng() * 0.2));
  }
  return g;
}

export function makeHay(): THREE.Group {
  const g = new THREE.Group();
  const bale = at(part(cyl, toon(0xe2c062)), 0, 0.35, 0);
  bale.scale.set(0.45, 0.7, 0.45);
  bale.rotation.z = Math.PI / 2;
  g.add(bale);
  return g;
}

export function makeBarn(): THREE.Group {
  const g = new THREE.Group();
  const walls = at(part(box, toon(0xc0392b)), 0, 1.1, 0);
  walls.scale.set(3, 2.2, 2.4);
  const roof = at(part(new THREE.CylinderGeometry(1.5, 1.5, 3.2, 3), toon(0x5a3a2a)), 0, 2.6, 0);
  roof.rotation.z = Math.PI / 2;
  roof.scale.set(1, 1, 0.75);
  const door = at(new THREE.Mesh(box, toon(0xf4f0e0)), 0, 0.75, 1.21);
  door.scale.set(1.0, 1.5, 0.02);
  g.add(walls, roof, door);
  return g;
}
