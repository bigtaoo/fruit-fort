// The xenos, to the round-3 concepts (docs/art/bugs_r3): seen from above, long bodies split into
// head, thorax and abdomen, dark purple-black chitin, hot orange glow only in the seams, no cartoon
// eyes. The swarmer, carapace, leaper and siege tortoise are Tripo meshes (xenos.ts); the flyer, the
// jelly splitter, its crystal spores and the hive queen are built here, where see-through wings,
// jelly and glowing cores are easier in code than from a mesh with no texture.
//
// Conventions (models.ts): about one unit long, feet at y = 0, head to +z, and the userData
// horde.ts bakes into its vertex rig: `legs` (swung about x), `wings` (flapped about z, each with
// its `side`) and `blobs` (squashed). The chitin is vertex-coloured on CHITIN, which horde.ts swaps
// for the rim-lit bug plastic with an x-ray ghost; the glow is EMBER and CORE, the jelly JELLY.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnemyKind } from '../sim/types';
import { makeXeno, type XenoLook, type XenoPaint } from './xenos';

export const CHITIN = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
/**
 * The glow of seams and cores, and a paler core in each. They mark the stencil like the chitin,
 * so the x-ray ghost of a bug's back never paints over its own glow.
 */
const lit = (color: number, emissive: number, k: number) =>
  Object.assign(new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: k, roughness: 0.3 }), {
    stencilWrite: true,
    stencilRef: 1,
    stencilZPass: THREE.ReplaceStencilOp,
  });
// Bright enough that the seams still pop on a small bug at phone size.
export const EMBER = lit(0xffa418, 0xff8a00, 1.4);
export const CORE = lit(0xfff0b0, 0xffd870, 1.3);
export const WING = new THREE.MeshStandardMaterial({ color: 0xb894ff, emissive: 0x5a30c0, emissiveIntensity: 0.5, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2 });
/** The jelly dome and the spore crystals: see-through violet, lit a little from inside. */
export const JELLY = new THREE.MeshStandardMaterial({ color: 0x9a60ff, emissive: 0x4a1ca8, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.1, metalness: 0.1 });

/** Chitin: the shell, raised plates, the near-black underside and sockets, the violet accents. */
const SHELL = 0x2c1a44;
const PLATE = 0x5a3888;
const DEEP = 0x150c24;
const ACCENT = 0x7a46c8;
/** Legs, horns and scythes: a few shades lighter than the shell, so they show against it from above. */
const LEG = 0x5a3a86;

const PAINT: XenoPaint = { top: PLATE, side: SHELL, under: DEEP, leg: LEG, accent: ACCENT, chitin: CHITIN, glow: EMBER };

const sphere = new THREE.SphereGeometry(1, 20, 14);
const knob = new THREE.SphereGeometry(1, 8, 6);
const rod = new THREE.CylinderGeometry(1, 1, 1, 8);
const spike = new THREE.ConeGeometry(1, 1, 10);
/** A thin ring round z: the glowing seam between two segments. */
const seam = new THREE.TorusGeometry(1, 0.12, 6, 20);
/** Facets for the crystals. */
const gem = new THREE.OctahedronGeometry(1, 0);

/** Merge parts that may differ in index and uv (spheres, facets): no uv, all unindexed if any is. */
export function mergeParts(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = geos.some((g) => !g.index);
  return mergeGeometries(
    geos.map((g) => {
      const out = flat && g.index ? g.toNonIndexed() : g;
      out.deleteAttribute('uv');
      return out;
    }),
  );
}

type Paint = number | ((p: THREE.Vector3) => number);
type Bucket = 'glow' | 'core' | 'jelly';
const v = new THREE.Vector3();

