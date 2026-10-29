// Procedural low-poly stand-ins for the art list (§16): the bugs raiding the picnic, the three toy
// heroes, the toy train, the cake and the picnic props. Built from primitives so the first package stays tiny;
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

/** An ant: head, thorax and a big abdomen in a row, six walking legs, bent feelers. */
function ant(color: number): THREE.Group {
  const g = new THREE.Group();
  const gaster = at(ball(1, color), 0, 0.38, -0.42);
  gaster.scale.set(0.32, 0.3, 0.4);
  g.add(gaster);
  g.add(at(ball(0.17, lerpColor(color, WHITE, 0.15)), 0, 0.36, 0.02));
  g.add(at(ball(0.26, color), 0, 0.46, 0.38));
  eyes(g, 0.56, 0.6, 0.12, 0.08);
  for (const s of [-1, 1]) {
    const stalk = at(part(cyl, toon(BLACK), 0), s * 0.1, 0.78, 0.48);
    stalk.scale.set(0.025, 0.3, 0.025);
    stalk.rotation.set(0.5, 0, s * 0.35);
    g.add(stalk);
    const tip = at(part(cyl, toon(BLACK), 0), s * 0.2, 0.9, 0.72);
    tip.scale.set(0.025, 0.25, 0.025);
    tip.rotation.set(1.3, 0, s * 0.2);
    g.add(tip);
    const jaw = at(part(cone, toon(BLACK), 0), s * 0.08, 0.36, 0.62);
    jaw.scale.set(0.04, 0.14, 0.04);
    jaw.rotation.set(Math.PI / 2, 0, -s * 0.5);
    g.add(jaw);
  }
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) for (const z of [-0.15, 0.02, 0.18]) {
    const leg = at(part(cyl, toon(BLACK), 0), s * 0.3, 0.2, z);
    leg.scale.set(0.03, 0.42, 0.03);
    leg.rotation.z = s * 1.0;
    g.add(leg);
    legs.push(leg);
  }
  g.userData.legs = legs;
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

/** A housefly: round dark body, big red eyes, two see-through wings that buzz. */
function fly(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = at(ball(1, color), 0, 0, -0.1);
  body.scale.set(0.3, 0.27, 0.45);
  g.add(body);
  for (let i = 0; i < 3; i++) {
    const band = at(new THREE.Mesh(new THREE.TorusGeometry(0.27 - i * 0.03, 0.025, 4, 16), toon(0x55606a)), 0, 0, -0.2 - i * 0.12);
    g.add(band);
  }
  g.add(at(ball(0.22, color), 0, 0.05, 0.4));
  for (const s of [-1, 1]) {
    const eye = at(ball(0.15, 0xc8302a, 0.06), s * 0.15, 0.12, 0.47);
    eye.add(at(ball(0.35, WHITE, 0), -s * 0.3, 0.45, 0.6));
    g.add(eye);
  }
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = at(new THREE.Group(), s * 0.15, 0.24, -0.05);
    const wing = at(part(sphere, toon(0xdff2ff, { opacity: 0.55 }), 0.04), s * 0.3, 0, -0.15);
    wing.scale.set(0.34, 0.02, 0.2);
    wing.rotation.y = -s * 0.5;
    pivot.add(wing);
    pivot.userData.side = s;
    g.add(pivot);
    wings.push(pivot);
  }
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
    case 'caterpillar': return ant(color);
    case 'beetle': return beetle(color);
    case 'crow': return fly(color);
    case 'snail': return snail(color);
    case 'mold': return mold(color);
    case 'spore': return spore(color);
    case 'locust': return locust(color, false);
    case 'boss': return locust(color, true);
  }
}

