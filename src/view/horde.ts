// The swarm on screen: every bug of a kind is one instanced draw per material (shell, its x-ray
// ghost, glow, core, wings), and the blob shadows, HP bars and hit flares of all of them one draw
// each. Built per bug, a wave cost ~30 draw calls a bug and a phone GPU fell to ~42 fps mid-wave
// (§16.19); this way the draw count stays flat however many bugs there are.
//
// The legs, wings and blobs still move: each kind's model (swarm.ts) is baked once into a geometry
// per material, every vertex tagged with the part it hangs from (`bugRig`: the pivot, and which leg,
// wing or blob it is), and the vertex shader swings it with the bug's own phases (`bugAnim`) just as
// the per-bug animation did: legs about x at the hip, wings about z, blobs squashed about their middle.

import * as THREE from 'three';
import type { EnemyKind } from '../sim/types';
import { softDot } from './fx';
import { BUG_PLASTIC, BUG_XRAY } from './models';
import { CHITIN, CORE, EMBER, JELLY, WING, makeSwarmBug, mergeParts } from './swarm';

/** Rig codes in `bugRig.w`: type * 16 + index (leg number, wing side 0/1, blob number). */
const LEG = 1;
const WING_RIG = 2;
const BLOB = 3;
/** A leg turns this far (radians) either side of standing, about its hip. */
const SWING = 0.35;

const RIG_HEAD = /* glsl */ `
attribute vec4 bugRig;
attribute vec2 bugAnim;
// A point (pivot 1) or a normal (pivot 0) of the part this vertex hangs from, posed: a leg swung
// about x at its hip, a wing flapped about z, a blob squashed about its middle.
vec3 bugPose(vec3 p, float pivot) {
  float type = floor(bugRig.w / 16.0 + 0.01);
  if (type < 0.5) return p;
  float i = bugRig.w - type * 16.0;
  vec3 c = bugRig.xyz * pivot;
  vec3 q = p - c;
  if (type < 1.5) {
    float a = sin(bugAnim.x + i * 1.7) * ${SWING.toFixed(2)};
    float s = sin(a), k = cos(a);
    q = vec3(q.x, k * q.y - s * q.z, s * q.y + k * q.z);
  } else if (type < 2.5) {
    float a = (i * 2.0 - 1.0) * sin(bugAnim.y) * 0.6;
    float s = sin(a), k = cos(a);
    q = vec3(k * q.x - s * q.y, s * q.x + k * q.y, q.z);
  } else {
    float k = 1.0 + sin(bugAnim.x * 0.7 + i) * 0.08;
    q *= pivot > 0.5 ? vec3(k, 1.0 / k, k) : vec3(1.0 / k, k, 1.0 / k);
  }
  return c + q;
}
`;

/** Pose the vertices (and normals) by the rig; keeps whatever the material already does to its shaders. */
function rigged<M extends THREE.Material>(m: M, key: string): M {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.vertexShader =
      RIG_HEAD +
      sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = bugPose(objectNormal, 0.0);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = bugPose(transformed, 1.0);');
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// The bug materials are only ever drawn here, so they take the rig in place.
const SHELL_MAT = rigged(BUG_PLASTIC, 'bug-rim-rig');
const GHOST_MAT = rigged(BUG_XRAY, 'bug-xray-rig');
const GLOW_MAT = rigged(EMBER, 'bug-ember-rig');
const CORE_MAT = rigged(CORE, 'bug-core-rig');
const WING_MAT = rigged(WING, 'bug-wing-rig');
const JELLY_MAT = rigged(JELLY, 'bug-jelly-rig');
/** The shell's shadow, with its legs swinging. */
const DEPTH_MAT = rigged(new THREE.MeshDepthMaterial(), 'bug-depth-rig');

interface Baked {
  shell: THREE.BufferGeometry;
  glow?: THREE.BufferGeometry;
  core?: THREE.BufferGeometry;
  wing?: THREE.BufferGeometry;
  jelly?: THREE.BufferGeometry;
}

/** A kind's model flattened into one geometry per material, each vertex tagged with its rig. */
function bake(kind: EnemyKind): Baked {
  const g = makeSwarmBug(kind);
  g.updateMatrixWorld(true);
  const d = g.userData;
  const legs = (d.legs ?? []) as THREE.Object3D[];
  const wings = (d.wings ?? []) as THREE.Object3D[];
  const blobs = (d.blobs ?? []) as THREE.Object3D[];
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const pivot = new THREE.Vector3();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let code = 0;
    pivot.set(0, 0, 0);
    for (let a: THREE.Object3D | null = m; a && a !== g; a = a.parent) {
      let i = legs.indexOf(a);
      if (i >= 0) code = LEG * 16 + i;
      else if ((i = wings.indexOf(a)) >= 0) code = WING_RIG * 16 + (a.userData.side > 0 ? 1 : 0);
      else if ((i = blobs.indexOf(a)) >= 0) code = BLOB * 16 + i;
      else continue;
      a.getWorldPosition(pivot);
      break;
    }
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    // A Tripo bug (xenos.ts) comes rigged per vertex already.
    if (!geo.getAttribute('bugRig')) {
      const rig = new Float32Array(geo.getAttribute('position').count * 4);
      for (let i = 0; i < rig.length; i += 4) rig.set([pivot.x, pivot.y, pivot.z, code], i);
      geo.setAttribute('bugRig', new THREE.BufferAttribute(rig, 4));
    }
    const mat = m.material as THREE.Material;
    if (!parts.has(mat)) parts.set(mat, []);
    parts.get(mat)!.push(geo);
  });
  const merged = (mat: THREE.Material) => {
    const geos = parts.get(mat);
    return geos ? mergeParts(geos) : undefined;
  };
  return { shell: merged(CHITIN)!, glow: merged(EMBER), core: merged(CORE), wing: merged(WING), jelly: merged(JELLY) };
}