/** A bug part's pieces, merged into one mesh each for the chitin, the glow, the cores and the jelly. */
class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  /** A piece of chitin (`paint` a colour or a colour per vertex) or of glow, core or jelly. */
  add(geo: THREE.BufferGeometry, paint: Paint | Bucket, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0): this {
    const g = geo.clone().applyMatrix4(
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)),
    );
    const mat = paint === 'glow' ? EMBER : paint === 'core' ? CORE : paint === 'jelly' ? JELLY : CHITIN;
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat)!.push(mat === CHITIN ? colour(g, paint as Paint) : g);
    return this;
  }

  /** A rod from `a` to `b` with a ball at `b` for the joint. */
  limb(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): this {
    const d = v.subVectors(b, a);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    const m = a.clone().add(b).multiplyScalar(0.5);
    return this.add(rod, color, m.x, m.y, m.z, r, d.length(), r, e.x, e.y, e.z).add(knob, color, b.x, b.y, b.z, r * 1.25);
  }

  /** A pair of narrow glowing slit eyes either side of x = 0, angled back along the head. */
  eyes(x: number, y: number, z: number, r: number): this {
    for (const s of [-1, 1]) this.add(sphere, 'glow', s * x, y, z, r * 0.55, r * 0.3, r, 0, s * 0.5, 0);
    return this;
  }

  build(into: THREE.Object3D): void {
    for (const [mat, geos] of this.parts) {
      const m = new THREE.Mesh(mergeParts(geos), mat);
      m.castShadow = mat === CHITIN;
      into.add(m);
    }
  }
}

function colour(g: THREE.BufferGeometry, paint: Paint): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const c = new THREE.Color();
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    c.setHex(typeof paint === 'number' ? paint : paint(v.fromBufferAttribute(pos, i))).toArray(out, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}

const p = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * A leg on each side at each `z`: hip, knee up and out, foot on the ground further out. Each hangs
 * from a pivot at the hip, so swinging it about x walks the foot fore and aft.
 */
function legs(g: THREE.Group, zs: number[], hip: [number, number], knee: [number, number], foot: number, r: number, splay = 0.12): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    zs.forEach((z, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * hip[0], hip[1], z);
      // The front legs reach forward and the back ones back, round the middle.
      const lean = (i - (zs.length - 1) / 2) * -splay;
      new Kit()
        .limb(p(0, 0, 0), p(s * (knee[0] - hip[0]), knee[1] - hip[1], lean * 0.5), r, LEG)
        .limb(p(s * (knee[0] - hip[0]), knee[1] - hip[1], lean * 0.5), p(s * (foot - hip[0]), r - hip[1], lean), r * 0.8, LEG)
        .build(pivot);
      g.add(pivot);
      out.push(pivot);
    });
  }
  return out;
}

/** A segmented body along z: plates from `z0` back, each a little narrower, a glowing seam between each two. */
function segments(k: Kit, y: number, z0: number, n: number, r: number, len: number, taper: number): void {
  for (let i = 0; i < n; i++) {
    const ri = r * (1 - (i / n) * taper);
    const z = z0 - i * len;
    k.add(sphere, i % 2 ? SHELL : PLATE, 0, y, z, ri, ri * 0.85, len * 0.62);
    if (i) k.add(seam, 'glow', 0, y, z + len * 0.5, ri * 0.9, ri * 0.78, ri * 0.5);
  }
}

/**
 * A tortoise's plates in plan round (x, z): a hexagon of radius `r`, the same again at `ring`, and
 * spokes joining their corners and running on out to the rim.
 */
function tortoise(x: number, z: number, r: number, ring: number): [number, number, number, number][] {
  const at = (i: number, rr: number) => [x + Math.sin((i / 3) * Math.PI) * rr, z + Math.cos((i / 3) * Math.PI) * rr * 1.15];
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < 6; i++) {
    for (const rr of [r, ring]) out.push([...at(i, rr), ...at(i + 1, rr)] as [number, number, number, number]);
    out.push([...at(i, r), ...at(i, 0.28)] as [number, number, number, number]);
  }
  return out;
}

const TRIPO: Partial<Record<EnemyKind, XenoLook>> = {
  caterpillar: { file: 'swarmer', scale: 1.25, body: [0.11, 0.32, 0.11], spine: 0.04, seams: [0.31, 0.19, 0.08, -0.03, -0.12] },
  beetle: { file: 'carapace', scale: 1.1, body: [0.2, 0.36, 0], spine: 0.06, seams: [0.24, 0.12], ribs: [[0, 0.12, -0.32]] },
  locust: { file: 'leaper', scale: 1.3, body: [0.12, 0.43, -0.03], spine: 0.05, seams: [0.24, 0.08, -0.1, -0.24], ribs: [[0, -0.1, -0.4]] },
  snail: {
    file: 'sieger',
    body: [0.29, 0.34, 0],
    spine: 0.08,
    // The neck, and plates glowing between as on a tortoise: a hexagon in the middle of the dome,
    // a ring of plates round it and the rim's beyond.
    seams: [0.3],
    lines: tortoise(0, -0.04, 0.1, 0.22),
    // The stubs of crystal the mesh kept: violet, lit at the tips (the tall ones are added in code).
    accent: (c) => c.y > 0.38 && Math.abs(c.x) < 0.16,
    glow: (c) => c.y > 0.46 && Math.abs(c.x) < 0.16,
  },
};

