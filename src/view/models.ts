// Procedural low-poly stand-ins for the art list (§16): the bugs raiding the picnic, the three toy
// heroes, the toy train, the cake and the picnic props. Built from primitives so the first package stays tiny;
// a real modelled asset can replace any builder later without touching the sim.
//
// Conventions: every model faces +z (towards the camera), stands on y = 0 and is about one unit
// across, so callers scale it by the unit's size. Parts that animate are tagged in userData.

import * as THREE from 'three';
import { ENEMIES, FRUITS } from '../sim/config';
import type { EnemyKind, FruitKind, HeroKind } from '../sim/types';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { meshGeometry, type MeshName } from './meshes';

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

// --- Modelled meshes -------------------------------------------------------------------------

/**
 * Paints a vertex of a normalised model: x and z centred, y from 0 at the feet, the longest side 1.
 * `h` is the model's height, so painters can split by fraction of height.
 */
type Painter = (x: number, y: number, z: number, h: number) => number;

const VERTEX_TOON = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP });
const meshCache = new Map<string, { geo: THREE.BufferGeometry; hull: THREE.BufferGeometry; h: number; top: THREE.Vector3 }>();

/**
 * One Tripo model as a toon mesh with vertex colours and an outline hull, normalised to the
 * conventions above. `yaw` turns the export so its head faces +z. Undefined before the GLBs load.
 */
function modelled(name: MeshName, yaw: number, paint: Painter, variant = ''): THREE.Group | undefined {
  const key = name + variant;
  let m = meshCache.get(key);
  if (!m) {
    const raw = meshGeometry(name);
    if (!raw) return undefined;
    const geo = raw.clone().rotateY(yaw);
    geo.computeBoundingBox();
    const b = geo.boundingBox!;
    const size = b.getSize(new THREE.Vector3());
    const k = 1 / Math.max(size.x, size.y, size.z);
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2).scale(k, k, k);
    const h = size.y * k;
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const top = new THREE.Vector3(0, -1, 0);
    for (let i = 0; i < pos.count; i++) {
      c.setHex(paint(pos.getX(i), pos.getY(i), pos.getZ(i), h)).toArray(colors, i * 3);
      if (pos.getY(i) > top.y) top.fromBufferAttribute(pos, i);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Centre on the middle of the body so the hull grows evenly; the mesh sits back up by h/2.
    geo.translate(0, -h / 2, 0);
    // Outline: the surface pushed out along its normals, drawn back faces only.
    const hull = new THREE.BufferGeometry();
    const nrm = geo.getAttribute('normal');
    const out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      out[i * 3] = pos.getX(i) + nrm.getX(i) * 0.012;
      out[i * 3 + 1] = pos.getY(i) + nrm.getY(i) * 0.012;
      out[i * 3 + 2] = pos.getZ(i) + nrm.getZ(i) * 0.012;
    }
    hull.setAttribute('position', new THREE.BufferAttribute(out, 3));
    hull.setIndex(geo.getIndex());
    m = { geo, hull, h, top };
    meshCache.set(key, m);
  }
  const g = new THREE.Group();
  const body = at(new THREE.Mesh(m.geo, VERTEX_TOON), 0, m.h / 2, 0);
  body.castShadow = true;
  body.add(new THREE.Mesh(m.hull, OUTLINE));
  g.add(body);
  g.userData.body = body;
  g.userData.height = m.h;
  /** The highest point, feet at y = 0: where a candle flame or a hat goes. */
  g.userData.top = m.top;
  return g;
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

// Each export faces its own way; these turn the head to +z (checked by eye, see docs/art/tripo_r*).
const TURN = Math.PI / 2;

