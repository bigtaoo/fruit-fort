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
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { meshGeometry, rigModel, type MeshName, type RigName } from './meshes';

/** Same sequence every load, so the props never jump between runs. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// --- Materials -------------------------------------------------------------------------------

/**
 * The shared lit material: soft and a little glossy, like painted wood and plastic toys in the sun
 * (style frame docs/art/style_r4/b_marsh.png). No bands and no outlines; the scene's environment
 * light fills the shadow side so nothing goes grey.
 */
const plasticCache = new Map<string, THREE.MeshStandardMaterial>();

export function plastic(color: number, opts: { emissive?: number; map?: THREE.Texture; opacity?: number; rough?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}:${opts.emissive ?? 0}:${opts.map?.id ?? -1}:${opts.opacity ?? 1}:${opts.rough ?? ROUGH}`;
  let m = plasticCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? ROUGH, metalness: 0, emissive: opts.emissive ?? 0, map: opts.map ?? null });
    if (opts.opacity !== undefined && opts.opacity < 1) {
      m.transparent = true;
      m.opacity = opts.opacity;
      m.depthWrite = false;
    }
    plasticCache.set(key, m);
  }
  return m;
}

/** Roughness of most surfaces: a broad, soft highlight. */
const ROUGH = 0.55;

/** A mesh that casts a shadow. */
function part(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
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

const VERTEX_PLASTIC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: ROUGH, metalness: 0 });
const meshCache = new Map<string, { geo: THREE.BufferGeometry; h: number; top: THREE.Vector3 }>();

/**
 * One Tripo model as a mesh with vertex colours, normalised to the
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
    // Centre on the middle of the body; the mesh sits back up by h/2.
    geo.translate(0, -h / 2, 0);
    m = { geo, h, top };
    meshCache.set(key, m);
  }
  const g = new THREE.Group();
  const body = at(new THREE.Mesh(m.geo, VERTEX_PLASTIC), 0, m.h / 2, 0);
  body.castShadow = true;
  g.add(body);
  g.userData.body = body;
  g.userData.height = m.h;
  /** The highest point, feet at y = 0: where a candle flame or a hat goes. */
  g.userData.top = m.top;
  return g;
}

/**
 * Walk cycles a second for a rigged bug whose feet cover `stride` of its own length (one unit) per
 * cycle, so they keep pace with the ground at its speed once scaled (see scripts/art/rig_bug.py).
 */
function strides(kind: EnemyKind, stride: number): number {
  const def = ENEMIES[kind];
  return def.speed / (stride * def.size * 1.25);
}

/** Each rig's geometry painted per look (`name` + variant), with the skin attributes it was cloned with. */
const paintedRigs = new Map<string, THREE.BufferGeometry>();

/**
 * A rigged Tripo model (scripts/art/rig_bug.py) with the same conventions and vertex paint as
 * `modelled`, playing its baked clips: `walk` at `cycles` a second (for a flyer, the flight loop),
 * and `bite`. `animateEnemy` drives them.
 */
function rigged(name: RigName, paint: Painter, cycles: number, variant = ''): THREE.Group | undefined {
  const rig = rigModel(name);
  const walk = rig?.clips.find((c) => c.name === 'walk');
  const bite = rig?.clips.find((c) => c.name === 'bite');
  if (!rig || !walk || !bite) return undefined;
  const scene = cloneRig(rig.scene);
  let skin: THREE.SkinnedMesh | undefined;
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skin = o as THREE.SkinnedMesh;
  });
  if (!skin) return undefined;
  const key = name + variant;
  let geo = paintedRigs.get(key);
  if (!geo) {
    // Shared by every clone of this look: paint it once, in the normalised frame `modelled` paints in.
    geo = skin.geometry.clone();
    geo.computeBoundingBox();
  }
  const b = geo.boundingBox!;
  const size3 = b.getSize(new THREE.Vector3());
  const k = 1 / Math.max(size3.x, size3.y, size3.z);
  const h = size3.y * k;
  if (!paintedRigs.has(key)) {
    paintedRigs.set(key, geo);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = (pos.getX(i) - (b.min.x + b.max.x) / 2) * k;
      const z = (pos.getZ(i) - (b.min.z + b.max.z) / 2) * k;
      c.setHex(paint(x, (pos.getY(i) - b.min.y) * k, z, h)).toArray(colors, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  skin.geometry = geo;
  skin.material = VERTEX_PLASTIC;
  skin.castShadow = true;
  // The bones carry the mesh beyond its rest bounds.
  skin.frustumCulled = false;
  scene.scale.setScalar(k);
  scene.position.set(-((b.min.x + b.max.x) / 2) * k, -b.min.y * k, -((b.min.z + b.max.z) / 2) * k);
  const g = new THREE.Group();
  g.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  const walking = mixer.clipAction(walk);
  const biting = mixer.clipAction(bite);
  walking.play();
  biting.play();
  g.userData.mixer = mixer;
  g.userData.walk = walking;
  g.userData.bite = biting;
  // Clip seconds per real second.
  g.userData.pace = cycles * walk.duration;
  g.userData.height = h;
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

function ball(r: number, color: number, geo = sphere): THREE.Mesh {
  const m = part(geo, plastic(color));
  m.scale.setScalar(r);
  return m;
}

/** Two cartoon eyes on the +z face of a body, centred at (0, y, z). */
function eyes(g: THREE.Object3D, y: number, z: number, spread: number, size: number): void {
  for (const s of [-1, 1]) {
    const white = at(ball(size, WHITE), s * spread, y, z);
    const pupil = at(ball(0.55, BLACK), 0, 0.05, 0.6);
    white.add(pupil);
    g.add(white);
  }
}

// Each export faces its own way; these turn the head to +z (checked by eye, see docs/art/tripo_r*).
const TURN = Math.PI / 2;

/**
 * Bugs wear the vertex plastic with a pale rim light added: a fresnel glow along their outline, so a
 * dark body still reads against the pink fence, the dark shadows by it, or the grass.
 */
function rimLit<M extends THREE.Material>(m: M, key: string): M {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rim = 1.0 - max(dot(normalize(vViewPosition), normal), 0.0);
      totalEmissiveRadiance += vec3(1.0, 0.94, 0.82) * pow(rim, 2.5) * 0.55;`,
    );
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// A bug marks the stencil wherever it is drawn, so its x-ray below never lands on a bug in plain sight.
// It takes little of the studio environment (see bugEnvironment): on a small dark body the bright
// grazing reflection read as a pale fuzzy fringe round every bug; the warm rim above is enough to lift it.
const BUG_PLASTIC = rimLit(
  Object.assign(VERTEX_PLASTIC.clone(), { stencilWrite: true, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp, envMapIntensity: 0.15 }),
  'bug-rim',
);

/**
 * Where the train, the fence or the cake hides a bug, a see-through ghost of it is drawn over them:
 * only where something is in front (depth greater) and no bug has been drawn yet (stencil), so the
 * bug's own back never shows through its front and overlapping ghosts don't double up.
 */
const BUG_XRAY = rimLit(
  Object.assign(VERTEX_PLASTIC.clone(), {
    transparent: true,
    opacity: 0.7,
    envMapIntensity: 0.15,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  }),
  'bug-xray',
);

/**
 * Hand the bug materials the studio environment themselves: three ignores envMapIntensity on a
 * material lit by scene.environment and uses scene.environmentIntensity instead.
 */
export function bugEnvironment(env: THREE.Texture): void {
  BUG_PLASTIC.envMap = env;
  BUG_XRAY.envMap = env;
}

/** Dress a Tripo bug: the rim-lit plastic, and a ghost of each part that shows through whatever hides it. */
function bugSkin(g: THREE.Group | undefined): THREE.Group | undefined {
  g?.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.material !== VERTEX_PLASTIC) return;
    m.material = BUG_PLASTIC;
    // After the rest of the opaque set (three sorts by material before distance), so a hidden bug
    // fails the depth test and leaves the stencil clear for its ghost.
    m.renderOrder = 1;
    const sk = m as THREE.SkinnedMesh;
    let ghost: THREE.Mesh;
    if (sk.isSkinnedMesh) {
      // Rides the same bones; it sits at its parent's origin, so the parent's bind matrix holds.
      const skinned = new THREE.SkinnedMesh(m.geometry, BUG_XRAY);
      skinned.bind(sk.skeleton, sk.bindMatrix);
      skinned.frustumCulled = false;
      ghost = skinned;
    } else ghost = new THREE.Mesh(m.geometry, BUG_XRAY);
    ghost.renderOrder = 4;
    m.add(ghost);
  });
  return g;
}