/**
 * The siege tortoise's crystals, taller than the decimated mesh could keep: a fan of see-through
 * violet shards rising off the front of its shell, each glowing down its core.
 */
function crystals(g: THREE.Group): void {
  const k = new Kit();
  for (const [x, z, h, lean] of [[0, 0.17, 0.48, 0], [-0.075, 0.12, 0.36, 0.35], [0.08, 0.14, 0.4, -0.3], [-0.04, 0.26, 0.28, 0.2], [0.05, 0.03, 0.3, -0.2]]) {
    const y = 0.38 + h * 0.45;
    k.add(gem, 'jelly', x, y, z, 0.055, h / 2, 0.055, -0.15, 0, lean).add(gem, 'glow', x, y, z, 0.02, h * 0.42, 0.02, -0.15, 0, lean);
  }
  k.build(g);
}

const EXTRAS: Partial<Record<EnemyKind, (g: THREE.Group) => void>> = { snail: crystals };

/** Flyer: a slim dragonfly body with glowing segment seams, slit eyes, four violet wings in an X. */
function flyer(): THREE.Group {
  const g = new THREE.Group();
  const k = new Kit()
    .add(sphere, SHELL, 0, 0.42, 0.36, 0.075, 0.065, 0.075)
    .eyes(0.045, 0.45, 0.39, 0.06)
    .add(sphere, PLATE, 0, 0.42, 0.2, 0.1, 0.085, 0.13)
    .add(spike, LEG, 0, 0.42, -0.47, 0.025, 0.1, 0.025, -Math.PI / 2);
  segments(k, 0.42, 0.04, 6, 0.06, 0.075, 0.45);
  k.build(g);
  g.userData.legs = legs(g, [0.14, 0.2, 0.26], [0.05, 0.38], [0.1, 0.32], 0.13, 0.012, 0.3);
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    // Front pair swept forward, back pair back, so from above they cross in an X.
    for (const [z, sweep] of [[0.24, -0.35], [0.16, 0.4]]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.06, 0.48, z);
      const arm = new THREE.Group();
      arm.rotation.y = s * sweep;
      const wing = new THREE.Mesh(sphere, WING);
      wing.position.x = s * 0.4;
      wing.scale.set(0.4, 0.008, 0.065);
      arm.add(wing);
      pivot.add(arm);
      pivot.userData.side = s;
      g.add(pivot);
      wings.push(pivot);
    }
  }
  g.userData.wings = wings;
  return g;
}

/**
 * Jelly splitter: a see-through violet dome on a dark chitin rim, three glowing crystal cores inside
 * (the spores it splits into when it dies), short chitin feelers round the rim. The dome wobbles.
 */
function jelly(): THREE.Group {
  const g = new THREE.Group();
  const rim = new Kit().add(seam, DEEP, 0, 0.08, 0, 0.44, 0.44, 0.9, Math.PI / 2).add(seam, 'glow', 0, 0.11, 0, 0.4, 0.4, 0.4, Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    rim.add(spike, LEG, Math.sin(a) * 0.48, 0.07, Math.cos(a) * 0.48, 0.035, 0.16, 0.035, Math.PI / 2 - 0.2, a, 0);
  }
  rim.build(g);
  const b = new THREE.Group();
  b.position.y = 0.12;
  const k = new Kit().add(sphere, 'jelly', 0, 0.1, 0, 0.44, 0.42, 0.46);
  for (const [x, z, r] of [[0.13, 0.1, 0.09], [-0.14, 0.07, 0.085], [0.01, -0.15, 0.095]]) {
    k.add(gem, 'glow', x, 0.12, z, r * 0.8, r * 1.3, r * 0.8).add(gem, 'core', x, 0.14, z, r * 0.4, r * 0.65, r * 0.4);
  }
  k.build(b);
  g.add(b);
  g.userData.blobs = [b];
  return g;
}