/** Per-frame procedural animation: walk, buzz, wobble. `t` is a running clock, `seed` varies the phase. */
export function animateEnemy(g: THREE.Object3D, t: number, seed: number, chewing: boolean): void {
  const ph = t * (chewing ? 14 : 8) + seed;
  const d = g.userData;
  if (d.legs) (d.legs as THREE.Object3D[]).forEach((l, i) => (l.rotation.x = (l.userData.base ??= l.rotation.x) + Math.sin(ph + i * 1.7) * 0.35));
  if (d.wings) for (const w of d.wings as THREE.Object3D[]) w.rotation.z = w.userData.side * Math.sin(t * 40 + seed) * 0.6;
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

/**
 * A toy hero about 1.6 tall with arms that wave (`userData.arms`): the tin soldier (farmer slot),
 * the wind-up robot (beekeeper slot) and the plush dinosaur (chef slot).
 */
export function makeHeroModel(kind: HeroKind): THREE.Group {
  const g = new THREE.Group();
  const outfit = { farmer: 0xd8402f, beekeeper: 0xa8b4c0, chef: 0x5cbf5a }[kind];
  const hand = { farmer: SKIN, beekeeper: 0x6a7480, chef: 0x5cbf5a }[kind];
  if (kind === 'beekeeper') {
    const body = at(part(box, toon(outfit)), 0, 0.4, 0);
    body.scale.set(0.62, 0.7, 0.5);
    const panel = at(new THREE.Mesh(box, toon(0x3a4a5a)), 0, 0.45, 0.26);
    panel.scale.set(0.34, 0.24, 0.02);
    const head = at(part(box, toon(outfit)), 0, 1.0, 0);
    head.scale.set(0.6, 0.48, 0.5);
    const visor = at(new THREE.Mesh(box, toon(0x22303c)), 0, 1.02, 0.26);
    visor.scale.set(0.46, 0.22, 0.02);
    const glow = new THREE.MeshBasicMaterial({ color: 0x7ff0ff });
    for (const s of [-1, 1]) {
      const eye = at(new THREE.Mesh(sphere, glow), s * 0.11, 1.02, 0.28);
      eye.scale.set(0.06, 0.06, 0.02);
      g.add(eye);
      const light = at(new THREE.Mesh(sphere, toon(s < 0 ? 0xff5a4a : 0x5ae07a)), s * 0.08, 0.45, 0.28);
      light.scale.set(0.045, 0.045, 0.02);
      g.add(light);
    }
    const stalk = at(new THREE.Mesh(cyl, toon(0x6a7480)), 0, 1.38, 0);
    stalk.scale.set(0.025, 0.28, 0.025);
    const bulb = at(ball(0.08, 0xff5a4a, 0.06), 0, 1.54, 0);
    const key = at(part(box, toon(GOLD)), 0, 0.5, -0.32);
    key.scale.set(0.3, 0.16, 0.04);
    g.add(body, panel, head, visor, stalk, bulb, key);
    g.userData.key = key;
  } else if (kind === 'chef') {
    const body = at(part(new THREE.CylinderGeometry(0.32, 0.42, 0.75, 14), toon(outfit)), 0, 0.38, 0);
    const belly = at(new THREE.Mesh(sphere, toon(0xd8f0a0)), 0, 0.38, 0.24);
    belly.scale.set(0.24, 0.3, 0.12);
    const head = at(ball(0.36, outfit), 0, 1.0, -0.02);
    const snout = at(ball(1, outfit), 0, 0.92, 0.26);
    snout.scale.set(0.26, 0.2, 0.22);
    eyes(g, 1.12, 0.26, 0.15, 0.08);
    for (const s of [-1, 1]) g.add(at(ball(0.025, BLACK, 0), s * 0.07, 0.96, 0.47));
    const spikes = toon(0xf2c230);
    for (const [y, z, r] of [[1.32, -0.08, 0.1], [1.12, -0.3, 0.09], [0.8, -0.4, 0.09], [0.5, -0.44, 0.08]]) {
      const sp = at(part(cone, spikes, 0.06), 0, y, z);
      sp.scale.set(r, r * 1.6, r);
      sp.rotation.x = -0.7;
      g.add(sp);
    }
    const tail = at(part(cone, toon(outfit)), 0, 0.2, -0.55);
    tail.scale.set(0.16, 0.5, 0.16);
    tail.rotation.x = -1.9;
    g.add(body, belly, head, snout, tail);
  } else {
    const body = at(part(new THREE.CylinderGeometry(0.3, 0.36, 0.75, 14), toon(outfit)), 0, 0.38, 0);
    const legs = at(part(new THREE.CylinderGeometry(0.36, 0.38, 0.1, 14), toon(0x1f2a5a), 0), 0, 0.05, 0);
    const head = at(ball(0.32, SKIN), 0, 1.0, 0);
    eyes(g, 1.02, 0.28, 0.11, 0.07);
    const cheeks = toon(0xf07a7a);
    for (const s of [-1, 1]) {
      const ch = at(new THREE.Mesh(sphere, cheeks), s * 0.19, 0.93, 0.25);
      ch.scale.set(0.06, 0.06, 0.03);
      g.add(ch);
      const strap = at(new THREE.Mesh(box, toon(WHITE)), 0, 0.42, 0.31);
      strap.scale.set(0.07, 0.75, 0.03);
      strap.rotation.z = s * 0.6;
      g.add(strap);
    }
    for (const y of [0.2, 0.62]) g.add(at(ball(0.04, GOLD, 0), 0, y, 0.33));
    const shako = at(part(new THREE.CylinderGeometry(0.27, 0.24, 0.5, 14), toon(0x1a1a24)), 0, 1.45, 0);
    const peak = at(new THREE.Mesh(cyl, toon(0x1a1a24)), 0, 1.22, 0.12);
    peak.scale.set(0.24, 0.03, 0.18);
    const badge = at(ball(0.07, GOLD, 0.04), 0, 1.45, 0.26);
    const plume = at(ball(1, 0xd8402f, 0.04), 0, 1.76, 0.05);
    plume.scale.set(0.08, 0.14, 0.08);
    g.add(body, legs, head, shako, peak, badge, plume);
  }
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = at(new THREE.Group(), s * 0.36, 0.62, 0);
    const arm = at(part(new THREE.CapsuleGeometry(0.08, 0.3, 4, 8), toon(outfit)), 0, -0.2, 0);
    pivot.add(arm);
    pivot.add(at(ball(0.09, hand, 0.06), 0, -0.42, 0));
    pivot.rotation.z = s * 0.25;
    pivot.userData.side = s;
    g.add(pivot);
    arms.push(pivot);
  }
  g.userData.arms = arms;
  return g;
}