/** Bugs from Tripo: dark, saturated bodies (style_r4), black legs; eyes where the mesh has them clearly. */
const BUG_LOOKS: Partial<Record<EnemyKind, () => THREE.Group | undefined>> = {
  caterpillar: () => modelled('ant', 0, (_x, y, _z, h) =>
    y > h * 0.8 || y < h * 0.22 ? BLACK : 0x5e2a1c),
  beetle: () => modelled('beetle', 0, (x, y, z) =>
    y < 0.1 ? 0x161830 : z > 0.42 && y > 0.14 && y < 0.3 && Math.abs(x) > 0.04 ? WHITE : z > 0.3 ? 0x1e2250 : 0x2c3490),
  crow: () => modelled('fly', 0, (x, y, z, h) =>
    Math.abs(x) > 0.28 && y > h * 0.45 ? 0xdff2ff : z > 0.12 && y > h * 0.35 && Math.abs(x) > 0.06 ? 0xd0302a : y < h * 0.22 ? BLACK : 0x2a3036),
  snail: () => modelled('snail', 0, (_x, y, z, h) =>
    y > h * 0.86 && z > 0.15 ? WHITE : z < 0.12 && y > h * 0.22 ? 0x6a3a9c : 0x24605e),
  locust: () => modelled('locustking', TURN, locustPaint(0x6a2230, 0x6a2230), ':small'),
  boss: () => modelled('locustking', TURN, locustPaint(0x262228, GOLD), ':king'),
};

/** The locust king: black armour, orange legs, yellow eyes; `horns` gold for the boss, plain for the small one. */
function locustPaint(body: number, horns: number): Painter {
  return (x, y, z, h) =>
    y > h * 0.7 && z > 0.15 ? horns : y < h * 0.35 && Math.abs(x) > 0.1 ? 0xe88a1e : z > 0.3 && y > h * 0.35 && Math.abs(x) > 0.06 ? 0xf2d22a : body;
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
  const modelledBug = BUG_LOOKS[kind]?.();
  if (modelledBug) return modelledBug;
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
  // A one-piece model can't move its legs: it waddles and bobs instead.
  if (d.body) {
    const body = d.body as THREE.Object3D;
    body.rotation.z = Math.sin(ph) * 0.1;
    body.position.y = d.height / 2 + Math.abs(Math.sin(ph)) * 0.04;
  }
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
  const toy = modelledHero(kind);
  if (toy) return toy;
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

/** The black top hat every hero wears, so the rider reads as the hero (style_r4). */
function topHat(): THREE.Group {
  const g = new THREE.Group();
  const felt = toon(0x1a1a24);
  g.add(at(part(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16), felt, 0.08), 0, 0.02, 0));
  g.add(at(part(new THREE.CylinderGeometry(0.13, 0.14, 0.26, 16), felt, 0.06), 0, 0.17, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.05, 16), toon(0xd8402f)), 0, 0.07, 0));
  return g;
}