/** Bugs from Tripo: dark, saturated bodies (style_r4), black legs; eyes where the mesh has them clearly. */
const BUG_LOOKS: Partial<Record<EnemyKind, () => THREE.Group | undefined>> = {
  caterpillar: () => {
    const paint: Painter = (_x, y, _z, h) => (y > h * 0.8 || y < h * 0.22 ? BLACK : 0x5e2a1c);
    return rigged('ant', paint, strides('caterpillar', 0.34)) ?? modelled('ant', 0, paint);
  },
  beetle: () => {
    const paint: Painter = (x, y, z) =>
      y < 0.1 ? 0x161830 : z > 0.42 && y > 0.14 && y < 0.3 && Math.abs(x) > 0.04 ? WHITE : z > 0.3 ? 0x1e2250 : 0x2c3490;
    return rigged('beetle', paint, strides('beetle', 0.27)) ?? modelled('beetle', 0, paint);
  },
  crow: () => {
    const paint: Painter = (x, y, z, h) =>
      Math.abs(x) > 0.28 && y > h * 0.45 ? 0xdff2ff : z > 0.12 && y > h * 0.35 && Math.abs(x) > 0.06 ? 0xd0302a : y < h * 0.22 ? BLACK : 0x2a3036;
    // The flight loop beats at its own rate, whatever the speed.
    return rigged('fly', paint, 3.75) ?? modelled('fly', 0, paint);
  },
  snail: () => {
    const paint: Painter = (_x, y, z, h) => (y > h * 0.86 && z > 0.15 ? WHITE : z < 0.12 && y > h * 0.22 ? 0x6a3a9c : 0x24605e);
    // The ripple is no step: a stride long enough for about one ripple a second.
    return rigged('snail', paint, strides('snail', 0.5)) ?? modelled('snail', 0, paint);
  },
  // The rig is already turned head to +z; the one-piece model still needs TURN.
  locust: () => {
    const paint = locustPaint(0x6a2230, 0x6a2230);
    return rigged('locustking', paint, strides('locust', 0.3), ':small') ?? modelled('locustking', TURN, paint, ':small');
  },
  boss: () => {
    const paint = locustPaint(0x262228, GOLD);
    return rigged('locustking', paint, strides('boss', 0.3), ':king') ?? modelled('locustking', TURN, paint, ':king');
  },
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

function fruitMat(kind: FruitKind, tier: number, map?: THREE.Texture): THREE.MeshStandardMaterial {
  return plastic(map ? (tier === 0 ? 0xc8f0a0 : WHITE) : fruitColor(kind, tier), { emissive: tier === 2 ? 0x4a3300 : 0, map });
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
    const leaf = part(cone, plastic(0x3d9a3a));
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
      const seed = plastic(0xffe27a);
      for (let i = 0; i < 18; i++) {
        const y = 0.2 + (i % 6) * 0.12;
        const a = i * 2.4;
        const r = y < 0.5 ? 0.12 + y * 0.6 : 0.43;
        const s = at(part(lowSphere, seed), Math.cos(a) * r, y, Math.sin(a) * r);
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
      for (const [x, z] of [[-0.08, -0.06], [0.08, -0.06], [0, 0.08]]) g.add(at(ball(0.045, 0x3a2414), x, 0.92, z));
      eyes(g, 0.5, 0.42, 0.14, 0.08);
      break;
    }
    case 'watermelon': {
      const b = at(part(sphere, mat), 0, 0.45, 0);
      b.scale.set(0.58, 0.45, 0.5);
      b.rotation.z = Math.PI / 2; // stripes run end to end
      g.add(b);
      const stem = at(part(cyl, plastic(0x6b4a2a)), 0, 0.92, 0);
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
        const berry = at(part(sphere, mat), x, y, z);
        berry.scale.setScalar(0.17);
        g.add(berry);
      }
      const front = at(new THREE.Group(), 0, 0.5, 0.3);
      eyes(front, 0, 0, 0.1, 0.07);
      g.add(front);
      const stem = at(part(cyl, plastic(0x6b4a2a)), 0, 0.95, 0);
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
        const nub = at(part(cone, mat), s * 0.58, 0.42, 0);
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
    const band = part(new THREE.CylinderGeometry(0.18, 0.16, 0.08, 10), plastic(GOLD, { emissive: 0x403000 }));
    crown.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = at(part(cone, plastic(GOLD, { emissive: 0x403000 })), Math.cos(a) * 0.15, 0.1, Math.sin(a) * 0.15);
      spike.scale.set(0.05, 0.12, 0.05);
      crown.add(spike);
    }
    g.add(crown);
  }
  if (level >= 7) {
    const halo = at(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 24), plastic(0xfff3a0, { emissive: 0x806000 })), 0, 1.35, 0);
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
    const stalk = at(part(cyl, plastic(BLACK)), s * 0.1, 0.78, 0.48);
    stalk.scale.set(0.025, 0.3, 0.025);
    stalk.rotation.set(0.5, 0, s * 0.35);
    g.add(stalk);
    const tip = at(part(cyl, plastic(BLACK)), s * 0.2, 0.9, 0.72);
    tip.scale.set(0.025, 0.25, 0.025);
    tip.rotation.set(1.3, 0, s * 0.2);
    g.add(tip);
    const jaw = at(part(cone, plastic(BLACK)), s * 0.08, 0.36, 0.62);
    jaw.scale.set(0.04, 0.14, 0.04);
    jaw.rotation.set(Math.PI / 2, 0, -s * 0.5);
    g.add(jaw);
  }
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) for (const z of [-0.15, 0.02, 0.18]) {
    const leg = at(part(cyl, plastic(BLACK)), s * 0.3, 0.2, z);
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
  const shell = at(part(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), plastic(color)), 0, 0.15, -0.05);
  shell.scale.set(0.5, 0.45, 0.6);
  g.add(shell);
  const seam = at(new THREE.Mesh(box, plastic(lerpColor(color, BLACK, 0.5))), 0, 0.42, -0.05);
  seam.scale.set(0.03, 0.06, 1.0);
  g.add(seam);
  const head = at(ball(0.24, lerpColor(color, BLACK, 0.4)), 0, 0.25, 0.58);
  g.add(head);
  const horn = at(part(cone, plastic(lerpColor(color, BLACK, 0.4))), 0, 0.42, 0.75);
  horn.scale.set(0.07, 0.3, 0.07);
  horn.rotation.x = 0.6;
  g.add(horn);
  eyes(g, 0.32, 0.76, 0.11, 0.07);
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) for (const z of [-0.3, 0, 0.3]) {
    const leg = at(part(cyl, plastic(BLACK)), s * 0.5, 0.1, z);
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
    const band = at(new THREE.Mesh(new THREE.TorusGeometry(0.27 - i * 0.03, 0.025, 4, 16), plastic(0x55606a)), 0, 0, -0.2 - i * 0.12);
    g.add(band);
  }
  g.add(at(ball(0.22, color), 0, 0.05, 0.4));
  for (const s of [-1, 1]) {
    const eye = at(ball(0.15, 0xc8302a), s * 0.15, 0.12, 0.47);
    eye.add(at(ball(0.35, WHITE), -s * 0.3, 0.45, 0.6));
    g.add(eye);
  }
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = at(new THREE.Group(), s * 0.15, 0.24, -0.05);
    const wing = at(part(sphere, plastic(0xdff2ff, { opacity: 0.55 })), s * 0.3, 0, -0.15);
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
  const foot = at(part(new THREE.CapsuleGeometry(0.22, 1.0, 4, 10), plastic(0xd9c08a)), 0, 0.2, 0.05);
  foot.rotation.x = Math.PI / 2;
  foot.scale.set(1, 1, 0.8);
  g.add(foot);
  const shell = at(ball(0.48, color), 0, 0.62, -0.18);
  g.add(shell);
  const swirl = at(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 20), plastic(lerpColor(color, 0xf0d0a0, 0.5))), 0.42, 0.62, -0.18);
  swirl.rotation.y = Math.PI / 2;
  g.add(swirl);
  const swirl2 = at(swirl.clone(), -0.42, 0.62, -0.18);
  g.add(swirl2);
  for (const s of [-1, 1]) {
    const stalk = at(part(cyl, plastic(0xd9c08a)), s * 0.1, 0.5, 0.62);
    stalk.scale.set(0.035, 0.4, 0.035);
    stalk.rotation.z = s * 0.25;
    g.add(stalk);
    const eye = at(ball(0.08, WHITE), s * 0.15, 0.72, 0.64);
    eye.add(at(ball(0.55, BLACK), 0, 0, 0.6));
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
  const body = at(part(new THREE.CapsuleGeometry(0.2, 0.8, 4, 10), plastic(color)), 0, 0.35, -0.05);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const head = at(ball(0.24, lerpColor(color, 0xffffff, 0.15)), 0, 0.45, 0.55);
  g.add(head);
  eyes(g, 0.52, 0.74, 0.12, 0.08);
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const thigh = at(part(box, plastic(lerpColor(color, BLACK, 0.25))), s * 0.25, 0.45, -0.35);
    thigh.scale.set(0.08, 0.5, 0.12);
    thigh.rotation.x = -0.9;
    g.add(thigh);
    legs.push(thigh);
    const wing = at(part(box, plastic(0xe8f0c0, { opacity: 0.75 })), s * 0.12, 0.58, -0.25);
    wing.scale.set(0.18, 0.02, 0.8);
    wing.rotation.z = s * 0.25;
    g.add(wing);
  }
  if (crown) {
    const c = at(new THREE.Group(), 0, 0.68, 0.55);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = at(part(cone, plastic(GOLD, { emissive: 0x403000 })), Math.cos(a) * 0.13, 0.08, Math.sin(a) * 0.13);
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
  const modelledBug = bugSkin(BUG_LOOKS[kind]?.());
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

/** When in the rigged bite its jaws close on the fence, in seconds from the clip's start. */
const BITE_AT = 12 / 30;

/**
 * Per-frame animation: walk, buzz, wobble, and the rigged bugs' clips. `t` is a running clock,
 * `seed` varies the phase. True on the frame a rigged bug's bite lands.
 */
export function animateEnemy(g: THREE.Object3D, t: number, seed: number, chewing: boolean): boolean {
  const d = g.userData;
  if (d.mixer) {
    const walk = d.walk as THREE.AnimationAction;
    const bite = d.bite as THREE.AnimationAction;
    // Settle into the bite over a fifth of a second rather than snapping.
    const dt = Math.min(0.1, Math.max(0, t - (d.lastT ?? t)));
    d.lastT = t;
    d.chew = THREE.MathUtils.clamp((d.chew ?? 0) + (chewing ? dt : -dt) * 5, 0, 1);
    const offset = (seed * 0.618) % 1;
    const wl = walk.getClip().duration;
    const bl = bite.getClip().duration;
    walk.time = (t * d.pace + offset * wl) % wl;
    const was = d.biteT ?? 0;
    bite.time = (t + offset * bl) % bl;
    d.biteT = bite.time;
    walk.setEffectiveWeight(1 - d.chew);
    bite.setEffectiveWeight(d.chew);
    (d.mixer as THREE.AnimationMixer).update(0);
    return chewing && d.chew > 0.5 && was < BITE_AT && bite.time >= BITE_AT;
  }
  const ph = t * (chewing ? 14 : 8) + seed;
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
  // Chewing enemies nod into the wall: about their own sideways axis, so it is a nod whichever way
  // they face (the group's x is the world's, turned with them only by the yaw after it).
  (d.body ?? g).rotation.x = chewing ? Math.max(0, Math.sin(ph)) * 0.25 : 0;
  return false;
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
    const body = at(part(box, plastic(outfit)), 0, 0.4, 0);
    body.scale.set(0.62, 0.7, 0.5);
    const panel = at(new THREE.Mesh(box, plastic(0x3a4a5a)), 0, 0.45, 0.26);
    panel.scale.set(0.34, 0.24, 0.02);
    const head = at(part(box, plastic(outfit)), 0, 1.0, 0);
    head.scale.set(0.6, 0.48, 0.5);
    const visor = at(new THREE.Mesh(box, plastic(0x22303c)), 0, 1.02, 0.26);
    visor.scale.set(0.46, 0.22, 0.02);
    const glow = new THREE.MeshBasicMaterial({ color: 0x7ff0ff });
    for (const s of [-1, 1]) {
      const eye = at(new THREE.Mesh(sphere, glow), s * 0.11, 1.02, 0.28);
      eye.scale.set(0.06, 0.06, 0.02);
      g.add(eye);
      const light = at(new THREE.Mesh(sphere, plastic(s < 0 ? 0xff5a4a : 0x5ae07a)), s * 0.08, 0.45, 0.28);
      light.scale.set(0.045, 0.045, 0.02);
      g.add(light);
    }
    const stalk = at(new THREE.Mesh(cyl, plastic(0x6a7480)), 0, 1.38, 0);
    stalk.scale.set(0.025, 0.28, 0.025);
    const bulb = at(ball(0.08, 0xff5a4a), 0, 1.54, 0);
    const key = at(part(box, plastic(GOLD)), 0, 0.5, -0.32);
    key.scale.set(0.3, 0.16, 0.04);
    g.add(body, panel, head, visor, stalk, bulb, key);
    g.userData.key = key;
  } else if (kind === 'chef') {
    const body = at(part(new THREE.CylinderGeometry(0.32, 0.42, 0.75, 14), plastic(outfit)), 0, 0.38, 0);
    const belly = at(new THREE.Mesh(sphere, plastic(0xd8f0a0)), 0, 0.38, 0.24);
    belly.scale.set(0.24, 0.3, 0.12);
    const head = at(ball(0.36, outfit), 0, 1.0, -0.02);
    const snout = at(ball(1, outfit), 0, 0.92, 0.26);
    snout.scale.set(0.26, 0.2, 0.22);
    eyes(g, 1.12, 0.26, 0.15, 0.08);
    for (const s of [-1, 1]) g.add(at(ball(0.025, BLACK), s * 0.07, 0.96, 0.47));
    const spikes = plastic(0xf2c230);
    for (const [y, z, r] of [[1.32, -0.08, 0.1], [1.12, -0.3, 0.09], [0.8, -0.4, 0.09], [0.5, -0.44, 0.08]]) {
      const sp = at(part(cone, spikes), 0, y, z);
      sp.scale.set(r, r * 1.6, r);
      sp.rotation.x = -0.7;
      g.add(sp);
    }
    const tail = at(part(cone, plastic(outfit)), 0, 0.2, -0.55);
    tail.scale.set(0.16, 0.5, 0.16);
    tail.rotation.x = -1.9;
    g.add(body, belly, head, snout, tail);
  } else {
    const body = at(part(new THREE.CylinderGeometry(0.3, 0.36, 0.75, 14), plastic(outfit)), 0, 0.38, 0);
    const legs = at(part(new THREE.CylinderGeometry(0.36, 0.38, 0.1, 14), plastic(0x1f2a5a)), 0, 0.05, 0);
    const head = at(ball(0.32, SKIN), 0, 1.0, 0);
    eyes(g, 1.02, 0.28, 0.11, 0.07);
    const cheeks = plastic(0xf07a7a);
    for (const s of [-1, 1]) {
      const ch = at(new THREE.Mesh(sphere, cheeks), s * 0.19, 0.93, 0.25);
      ch.scale.set(0.06, 0.06, 0.03);
      g.add(ch);
      const strap = at(new THREE.Mesh(box, plastic(WHITE)), 0, 0.42, 0.31);
      strap.scale.set(0.07, 0.75, 0.03);
      strap.rotation.z = s * 0.6;
      g.add(strap);
    }
    for (const y of [0.2, 0.62]) g.add(at(ball(0.04, GOLD), 0, y, 0.33));
    const shako = at(part(new THREE.CylinderGeometry(0.27, 0.24, 0.5, 14), plastic(0x1a1a24)), 0, 1.45, 0);
    const peak = at(new THREE.Mesh(cyl, plastic(0x1a1a24)), 0, 1.22, 0.12);
    peak.scale.set(0.24, 0.03, 0.18);
    const badge = at(ball(0.07, GOLD), 0, 1.45, 0.26);
    const plume = at(ball(1, 0xd8402f), 0, 1.76, 0.05);
    plume.scale.set(0.08, 0.14, 0.08);
    g.add(body, legs, head, shako, peak, badge, plume);
  }
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = at(new THREE.Group(), s * 0.36, 0.62, 0);
    const arm = at(part(new THREE.CapsuleGeometry(0.08, 0.3, 4, 8), plastic(outfit)), 0, -0.2, 0);
    pivot.add(arm);
    pivot.add(at(ball(0.09, hand), 0, -0.42, 0));
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
  const felt = plastic(0x1a1a24);
  g.add(at(part(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16), felt), 0, 0.02, 0));
  g.add(at(part(new THREE.CylinderGeometry(0.13, 0.14, 0.26, 16), felt), 0, 0.17, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.05, 16), plastic(0xd8402f)), 0, 0.07, 0));
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