/** Idle sway, and arms up while the skill runs. */
export function animateHero(g: THREE.Object3D, t: number, casting: boolean): void {
  g.position.y = Math.abs(Math.sin(t * (casting ? 8 : 2))) * (casting ? 0.12 : 0.04);
  if (g.userData.key) (g.userData.key as THREE.Object3D).rotation.z = t * (casting ? 12 : 3);
  for (const a of (g.userData.arms ?? []) as THREE.Object3D[]) {
    const s = a.userData.side as number;
    a.rotation.z = casting ? s * (2.6 + Math.sin(t * 12) * 0.2) : s * (0.25 + Math.sin(t * 2) * 0.06);
  }
}

// --- Train -----------------------------------------------------------------------------------

/**
 * A toy steam engine about 1.6 long, nose towards +z: boiler and chimney in front, an open cab at
 * the back where the hero rides (`userData.seat`), four wheels that spin (`userData.wheels`) and a
 * cannon on the cab roof. Painted in the hero's colour.
 */
export function makeLocomotive(color: number): THREE.Group {
  const g = new THREE.Group();
  const paint = toon(color);
  const trim = toon(0x2b2b2b);
  const brass = toon(0xe0b040);
  const chassis = at(part(box, toon(0x5a3a22)), 0, 0.22, 0);
  chassis.scale.set(0.7, 0.14, 1.6);
  g.add(chassis);
  const boiler = at(part(cyl, paint), 0, 0.5, 0.3);
  boiler.rotation.x = Math.PI / 2;
  boiler.scale.set(0.3, 0.9, 0.3);
  g.add(boiler);
  const nose = at(part(cyl, trim), 0, 0.5, 0.77);
  nose.rotation.x = Math.PI / 2;
  nose.scale.set(0.24, 0.06, 0.24);
  g.add(nose);
  const lamp = at(ball(0.08, 0xfff1a8, 0.03), 0, 0.62, 0.8);
  g.add(lamp);
  const chimney = at(part(new THREE.CylinderGeometry(0.14, 0.09, 0.32, 10), trim), 0, 0.92, 0.55);
  g.add(chimney);
  const dome = at(ball(0.12, 0xe0b040, 0.03), 0, 0.8, 0.15);
  g.add(dome);
  // The cab: floor, two side walls and a roof on four posts.
  const cab = at(part(box, paint), 0, 0.45, -0.5);
  cab.scale.set(0.66, 0.32, 0.55);
  g.add(cab);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const post = at(new THREE.Mesh(box, trim), sx * 0.3, 0.85, -0.5 + sz * 0.24);
    post.scale.set(0.05, 0.5, 0.05);
    g.add(post);
  }
  const roof = at(part(box, paint), 0, 1.12, -0.5);
  roof.scale.set(0.78, 0.07, 0.68);
  g.add(roof);
  const gun = at(part(cyl, brass), 0, 1.24, -0.4);
  gun.rotation.x = Math.PI / 2;
  gun.scale.set(0.08, 0.4, 0.08);
  g.add(gun);
  const seat = at(new THREE.Group(), 0, 0.6, -0.5);
  g.add(seat);
  g.userData.seat = seat;
  const wheels: THREE.Object3D[] = [];
  const wheelGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 14);
  for (const sx of [-1, 1]) for (const z of [-0.45, 0.35]) {
    const wheel = at(part(wheelGeo, toon(0xc0392b)), sx * 0.38, 0.17, z);
    wheel.rotation.z = Math.PI / 2;
    const hub = at(new THREE.Mesh(box, brass), 0, sx * 0.05, 0);
    hub.scale.set(0.26, 0.02, 0.05);
    wheel.add(hub);
    g.add(wheel);
    wheels.push(wheel);
  }
  g.userData.wheels = wheels;
  return g;
}

