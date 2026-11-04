// The shared look of the moving models: the plastic material, the bugs' rim-lit skin with its
// x-ray ghost, the hero idle animation, and the contact shade under the set. The bugs are built in
// swarm.ts and drawn (and animated) a kind at a time by horde.ts; the troopers, tank and outpost
// in scifi.ts, the shield wall in fence.ts. The picnic theme's builders (fruits, toy bugs, toy heroes, the train, the cake, the lawn) are in leftovers/.
//
// Conventions: every model faces +z (towards the camera), stands on y = 0 and is about one unit
// across, so callers scale it by the unit's size. Parts that animate are tagged in userData.

import * as THREE from 'three';

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
 * Bugs wear the vertex plastic with a rim light added: a fresnel glow along their outline, so a dark
 * body still reads against the blue ice, the rocks and the shadows by them. Hot orange-red, the
 * colour of their eyes: hostile, and apart from the cyan of the fort and tank and the violet of the
 * crystals (a pale violet rim melted into both the ice and the crystals). A thin bright edge over a
 * softer wide one, so each leg and the head are edged too and separate from the body they cross.
 */
function rimLit<M extends THREE.Material>(m: M, key: string): M {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rim = 1.0 - max(dot(normalize(vViewPosition), normal), 0.0);
      totalEmissiveRadiance += vec3(0.62, 0.4, 1.0) * (pow(rim, 2.2) * 0.75 + pow(rim, 6.0) * 1.1);`,
    );
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// A bug marks the stencil wherever it is drawn, so its x-ray below never lands on a bug in plain sight.
// It takes little of the studio environment (see bugEnvironment): on a small dark body the bright
// grazing reflection read as a pale fuzzy fringe round every bug; the violet rim above (the xenos' crystal colour) is enough to lift it.
export const BUG_PLASTIC = rimLit(
  Object.assign(VERTEX_PLASTIC.clone(), { stencilWrite: true, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp, envMapIntensity: 0.15 }),
  'bug-rim',
);

/**
 * Where the tank, the wall or the reactor hides a bug, a see-through ghost of it is drawn over them:
 * only where something is in front (depth greater) and no bug has been drawn yet (stencil), so the
 * bug's own back never shows through its front and overlapping ghosts don't double up.
 */
export const BUG_XRAY = rimLit(
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

/**
 * The hero's pose: a bob (faster while casting), arms out to cast, `aim` (0..1, eased in main.ts while
 * it is shooting) the arms raised forward as if holding the blaster out at the target, and `shot`
 * (0..1 of a shot's jolt, shotCurve): rocked back on its heels, pushed back and squashed, the arms
 * kicked up with the muzzle, so the arms and body move as one. Facing the target is the container's
 * yaw (main.ts).
 */
export function animateHero(g: THREE.Object3D, t: number, casting: boolean, shot = 0, aim = 0): void {
  if (casting) aim = shot = 0;
  g.position.y = Math.abs(Math.sin(t * (casting ? 8 : 2))) * (casting ? 0.12 : 0.04);
  g.position.z = -0.09 * shot;
  g.rotation.x = -0.32 * shot;
  g.scale.set(1 + 0.05 * shot, 1 - 0.1 * shot, 1 + 0.05 * shot);
  if (g.userData.key) (g.userData.key as THREE.Object3D).rotation.z = t * (casting ? 12 : 3);
  for (const a of (g.userData.arms ?? []) as THREE.Object3D[]) {
    const s = a.userData.side as number;
    a.rotation.z = casting ? s * (2.6 + Math.sin(t * 12) * 0.2) : s * (0.25 + Math.sin(t * 2) * 0.06 * (1 - aim) - 0.15 * aim);
    a.rotation.x = -aim * (1.3 + 0.7 * shot);
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