/** A soft-edged box, as the toy parts in the style frame have no sharp corners. */
function roundBox(w: number, h: number, d: number, r: number, mat: THREE.Material): THREE.Mesh {
  return part(new RoundedBoxGeometry(w, h, d, 3, r), mat);
}

/** Running gear: axle height, wheel stations, crank throw and the main rod's length. */
const AXLE_Y = 0.19;
const AXLES = [-0.55, 0.05, 0.6];
const CRANK = 0.09;
const MAIN_ROD = 0.6;
/** Where the side rods run: coupling rods just outside the wheels, main rod and cylinder outside those. */
const ROD_X = 0.45;
const MAIN_X = 0.5;
/** The cylinder sits ahead of the front wheel; its rear face, where the piston rod goes in. */
const CYL_Z = 0.88;
const CYL_LEN = 0.2;

/**
 * The wooden toy engine of the style frame, about 1.9 long, nose towards +z: a red boiler with a
 * tall black chimney and a black dome, an open cab at the back under a broad black roof where the
 * hero rides (`userData.seat`), cream wooden wheels that spin (`userData.wheels`) and a blue buffer
 * beam in front. Always red: the heroes differ by rider, not paint.
 *
 * Everything above the wheels is in `userData.body`, so it can bob, rock and hop on its springs
 * while the wheels stay on the rail; the chimney is its own group (`userData.stack`, pivot at its
 * foot) so it can squash and stretch with each chuff. The side rods (`userData.gear`) are driven by
 * `driveLocomotive`.
 */
export function makeLocomotive(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  g.userData.body = body;
  const red = plastic(0xd8302a, { rough: 0.4 });
  const black = plastic(0x22201e, { rough: 0.45 });
  const gold = plastic(0xe8b84a, { rough: 0.35 });
  body.add(at(roundBox(0.62, 0.16, 1.8, 0.05, plastic(0x7a2a20)), 0, 0.3, 0));
  // Boiler: a red barrel from the cab forward, with gold bands and a black smokebox door.
  const boiler = at(part(new THREE.CylinderGeometry(0.29, 0.29, 0.95, 28), red), 0, 0.66, 0.36);
  boiler.rotation.x = TURN;
  body.add(boiler);
  for (const z of [0.05, 0.45, 0.8]) {
    const band = at(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 28), gold), 0, 0.66, z);
    band.rotation.x = TURN;
    body.add(band);
  }
  const door = at(part(new THREE.CylinderGeometry(0.25, 0.27, 0.06, 28), black), 0, 0.66, 0.86);
  door.rotation.x = TURN;
  body.add(door);
  body.add(at(ball(0.06, 0xfff1a8), 0, 0.66, 0.9));
  // Chimney: a tapering black stack with a flared lip; a black dome behind it.
  const stack = at(new THREE.Group(), 0, 0.9, 0.62);
  stack.add(at(part(new THREE.CylinderGeometry(0.1, 0.13, 0.36, 18), black), 0, 0.18, 0));
  stack.add(at(part(new THREE.CylinderGeometry(0.16, 0.11, 0.1, 18), black), 0, 0.4, 0));
  body.add(stack);
  g.userData.stack = stack;
  const dome = at(part(new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), black), 0, 0.93, 0.2);
  body.add(dome);
  body.add(at(roundBox(0.66, 0.12, 0.1, 0.04, plastic(0x3a6ad8, { rough: 0.4 })), 0, 0.32, 0.93));
  // Cab: low red walls, corner posts and a broad black roof that overhangs on every side.
  // High enough that the hero standing inside shows between the posts, hat and all.
  body.add(at(roundBox(0.74, 0.36, 0.62, 0.06, red), 0, 0.55, -0.55));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) body.add(at(roundBox(0.08, 0.66, 0.08, 0.03, red), sx * 0.32, 1.06, -0.55 + sz * 0.26));
  body.add(at(roundBox(0.88, 0.09, 0.78, 0.04, black), 0, 1.42, -0.55));
  const seat = at(new THREE.Group(), 0, 0.6, -0.55);
  body.add(seat);
  g.userData.seat = seat;
  // Wheels: cream wooden discs with a dark hub, three a side. A wheel's local y is the axle, pointing
  // inwards (TURN about z), so the hub and the crank pin go at -sx to sit on the outer face.
  const wheels: THREE.Object3D[] = [];
  const wheelGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.1, 24);
  const wood = plastic(0xf0dcb0, { rough: 0.6 });
  const hub = plastic(0x6a4428);
  const pinGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10);
  const gear: { sx: number; phase: number; coupling: THREE.Object3D; main: THREE.Object3D; head: THREE.Object3D }[] = [];
  for (const sx of [-1, 1]) {
    // Quartered like a real engine: the right-hand cranks lead the left by a quarter turn, so the
    // two sides never both sit on dead centre.
    const phase = sx > 0 ? TURN : 0;
    for (const z of AXLES) {
      const wheel = at(part(wheelGeo, wood), sx * 0.36, AXLE_Y, z);
      wheel.rotation.z = TURN;
      const cap = at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12), hub), 0, -sx * 0.055, 0);
      wheel.add(cap);
      // The spoke points at the crank pin: local x is up, local z forward, before the wheel turns.
      const spoke = at(new THREE.Mesh(box, hub), 0, -sx * 0.055, 0);
      spoke.scale.set(0.26, 0.02, 0.04);
      spoke.rotation.y = -phase;
      wheel.add(spoke);
      // Pins stop short of the crosshead's line, except the middle one the main rod hangs on.
      const reach = z === AXLES[1] ? 0.1 : 0.065;
      const pin = at(new THREE.Mesh(pinGeo, gold), CRANK * Math.cos(phase), -sx * (0.05 + reach / 2), CRANK * Math.sin(phase));
      pin.scale.y = reach / 0.1;
      wheel.add(pin);
      g.add(wheel);
      wheels.push(wheel);
    }
    // Coupling rod: one gold bar over all three pins; it never turns, only circles with them.
    const coupling = at(roundBox(0.03, 0.05, AXLES[2] - AXLES[0] + 0.12, 0.015, gold), sx * ROD_X, AXLE_Y, (AXLES[0] + AXLES[2]) / 2);
    g.add(coupling);
    // Cylinder ahead of the front wheel, red with gold ends; the crosshead slides behind it on a
    // piston rod and the black main rod links it to the middle pin.
    const cyl = at(part(new THREE.CylinderGeometry(0.07, 0.07, CYL_LEN, 16), red), sx * MAIN_X, AXLE_Y, CYL_Z);
    cyl.rotation.x = TURN;
    g.add(cyl);
    for (const dz of [-1, 1]) {
      const end = at(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 16), gold), sx * MAIN_X, AXLE_Y, CYL_Z + (dz * CYL_LEN) / 2);
      end.rotation.x = TURN;
      g.add(end);
    }
    const head = at(roundBox(0.05, 0.07, 0.08, 0.02, gold), sx * MAIN_X, AXLE_Y, 0);
    const piston = at(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), gold), 0, 0, 0.11);
    piston.rotation.x = TURN;
    head.add(piston);
    g.add(head);
    const main = new THREE.Group();
    main.add(at(roundBox(0.03, 0.045, MAIN_ROD + 0.06, 0.015, black), 0, 0, 0));
    g.add(main);
    gear.push({ sx, phase, coupling, main, head });
  }
  g.userData.wheels = wheels;
  g.userData.gear = gear;
  driveLocomotive(g, 0);
  return g;
}

/**
 * Turn the wheels to `roll` (radians, from the distance driven) and move the side rods with them.
 * A wheel's rotation.x carries a pin at angle `a` from the top to (y, z) = CRANK (cos, sin)(a + roll),
 * which is where the pins parented to the wheels end up, so the rods computed here stay on them.
 */
export function driveLocomotive(g: THREE.Object3D, roll: number): void {
  for (const w of (g.userData.wheels ?? []) as THREE.Object3D[]) w.rotation.x = roll;
  for (const s of (g.userData.gear ?? []) as { sx: number; phase: number; coupling: THREE.Object3D; main: THREE.Object3D; head: THREE.Object3D }[]) {
    const dy = CRANK * Math.cos(s.phase + roll);
    const dz = CRANK * Math.sin(s.phase + roll);
    s.coupling.position.set(s.sx * ROD_X, AXLE_Y + dy, (AXLES[0] + AXLES[2]) / 2 + dz);
    // The crosshead stays on the cylinder's axis, the main rod's length ahead of the middle pin.
    const pz = AXLES[1] + dz;
    const hz = pz + Math.sqrt(MAIN_ROD * MAIN_ROD - dy * dy);
    s.head.position.z = hz;
    s.main.position.set(s.sx * (MAIN_X - 0.005), AXLE_Y + dy / 2, (pz + hz) / 2);
    s.main.rotation.x = Math.atan2(dy, hz - pz);
  }
}

/**
 * The birthday cake of the style frame, about 1.8 across and nearly half as tall: a dark baked foot,
 * two golden sponge layers with a bulging cream filling, and a thick glossy cap of ivory icing with a
 * rounded shoulder that hangs over the side in fat, round-ended drips. A few sprinkles; a tall red
 * candle in the middle, the only one lit, and slim pastel candles round it.
 */