/** The Tripo heroes, 1.6 tall like the builders below: tin soldier, wind-up robot, plush dinosaur. */
function modelledHero(kind: HeroKind): THREE.Group | undefined {
  let g: THREE.Group | undefined;
  let hat = false;
  if (kind === 'farmer') {
    // Shako (black) is part of the mesh: red coat, white face band, navy trousers, black boots.
    g = modelled('soldier', Math.PI, (x, y, z, h) =>
      y > h * 0.76 ? 0x1a1a24 : y > h * 0.62 ? SKIN : y < h * 0.05 ? BLACK : y < h * 0.36 ? 0x1f2a5a
        : z > 0.1 && Math.abs(Math.abs(x) - (y / h - 0.36) * 0.6) < 0.03 ? WHITE : 0xd8402f);
  } else if (kind === 'beekeeper') {
    g = modelled('robot', 0, (x, y, z, h) =>
      y > h * 0.95 ? 0xff5a4a : z > 0.18 && y > h * 0.66 && y < h * 0.8 && Math.abs(x) > 0.04 ? 0xffd84a
        : z < -0.2 ? GOLD : z > 0.2 && y > h * 0.35 && y < h * 0.55 ? [0xff5a4a, 0x5ae07a, 0x4a9af0][Math.floor((x + 0.5) * 9) % 3] : 0x8aa6c8);
    hat = true;
  } else {
    g = modelled('dino', -0.7, (x, y, z, h) =>
      y < h * 0.03 ? WHITE : z > 0.05 && Math.abs(x) < 0.22 && y > h * 0.15 && y < h * 0.6 ? 0xfff0c8 : z < -0.15 && y > h * 0.35 ? 0xf2c230 : 0xf07a28);
    hat = true;
  }
  if (!g) return undefined;
  // Scale by height, not the longest side: the dinosaur's tail would make it the smallest.
  const h = g.userData.height as number;
  g.scale.setScalar(1.6 / h);
  if (hat) {
    // On the crown of the head; the robot's top point is its aerial, so its hat sits lower.
    const top = g.userData.top as THREE.Vector3;
    const crown = kind === 'beekeeper' ? new THREE.Vector3(0, h * 0.86, 0) : top;
    const t = topHat();
    t.position.set(crown.x, crown.y - h / 2 - 0.02, crown.z);
    t.scale.setScalar(h / 1.6);
    (g.userData.body as THREE.Object3D).add(t);
  }
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
  const toy = modelledTrain();
  if (toy) return toy;
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

/**
 * The Tripo engine, 1.6 long and always red (style_r4: the heroes differ by rider, not paint):
 * black chimney and roof, wooden wheels. The wheels are part of the mesh, so `wheels` is empty;
 * the hero rides on the cab roof.
 */
function modelledTrain(): THREE.Group | undefined {
  const g = modelled('train', TURN, (_x, y, z, h) =>
    y < h * 0.08 ? 0x2b2b2b : y < h * 0.3 ? 0xe0b47a : y > h * 0.9 || (z > 0.2 && y > h * 0.62) ? 0x2b2b2b : 0xd63a2a);
  if (!g) return undefined;
  g.scale.setScalar(1.6);
  const seat = at(new THREE.Group(), 0, g.userData.height as number, -0.3);
  seat.scale.setScalar(1 / 1.6);
  g.add(seat);
  g.userData.seat = seat;
  g.userData.wheels = [];
  return g;
}

/** The birthday cake the bugs are after, about 2.9 across: stand, two tiers, strawberries, candles. */
export function makeCake(): THREE.Group {
  const toy = modelledCake();
  if (toy) return toy;
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

/**
 * The Tripo cake, 2.6 across, as in the style frame: cream icing dripping over a golden sponge with
 * a cream layer, a ring of strawberries, the modelled candle in the middle and six pastel ones round it.
 */
function modelledCake(): THREE.Group | undefined {
  const CREAM = 0xfff3e0;
  const g = modelled('cake', 0, (x, y, z, h) => {
    const r = Math.hypot(x, z);
    if (r < 0.05 && y > h * 0.75) return y > h * 0.93 ? 0xffd84a : 0xf06a8a;
    if (y > h * 0.74 && r > 0.26 && r < 0.46) return 0xd8202a;
    const a = Math.atan2(z, x);
    const drip = y > h * 0.25 && Math.sin(a * 9) > 0.3 && y > h * (0.5 - 0.25 * Math.abs(Math.sin(a * 4)));
    if (y > h * 0.5 || drip) return CREAM;
    return y > h * 0.27 && y < h * 0.33 ? CREAM : 0xf0c27e;
  });
  if (!g) return undefined;
  g.scale.setScalar(2.6);
  const fire = new THREE.MeshBasicMaterial({ color: 0xffc94a });
  const top = g.userData.top as THREE.Vector3;
  const flame = at(new THREE.Mesh(sphere, fire), top.x, top.y + 0.03, top.z);
  flame.userData.k = 1.6 / 2.6;
  flame.scale.set(0.05, 0.09, 0.05).multiplyScalar(flame.userData.k);
  g.add(flame);
  const flames = [flame];
  // The icing height just inside the strawberry ring, so the small candles stand on it.
  const body = g.userData.body as THREE.Mesh;
  const pos = body.geometry.getAttribute('position');
  let deck = 0;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    if (r > 0.14 && r < 0.22) deck = Math.max(deck, pos.getY(i));
  }
  deck += body.position.y;
  const colors = [0x6ab0f0, 0xffd84a, 0xf06a9a, 0xb08af0, 0xf0a040, 0x8ad86a];
  colors.forEach((c, i) => {
    const a = (i / colors.length) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 0.18;
    const z = Math.sin(a) * 0.18;
    const candle = at(part(cyl, toon(c), 0.1), x, deck + 0.04, z);
    candle.scale.set(0.016, 0.1, 0.016);
    const f = at(new THREE.Mesh(sphere, fire), x, deck + 0.105, z);
    f.userData.k = 1 / 2.6;
    f.scale.set(0.05, 0.09, 0.05).multiplyScalar(f.userData.k);
    g.add(candle, f);
    flames.push(f);
  });
  g.userData.flames = flames;
  return g;
}

/** Candle flames flicker. */
export function animateCake(g: THREE.Object3D, t: number): void {
  ((g.userData.flames ?? []) as THREE.Object3D[]).forEach((f, i) => {
    const k = (f.userData.k as number | undefined) ?? 1;
    f.scale.set(0.05 * k, (0.09 + Math.sin(t * 13 + i * 2) * 0.02) * k, 0.05 * k);
  });
}

// --- Lawn (§16.1, style frame docs/art/style_r4/b_marsh.png) ---------------------------------

function canvasTexture(size: number, draw: (x: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Short grass from above: a mid green covered in blade strokes of four shades. One repeat is a few units. */
export function lawnTexture(rng: () => number): THREE.CanvasTexture {
  return canvasTexture(256, (x) => {
    x.fillStyle = '#64ae40';
    x.fillRect(0, 0, 256, 256);
    const shades = ['#539c34', '#7cc152', '#478e2e', '#90cc64'];
    x.lineWidth = 2;
    x.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const px = rng() * 256;
      const py = rng() * 256;
      x.strokeStyle = shades[i % 4];
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (rng() - 0.5) * 5, py - 4 - rng() * 7);
      x.stroke();
    }
  });
}

/** The log slice the cake stands on: `r` across the top, 0.36 tall, growth rings on top, bark round the side. */
export function makeLogSlice(r: number, rng: () => number): THREE.Group {
  const rings = canvasTexture(256, (x) => {
    x.fillStyle = '#e8c38c';
    x.fillRect(0, 0, 256, 256);
    for (let i = 1; i < 15; i++) {
      x.strokeStyle = i % 2 ? '#d2a268' : '#dcb47c';
      x.lineWidth = 2 + rng() * 2;
      x.beginPath();
      x.arc(128 + (rng() - 0.5) * 3, 128 + (rng() - 0.5) * 3, i * 8.5, 0, Math.PI * 2);
      x.stroke();
    }
    // A sapwood band at the edge and a few drying cracks.
    x.strokeStyle = '#f2d4a4';
    x.lineWidth = 10;
    x.beginPath();
    x.arc(128, 128, 122, 0, Math.PI * 2);
    x.stroke();
    x.strokeStyle = '#b07a46';
    x.lineWidth = 2;
    for (const a of [0.7, 2.9, 4.6]) {
      x.beginPath();
      x.moveTo(128 + Math.cos(a) * 20, 128 + Math.sin(a) * 20);
      x.lineTo(128 + Math.cos(a + 0.08) * 70, 128 + Math.sin(a + 0.08) * 70);
      x.stroke();
    }
  });
  const bark = canvasTexture(128, (x) => {
    x.fillStyle = '#7a4a2a';
    x.fillRect(0, 0, 128, 128);
    const shades = ['#5c361e', '#8c5c36', '#683e22'];
    for (let i = 0; i < 40; i++) {
      x.fillStyle = shades[i % 3];
      x.fillRect(rng() * 128, 0, 2 + rng() * 5, 128);
    }
  });
  bark.repeat.set(5, 1);
  const geo = new THREE.CylinderGeometry(r, r * 1.06, 0.36, 40);
  const cap = toon(WHITE, { map: rings });
  const log = new THREE.Mesh(geo, [toon(WHITE, { map: bark }), cap, cap]);
  log.position.y = 0.18;
  log.castShadow = log.receiveShadow = true;
  const o = new THREE.Mesh(geo, OUTLINE);
  o.scale.set(1.025, 1.08, 1.025);
  log.add(o);
  const g = new THREE.Group();
  g.add(log);
  return g;
}

/** The wooden toy track: a flat ring `inner`..`outer`, `height` thick with a bevelled edge, two wheel grooves and joints. */
export function makeTrack(inner: number, outer: number, height: number): THREE.Group {
  const shape = new THREE.Shape().absarc(0, 0, outer, 0, Math.PI * 2, false);
  shape.holes.push(new THREE.Path().absarc(0, 0, inner, 0, Math.PI * 2, true));
  const bevel = 0.03;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 72 });
  geo.rotateX(-Math.PI / 2).translate(0, bevel, 0);
  const g = new THREE.Group();
  const wood = new THREE.Mesh(geo, toon(0xe8c48e));
  wood.castShadow = wood.receiveShadow = true;
  g.add(wood);
  const groove = toon(0xc49460);
  const mid = (inner + outer) / 2;
  for (const r of [mid - 0.2, mid + 0.2]) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.035, r + 0.035, 96), groove);
    m.rotation.x = -Math.PI / 2;
    m.position.y = height + 0.003;
    g.add(m);
  }
  const jointGeo = new THREE.BoxGeometry(outer - inner, 0.006, 0.025);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const joint = new THREE.Mesh(jointGeo, groove);
    joint.position.set(Math.cos(a) * mid, height + 0.003, Math.sin(a) * mid);
    joint.rotation.y = -a;
    g.add(joint);
  }
  return g;
}