/**
 * How far a body walks per radian of leg phase without its feet sliding: a foot hangs `reach` below
 * its hip and swings ±SWING about it, so on the ground it sweeps 2·SWING·reach back in half a cycle
 * (π radians). `reach` is the median over the legs (the queen's scythes never reach the ground);
 * 0 for a kind with no legs (or, the spore, no shell).
 */
function strideOf(shell: THREE.BufferGeometry | undefined): number {
  if (!shell) return 0;
  const rig = shell.getAttribute('bugRig');
  const pos = shell.getAttribute('position');
  const low = new Map<number, number>();
  for (let i = 0; i < rig.count; i++) {
    const w = rig.getW(i);
    if (Math.floor(w / 16 + 0.01) !== LEG) continue;
    const drop = rig.getY(i) - pos.getY(i);
    low.set(w, Math.max(low.get(w) ?? 0, drop));
  }
  const reach = [...low.values()].sort((a, b) => a - b);
  if (!reach.length) return 0;
  return (2 * SWING * reach[reach.length >> 1]) / Math.PI;
}

/** Grow an instanced attribute to hold `cap` items, keeping what it has. */
function grown(a: THREE.InstancedBufferAttribute, cap: number): THREE.InstancedBufferAttribute {
  const out = new THREE.InstancedBufferAttribute(new Float32Array(cap * a.itemSize), a.itemSize);
  out.array.set(a.array as Float32Array);
  out.setUsage(THREE.DynamicDrawUsage);
  return out;
}

/** An instanced mesh drawn in the scene with no culling, hidden while empty. */
function batch(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, order = 0): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  m.renderOrder = order;
  m.count = 0;
  m.visible = false;
  scene.add(m);
  return m;
}