// --- Picnic -----------------------------------------------------------------------------------

/** Red-and-white gingham for the tablecloth; one texture repeat is one square pair. */
export function gingham(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fbf6ee';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(214, 72, 72, 0.55)';
  x.fillRect(0, 0, 32, 64);
  x.fillRect(0, 0, 64, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** The birthday cake the bugs are after, about 2.9 across: stand, two tiers, strawberries, candles. */
export function makeCake(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(part(new THREE.CylinderGeometry(1.45, 1.3, 0.1, 32), toon(0xf4f4f8)), 0, 0.05, 0));
  g.add(at(part(new THREE.CylinderGeometry(1.1, 1.1, 0.6, 32), toon(0xf7a8c0)), 0, 0.4, 0));
  g.add(at(part(new THREE.CylinderGeometry(1.14, 1.14, 0.1, 32), toon(0xfffaf2)), 0, 0.72, 0));
  const cream = toon(0xfffaf2);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    g.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.1 + (i % 3) * 0.08, 4, 8), cream), Math.cos(a) * 1.11, 0.6 - (i % 3) * 0.04, Math.sin(a) * 1.11));
  }
  g.add(at(part(new THREE.CylinderGeometry(0.7, 0.7, 0.45, 28), toon(0xfff0d8)), 0, 1.0, 0));
  g.add(at(part(new THREE.CylinderGeometry(0.73, 0.73, 0.08, 28), toon(0xf7a8c0)), 0, 1.24, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const berry = makeFruitModel('strawberry', 3);
    berry.scale.setScalar(0.22);
    berry.position.set(Math.cos(a) * 0.92, 0.76, Math.sin(a) * 0.92);
    g.add(berry);
  }
  const flames: THREE.Object3D[] = [];
  const colors = [0x6ab0f0, 0xffd84a, 0x8ad86a, 0xf06a9a, 0xb08af0];
  const fire = new THREE.MeshBasicMaterial({ color: 0xffc94a });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.cos(a) * 0.42;
    const z = Math.sin(a) * 0.42;
    const candle = at(part(cyl, toon(colors[i]), 0.08), x, 1.48, z);
    candle.scale.set(0.05, 0.42, 0.05);
    const flame = at(new THREE.Mesh(sphere, fire), x, 1.76, z);
    flame.scale.set(0.05, 0.1, 0.05);
    g.add(candle, flame);
    flames.push(flame);
  }
  g.userData.flames = flames;
  return g;
}

/** Candle flames flicker. */
export function animateCake(g: THREE.Object3D, t: number): void {
  ((g.userData.flames ?? []) as THREE.Object3D[]).forEach((f, i) => f.scale.set(0.05, 0.09 + Math.sin(t * 13 + i * 2) * 0.02, 0.05));
}