export function makeCake(icing = 0xfff4de): THREE.Group {
  const g = new THREE.Group();
  const R = 0.8;
  const sponge = new THREE.MeshStandardMaterial({ color: 0xf6b462, roughness: 0.75, metalness: 0, vertexColors: true });
  const cream = new THREE.MeshPhysicalMaterial({ color: 0xfff4de, roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  // The cap and its drips; on the pale picnic cloth a strawberry pink, so the cake doesn't wash out.
  const glaze = icing === 0xfff4de ? cream : new THREE.MeshPhysicalMaterial({ color: icing, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  // Each layer is shaded by height (`shade(t)`, t from 0 at its foot to 1 at its top), so the sponge
  // darkens into the crevices under the filling and under the overhanging icing instead of reading
  // as one flat band of colour.
  const layer = (y0: number, y1: number, mat: THREE.Material, rr = R, shade = (_t: number) => 1) => {
    const geo = new THREE.CylinderGeometry(rr, rr, y1 - y0, 96, 12);
    const p = geo.attributes.position;
    const col: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const v = shade(p.getY(i) / (y1 - y0) + 0.5);
      col.push(v, v, v);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.add(at(part(geo, mat), 0, (y0 + y1) / 2, 0));
  };
  const crevice = (t: number, foot: number, head: number) =>
    1.05 - foot * (1 - THREE.MathUtils.smoothstep(t, 0, 0.8)) - head * THREE.MathUtils.smoothstep(t, 0.75, 1);
  layer(0, 0.05, plastic(0xdc9850, { rough: 0.8 }));
  layer(0.05, 0.28, sponge, R, (t) => crevice(t, 0.32, 0.15));
  layer(0.28, 0.36, cream, R + 0.01);
  // The filling squeezes out a little: a fat soft roll round the rim.
  const roll = part(new THREE.TorusGeometry(R + 0.015, 0.055, 14, 96).rotateX(Math.PI / 2), cream);
  g.add(at(roll, 0, 0.32, 0));
  layer(0.36, 0.62, sponge, R, (t) => crevice(t, 0.32, 0.3));
  // Icing: a domed cap with a rounded shoulder (lathe, outer to centre so it faces up) and a skirt
  // round the edge whose lower rim hangs in drips of uneven length with rounded ends.
  const TOP = 0.62;
  const O = R + 0.075;
  const cap = new THREE.LatheGeometry(
    [
      new THREE.Vector2(O, TOP + 0.0),
      new THREE.Vector2(O + 0.025, TOP + 0.04),
      new THREE.Vector2(O + 0.015, TOP + 0.085),
      new THREE.Vector2(O - 0.03, TOP + 0.115),
      new THREE.Vector2(R - 0.1, TOP + 0.13),
      new THREE.Vector2(0.4, TOP + 0.14),
      new THREE.Vector2(0, TOP + 0.145),
    ],
    128,
  );
  // Hand-spread icing is never flat: soft, low swells over the top, more towards the rim.
  const lump = cap.attributes.position;
  for (let i = 0; i < lump.count; i++) {
    const x = lump.getX(i);
    const z = lump.getZ(i);
    const r = Math.hypot(x, z) / O;
    const a = Math.atan2(z, x);
    lump.setY(i, lump.getY(i) + r * r * 0.032 * (Math.sin(a * 5 + 1) + 0.6 * Math.sin(a * 9 + r * 4)));
  }
  cap.computeVertexNormals();
  g.add(part(cap, glaze));
  const rng = seeded(11);
  const LOBES = 11;
  const cuts: number[] = [0];
  for (let i = 1; i < LOBES; i++) cuts.push(i / LOBES + (rng() - 0.5) * 0.4 / LOBES);
  cuts.push(1);
  const drop = cuts.slice(0, -1).map(() => 0.06 + rng() * 0.14);
  const skirt = new THREE.CylinderGeometry(O, O, 1, 360, 12, true);
  const pos = skirt.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const u = ((Math.atan2(z, x) / (Math.PI * 2)) + 1) % 1;
    let j = 0;
    while (cuts[j + 1] <= u) j++;
    const f = (u - cuts[j]) / (cuts[j + 1] - cuts[j]);
    const len = 0.04 + drop[j] * Math.sin(Math.PI * f) ** 0.4;
    const t = 0.5 - pos.getY(i);
    // Thick icing: the drips swell outward towards their ends.
    const k = 1 + 0.03 * t ** 2 * Math.sin(Math.PI * f);
    pos.setXYZ(i, x * k, TOP + 0.02 - t * len, z * k);
  }
  skirt.computeVertexNormals();
  g.add(part(skirt, glaze));
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2;
    const r = 0.12 + rng() * 0.6;
    const dot = glaze === cream ? (i % 3 ? 0xb0804a : 0x8a5a30) : i % 3 ? WHITE : 0xfff0a0;
    g.add(at(ball(0.02, dot, lowSphere), Math.cos(a) * r, TOP + 0.14, Math.sin(a) * r));
  }
  const fire = new THREE.MeshBasicMaterial({ color: 0xffc94a });
  const flames: THREE.Object3D[] = [];
  const candle = (x: number, z: number, h: number, color: number, lit: boolean) => {
    const base = TOP + 0.13;
    g.add(at(part(new THREE.CylinderGeometry(0.032, 0.034, h, 14), plastic(color, { rough: 0.35 })), x, base + h / 2, z));
    const wick = at(new THREE.Mesh(cyl, plastic(0x2a2018)), x, base + h + 0.02, z);
    wick.scale.set(0.006, 0.04, 0.006);
    g.add(wick);
    if (!lit) return;
    const f = at(new THREE.Mesh(sphere, fire), x, base + h + 0.09, z);
    f.userData.k = 0.9;
    g.add(f);
    flames.push(f);
  };
  candle(0, -0.05, 0.42, 0xe23040, true);
  const colors = [0x5a8ef0, 0xf09a3a, 0x9a5ad8, 0xf07aa0, 0xf2c84a, 0x6aa0f0, 0xf0a040, 0xe86a8a];
  colors.forEach((c, i) => {
    const a = (i / colors.length) * Math.PI * 2 + 0.3 + rng() * 0.3;
    const r = i % 2 ? 0.52 : 0.34;
    candle(Math.cos(a) * r, Math.sin(a) * r, 0.22 + rng() * 0.1, c, false);
  });
  g.userData.flames = flames;
  return g;
}

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
  // The camera looks down at 40°, so the ground is seen at a slant: without anisotropic filtering
  // the lawn, track and stump textures smear into a blur a short way off. three caps it at the GPU's max.
  t.anisotropy = 16;
  return t;
}

/**
 * Short grass from above: soft blotches of a few greens, then thin blade strokes in low contrast.
 * Everything is drawn nine times, shifted by a tile, so the edges wrap without a seam.
 */
function lawnTexture(rng: () => number): THREE.CanvasTexture {
  const S = 512;
  return canvasTexture(S, (x) => {
    x.fillStyle = '#4f7226';
    x.fillRect(0, 0, S, S);
    const wrap = (draw: (ox: number, oy: number) => void) => {
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) draw(ox, oy);
    };
    for (let i = 0; i < 60; i++) {
      const px = rng() * S;
      const py = rng() * S;
      const r = 30 + rng() * 70;
      const col = ['rgba(150,182,72,0.22)', 'rgba(36,62,16,0.32)'][i % 2];
      wrap((ox, oy) => {
        const cx = px + ox;
        const cy = py + oy;
        const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, col);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr;
        x.fillRect(cx - r, cy - r, r * 2, r * 2);
      });
    }
    const shades = ['#5f8230', '#86a648', '#557a2a', '#97b356'];
    x.lineCap = 'round';
    for (let i = 0; i < 5000; i++) {
      const px = rng() * S;
      const py = rng() * S;
      const dx = (rng() - 0.5) * 6;
      const dy = -6 - rng() * 9;
      x.strokeStyle = shades[i % 4];
      x.lineWidth = 1.5 + rng() * 1.5;
      x.globalAlpha = 0.55;
      x.beginPath();
      wrap((ox, oy) => {
        x.moveTo(px + ox, py + oy);
        x.lineTo(px + ox + dx, py + oy + dy);
      });
      x.stroke();
    }
    x.globalAlpha = 1;
  });
}

/**
 * The ground: a big plane with the lawn texture, and vertex colours that lay broad sunny and shady
 * patches over it (a few crossed sine waves), so the tiling never shows.
 */
export function makeLawn(rng: () => number, size: number): THREE.Mesh {
  const map = lawnTexture(rng);
  map.repeat.set(size / 6, size / 6);
  const geo = new THREE.PlaneGeometry(size, size, 120, 120).rotateX(-Math.PI / 2);
  const waves = Array.from({ length: 6 }, (_, i) => {
    const a = rng() * Math.PI * 2;
    const k = (Math.PI * 2) / (3 + i * 1.6);
    return { kx: Math.cos(a) * k, kz: Math.sin(a) * k, p: rng() * 6.3 };
  });
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const shade = new THREE.Color(0.6, 0.66, 0.6);
  const sun = new THREE.Color(0.96, 0.95, 0.86);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    let v = 0;
    for (const w of waves) v += Math.sin(w.kx * px + w.kz * pz + w.p);
    const t = THREE.MathUtils.smoothstep(v / waves.length, -0.45, 0.45);
    c.copy(shade).lerp(sun, t).toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 1, metalness: 0 }));
  m.receiveShadow = true;
  return m;
}


/**
 * The ground beyond the real grass, baked from the real grass so the two can't be told apart: once,
 * at start-up, a 6 m tile of the same clumps on the same lawn texture is drawn under the scene's own
 * lights into a texture, and a big unlit plane repeats it. The tile is drawn looking along the game
 * camera (`pitch` down from level, from the near side), squashed back onto the ground, so each
 * blade's slant and its sunny and shady sides are where the eye expects them. Clumps near the tile's
 * edges are drawn again a tile over, so it wraps without a seam. The baked clumps all wear one
 * average colour; the plane's vertex colours carry the real grass's own colour field (`tint`), so the
 * patches of lush and dry grass run on from the real clumps into the baked ones.
 */
