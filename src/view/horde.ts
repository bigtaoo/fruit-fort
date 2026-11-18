// The swarm on screen: every bug of a kind is one instanced draw per material (shell, its x-ray
// ghost, glow, core, wings), and the blob shadows, HP bars and hit flares of all of them one draw
// each. Built per bug, a wave cost ~30 draw calls a bug and a phone GPU fell to ~42 fps mid-wave
// (§16.19); this way the draw count stays flat however many bugs there are.
//
// The legs, wings and blobs still move: the rig (bugrig.ts) bakes each kind's model and swings its
// parts in the vertex shader with the bug's own phases (`bugAnim`), hit flash and status tint.

import * as THREE from 'three';
import type { EnemyKind } from '../sim/types';
import { softDot } from './fx';
import { CORE_MAT, DEPTH_MAT, GHOST_MAT, GLOW_MAT, JELLY_MAT, SHELL_MAT, WING_MAT, bake, strideOf } from './bugrig';

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
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.share();
  }

  private share(): void {
    for (const m of this.meshes) m.instanceMatrix = this.matrix;
    for (const g of this.geos) g.setAttribute('bugAnim', this.anim);
  }

  add(m: THREE.Matrix4, ph: number, wing: number, hit: number, tint: number): void {
    if (this.n === this.cap) {
      this.cap *= 2;
      this.matrix = grown(this.matrix, this.cap);
      this.anim = grown(this.anim, this.cap);
      this.share();
    }
    m.toArray(this.matrix.array, this.n * 16);
    const a = this.anim.array;
    a[this.n * 4] = ph;
    a[this.n * 4 + 1] = wing;
    a[this.n * 4 + 2] = hit;
    a[this.n * 4 + 3] = tint;
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
// out from the one behind it. Each is up to four quads (edge, track, white damage trail, fill) in one instanced batch.
const BAR_H = 0.12;
const BAR_EDGE = 0.035;
const BAR_COLOURS = {
  edge: new THREE.Color(0x0a0612),
  back: new THREE.Color(0x3a1c22),
  trail: new THREE.Color(0xfff4e8),
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
  /** How far the white damage trail reaches (>= frac), and the hit jump (0 to 1). */
  trail: number;
  pop: number;
  boss: boolean;
  dist: number;
}

const mtx = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();
const euler = new THREE.Euler();
const right = new THREE.Vector3();
const edge = new THREE.Vector3();
const UP = new THREE.Quaternion();

export class Horde {
  private kinds = new Map<EnemyKind, KindBatch>();
  private shadows: Flat;
  private bars: Flat;
  private glints: Flat;
  private barList: Bar[] = [];
  /** The frame's bars in draw order (far to near); the same objects as barList, kept between frames. */
  private order: Bar[] = [];
  private barCount = 0;

  constructor(private scene: THREE.Scene) {
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTexture(), transparent: true, opacity: 0.68, depthWrite: false });
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

  /** The kinds whose batches are built, in the order they were prepared (warmRest, rewarm). */
  prepared(): EnemyKind[] {
    return [...this.kinds.keys()];
  }

  /**
   * Show one kind's batches for a moment, or the flats (shadow blobs, health bars, hit glints) when `k`
   * is null; `false` puts them back. One kind at a time is how re-warming paces itself: showAll would
   * put every program in front of the first compile and freeze a frame (§15.6).
   */
  show(k: EnemyKind | null, on: boolean): void {
    if (k === null) {
      for (const f of [this.shadows, this.bars, this.glints]) f.mesh.visible = on || f.mesh.count > 0;
      return;
    }
    const b = this.kinds.get(k);
    if (b) for (const m of b.meshes) m.visible = on || m.count > 0;
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
   * blobs, `wing` its wings (the same phases the per-bug animation took); `hit` (0 to 1) washes it white,
   * `tint` (-1 to 1) colours it by its status: ice above 0, burning below.
   */
  bug(kind: EnemyKind, x: number, y: number, z: number, yaw: number, nod: number, scale: number, ph: number, wing: number, hit = 0, tint = 0): void {
    // 'YXZ': nod about the bug's own sideways axis, then turn it. The default 'XYZ' nodded about the world x
    // axis, so a bug not heading along z rolled onto its side instead of dipping its head.
    mtx.compose(pos.set(x, y, z), quat.setFromEuler(euler.set(nod, yaw, 0, 'YXZ')), scl.setScalar(scale));
    this.kind(kind).add(mtx, ph, wing, hit, tint);
  }

  /** A blob under a bug, a little towards where the sun throws shadows (+x, -z), so it sits on the ground (11-11 review). */
  shadow(x: number, z: number, r: number): void {
    this.shadows.add(mtx.compose(pos.set(x + r * 0.12, SHADOW_Y, z - r * 0.12), UP, scl.setScalar(r)));
  }

  /**
   * An HP bar centred at (x, y, z), `width` across, `frac` of it filled and white on to `trail`
   * (the HP just lost); `pop` swells it for a hit.
   */
  bar(x: number, y: number, z: number, width: number, frac: number, trail: number, pop: number, boss: boolean): void {
    let b = this.barList[this.barCount];
    // The bars are kept and written over, field by field: Object.assign on a fresh literal made one
    // throwaway object per bug per frame, for a list that is the same size every frame.
    if (!b) this.barList.push((b = { x, y, z, width, frac, trail, pop, boss, dist: 0 }));
    else (b.x = x), (b.y = y), (b.z = z), (b.width = width), (b.frac = frac), (b.trail = trail), (b.pop = pop), (b.boss = boss);
    this.barCount++;
  }

  /** The hit flare at (x, y, z), `size` across. */
  glint(x: number, y: number, z: number, size: number, camera: THREE.Camera): void {
    this.glints.add(mtx.compose(pos.set(x, y, z), camera.quaternion, scl.set(size, size, 1)));
  }

  /** Upload the frame. The bars turn to face `camera` and are ordered far to near from it. */
  end(camera: THREE.Camera): void {
    const q = camera.quaternion;
    // Sorted in a list kept from frame to frame rather than a slice of barList: the bars themselves
    // are reused, so only the order has to be built, and no array is thrown away each frame.
    const bars = this.order;
    bars.length = this.barCount;
    for (let i = 0; i < this.barCount; i++) {
      const b = (bars[i] = this.barList[i]);
      b.dist = camera.position.distanceToSquared(pos.set(b.x, b.y, b.z));
    }
    bars.sort((a, b) => b.dist - a.dist);
    right.set(1, 0, 0).applyQuaternion(q);
    for (const b of bars) {
      // A hit swells the bar a little, taller more than wider, and eases back.
      const w = b.width * (1 + b.pop * 0.08);
      const hh = BAR_H * (1 + b.pop * 0.45);
      const left = edge.set(b.x, b.y, b.z).addScaledVector(right, -w * 0.5);
      pos.set(b.x, b.y, b.z);
      this.bars.add(mtx.compose(pos, q, scl.set(w + BAR_EDGE * 2, hh + BAR_EDGE * 2, 1)), BAR_COLOURS.edge);
      this.bars.add(mtx.compose(pos, q, scl.set(w, hh, 1)), BAR_COLOURS.back);
      if (b.trail > b.frac + 0.002) {
        pos.copy(left).addScaledVector(right, b.trail * w * 0.5);
        this.bars.add(mtx.compose(pos, q, scl.set(b.trail * w, hh, 1)), BAR_COLOURS.trail);
      }
      const f = Math.max(0.02, b.frac);
      pos.copy(left).addScaledVector(right, f * w * 0.5);
      this.bars.add(mtx.compose(pos, q, scl.set(f * w, hh, 1)), b.boss ? BAR_COLOURS.boss : BAR_COLOURS.fill);
    }
    for (const b of this.kinds.values()) b.flush();
    this.shadows.flush();
    this.bars.flush();
    this.glints.flush();
  }
}