/** A plate with a few chocolate-chip cookies. */
export function makePlate(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  g.add(at(part(new THREE.CylinderGeometry(1.5, 1.2, 0.12, 28), toon(0xf4f4f8)), 0, 0.06, 0));
  const rim = at(new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.04, 4, 32), toon(0x6ab0e0)), 0, 0.12, 0);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng();
    const cookie = at(part(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16), toon(0xd8a060)), Math.cos(a) * 0.6, 0.18 + i * 0.03, Math.sin(a) * 0.6);
    for (let k = 0; k < 4; k++) {
      const chip = at(new THREE.Mesh(sphere, toon(0x5a3420)), (rng() - 0.5) * 0.6, 0.5, (rng() - 0.5) * 0.6);
      chip.scale.set(0.12, 0.6, 0.12);
      cookie.add(chip);
    }
    g.add(cookie);
  }
  return g;
}

export function makeCup(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const color = [0xf2d230, 0x6ab0e0, 0xf07a9a][Math.floor(rng() * 3)];
  g.add(at(part(new THREE.CylinderGeometry(0.55, 0.45, 1.0, 20), toon(color)), 0, 0.5, 0));
  const drink = at(new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), toon(0xf0a040)), 0, 0.92, 0);
  drink.rotation.x = -Math.PI / 2;
  g.add(drink);
  g.add(at(part(new THREE.TorusGeometry(0.25, 0.07, 6, 14), toon(color), 0.1), 0.6, 0.5, 0));
  return g;
}

export function makeJar(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(part(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 18), toon(0xc8304a)), 0, 0.4, 0));
  g.add(at(part(new THREE.CylinderGeometry(0.54, 0.54, 0.16, 18), toon(0xf4f4f4)), 0, 0.88, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.51, 0.51, 0.3, 18, 1, true), toon(0xfff0c8)), 0, 0.4, 0));
  return g;
}

/** A watermelon slice lying on its side. */
export function makeMelonSlice(): THREE.Group {
  const g = new THREE.Group();
  const slice = new THREE.Group();
  slice.add(part(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 20, 1, false, 0, Math.PI), toon(0xf05060)));
  const rind = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.3, 20, 1, true, 0, Math.PI), toon(0x3fa34d));
  slice.add(rind);
  for (let i = 0; i < 6; i++) {
    const a = 0.4 + (i / 6) * 2.4;
    const seed = at(new THREE.Mesh(sphere, toon(BLACK)), Math.sin(a) * 0.6, 0.16, Math.cos(a) * 0.6);
    seed.scale.set(0.05, 0.02, 0.08);
    slice.add(seed);
  }
  slice.position.y = 0.15;
  g.add(slice);
  return g;
}

export function makeSugar(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const c = at(part(box, toon(WHITE), 0.04), (rng() - 0.5) * 0.8, 0.15, (rng() - 0.5) * 0.8);
    c.scale.setScalar(0.3);
    c.rotation.y = rng() * 2;
    g.add(c);
  }
  return g;
}

export function makeStrawberry(): THREE.Group {
  const g = makeFruitModel('strawberry', 3);
  g.scale.setScalar(0.8);
  return g;
}

/** A big wicker basket with a lid and a handle, the backdrop of the picnic. */
export function makeBasket(): THREE.Group {
  const g = new THREE.Group();
  const wicker = toon(0xc8964e);
  const body = at(part(box, wicker), 0, 1.0, 0);
  body.scale.set(4, 2, 2.6);
  g.add(body);
  for (let i = 0; i < 4; i++) {
    const band = at(new THREE.Mesh(box, toon(0xa8763a)), 0, 0.3 + i * 0.45, 0);
    band.scale.set(4.04, 0.1, 2.64);
    g.add(band);
  }
  const lid = at(part(box, toon(0xb8864a)), 0, 2.1, 0);
  lid.scale.set(4.1, 0.2, 2.7);
  const cloth = at(new THREE.Mesh(box, toon(0xd64848)), 0.6, 1.6, 1.32);
  cloth.scale.set(1.4, 1.0, 0.04);
  const handle = at(part(new THREE.TorusGeometry(1.2, 0.1, 6, 20, Math.PI), wicker), 0, 2.2, 0);
  g.add(lid, cloth, handle);
  return g;
}