/**
 * The marshmallow fence: `posts` chunky rounded posts on a circle of radius `r`, pink and white in
 * turn, and two gold wafer sticks between neighbours. Only the sticks break (paintFence), so they
 * are single meshes; the posts are instanced.
 */
export function makeFence(r: number, posts: number): { group: THREE.Group; rails: THREE.Mesh[] } {
  const g = new THREE.Group();
  const H = 0.9;
  const postGeo = new RoundedBoxGeometry(0.4, H, 0.3, 3, 0.13);
  const sets = [new THREE.InstancedMesh(postGeo, toon(0xf9b6ca), Math.ceil(posts / 2)), new THREE.InstancedMesh(postGeo, toon(0xfdf6ee), Math.floor(posts / 2))];
  const hull = new THREE.InstancedMesh(postGeo, OUTLINE, posts);
  const d = new THREE.Object3D();
  const step = (Math.PI * 2) / posts;
  for (let i = 0; i < posts; i++) {
    const a = i * step;
    d.position.set(Math.cos(a) * r, H / 2, Math.sin(a) * r);
    // Broad side along the fence: local x on the tangent.
    d.rotation.set(0, -a - Math.PI / 2, 0);
    d.scale.setScalar(1);
    d.updateMatrix();
    sets[i % 2].setMatrixAt(Math.floor(i / 2), d.matrix);
    d.scale.set(1.08, 1.05, 1.1);
    d.updateMatrix();
    hull.setMatrixAt(i, d.matrix);
  }
  for (const s of sets) {
    s.castShadow = true;
    g.add(s);
  }
  g.add(hull);
  const len = 2 * r * Math.sin(step / 2);
  const railGeo = new THREE.CylinderGeometry(0.055, 0.055, len, 8).rotateZ(Math.PI / 2);
  const wafer = toon(0xeab04c);
  const rails: THREE.Mesh[] = [];
  for (let i = 0; i < posts; i++) {
    const a = (i + 0.5) * step;
    const rr = r * Math.cos(step / 2);
    for (const y of [0.3, 0.62]) {
      const rail = new THREE.Mesh(railGeo, wafer);
      rail.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
      rail.rotation.set(0, -a - Math.PI / 2, 0);
      rail.castShadow = true;
      rail.userData.base = { y, rot: rail.rotation.clone() };
      g.add(rail);
      rails.push(rail);
    }
  }
  return { group: g, rails };
}

