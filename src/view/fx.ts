// Short-lived effects (§16.3): a pooled particle system for splashes, chips, sparkles and bees,
// flat expanding rings (instanced, one draw), soft puffs (smoke, dust, flashes; instanced, two draws) and floating
// numbers for gold (one draw, glyphs from a baked atlas: glyphtext.ts). Otherwise procedural: the only
// textures are that atlas and one radial soft dot.

import * as THREE from 'three';
import { GlyphText } from './glyphtext';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
  size: number;
  gravity: number;
  /** Shrink to nothing over the life (true) or pop out at the end (false). */
  shrink: boolean;
  color: number;
}

interface Ring {
  x: number; y: number; z: number;
  color: number;
  age: number;
  life: number;
  r: number;
}

interface Floater {
  text: string;
  x: number; y: number; z: number;
  color: string;
  age: number;
  life: number;
  /** Cell height at rest; the text pops past it on spawn and settles. */
  h: number;
}

interface Puff {
  x: number; y: number; z: number;
  color: number;
  age: number;
  life: number;
  from: number;
  to: number;
  rise: number;
  opacity: number;
  /** Which batch draws it: 0 a cloud, 1 an additive glow. */
  glow: number;
}

export interface PuffOpts {
  size?: number;
  /** End size as a multiple of `size`. */
  grow?: number;
  life?: number;
  /** Upward drift, world units a second. */
  rise?: number;
  opacity?: number;
  /** Additive: a glow or flash rather than a cloud. */
  glow?: boolean;
}

let dotTex: THREE.Texture | undefined;
/** A soft round dot, opaque in the middle and fading to nothing at the rim. Shared with units.ts's hit flare. */
export function softDot(): THREE.Texture {
  if (dotTex) return dotTex;
  // Written texel by texel (white, alpha falling off smoothly to the rim) rather than drawn on a
  // canvas: the canvas gradient uploaded nearly clear and the puffs vanished.
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.min(1, Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2));
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * (1 - d * d) ** 1.5);
    }
  }
  dotTex = new THREE.DataTexture(data, N, N);
  dotTex.magFilter = dotTex.minFilter = THREE.LinearFilter;
  dotTex.needsUpdate = true;
  return dotTex;
}

/** Most puffs alive at once; past it the oldest goes. */
const MAX_PUFFS = 120;
/** Glows and rings held for one frame (`Fx.hold`, `Fx.holdRing`): a wagon's charge light and ring. */
const MAX_HELD = 16;
/** Most rings alive at once; past it the oldest goes. */
const MAX_RINGS = 64;
const tmpMat = new THREE.Matrix4();

/**
 * Every live puff of one blending in a single draw: a quad per instance turned to face the camera
 * in the vertex shader, as a sprite is. Each sprite was its own draw call, and every shot throws a
 * muzzle and a hit flash, so a busy wave spent dozens of draws on them (§16.19).
 */
class PuffBatch {
  readonly mesh: THREE.InstancedMesh;
  private alpha: THREE.InstancedBufferAttribute;
  n = 0;
  private max: number;

  /** `ring`: flat rings lying face up instead of camera-facing dots. Each ring was its own draw (~15 a frame). */
  constructor(glow: boolean, ring = false) {
    const max = (this.max = (ring ? MAX_RINGS : MAX_PUFFS) + MAX_HELD);
    const mat = new THREE.MeshBasicMaterial({ map: ring ? null : softDot(), transparent: true, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float puffAlpha;\nvarying float vPuffAlpha;\n' + sh.vertexShader.replace(
        '#include <project_vertex>',
        ring
          ? 'vPuffAlpha = puffAlpha;\n#include <project_vertex>'
          : `vPuffAlpha = puffAlpha;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mvPosition.xy += position.xy * length(instanceMatrix[0].xyz);
        gl_Position = projectionMatrix * mvPosition;`,
      );
      sh.fragmentShader = 'varying float vPuffAlpha;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vPuffAlpha;');
    };
    mat.customProgramCacheKey = () => (ring ? 'ring' : 'puff');
    // Each batch has its own copy of the shape: the opacity attribute is per batch. A ring lies face
    // up, front side only, under a camera that is always above it.
    const geo = ring ? new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2) : new THREE.PlaneGeometry(1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('puffAlpha', this.alpha);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, tmpColor.set(0xffffff));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.count = 0;
  }

  put(x: number, y: number, z: number, size: number, color: number, alpha: number): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.mesh.setMatrixAt(i, tmpMat.makeScale(size, size, size).setPosition(x, y, z));
    this.mesh.setColorAt(i, tmpColor.set(color));
    this.alpha.setX(i, alpha);
  }

  flush(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.n = 0;
  }
}