/** Crystal spore: a violet teardrop of facets pointing ahead, a glowing core inside, a small facet trailing. */
function spore(): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Group();
  b.position.y = 0.34;
  new Kit()
    .add(gem, 'jelly', 0, 0, -0.04, 0.24, 0.22, 0.24)
    .add(gem, 'jelly', 0, 0, 0.2, 0.15, 0.14, 0.3)
    .add(gem, 'glow', 0, 0, 0.02, 0.1, 0.1, 0.14)
    .add(gem, 'core', 0, 0, 0.02, 0.05, 0.05, 0.07)
    .add(gem, 'jelly', 0, -0.02, -0.3, 0.09, 0.09, 0.12)
    .build(b);
  g.add(b);
  g.userData.blobs = [b];
  return g;
}

/**
 * Hive queen: a long segmented body, a crown of horns, two huge scythe forelegs and a swollen egg sac
 * behind, banded in chitin with the eggs glowing through every seam.
 */
function hiveQueen(): THREE.Group {
  const g = new THREE.Group();
  const k = new Kit()
    .add(sphere, SHELL, 0, 0.46, 0.34, 0.15, 0.13, 0.13)
    .eyes(0.08, 0.5, 0.42, 0.08)
    .add(sphere, PLATE, 0, 0.46, 0.15, 0.2, 0.17, 0.15)
    .add(seam, 'glow', 0, 0.46, 0.25, 0.16, 0.14, 0.1)
    .add(sphere, SHELL, 0, 0.44, -0.02, 0.17, 0.15, 0.1);
  // The egg sac: wide chitin bands, the glow showing between them, and violet crystals growing
  // out of its back as on the siege tortoise.
  k.add(sphere, 'glow', 0, 0.42, -0.32, 0.27, 0.235, 0.25);
  for (const [x, z, h, lean] of [[0, -0.32, 0.44, 0], [-0.12, -0.26, 0.32, 0.45], [0.12, -0.38, 0.34, -0.45], [0.02, -0.5, 0.24, -0.1]]) {
    k.add(gem, 'jelly', x, 0.7 + h * 0.4, z, 0.065, h / 2, 0.065, -0.3, 0, lean).add(gem, 'glow', x, 0.7 + h * 0.4, z, 0.018, h * 0.42, 0.018, -0.3, 0, lean);
  }
  for (let i = 0; i < 5; i++) {
    const z = -0.12 - i * 0.1;
    const r = Math.sin(((i + 0.6) / 5.2) * Math.PI) * 0.33 + 0.04;
    k.add(sphere, i % 2 ? SHELL : PLATE, 0, 0.42, z, r, r * 0.86, 0.052);
  }
  // A crown of five violet horns leaning back off the head.
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.45;
    const x = Math.sin(a) * 0.13;
    const z = 0.36 - Math.cos(a) * 0.06;
    const h = i === 2 ? 0.26 : 0.19;
    k.add(spike, ACCENT, x, 0.56 + h / 2, z, 0.035, h, 0.035, -0.35, 0, -a * 0.6);
  }
  k.build(g);
  const walk = legs(g, [-0.12, 0.02, 0.14], [0.16, 0.4], [0.42, 0.52], 0.56, 0.045, 0.25);
  // The scythes: an arm up and out from the thorax, a long curved blade reaching forward.
  const scythes: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.15, 0.48, 0.22);
    new Kit()
      .limb(p(0, 0, 0), p(s * 0.18, 0.2, 0.06), 0.045, LEG)
      .add(spike, ACCENT, s * 0.2, 0.16, 0.24, 0.035, 0.38, 0.018, Math.PI / 2 + 0.1, 0, -s * 0.25)
      .add(spike, 'glow', s * 0.2, 0.18, 0.2, 0.01, 0.24, 0.008, Math.PI / 2 + 0.1, 0, -s * 0.25)
      .build(pivot);
    g.add(pivot);
    scythes.push(pivot);
  }
  g.userData.legs = [...walk, ...scythes];
  return g;
}

const BUILT: Partial<Record<EnemyKind, () => THREE.Group>> = { crow: flyer, mold: jelly, spore, boss: hiveQueen };

/** A xeno of this kind, one unit long; horde.ts bakes it into one instanced batch per material. */
export function makeSwarmBug(kind: EnemyKind): THREE.Group {
  const look = TRIPO[kind];
  const g = look && makeXeno(look, PAINT);
  if (g) {
    EXTRAS[kind]?.(g);
    return g;
  }
  // A Tripo kind whose mesh is missing stands in as a flyer without wings: still a bug, still rigged.
  return (BUILT[kind] ?? flyer)();
}