/**
 * Grass tufts, daisies and broad leaves scattered over the lawn, one instanced mesh per kind.
 * Tufts go anywhere from `from` to `to` that `bare(r)` leaves free; flowers and leaves only past `flowers`.
 */
export function makeMeadow(rng: () => number, from: number, to: number, flowers: number, bare: (r: number) => boolean): THREE.Group {
  const g = new THREE.Group();
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  // An area-even point between radius a and b.
  const spot = (a: number, b: number) => {
    const r = Math.sqrt(a * a + rng() * (b * b - a * a));
    const t = rng() * Math.PI * 2;
    return { r, x: Math.cos(t) * r, z: Math.sin(t) * r };
  };

  const blade = new THREE.ConeGeometry(0.035, 0.26, 3).translate(0, 0.13, 0);
  const TUFTS = 520;
  const BLADES = 5;
  const tufts = new THREE.InstancedMesh(blade, toon(WHITE), TUFTS * BLADES);
  const greens = [0x4c9a30, 0x6cbc44, 0x8ad25a, 0x5aa83a];
  let n = 0;
  for (let i = 0; i < TUFTS; i++) {
    const p = spot(from, to);
    if (bare(p.r)) continue;
    const base = greens[i % greens.length];
    for (let k = 0; k < BLADES; k++) {
      d.position.set(p.x + (rng() - 0.5) * 0.14, 0, p.z + (rng() - 0.5) * 0.14);
      d.rotation.set((rng() - 0.5) * 0.7, rng() * 3, (rng() - 0.5) * 0.7);
      d.scale.setScalar(0.7 + rng() * 0.7);
      d.updateMatrix();
      tufts.setMatrixAt(n, d.matrix);
      tufts.setColorAt(n, c.setHex(base).offsetHSL(0, 0, (rng() - 0.5) * 0.08));
      n++;
    }
  }
  tufts.count = n;
  g.add(tufts);

  // Daisies: ten white petals round a yellow middle, lying on the grass.
  const petal = new THREE.SphereGeometry(1, 8, 4).scale(0.09, 0.022, 0.034).translate(0.12, 0, 0);
  const petals = mergeGeometries(Array.from({ length: 10 }, (_, i) => petal.clone().rotateY((i / 10) * Math.PI * 2)));
  const middle = new THREE.SphereGeometry(0.065, 10, 6).scale(1, 0.55, 1);
  const DAISIES = 46;
  const heads = new THREE.InstancedMesh(petals, toon(WHITE), DAISIES);
  const hearts = new THREE.InstancedMesh(middle, toon(0xffc928), DAISIES);
  for (let i = 0; i < DAISIES; i++) {
    const p = spot(flowers, to);
    d.position.set(p.x, 0.1, p.z);
    d.rotation.set((rng() - 0.5) * 0.4, rng() * 6, (rng() - 0.5) * 0.4);
    d.scale.setScalar(1 + rng() * 0.8);
    d.updateMatrix();
    heads.setMatrixAt(i, d.matrix);
    d.position.y += 0.012 * d.scale.x;
    d.updateMatrix();
    hearts.setMatrixAt(i, d.matrix);
  }
  g.add(heads, hearts);

  // Broad leaves in clumps of four, fanning out and tilted up.
  const leaf = new THREE.SphereGeometry(1, 10, 6).scale(0.26, 0.05, 0.62).translate(0, 0, 0.6);
  const CLUMPS = 12;
  const leaves = new THREE.InstancedMesh(leaf, toon(WHITE), CLUMPS * 4);
  for (let i = 0; i < CLUMPS; i++) {
    const p = spot(flowers + 1.2, to);
    const s = 0.8 + rng() * 0.7;
    for (let k = 0; k < 4; k++) {
      d.position.set(p.x, 0.02, p.z);
      d.rotation.set(-0.5 - rng() * 0.3, (k / 4) * Math.PI * 2 + rng(), 0, 'YXZ');
      d.scale.setScalar(s);
      d.updateMatrix();
      leaves.setMatrixAt(i * 4 + k, d.matrix);
      leaves.setColorAt(i * 4 + k, c.setHex(k % 2 ? 0x5cae48 : 0x78c45a));
    }
  }
  g.add(leaves);
  return g;
}