/** Every bug of one kind: its meshes share one matrix and one animation phase per bug. */
class KindBatch {
  readonly meshes: THREE.InstancedMesh[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private matrix: THREE.InstancedBufferAttribute;
  private anim: THREE.InstancedBufferAttribute;
  /** How high the model's back stands at scale 1, for the health bar over it. */
  readonly top: number;
  /** How far the body moves, at scale 1, while its legs swing through one radian of phase. */
  readonly stride: number;
  n = 0;

  constructor(scene: THREE.Scene, kind: EnemyKind, private cap = 16) {
    const b = bake(kind);
    // (A spore is all glow, no shell.)
    this.top = Math.max(...Object.values(b).map((g) => (g ? (g.computeBoundingBox(), g.boundingBox!.max.y) : 0)));
    this.stride = strideOf(b.shell);
    const shell = batch(scene, b.shell, SHELL_MAT, cap, 1);
    // After the rest of the opaque set (three sorts by material before distance), so a hidden bug
    // fails the depth test and leaves the stencil clear for its ghost.
    shell.castShadow = true;
    shell.customDepthMaterial = DEPTH_MAT;
    this.meshes.push(shell, batch(scene, b.shell, GHOST_MAT, cap, 4));
    // The glow marks the stencil too, so it goes in the same late pass.
    if (b.glow) this.meshes.push(batch(scene, b.glow, GLOW_MAT, cap, 1));
    if (b.core) this.meshes.push(batch(scene, b.core, CORE_MAT, cap, 1));
    if (b.wing) this.meshes.push(batch(scene, b.wing, WING_MAT, cap));
    // The see-through jelly and crystal over the glowing cores inside them.
    if (b.jelly) this.meshes.push(batch(scene, b.jelly, JELLY_MAT, cap, 2));
    this.geos = [b.shell, b.glow, b.core, b.wing, b.jelly].filter((g): g is THREE.BufferGeometry => !!g);
    this.matrix = shell.instanceMatrix;
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.share();
  }

  private share(): void {
    for (const m of this.meshes) m.instanceMatrix = this.matrix;
    for (const g of this.geos) g.setAttribute('bugAnim', this.anim);
  }

  add(m: THREE.Matrix4, ph: number, wing: number): void {
    if (this.n === this.cap) {
      this.cap *= 2;
      this.matrix = grown(this.matrix, this.cap);
      this.anim = grown(this.anim, this.cap);
      this.share();
    }
    m.toArray(this.matrix.array, this.n * 16);
    this.anim.array[this.n * 2] = ph;
    this.anim.array[this.n * 2 + 1] = wing;
    this.n++;
  }

  flush(): void {
    for (const m of this.meshes) {
      m.count = this.n;
      m.visible = this.n > 0;
    }
    this.matrix.needsUpdate = this.anim.needsUpdate = true;
  }
}

/** A flat instanced batch of one material, grown on demand (shadows, bar pieces, flares). */
class Flat {
  readonly mesh: THREE.InstancedMesh;
  n = 0;

  constructor(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, private cap: number, order = 0, colours = false) {
    this.mesh = batch(scene, geo, mat, cap, order);
    if (colours) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
  }

  add(m: THREE.Matrix4, c?: THREE.Color): void {
    if (this.n === this.cap) {
      this.cap *= 2;
      this.mesh.instanceMatrix = grown(this.mesh.instanceMatrix, this.cap);
      if (this.mesh.instanceColor) this.mesh.instanceColor = grown(this.mesh.instanceColor, this.cap);
    }
    m.toArray(this.mesh.instanceMatrix.array, this.n * 16);
    if (c) c.toArray(this.mesh.instanceColor!.array, this.n * 3);
    this.n++;
  }

  flush(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// HP bars: bright enough to read on the dark oxblood bugs, with a near-black edge so a bar stands
// out from the one behind it. Each is three quads (edge, track, fill) in one instanced batch.
const BAR_H = 0.17;
const BAR_EDGE = 0.045;
const BAR_COLOURS = {
  edge: new THREE.Color(0x0a0612),
  back: new THREE.Color(0x3a1c22),
  fill: new THREE.Color(0xff4d5e),
  boss: new THREE.Color(0xffa62a),
};

/** Blob shadow: dark in the middle, fading to nothing at the rim, so it has no edge to cut. */
function blobTexture(): THREE.Texture {
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot((x + 0.5) / S * 2 - 1, (y + 0.5) / S * 2 - 1);
      // alphaMap reads the green channel: written to all four.
      data.fill(Math.round(255 * Math.max(0, 1 - d * d) ** 1.4), (y * S + x) * 4, (y * S + x) * 4 + 4);
    }
  }
  const t = new THREE.DataTexture(data, S, S);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
/** Just above the ground, so the flat disc never z-fights the sand. */
const SHADOW_Y = 0.07;

interface Bar {
  x: number;
  y: number;
  z: number;
  width: number;
  frac: number;
  boss: boolean;
  dist: number;
}

const mtx = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();
const euler = new THREE.Euler();
const right = new THREE.Vector3();
const UP = new THREE.Quaternion();

export class Horde {
  private kinds = new Map<EnemyKind, KindBatch>();
  private shadows: Flat;
  private bars: Flat;
  private glints: Flat;
  private barList: Bar[] = [];
  private barCount = 0;