const easeOutBack = (k: number) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;

export interface BurstOpts {
  count?: number;
  /** Outward speed. */
  speed?: number;
  /** Upward kick added to each particle. */
  up?: number;
  size?: number;
  life?: number;
  gravity?: number;
  /** Second colour mixed in at random. */
  alt?: number;
  y?: number;
  spread?: number;
}

const MAX = 900;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

/** Send the GPU only the first n instances of an instanced attribute (the live ones). */
function upload(at: THREE.InstancedBufferAttribute, n: number): void {
  at.clearUpdateRanges();
  at.addUpdateRange(0, n * at.itemSize);
  at.needsUpdate = n > 0;
}

/** Drop in place the items `live` says are done (no new array a frame), keeping the order. */
function keep<T>(list: T[], live: (item: T) => boolean): void {
  let n = 0;
  for (const item of list) if (live(item)) list[n++] = item;
  list.length = n;
}

export class Fx {
  private mesh: THREE.InstancedMesh;
  /**
   * The live particles, packed: instance i is parts[i] and only these are drawn. Slots were handed
   * out round-robin and the draw ran to the last live one, so once the pool wrapped a single spark
   * near the end drew ~800 hidden icosahedra. Dead objects wait in `spare` for the next emit.
   */
  private parts: Particle[] = [];
  private spare: Particle[] = [];
  /** Which particle a full pool overwrites next: the list is oldest first, so about the oldest. */
  private next = 0;
  private rings: Ring[] = [];
  private ringBatch = new PuffBatch(false, true);
  private floaters: Floater[] = [];
  private puffs: Puff[] = [];
  /** This frame's held glows, six numbers each: x, y, z, size, colour, alpha. */
  private held: number[] = [];
  private heldRings: number[] = [];
  /** Clouds, then additive glows. */
  private puffBatches = [new PuffBatch(false), new PuffBatch(true)];
  private glyphs = new GlyphText();
  /** Share of particles actually emitted, lowered on slow devices (§15.6). */
  density = 1;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, dummy.matrix);
      this.mesh.setColorAt(i, tmpColor.set(0xffffff));
    }
    scene.add(this.mesh);
    for (const b of this.puffBatches) scene.add(b.mesh);
    scene.add(this.ringBatch.mesh);
    scene.add(this.glyphs.mesh);
  }

  reset(): void {
    this.spare.push(...this.parts);
    this.parts.length = 0;
    this.rings = [];
    this.ringBatch.flush();
    this.floaters = [];
    this.puffs = [];
    for (const b of this.puffBatches) b.flush();
    this.glyphs.flush();
  }

  /** One particle; returns nothing, the pool recycles the oldest slot when full. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number, gravity = 9, shrink = true): void {
    if (this.density < 1 && Math.random() >= this.density) return;
    let p: Particle;
    if (this.parts.length >= MAX) p = this.parts[this.next++ % MAX];
    else this.parts.push((p = this.spare.pop() ?? ({} as Particle)));
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.age = 0; p.life = life; p.size = size; p.gravity = gravity; p.shrink = shrink; p.color = color;
  }

  /** A spray of particles from a point. */
  burst(x: number, z: number, color: number, o: BurstOpts = {}): void {
    const n = o.count ?? 10;
    const sp = o.speed ?? 2.5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = sp * (0.4 + Math.random() * 0.6);
      const c = o.alt !== undefined && Math.random() < 0.4 ? o.alt : color;
      const s = (o.spread ?? 0) * Math.random();
      this.emit(x + Math.cos(a) * s, (o.y ?? 0.4) + Math.random() * 0.1, z + Math.sin(a) * s, Math.cos(a) * v, (o.up ?? 3) * (0.5 + Math.random() * 0.7), Math.sin(a) * v, c, (o.size ?? 0.08) * (0.7 + Math.random() * 0.6), (o.life ?? 0.6) * (0.7 + Math.random() * 0.5), o.gravity ?? 9);
    }
  }

  /** Particles flying from one point to another in `time` seconds (bees, juice). */
  stream(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, color: number, n: number, time: number, size = 0.07): void {
    for (let i = 0; i < n; i++) {
      const j = () => (Math.random() - 0.5) * 0.4;
      this.emit(fx + j(), fy + j(), fz + j(), (tx - fx) / time + j() * 2, (ty - fy) / time + j() * 2, (tz - fz) / time + j() * 2, color, size, time * (0.9 + Math.random() * 0.2), 0, false);
    }
  }

  ring(x: number, z: number, r: number, color: number, life = 0.35, y = 0.06): void {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x, y, z, color, age: 0, life, r });
  }

  /** A soft dot that swells and fades: smoke, a dust cloud, or (glow) a flash of light. */
  puff(x: number, y: number, z: number, color: number, o: PuffOpts = {}): void {
    if (this.density < 1 && Math.random() >= this.density) return;
    if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
    const size = o.size ?? 0.4;
    this.puffs.push({ x, y, z, color, age: 0, life: o.life ?? 0.6, from: size * 0.5, to: size * (o.grow ?? 1.6), rise: o.rise ?? 0.4, opacity: o.opacity ?? 0.7, glow: o.glow ? 1 : 0 });
  }

  /** A glow for one frame only, drawn by the next update and gone after it: a light that follows something. */
  hold(x: number, y: number, z: number, size: number, color: number, alpha: number): void {
    if (this.held.length < MAX_HELD * 6) this.held.push(x, y, z, size, color, alpha);
  }

  /** A flat ring for one frame only, like `hold`. */
  holdRing(x: number, y: number, z: number, r: number, color: number, alpha: number): void {
    if (this.heldRings.length < MAX_HELD * 6) this.heldRings.push(x, y, z, r, color, alpha);
  }

  /** Rising text such as "+6" over a kill: pops in with a bounce, drifts up and fades. Digits and + - x % K M ! . only. */
  text(x: number, y: number, z: number, text: string, color = '#ffd84a', size = 0.5, life = 0.85): void {
    if (this.floaters.length > 40) this.floaters.shift();
    this.floaters.push({ text, x, y, z, color, age: 0, life, h: size * 0.72 });
  }

  update(dt: number): void {
    // Only the live particles are drawn, packed from instance 0: the idle pool cost 18k triangles a frame.
    let n = 0;
    for (const p of this.parts) {
      p.age += dt;
      if (p.age >= p.life) {
        this.spare.push(p);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      // Bounce once off the ground so splashes settle instead of sinking.
      if (p.y < 0.05 && p.vy < 0) {
        p.y = 0.05;
        p.vy *= -0.3;
        p.vx *= 0.5;
        p.vz *= 0.5;
      }
      const k = p.age / p.life;
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(p.size * (p.shrink ? 1 - k * k : k > 0.85 ? (1 - k) / 0.15 : 1));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(n, dummy.matrix);
      this.mesh.setColorAt(n, tmpColor.set(p.color));
      this.parts[n++] = p;
    }
    this.parts.length = n;
    this.next = 0;
    this.mesh.count = n;
    // Upload only the instances drawn.
    upload(this.mesh.instanceMatrix, n);
    upload(this.mesh.instanceColor!, n);

    keep(this.rings, (r) => {
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) return false;
      this.ringBatch.put(r.x, r.y, r.z, r.r * (0.4 + 0.6 * Math.sqrt(k)), r.color, 0.85 * (1 - k));
      return true;
    });
    const hr = this.heldRings;
    for (let i = 0; i < hr.length; i += 6) this.ringBatch.put(hr[i], hr[i + 1], hr[i + 2], hr[i + 3], hr[i + 4], hr[i + 5]);
    hr.length = 0;
    this.ringBatch.flush();

    keep(this.floaters, (f) => {
      f.age += dt;
      const k = f.age / f.life;
      if (k >= 1) return false;
      // Pop in over the first 0.18 s with an overshoot, then drift up, slowing, and fade.
      f.y += dt * 2.2 * (1 - k);
      this.glyphs.put(f.text, f.x, f.y, f.z, f.h * easeOutBack(Math.min(1, f.age / 0.18)), f.color, k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35);
      return true;
    });
    this.glyphs.flush();

    keep(this.puffs, (p) => {
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) return false;
      p.y += p.rise * dt;
      this.puffBatches[p.glow].put(p.x, p.y, p.z, p.from + (p.to - p.from) * (1 - (1 - k) ** 2), p.color, p.opacity * (1 - k) * Math.min(1, k * 8));
      return true;
    });
    const h = this.held;
    for (let i = 0; i < h.length; i += 6) this.puffBatches[1].put(h[i], h[i + 1], h[i + 2], h[i + 3], h[i + 4], h[i + 5]);
    h.length = 0;
    for (const b of this.puffBatches) b.flush();
  }
}
