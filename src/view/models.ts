// The shared look of the moving models: the plastic material, the bugs' rim-lit skin with its
// x-ray ghost, the bug and hero idle animation, and the contact shade under the set. The bugs are
// built in swarm.ts, the troopers, tank and outpost in scifi.ts, the shield wall in fence.ts. The
// picnic theme's builders (fruits, toy bugs, toy heroes, the train, the cake, the lawn) are in leftovers/.
//
// Conventions: every model faces +z (towards the camera), stands on y = 0 and is about one unit
// across, so callers scale it by the unit's size. Parts that animate are tagged in userData.

import * as THREE from 'three';
import type { EnemyKind } from '../sim/types';
import { CHITIN, CORE, EMBER, makeSwarmBug } from './swarm';

/** Same sequence every load, so the props never jump between runs. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// --- Materials -------------------------------------------------------------------------------

/**
 * The shared lit material: soft and a little glossy, painted metal and moulded plastic
 * (concept docs/art/scifi_r2). No bands and no outlines; the scene's environment
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

/** The bugs' vertex-coloured plastic, before their rim light. */
const VERTEX_PLASTIC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: ROUGH, metalness: 0 });

/**
 * Bugs wear the vertex plastic with a pale rim light added: a fresnel glow along their outline, so a
 * dark body still reads against the sand, the pylons and the shadows by them.
 */
function rimLit<M extends THREE.Material>(m: M, key: string): M {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rim = 1.0 - max(dot(normalize(vViewPosition), normal), 0.0);
      totalEmissiveRadiance += vec3(0.78, 0.6, 1.0) * pow(rim, 2.5) * 0.55;`,
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
 * Where the tank, the wall or the reactor hides a bug, a see-through ghost of it is drawn over them:
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

/** Dress a bug: the rim-lit plastic, and a ghost of each part that shows through whatever hides it. */
function bugSkin(g: THREE.Group): THREE.Group {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    // The glow marks the stencil too, so it goes in the same late pass.
    if (m.material === EMBER || m.material === CORE) m.renderOrder = 1;
    if (m.material !== CHITIN) return;
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

/** An enemy model one unit long, built to the concept (swarm.ts); scale it by the enemy's size. */
export function makeEnemyModel(kind: EnemyKind): THREE.Group {
  return bugSkin(makeSwarmBug(kind));
}

/** Per-frame animation: legs step, wings buzz, blobs wobble. `t` is a running clock, `seed` varies the phase. */
export function animateEnemy(g: THREE.Object3D, t: number, seed: number, chewing: boolean): void {
  const d = g.userData;
  const ph = t * (chewing ? 14 : 8) + seed;
  if (d.legs) (d.legs as THREE.Object3D[]).forEach((l, i) => (l.rotation.x = (l.userData.base ??= l.rotation.x) + Math.sin(ph + i * 1.7) * 0.35));
  if (d.wings) for (const w of d.wings as THREE.Object3D[]) w.rotation.z = w.userData.side * Math.sin(t * 40 + seed) * 0.6;
  if (d.blobs) (d.blobs as THREE.Object3D[]).forEach((b, i) => {
    const base = (b.userData.r ??= b.scale.x);
    const k = 1 + Math.sin(ph * 0.7 + i) * 0.08;
    b.scale.set(base * k, base / k, base * k);
  });
  // Chewing bugs nod into the wall: about their own sideways axis, so it is a nod whichever way
  // they face (the group's x is the world's, turned with them only by the yaw after it).
  g.rotation.x = chewing ? Math.max(0, Math.sin(ph)) * 0.25 : 0;
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

/**
 * Soft contact shade on the ground round things standing on it: a flat disc whose darkness at radius r sums `bands` (radius, width, strength), a bell each.
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

/** Half the gauge of the mag rail: its two rails lie this far either side of the tank's ring. */
export const RAIL = 0.36;