export function makeTurf(
  renderer: THREE.WebGLRenderer,
  rng: () => number,
  size: number,
  pitch: number,
  light: (set: THREE.Scene) => void,
  tint: (x: number, z: number) => THREE.Color,
): THREE.Mesh {
  const T = 6;
  const set = new THREE.Scene();
  light(set);
  const soil = lawnTexture(rng);
  soil.repeat.set(3, 3);
  // The real ground's sun and shade patches average about this.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3 * T, 3 * T).rotateX(-Math.PI / 2).translate(T / 2, 0, -T / 2),
    new THREE.MeshStandardMaterial({ map: soil, color: 0xd0d0cc, roughness: 1, metalness: 0 }),
  );
  set.add(ground);

  // The average of the real grass's colour field, which the baked clumps wear.
  const mean = new THREE.Color(0, 0, 0);
  const N = 24;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const t = tint(-16 + (32 * i) / N, -16 + (32 * j) / N);
      mean.r += t.r / (N * N);
      mean.g += t.g / (N * N);
      mean.b += t.b / (N * N);
    }
  // Same clumps and sizes as the sward by the blanket (`makeMeadow`), as densely, with a few of the
  // taller ones among them.
  const blades = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  const kinds = [
    { geo: grassClump(6, 0.15, 0.4, 0x1f3a14, 0x9cc256, 2), count: Math.round(3.1 * T * T), h: 0.21, dh: 0.03, spread: 2.5 },
    { geo: grassClump(7, 0.13, 0.6, 0x1a3410, 0xa6c85c, 2), count: Math.round(0.35 * T * T), h: 0.25, dh: 0.05, spread: 1 },
  ];
  for (const k of kinds) {
    const mesh = new THREE.InstancedMesh(k.geo, blades, k.count * 9);
    let n = 0;
    for (let i = 0; i < k.count; i++) {
      const x = rng() * T;
      const z = -rng() * T;
      const turn = rng() * Math.PI * 2;
      const h = k.h + rng() * k.dh;
      const sx = h * k.spread * (1 + rng() * 0.4);
      const sz = h * k.spread * (1 + rng() * 0.4);
      c.copy(mean).multiplyScalar(0.94 + rng() * 0.12);
      for (const ox of [-T, 0, T])
        for (const oz of [-T, 0, T]) {
          d.position.set(x + ox, 0, z + oz);
          d.rotation.set(0, turn, 0);
          d.scale.set(sx, h, sz);
          d.updateMatrix();
          mesh.setMatrixAt(n, d.matrix);
          mesh.setColorAt(n++, c);
        }
    }
    mesh.frustumCulled = false;
    set.add(mesh);
  }

  // A parallel projection along the game camera's line of sight: each point slides down that line to
  // the ground, and the tile x 0..T, z -T..0 fills the texture, matching the big plane's UVs below.
  // The camera object only gives the lighting its viewing direction.
  const cam = new THREE.OrthographicCamera();
  cam.rotation.x = -pitch;
  cam.updateMatrixWorld();
  const cot = 1 / Math.tan(pitch);
  const sin = Math.sin(pitch);
  const cos = Math.cos(pitch);
  const oblique = new THREE.Matrix4().set(
    2 / T, 0, 0, -1,
    0, (2 * cot) / T, -2 / T, -1,
    0, -sin / 14, -cos / 14, 0,
    0, 0, 0, 1,
  );
  cam.projectionMatrix.multiplyMatrices(oblique, cam.matrixWorld);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  // Linear light in half floats, as the scene's own buffer holds it: the composer's tone mapping
  // then treats the baked grass and the real grass alike.
  const baked = new THREE.WebGLRenderTarget(1024, 1024, {
    type: THREE.HalfFloatType,
    samples: 4,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    anisotropy: renderer.capabilities.getMaxAnisotropy(),
  });
  const was = renderer.getRenderTarget();
  renderer.setRenderTarget(baked);
  renderer.render(set, cam);
  renderer.setRenderTarget(was);
  set.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  soil.dispose();

  const map = baked.texture;
  map.repeat.set(size / T, size / T);
  const geo = new THREE.PlaneGeometry(size, size, 120, 120).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = tint(pos.getX(i), pos.getZ(i));
    col[i * 3] = t.r / mean.r;
    col[i * 3 + 1] = t.g / mean.g;
    col[i * 3 + 2] = t.b / mean.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // Unlit: the light is in the bake already.
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, vertexColors: true }));
}

/**
 * One clump of grass: curved, tapering blades fanned round a point, dark at the root and bright at
 * the tip. Each blade's normal leans halfway between its own face and straight up, so blades turned
 * to the sun catch it and the others stay a shade darker: the lawn reads as separate blades.
 */
