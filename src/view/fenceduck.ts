// The fence posts in front of the train duck out of its way (2026-11-11 review: on the near side of
// the ring the posts, 1.3 tall, hid the tank and the wagons behind them from the camera). Only posts
// standing between the camera and a car sink, to about half, and rise again as it passes; ones beside
// or behind it stay whole. Done in the vertex shader of the posts, their glow trim and the shield
// panels, from a few points the view sets each frame: no matrices change and the fence's own wear and
// wobble are untouched.

import * as THREE from 'three';

/** How many cars can duck the fence at once: the tank and four wagons. */
export const DUCK_CARS = 5;
/** Where the cars stand on the board (x, z); unused slots are far away. */
const at = Array.from({ length: DUCK_CARS }, () => new THREE.Vector2(99, 99));
const uniform = { value: at };

/** Set the cars that duck the fence this frame (board x, z); the rest are cleared. */
export function duckAt(points: readonly { x: number; z: number }[]): void {
  for (let i = 0; i < DUCK_CARS; i++) {
    const p = points[i];
    at[i].set(p ? p.x : 99, p ? p.z : 99);
  }
}

/** Share of a post's height it sinks in front of a car. */
const DEPTH = 0.55;

const VERT = /* glsl */ `
#ifdef USE_INSTANCING
uniform vec2 duckAt[${DUCK_CARS}];
float fenceDuck() {
  vec2 p = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
  float k = 0.0;
  for (int i = 0; i < ${DUCK_CARS}; i++) {
    vec2 d = p - duckAt[i];
    // In front of the car (towards the camera, +z) and not far to either side of it.
    k = max(k, (1.0 - smoothstep(0.45, 1.0, abs(d.x))) * smoothstep(0.15, 0.55, d.y) * (1.0 - smoothstep(1.3, 1.9, d.y)));
  }
  return k * ${DEPTH.toFixed(2)};
}
#endif
`;

/**
 * Teach a fence material to duck: its geometry's local y sinks towards `foot` (the part's own bottom)
 * where a car stands behind it. Keeps any shader patch the material already has.
 */
function teach(mat: THREE.Material, foot: number, key: string): void {
  const before = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    before(sh, r);
    sh.uniforms.duckAt = uniform;
    sh.vertexShader = VERT + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n#ifdef USE_INSTANCING\ntransformed.y = ${foot.toFixed(2)} + (transformed.y - (${foot.toFixed(2)})) * (1.0 - fenceDuck());\n#endif`,
    );
  };
  const old = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => old() + key;
}

/**
 * Make the fence's posts, trim and shield panels duck in front of the cars. The posts and their trim
 * stand on y -0.2 (their foot in the sand); the panels are planes about their middle, 0.98 tall.
 */
export function duckFence(fence: THREE.Object3D): void {
  fence.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh) return;
    const mat = m.material as THREE.Material;
    if (m.geometry.getAttribute('shieldTile')) teach(mat, -0.49, '|duck-panel');
    else teach(mat, -0.2, '|duck-post');
  });
}