  constructor(private scene: THREE.Scene) {
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTexture(), transparent: true, opacity: 0.5, depthWrite: false });
    this.shadows = new Flat(scene, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), shadowMat, 64);
    // Drawn over everything (no depth test), nearer bars over farther ones whole: the batch is
    // filled far to near, edge, track and fill in turn, so in a clump the front bug's bar is never
    // cut by a neighbour's fill.
    this.bars = new Flat(scene, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ depthTest: false }), 96, 1000, true);
    // The hit flare: a soft additive dot turned to the camera, one per bug that was just hit.
    const glintMat = new THREE.MeshBasicMaterial({ map: softDot(), color: 0xfff4e0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glints = new Flat(scene, new THREE.PlaneGeometry(1, 1), glintMat, 32);
  }

  private kind(k: EnemyKind): KindBatch {
    let b = this.kinds.get(k);
    if (!b) this.kinds.set(k, (b = new KindBatch(this.scene, k)));
    return b;
  }

  /** Build every kind's batches now, so their shaders compile before the first wave (warm). */
  prepare(kinds: readonly EnemyKind[]): void {
    for (const k of kinds) this.kind(k);
  }

  /** Show every batch for a moment, so renderer.compile sees them; `false` puts them back. */
  showAll(on: boolean): void {
    for (const b of this.kinds.values()) for (const m of b.meshes) m.visible = on || m.count > 0;
    for (const f of [this.shadows, this.bars, this.glints]) f.mesh.visible = on || f.mesh.count > 0;
  }

  /** How high a bug of this kind stands at scale 1. */
  top(k: EnemyKind): number {
    return this.kind(k).top;
  }

  /** How far a bug of this kind moves per radian of leg phase at scale 1 (0: no legs). */
  stride(k: EnemyKind): number {
    return this.kind(k).stride;
  }

  /** Start a frame: no bugs yet. */
  begin(): void {
    for (const b of this.kinds.values()) b.n = 0;
    this.shadows.n = this.bars.n = this.glints.n = 0;
    this.barCount = 0;
  }

  /**
   * One bug at (x, y, z), turned by `yaw`, nodding by `nod`, at `scale`; `ph` drives its legs and
   * blobs, `wing` its wings (the same phases the per-bug animation took).
   */
  bug(kind: EnemyKind, x: number, y: number, z: number, yaw: number, nod: number, scale: number, ph: number, wing: number): void {
    // 'YXZ': nod about the bug's own sideways axis, then turn it. The default 'XYZ' nodded about the world x
    // axis, so a bug not heading along z rolled onto its side instead of dipping its head.
    mtx.compose(pos.set(x, y, z), quat.setFromEuler(euler.set(nod, yaw, 0, 'YXZ')), scl.setScalar(scale));
    this.kind(kind).add(mtx, ph, wing);
  }

  shadow(x: number, z: number, r: number): void {
    this.shadows.add(mtx.compose(pos.set(x, SHADOW_Y, z), UP, scl.setScalar(r)));
  }

  /** An HP bar centred at (x, y, z), `width` across, `frac` of it filled. */
  bar(x: number, y: number, z: number, width: number, frac: number, boss: boolean): void {
    let b = this.barList[this.barCount];
    if (!b) this.barList.push((b = { x, y, z, width, frac, boss, dist: 0 }));
    Object.assign(b, { x, y, z, width, frac, boss });
    this.barCount++;
  }

  /** The hit flare at (x, y, z), `size` across. */
  glint(x: number, y: number, z: number, size: number, camera: THREE.Camera): void {
    this.glints.add(mtx.compose(pos.set(x, y, z), camera.quaternion, scl.set(size, size, 1)));
  }

  /** Upload the frame. The bars turn to face `camera` and are ordered far to near from it. */
  end(camera: THREE.Camera): void {
    const q = camera.quaternion;
    const bars = this.barList.slice(0, this.barCount);
    for (const b of bars) b.dist = camera.position.distanceToSquared(pos.set(b.x, b.y, b.z));
    bars.sort((a, b) => b.dist - a.dist);
    right.set(1, 0, 0).applyQuaternion(q);
    for (const b of bars) {
      pos.set(b.x, b.y, b.z);
      this.bars.add(mtx.compose(pos, q, scl.set(b.width + BAR_EDGE * 2, BAR_H + BAR_EDGE * 2, 1)), BAR_COLOURS.edge);
      this.bars.add(mtx.compose(pos, q, scl.set(b.width, BAR_H, 1)), BAR_COLOURS.back);
      pos.addScaledVector(right, (b.frac - 1) * b.width * 0.5);
      this.bars.add(mtx.compose(pos, q, scl.set(Math.max(0.02, b.frac) * b.width, BAR_H, 1)), b.boss ? BAR_COLOURS.boss : BAR_COLOURS.fill);
    }
    for (const b of this.kinds.values()) b.flush();
    this.shadows.flush();
    this.bars.flush();
    this.glints.flush();
  }
}