function grassClump(blades: number, width: number, lean: number, root: number, tip: number, SEG = 3): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const dark = new THREE.Color(root);
  const light = new THREE.Color(tip);
  const k = new THREE.Color();
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 0.7;
    const bend0 = lean * (0.6 + (b % 3) * 0.3);
    const h = 0.6 + ((b * 37) % 10) / 16;
    const ox = Math.cos(a) * 0.07;
    const oz = Math.sin(a) * 0.07;
    // Side to side across the blade, perpendicular to the way it leans.
    const sx = -Math.sin(a);
    const sz = Math.cos(a);
    const at = (t: number) => {
      const bend = bend0 * t * t;
      return { x: ox + Math.cos(a) * bend, y: h * t, z: oz + Math.sin(a) * bend, w: width * (1 - t) ** 0.8 };
    };
    for (let s = 0; s < SEG; s++) {
      const p = at(s / SEG);
      const q = at((s + 1) / SEG);
      // Face normal of this segment (side x along), blended with up.
      const tx = q.x - p.x;
      const ty = q.y - p.y;
      const tz = q.z - p.z;
      const n = new THREE.Vector3(-sz * ty, sz * tx - sx * tz, sx * ty).normalize();
      n.lerp(new THREE.Vector3(0, 1, 0), 0.62).normalize();
      const quad = [
        [p.x - sx * p.w, p.y, p.z - sz * p.w, s / SEG],
        [p.x + sx * p.w, p.y, p.z + sz * p.w, s / SEG],
        [q.x + sx * q.w, q.y, q.z + sz * q.w, (s + 1) / SEG],
        [q.x - sx * q.w, q.y, q.z - sz * q.w, (s + 1) / SEG],
      ];
      // Both faces as real triangles, the back one with the normal mirrored sideways but still up,
      // so a blade's back is lit like grass rather than flipped dark as DoubleSide would.
      for (const [order, f] of [[[0, 1, 2, 0, 2, 3], 1], [[0, 2, 1, 0, 3, 2], -1]] as const) {
        for (const i of order) {
          const [x, y, z, t] = quad[i];
          pos.push(x, y, z);
          nor.push(n.x * f, n.y, n.z * f);
          k.copy(dark).lerp(light, t ** 0.7);
          col.push(k.r, k.g, k.b);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/**
 * The stump the cake stands on, as in the style frame: `r` across the top, `h` tall. A warm cut face
 * with growth rings inside a dark bark lip that stands a little proud of it, and thick bark round the
 * side in uneven vertical plates split by deep dark grooves, flaring out where it meets the grass.
 */
export function makeLogSlice(r: number, h: number, rng: () => number): THREE.Group {
  const rings = canvasTexture(512, (x) => {
    x.fillStyle = '#ebcca2';
    x.fillRect(0, 0, 512, 512);
    const g = x.createRadialGradient(256, 256, 0, 256, 256, 250);
    g.addColorStop(0, 'rgba(170,110,60,0.2)');
    g.addColorStop(0.25, 'rgba(170,110,60,0)');
    g.addColorStop(0.85, 'rgba(255,230,180,0.0)');
    g.addColorStop(0.93, 'rgba(255,226,170,0.55)');
    g.addColorStop(1, 'rgba(120,64,30,0.6)');
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 512);
    // Broad soft bands of darker latewood under the fine rings, as the style frame shows.
    for (let i = 7; i > 0; i--) {
      x.fillStyle = i % 2 ? 'rgba(200,140,84,0.28)' : 'rgba(255,236,200,0.3)';
      x.beginPath();
      x.arc(256, 256, i * 33 + (rng() - 0.5) * 8, 0, Math.PI * 2);
      x.fill();
    }
    for (let i = 1; i < 32; i++) {
      x.strokeStyle = i % 4 ? 'rgba(196,140,90,0.45)' : 'rgba(168,112,66,0.6)';
      x.lineWidth = 1 + rng() * 1.6;
      x.beginPath();
      const rr = i * 7.3 + (rng() - 0.5) * 2.5;
      for (let k = 0; k <= 64; k++) {
        const a = (k / 64) * Math.PI * 2;
        const w = rr * (1 + 0.025 * Math.sin(a * 3 + i) + 0.015 * Math.sin(a * 7));
        const px = 256 + Math.cos(a) * w;
        const py = 256 + Math.sin(a) * w;
        if (k) x.lineTo(px, py);
        else x.moveTo(px, py);
      }
      x.stroke();
    }
    x.strokeStyle = 'rgba(130,76,36,0.6)';
    x.lineWidth = 2.5;
    for (const a of [0.7, 2.9, 4.6]) {
      x.beginPath();
      x.moveTo(256 + Math.cos(a) * 40, 256 + Math.sin(a) * 40);
      x.lineTo(256 + Math.cos(a + 0.06) * 150, 256 + Math.sin(a + 0.06) * 150);
      x.stroke();
    }
  });
  // Fine vertical grain over the bark; the plates and grooves themselves are in the geometry.
  const grain = canvasTexture(256, (x) => {
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(60,30,10,${0.08 + rng() * 0.14})`;
      x.fillRect(rng() * 256, 0, 1 + rng() * 3, 256);
    }
  });
  grain.repeat.set(6, 1);
  // Bark plates of uneven width round the stump; each has its own thickness and top height.
  const PLATES = 24;
  const cuts: number[] = [0];
  for (let i = 1; i < PLATES; i++) cuts.push(i / PLATES + (rng() - 0.5) * 0.5 / PLATES);
  cuts.push(1);
  const plate = cuts.slice(0, -1).map(() => ({ out: rng(), top: rng() }));
  const barkAt = (u: number) => {
    let i = 0;
    while (cuts[i + 1] <= u) i++;
    const f = (u - cuts[i]) / (cuts[i + 1] - cuts[i]);
    // Rounded plate face, falling into a sharp groove at each edge.
    const face = Math.sin(Math.PI * f) ** 0.22;
    return { k: 1 + 0.02 + 0.035 * plate[i].out * face - 0.05 * (1 - face), groove: 1 - face, top: plate[i].top };
  };
  // Profile, bottom to top: the flared foot, the side, the lip above the cut face and its inner edge.
  const rows: [number, number][] = [];
  for (let j = 0; j <= 8; j++) {
    const t = j / 8;
    rows.push([1 + 0.16 * (1 - t) ** 3, t * h]);
  }
  rows.push([1.005, h + 0.035], [0.955, h + 0.03], [0.93, h + 0.004]);
  const SEG = 240;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const dark = new THREE.Color(0x3a2010);
  const face = new THREE.Color(0x8c5232);
  const light = new THREE.Color(0xb47a4c);
  const c = new THREE.Color();
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      const a = u * Math.PI * 2;
      const b = barkAt(u % 1);
      const [rf, y0] = rows[j];
      const lip = j >= 9;
      const k = lip ? rf * (1 + (b.k - 1) * 0.5) : rf * b.k;
      const y = lip ? y0 + b.top * 0.03 : y0;
      pos.push(Math.cos(a) * r * k, y, -Math.sin(a) * r * k);
      c.copy(face).lerp(light, b.top * 0.5 * (1 - b.groove)).lerp(dark, b.groove ** 1.5);
      if (j === 0) c.multiplyScalar(0.6);
      if (lip) c.multiplyScalar(j === rows.length - 1 ? 0.55 : 0.75);
      col.push(c.r, c.g, c.b);
      uv.push(u, y / (h + 0.04));
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < SEG; i++) {
      const p = j * (SEG + 1) + i;
      const q = p + SEG + 1;
      idx.push(p, p + 1, q, p + 1, q + 1, q);
    }
  }
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  side.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  side.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  side.setIndex(idx);
  side.computeVertexNormals();
  const bark = new THREE.Mesh(side, new THREE.MeshStandardMaterial({ map: grain, vertexColors: true, roughness: 0.92, metalness: 0 }));
  bark.castShadow = bark.receiveShadow = true;
  // The rings are cut into the face: the same picture as a bump map, so each ring is a shallow
  // groove that catches light on one side and shade on the other. The face also domes a little.
  const disc = new THREE.CircleGeometry(r * 0.96, 96, 0, Math.PI * 2).rotateX(-Math.PI / 2);
  const fp = disc.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setY(i, 0.025 * (1 - (Math.hypot(fp.getX(i), fp.getZ(i)) / (r * 0.96)) ** 2));
  disc.computeVertexNormals();
  const top = new THREE.Mesh(disc, new THREE.MeshStandardMaterial({ map: rings, bumpMap: rings, bumpScale: 4, roughness: 0.7, metalness: 0 }));
  top.position.y = h + 0.006;
  top.receiveShadow = true;
  const g = new THREE.Group();
  g.add(bark, top);
  return g;
}

/**
 * Soft contact shade on the grass, where the style frame darkens the lawn round things standing on
 * it: a flat disc whose darkness at radius r sums `bands` (radius, width, strength), a bell each.
 */
export function makeContactShade(radius: number, bands: { r: number; w: number; k: number }[], color = 0x2a3a0c): THREE.Mesh {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  const img = x.createImageData(S, S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const r = (Math.hypot(i - S / 2 + 0.5, j - S / 2 + 0.5) / (S / 2)) * radius;
      let v = 0;
      for (const b of bands) v += b.k * Math.exp(-(((r - b.r) / b.w) ** 2));
      // The darkness goes in the green channel, which is what alphaMap reads.
      img.data.set([0, Math.min(255, v * 255), 0, 255], (j * S + i) * 4);
    }
  }
  x.putImageData(img, 0, 0);
  const alpha = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, alphaMap: alpha, transparent: true, depthWrite: false }),
  );
  m.position.y = 0.004;
  return m;
}

/**
 * Gingham, as on a picnic blanket: a cream ground crossed both ways by butter-yellow bands, deeper
 * where they cross, under a faint woven grain so it reads as cotton. Low contrast on purpose, so the
 * dark bugs and the red train stay the strongest things on it. One tile holds `bands` bands each way.
 */
function ginghamTexture(rng: () => number, bands: number, band = 'rgba(232, 168, 56, 0.55)', base = '#fbf1d6'): THREE.CanvasTexture {
  const S = 512;
  return canvasTexture(S, (x) => {
    x.fillStyle = base;
    x.fillRect(0, 0, S, S);
    const w = S / bands / 2;
    x.fillStyle = band;
    for (let i = 0; i < bands; i++) {
      x.fillRect(i * 2 * w, 0, w, S);
      x.fillRect(0, i * 2 * w, S, w);
    }
    for (let i = 0; i < 3000; i++) {
      x.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(110,70,20,0.06)';
      const len = 6 + rng() * 14;
      if (rng() < 0.5) x.fillRect(rng() * S, rng() * S, len, 1);
      else x.fillRect(rng() * S, rng() * S, 1, len);
    }
  });
}

/**
 * The picnic blanket the board stands on: a square `half` from the middle to each edge, turned by
 * `yaw`, with checks `check` wide. It lies on the lawn in a few soft, shallow folds that fade out at
 * the hem, where the cloth meets the grass; the edges wander a little so it isn't a ruled square.
 * The folds stay a couple of centimetres high, so the bugs walking over it don't sink in.
 */
export function makeBlanket(rng: () => number, half: number, yaw: number, check: number): THREE.Mesh {
  const map = ginghamTexture(rng, 4);
  const tiles = (half * 2) / (check * 8);
  map.repeat.set(tiles, tiles);
  const geo = new THREE.PlaneGeometry(half * 2, half * 2, 96, 96).rotateX(-Math.PI / 2);
  const folds = Array.from({ length: 4 }, (_, i) => {
    const a = rng() * Math.PI * 2;
    const k = (Math.PI * 2) / (2.5 + i * 1.3);
    return { kx: Math.cos(a) * k, kz: Math.sin(a) * k, p: rng() * 6.3 };
  });
  const hem = Array.from({ length: 2 }, () => ({ k: 0.8 + rng() * 0.8, p: rng() * 6.3 }));
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let f = 0;
    for (const w of folds) f += Math.sin(w.kx * x + w.kz * z + w.p);
    f = THREE.MathUtils.smoothstep(f / folds.length, -0.5, 0.5);
    const edge = half - Math.max(Math.abs(x), Math.abs(z));
    const lift = THREE.MathUtils.smoothstep(edge, 0, 0.25);
    pos.setY(i, 0.004 + lift * (0.006 + 0.03 * f));
    // The hem wanders in and out a little along each side.
    const near = 1 - THREE.MathUtils.smoothstep(edge, 0, 0.6);
    pos.setX(i, x + near * 0.08 * Math.sin(z * hem[0].k + hem[0].p));
    pos.setZ(i, z + near * 0.08 * Math.sin(x * hem[1].k + hem[1].p));
    // The folds' hollows lie in a little shade, the crests catch the sun.
    const v = 0.78 + 0.22 * f;
    col.set([v, v, v], i * 3);
  }
  geo.rotateY(yaw);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.95, metalness: 0 }));
  m.receiveShadow = true;
  return m;
}

/** A ceramic cake stand: a round foot, a short column and a plate `r` wide with a turned-up rim, its top at `h`. Mint, so it parts the cake from the yellow cloth. */
export function makeCakeStand(r: number, h: number, color = 0x9ed8c2): THREE.Mesh {
  const profile = [
    [0, 0], [0.44, 0], [0.47, 0.02], [0.44, 0.05], [0.2, 0.09], [0.12, 0.15],
    [0.11, h - 0.1], [0.2, h - 0.06], [r - 0.08, h - 0.04], [r, h + 0.01], [r + 0.01, h + 0.04],
    [r - 0.03, h + 0.045], [r - 0.12, h], [0, h],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const m = part(new THREE.LatheGeometry(profile, 64), plastic(color, { rough: 0.3 }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * A few things left on the cloth, to break up the empty yellow: a folded red gingham napkin with a
 * spoon on it, and a couple of strawberries. Flat or small, so the bugs walk past and over them.
 */
export function makePicnicProps(rng: () => number): { napkin: THREE.Group; berries: THREE.Group } {
  const napkin = new THREE.Group();
  const map = ginghamTexture(rng, 3, 'rgba(214, 52, 52, 0.62)', '#fdf6ec');
  const cloth = new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
  // Two layers of a folded square, the top one turned a little and slightly smaller.
  for (const [s, y, a] of [[1, 0.012, 0], [0.9, 0.03, 0.12]] as const) {
    const layer = part(new THREE.BoxGeometry(s, 0.018, s), cloth);
    layer.position.y = y;
    layer.rotation.y = a;
    layer.receiveShadow = true;
    napkin.add(layer);
  }
  const steel = plastic(0xdfe4ea, { rough: 0.25 });
  const bowl = part(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  bowl.scale.set(0.11, 0.03, 0.15);
  bowl.rotation.x = Math.PI;
  bowl.position.set(0, 0.07, -0.22);
  const handle = part(new THREE.BoxGeometry(0.045, 0.02, 0.5), steel);
  handle.position.set(0, 0.05, 0.13);
  const spoon = new THREE.Group().add(bowl, handle);
  spoon.rotation.y = 0.7;
  napkin.add(spoon);

  const berries = new THREE.Group();
  const flesh = plastic(0xe0283a, { rough: 0.35 });
  const leaf = plastic(0x3e8a2a);
  const berryGeo = new THREE.SphereGeometry(1, 14, 10);
  const bp = berryGeo.attributes.position;
  // Wide at the shoulder, tapering to a rounded point.
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i);
    const k = y < 0 ? 1 + y * 0.45 : 1;
    bp.setXYZ(i, bp.getX(i) * k, y * 1.15, bp.getZ(i) * k);
  }
  berryGeo.computeVertexNormals();
  for (const [x, z, a] of [[0, 0, 0.3], [0.3, 0.18, 2.1]] as const) {
    const b = new THREE.Group();
    const body = part(berryGeo, flesh);
    body.scale.setScalar(0.13);
    body.castShadow = true;
    const cap = part(cone, leaf);
    cap.scale.set(0.12, 0.03, 0.12);
    cap.position.y = 0.14;
    b.add(body, cap);
    // Lying on its side, point outwards.
    b.rotation.set(0, a, Math.PI / 2 - 0.2);
    b.position.set(x, 0.12, z);
    berries.add(b);
  }
  return { napkin, berries };
}

/**
 * The wooden toy track: a flat ring `inner`..`outer`, `height` thick with a bevelled edge, two wheel grooves and joints.
 * `wood` and `groove` set the colours: on the pale cloth it is a darker honey wood so the ring stands out.
 */
export function makeTrack(inner: number, outer: number, height: number, wood = 0xe8c48e, groove = 0xc49460): THREE.Group {
  const shape = new THREE.Shape().absarc(0, 0, outer, 0, Math.PI * 2, false);
  shape.holes.push(new THREE.Path().absarc(0, 0, inner, 0, Math.PI * 2, true));
  const bevel = 0.03;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 72 });
  geo.rotateX(-Math.PI / 2).translate(0, bevel, 0);
  const g = new THREE.Group();
  const ring = new THREE.Mesh(geo, plastic(wood));
  ring.castShadow = ring.receiveShadow = true;
  g.add(ring);
  const grooveMat = plastic(groove);
  const mid = (inner + outer) / 2;
  const gap = (outer - inner) * 0.34;
  for (const r of [mid - gap, mid + gap]) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.025, r + 0.025, 96), grooveMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = height + 0.003;
    g.add(m);
  }
  const jointGeo = new THREE.BoxGeometry(outer - inner, 0.006, 0.025);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const joint = new THREE.Mesh(jointGeo, grooveMat);
    joint.position.set(Math.cos(a) * mid, height + 0.003, Math.sin(a) * mid);
    joint.rotation.y = -a;
    g.add(joint);
  }
  return g;
}

/**
 * The marshmallow fence: `posts` soft square posts with rounded tops on a circle of radius `r`, pink
 * and white in turn and close together, and two thick gold wafer sticks between neighbours. The
 * sticks are single meshes, the posts one instanced mesh.
 *
 * As in the style frame: broad flat faces with soft bevelled edges, a gradient baked into vertex
 * colours (lighter at the top, a little darker where it meets the grass), and a satin sheen.
 *
 * `bite(angle)` jolts the post nearest that angle; `wobble(t)` (every frame) rocks the jolted posts
 * in and out with a red flush that fades, so the player sees where the fence is being eaten.
 *
 * `paint(frac, biters)` breaks the fence where it is being eaten: how much is broken follows the
 * health left, where follows the bugs chewing it this frame (`biters`, each with its bite rate), so
 * a post nobody touches never changes. Each post wears down smoothly from whole (0) to a stump (1),
 * leaning a little as it goes; the wafers between two posts sag and fall as they wear. A worn-out
 * post passes the rest of its bites to its neighbours, so a gap widens from where they chew. A
 * repair mends the least eaten posts first, so the spot still under attack stays broken instead of
 * mending and breaking again.
 *
 * `gapAt(angle)` says how far the fence is down at an angle, so a bug chewing there can step into
 * the gap (units.ts).
 */
export interface Fence {
  group: THREE.Group;
  bite(angle: number): void;
  wobble(t: number): void;
  /** Break or mend to match `frac` of health left: where posts were mended, how many fell to stumps. */
  paint(frac: number, biters: FenceBiter[]): { mended: { x: number; z: number }[]; felled: number };
  /** Whole again and every bite forgotten (a new run). */
  reset(): void;
  /** How open the fence is at this angle: 0 while the posts there stand, 1 once both are stumps with their wafers down. */
  gapAt(angle: number): number;
}

/** A bug chewing the fence: where it stands and how fast it eats (wall damage per second). */
export interface FenceBiter {
  x: number;
  z: number;
  rate: number;
}

/** Height a post keeps once it is eaten down to a stump. */
const STUMP = 0.36;
/**
 * Share of the posts eaten down to stumps when the wall falls. All of them would strip half the
 * ring bare at half health; this many leave gaps where the bugs come from and the rest standing.
 */
const FENCE_WORN_AT_ZERO = 0.4;

export function makeFence(r: number, posts: number): Fence {
  const g = new THREE.Group();
  const H = 1.0;
  const W = 0.2;
  const D = 0.3;
  const B = 0.06;
  const R = 0.13;
  // Front profile: a rectangle with well-rounded top corners, extruded front to back with a bevel;
  // its foot sinks into the grass.
  const x0 = W - B;
  const y1 = H - B;
  const shape = new THREE.Shape()
    .moveTo(-x0, -0.2)
    .lineTo(x0, -0.2)
    .lineTo(x0, y1 - R)
    .quadraticCurveTo(x0, y1, x0 - R, y1)
    .lineTo(-x0 + R, y1)
    .quadraticCurveTo(-x0, y1, -x0, y1 - R)
    .closePath();
  const postGeo = new THREE.ExtrudeGeometry(shape, { depth: D - B * 2, bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelSegments: 4, curveSegments: 8 });
  postGeo.translate(0, 0, -(D - B * 2) / 2);
  const pos = postGeo.attributes.position;
  const shade = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / H, 0, 1);
    // Only the foot darkens a little where the grass shades it; the rest stays clean and even.
    const v = 0.88 + 0.12 * THREE.MathUtils.smoothstep(t, 0, 0.3);
    shade.set([v, v, v], i * 3);
  }
  postGeo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  // Soft like new marshmallow: a smooth satin base under a light, broad lacquer highlight.
  const soft = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.4 });
  const set = new THREE.InstancedMesh(postGeo, soft, posts);
  const pink = new THREE.Color(0xf7aecb);
  const white = new THREE.Color(0xfffaf4);
  const d = new THREE.Object3D();
  const step = (Math.PI * 2) / posts;
  for (let i = 0; i < posts; i++) {
    const a = i * step;
    d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    // Broad side along the fence: local x on the tangent.
    d.rotation.set(0, -a - Math.PI / 2, 0);
    d.updateMatrix();
    set.setMatrixAt(i, d.matrix);
    set.setColorAt(i, i % 2 ? white : pink);
  }
  set.castShadow = true;
  set.receiveShadow = true;
  g.add(set);
  const len = 2 * r * Math.sin(step / 2);
  const railGeo = new THREE.CylinderGeometry(0.065, 0.065, len, 16).rotateZ(Math.PI / 2);
  const wafer = new THREE.MeshPhysicalMaterial({ color: 0xf0b040, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15 });
  const rails: THREE.Mesh[] = [];
  for (let i = 0; i < posts; i++) {
    const a = (i + 0.5) * step;
    const rr = r * Math.cos(step / 2);
    for (const y of [0.3, 0.62]) {
      const rail = new THREE.Mesh(railGeo, wafer);
      rail.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
      rail.rotation.set(0, -a - Math.PI / 2, 0);
      rail.castShadow = true;
      g.add(rail);
      rails.push(rail);
    }
  }
  const jolt = new Float32Array(posts);
  /** How far each post is eaten, 0 whole to 1 a stump. */
  const worn = new Float32Array(posts);
  /** All the eating each post has taken this run; only grows, and orders the mending. */
  const eaten = new Float32Array(posts);
  // A fixed lean per post as it wears.
  const lean = Array.from({ length: posts }, (_, i) => Math.sin(i * 91.7) * 0.6);
  const hurt = new THREE.Color(0xff5a5a);
  const tint = new THREE.Color();
  let last = 0;
  let wobbleT = 0;
  const ease = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const place = (i: number) => {
    const a = i * step;
    const k = jolt[i];
    const w = worn[i];
    d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    // Local z points out of the ring: a tilt about local x rocks the post in and out; a worn post
    // leans to one side and is eaten down towards a stump.
    d.rotation.set(Math.sin(wobbleT * 38) * 0.22 * k, -a - Math.PI / 2, lean[i] * w, 'YXZ');
    d.scale.set(1, 1 - (1 - STUMP) * w, 1);
    d.updateMatrix();
    set.setMatrixAt(i, d.matrix);
    set.setColorAt(i, tint.copy(i % 2 ? white : pink).lerp(hurt, 0.55 * k));
  };
  /** The two wafers between post i and the next wear with the two posts: the top one sags and falls first. */
  const placeRails = (i: number) => {
    const w = (worn[i] + worn[(i + 1) % posts]) / 2;
    const a = (i + 0.5) * step;
    for (const [n, rail] of [rails[i * 2], rails[i * 2 + 1]].entries()) {
      const sag = n ? ease(0.1, 0.45, w) : ease(0.3, 0.7, w);
      rail.visible = w < (n ? 0.5 : 0.75);
      rail.position.y = (n ? 0.62 : 0.3) - sag * (n ? 0.2 : 0.14);
      rail.rotation.set(0, -a - Math.PI / 2, sag * (n ? 0.5 : -0.4));
    }
  };
  const redraw = (i: number) => {
    place(i);
    placeRails(i);
    placeRails((i + posts - 1) % posts);
  };
  const flush = () => {
    set.instanceMatrix.needsUpdate = true;
    set.instanceColor!.needsUpdate = true;
  };
  /** Wear `amt` into post i; what a stump can't take spills to the less worn side, then on outwards. */
  const wear = (i: number, amt: number): number => {
    let felled = 0;
    for (let reach = 0; amt > 1e-6 && reach <= posts / 2; reach++) {
      const sides = reach === 0 ? [i] : [(i + reach) % posts, (i - reach + posts) % posts].sort((p, q) => worn[q] - worn[p]);
      for (const j of sides) {
        if (amt <= 1e-6 || worn[j] >= 1) continue;
        const take = Math.min(amt, 1 - worn[j]);
        worn[j] += take;
        eaten[j] += take;
        amt -= take;
        if (worn[j] >= 1 - 1e-6) {
          worn[j] = 1;
          felled++;
        }
        redraw(j);
      }
    }
    return felled;
  };
  return {
    group: g,
    bite(angle) {
      const i = ((Math.round(angle / step) % posts) + posts) % posts;
      jolt[i] = 1;
    },
    gapAt(angle) {
      const u = (((angle / step) % posts) + posts) % posts;
      const i = Math.floor(u) % posts;
      const f = u - Math.floor(u);
      // Open once the lower wafer is on its way down (it falls at 0.75).
      return ease(0.45, 0.8, worn[i] * (1 - f) + worn[(i + 1) % posts] * f);
    },
    paint(frac, biters) {
      const want = Math.min(1, Math.max(0, 1 - frac)) * posts * FENCE_WORN_AT_ZERO;
      const have = worn.reduce((n, w) => n + w, 0);
      const mended: { x: number; z: number }[] = [];
      let felled = 0;
      let delta = want - have;
      if (Math.abs(delta) < 1e-4) return { mended, felled };
      if (delta > 0) {
        const total = biters.reduce((n, b) => n + b.rate, 0);
        if (total > 0) {
          // Each bug eats its share, split between the two posts either side of where it stands.
          for (const b of biters) {
            const u = ((Math.atan2(b.z, b.x) / step) % posts + posts) % posts;
            const i = Math.floor(u);
            const f = u - i;
            const amt = (delta * b.rate) / total;
            felled += wear(i % posts, amt * (1 - f)) + wear((i + 1) % posts, amt * f);
          }
        } else {
          // Health lost with nobody at the fence: wear on the post already most eaten.
          let i = 0;
          for (let j = 1; j < posts; j++) if (worn[j] < 1 && (worn[i] >= 1 || eaten[j] > eaten[i])) i = j;
          felled += wear(i, delta);
        }
      } else {
        // Mend the least eaten posts first; each one mended this frame sparkles once.
        while (delta < -1e-6) {
          let i = -1;
          for (let j = 0; j < posts; j++) if (worn[j] > 0 && (i < 0 || eaten[j] < eaten[i])) i = j;
          if (i < 0) break;
          const take = Math.min(-delta, worn[i]);
          worn[i] -= take;
          delta += take;
          redraw(i);
          if (take > 0.05) {
            const a = i * step;
            mended.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
          }
        }
      }
      flush();
      return { mended, felled };
    },
    reset() {
      eaten.fill(0);
      jolt.fill(0);
      worn.fill(0);
      for (let i = 0; i < posts; i++) redraw(i);
      flush();
    },
    wobble(t) {
      const dt = Math.min(0.1, Math.max(0, t - last));
      last = t;
      wobbleT = t;
      let moved = false;
      for (let i = 0; i < posts; i++) {
        if (jolt[i] <= 0) continue;
        jolt[i] = Math.max(0, jolt[i] - dt * 3);
        place(i);
        moved = true;
      }
      if (moved) flush();
    },
  };
}

/** Seconds on the view clock, read by the grass shader; animateStage moves it on. */
export const wind = { value: 0 };

/** How many walkers the grass can bend round at once; past that the rest walk on it unbent. */
export const PRESSERS = 24;
/** Walkers pressing the grass down: x, z, radius (0 = unused slot). Units fills it every frame. */
export const pressers = { value: Array.from({ length: PRESSERS }, () => new THREE.Vector4()) };

/**
 * Sway a material's instanced blades in the wind: each vertex is pushed downwind by the square of
 * its height, so roots stay put and tips swing. Two slow waves rolling across the lawn make the
 * gusts travel as in a real meadow rather than every tuft nodding in step. The same code goes into
 * the shadow pass, so the shadows sway with the blades. `amp` scales the swing: flowers stand on
 * stems the model leaves out, so their heads swing wider than a blade tip at the same height.
 * `rate` scales the tempo: a flower head on its long stem nods slower than a short blade flutters.
 */
function swaying<M extends THREE.Material>(m: M, amp = 1, rate = 1): M {
  // three caches programs by the hook's source text, which is the same for every amp and rate.
  m.customProgramCacheKey = () => `sway:${amp}:${rate}`;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind;
    sh.uniforms.uPress = pressers;
    sh.vertexShader = `uniform float uWind;\nuniform vec4 uPress[${PRESSERS}];\n` + sh.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      // Round each walker the blades lie down and part outwards, flattest right under it.
      float h0 = max(mvPosition.y, 0.0);
      for (int i = 0; i < ${PRESSERS}; i++) {
        vec4 b = uPress[i];
        if (b.z <= 0.0) continue;
        vec2 off = mvPosition.xz - b.xy;
        float press = 1.0 - smoothstep(b.z * 0.4, b.z * 1.4, length(off));
        mvPosition.y *= 1.0 - 0.75 * press;
        mvPosition.xz += normalize(off + 1e-4) * h0 * press * 0.6;
      }
      float h = max(mvPosition.y, 0.0);
      float t = uWind * ${rate.toFixed(3)};
      float gust = 0.35 + 0.6 * sin(t * 1.1 - mvPosition.x * 0.35 - mvPosition.z * 0.2)
                 + 0.25 * sin(t * 2.7 + mvPosition.x * 1.6 - mvPosition.z * 1.3);
      mvPosition.xz += vec2(0.85, 0.5) * gust * h * h * ${(0.32 * amp).toFixed(3)};
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  return m;
}

/**
 * Grass tufts, daisies and broad leaves scattered over the lawn, one instanced mesh per kind.
 * Tufts go anywhere from `from` to `to` that `bare(r)` leaves free; flowers and leaves only past `flowers`.
 * In each `fringe` band (just off the foot of the stump, both track edges, either side of the fence) a
 * dense row of short tufts spills over the seam, so nothing stands on the lawn with a clean cut line round it.
 * `skip(x, z)` keeps grass, flowers and leaves off any spot it marks (under the picnic blanket, out past the real grass).
 */
export function makeMeadow(
  rng: () => number,
  from: number,
  to: number,
  flowers: number,
  bare: (r: number) => boolean,
  fringe: [number, number][] = [],
  skip: (x: number, z: number) => boolean = () => false,
): THREE.Group {
  const g = new THREE.Group();
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  // An area-even point between radius a and b.
  const spot = (a: number, b: number) => {
    const r = Math.sqrt(a * a + rng() * (b * b - a * a));
    const t = rng() * Math.PI * 2;
    return { r, x: Math.cos(t) * r, z: Math.sin(t) * r };
  };

  // Grass in layers, as in the style frame: a short fine sward everywhere, and taller, looser clumps
  // gathered in patches; two slow fields pick where the grass grows tall and where it lies in sun or
  // shade, so the lawn has hollows and tufts instead of an even pile.
  const field = (k: number) => {
    const w = Array.from({ length: 4 }, (_, i) => {
      const a = rng() * Math.PI * 2;
      const f = (Math.PI * 2) / (k + i * k * 0.6);
      return { x: Math.cos(a) * f, z: Math.sin(a) * f, p: rng() * 6.3 };
    });
    return (x: number, z: number) => 0.5 + w.reduce((s, q) => s + Math.sin(q.x * x + q.z * z + q.p), 0) / 6;
  };
  const tallness = field(2.2);
  const sunny = field(3.5);
  // Broad patches a few metres across, as a real lawn has: lusher, darker and a little longer in
  // some, thinner, paler and shorter in others. Without them the board reads as one flat carpet.
  const patch = field(7);
  const lush = (x: number, z: number) => THREE.MathUtils.smoothstep(patch(x, z), 0.3, 0.7);
  const tint = (x: number, z: number) => {
    const t = THREE.MathUtils.clamp(sunny(x, z), 0, 1);
    const l = lush(x, z);
    // Lush patches are deep and cool, dry ones pale and warm; the sun field lifts both.
    const r = 0.5 + 0.22 * t + 0.14 * (1 - l);
    const g = 0.56 + 0.26 * t + 0.06 * (1 - l);
    const b = 0.44 + 0.18 * t - 0.04 * (1 - l);
    // Cooler, bluer clumps gather in their own patches rather than speckling the lawn one by one.
    if (sunny(z * 1.7 + 3, x * 1.7 - 2) > 0.72) return c.setRGB(r * 0.86, g * 0.94, b * 1.12);
    return c.setRGB(r, g, b);
  };
  // For the baked turf further out (`makeTurf`), so its colour runs on from these clumps.
  g.userData.tint = tint;
  const blades = swaying(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }));
  const shadow = swaying(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  // Phones hold 30 fps at about 200k triangles a frame (§16.18), so the lawn is budgeted: grass casts
  // no shadow (the sward is too low to throw one that reads, the tall clumps stand outside the sun's
  // shadow box, and the shadow pass would draw it all again), and the big layers are cut into tiles
  // so the ones off screen are skipped.
  const TILE = 8;
  const layer = (
    geo: THREE.BufferGeometry,
    count: number,
    place: () => { r: number; x: number; z: number } | null,
    size: (x: number, z: number) => number,
    { spread = 1, edge = false, tiled = false } = {},
  ) => {
    const tiles = new Map<string, { m: THREE.Matrix4; c: THREE.Color }[]>();
    for (let i = 0; i < count; i++) {
      const p = place();
      if (!p || (!edge && bare(p.r)) || skip(p.x, p.z)) continue;
      d.position.set(p.x, 0, p.z);
      d.rotation.set(0, rng() * Math.PI * 2, 0);
      // The sward is cropped short along the track, so the wooden ring reads clearly through it.
      const h = size(p.x, p.z) * (!edge && (bare(p.r + 0.3) || bare(p.r - 0.3)) ? 0.55 : 1);
      d.scale.set(h * spread * (1 + rng() * 0.4), h, h * spread * (1 + rng() * 0.4));
      d.updateMatrix();
      const key = tiled ? `${Math.floor(p.x / TILE)},${Math.floor(p.z / TILE)}` : '';
      if (!tiles.has(key)) tiles.set(key, []);
      tiles.get(key)!.push({ m: d.matrix.clone(), c: tint(p.x, p.z).clone() });
    }
    for (const list of tiles.values()) {
      const set = new THREE.InstancedMesh(geo, blades, list.length);
      list.forEach((e, n) => {
        set.setMatrixAt(n, e.m);
        set.setColorAt(n, e.c);
      });
      // Bounds round the instances, not the one clump at the origin, so a tile off screen is culled.
      set.computeBoundingSphere();
      // The quality ladder thins the lawn by drawing only the first part of each set; the clumps
      // went in in random order, so any prefix is an even thinning.
      set.userData.clumps = list.length;
      set.castShadow = false;
      set.receiveShadow = true;
      set.customDepthMaterial = shadow;
      g.add(set);
    }
  };
  const anywhere = () => {
    const u = rng();
    return u < 0.3 ? spot(from, flowers) : u < 0.8 ? spot(flowers - 0.5, flowers + 5) : spot(from, to);
  };
  // Inside the track the lawn is a short, even sward round the stump, as in the style frame.
  const yard = flowers - 1.8;
  // Seen from the game camera, many fine blades blur into speckle; fewer, broader blades per clump
  // read as separate tufts with a dark heart, as in the style frame. Dark cool roots against paler
  // tips give the lawn its depth, and the darker ground under them lets the shadows show.
  // Kept short, a mown lawn to play on: the ants walk through it and must stay in plain sight. Short
  // clumps cover little ground, so each is splayed wide (the blades lie out more than they stand up)
  // and most are spread evenly by area, so no bald patches of bare earth open up between them.
  const ROOT = 0x1f3a14;
  const TIP = 0x9cc256;
  layer(
    grassClump(6, 0.15, 0.4, ROOT, TIP, 2),
    2100,
    () => {
      const p = rng() < 0.65 ? spot(from, to) : anywhere();
      return p.r < yard ? null : p;
    },
    (x, z) => 0.16 + 0.05 * tallness(x, z) + 0.05 * lush(x, z) + rng() * 0.03,
    { spread: 2.5, tiled: true },
  );
  // The yard between the stump and the track sits right under the camera and no ant walks there, so
  // it gets fewer, bigger tufts of its own: they read as plump clumps up close and cost a third as much.
  layer(
    grassClump(9, 0.13, 0.45, ROOT, TIP, 2),
    300,
    () => spot(from, yard + 0.3),
    (x, z) => 0.18 + 0.05 * tallness(x, z) + 0.05 * lush(x, z) + rng() * 0.04,
    { spread: 2.6 },
  );
  // Taller clumps only where the field says so, and only well out past the flower band, where they
  // frame the board without hiding the ants on their way in.
  layer(
    grassClump(7, 0.13, 0.6, 0x1a3410, 0xa6c85c, 2),
    2200,
    () => {
      const p = anywhere();
      return p.r > flowers + 4 && tallness(p.x, p.z) + 0.3 * lush(p.x, p.z) > 0.55 + rng() * 0.4 ? p : null;
    },
    (x, z) => 0.2 + 0.1 * tallness(x, z) + rng() * 0.05,
    { tiled: true },
  );
  // The fringes: short tufts packed along each seam, rooted on the grass side of it so their blades
  // lap over the edge of the wood and round the fence posts without growing up through them.
  for (const [a, b] of fringe) {
    layer(
      grassClump(7, 0.11, 0.45, ROOT, TIP, 2),
      Math.round(a * 70),
      () => spot(a, b),
      (x, z) => 0.13 + 0.05 * tallness(x, z) + rng() * 0.04,
      { spread: 1.8, edge: true },
    );
  }

  // Flowers, as in the style frame: daisies dotted singly or in twos and threes, most of them in a
  // band just outside the fence, and a few broad-leaved clumps further out towards the corners.
  // They draw from their own seed, so retuning the grass doesn't move them about.
  const bloom = seeded(7);
  const plot = (a: number, b: number) => {
    for (;;) {
      const r = Math.sqrt(a * a + bloom() * (b * b - a * a));
      const t = bloom() * Math.PI * 2;
      const p = { r, x: Math.cos(t) * r, z: Math.sin(t) * r };
      if (!skip(p.x, p.z)) return p;
    }
  };
  const BEDS = 40;
  const NEAR = 28;
  const beds = Array.from({ length: BEDS }, (_, i) => plot(i < NEAR ? flowers : flowers + 2, i < NEAR ? flowers + 1.6 : to));

  // Daisies: twelve white petals cupped a little round a domed yellow middle, held just above the sward.
  const petal = new THREE.SphereGeometry(1, 6, 3).scale(0.1, 0.022, 0.036).translate(0.13, 0, 0).rotateZ(0.18);
  const petals = mergeGeometries(Array.from({ length: 12 }, (_, i) => petal.clone().rotateY((i / 12) * Math.PI * 2)));
  const middle = new THREE.SphereGeometry(0.07, 8, 5).scale(1, 0.6, 1);
  const DAISIES = 90;
  // Flowers and leaves sway with the grass and bow under passing ants, so they get their own
  // swaying materials rather than the shared plastic ones.
  const swayed = (color: number, rough: number) => swaying(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }), 4, 0.4);
  const bowing = swaying(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), 4, 0.4);
  const heads = new THREE.InstancedMesh(petals, swayed(WHITE, 0.5), DAISIES);
  const hearts = new THREE.InstancedMesh(middle, swayed(0xffc020, 0.5), DAISIES);
  heads.castShadow = true;
  heads.customDepthMaterial = bowing;
  for (let i = 0; i < DAISIES; i++) {
    const b = beds[i % beds.length];
    const a = bloom() * Math.PI * 2;
    const r = i < BEDS ? 0 : 0.15 + bloom() * 0.3;
    d.position.set(b.x + Math.cos(a) * r, 0.2 + bloom() * 0.1, b.z + Math.sin(a) * r);
    d.rotation.set((bloom() - 0.5) * 0.5, bloom() * 6, (bloom() - 0.5) * 0.5);
    d.scale.setScalar(1.1 + bloom() * 0.5);
    d.updateMatrix();
    heads.setMatrixAt(i, d.matrix);
    d.position.y += 0.012 * d.scale.x;
    d.updateMatrix();
    hearts.setMatrixAt(i, d.matrix);
  }
  g.add(heads, hearts);

  // Broad leaves in clumps of five, fanning out and barely tilted up: only under the outer beds, so
  // the fence band stays flowers and grass. They lie low enough that their tips stay below the
  // daisy heads sharing the bed.
  const leaf = new THREE.SphereGeometry(1, 10, 6).scale(0.26, 0.05, 0.62).translate(0, 0, 0.6);
  const leafy = beds.slice(NEAR);
  const CLUMPS = leafy.length;
  const leaves = new THREE.InstancedMesh(leaf, swayed(WHITE, 0.45), CLUMPS * 5);
  leaves.castShadow = true;
  leaves.customDepthMaterial = bowing;
  leaves.receiveShadow = true;
  for (let i = 0; i < CLUMPS; i++) {
    const p = leafy[i];
    const s = 0.7 + bloom() * 0.4;
    for (let k = 0; k < 5; k++) {
      d.position.set(p.x + (bloom() - 0.5) * 0.3, 0.02, p.z + (bloom() - 0.5) * 0.3);
      d.rotation.set(-0.1 - bloom() * 0.15,(k / 5) * Math.PI * 2 + bloom(), 0, 'YXZ');
      d.scale.setScalar(s * (0.8 + bloom() * 0.4));
      d.updateMatrix();
      leaves.setMatrixAt(i * 5 + k, d.matrix);
      leaves.setColorAt(i * 5 + k, c.setHex(k % 2 ? 0x3a6418 : 0x5a8a2a));
    }
  }
  g.add(leaves);
  // Grass and flowers are no wall: a bug wading through them shows as it is, not as its x-ray
  // ghost (BUG_XRAY). Drawn after the bugs and the fence, so only blades and petals really in
  // front mark the stencil; one behind the fence fails the depth test and leaves the ghost be.
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.renderOrder = 2;
    for (const mat of [m.material].flat()) Object.assign(mat, { stencilWrite: true, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp });
  });
  return g;
}

