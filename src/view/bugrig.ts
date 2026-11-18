// The bugs' rig: each kind's model (swarm.ts) baked once into a geometry per material, every vertex
// tagged with the part it hangs from (`bugRig`: the pivot, and which leg, wing or blob it is), and the
// bug materials patched so the vertex shader swings it with the bug's own phases (`bugAnim`) just as
// the per-bug animation did: legs about x at the hip, wings about z, blobs squashed about their middle.
// `bugAnim.z` is the hit flash: the whole bug, every material of it, washed towards white; `bugAnim.w`
// a status tint (bugstatus.ts): above 0 chilled ice blue (a frost slow), below 0 burning magenta (plasma).
// Split from horde.ts, which draws the baked kinds instanced.

import * as THREE from 'three';
import type { EnemyKind } from '../sim/types';
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
attribute vec4 bugAnim;
varying float vBugHit;
varying float vBugTint;
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

/**
 * Pose the vertices (and normals) by the rig and wash the colour towards white by the hit flash;
 * keeps whatever the material already does to its shaders.
 */
function rigged<M extends THREE.Material>(m: M, key: string): M {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.vertexShader =
      RIG_HEAD +
      sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = bugPose(objectNormal, 0.0);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = bugPose(transformed, 1.0);\nvBugHit = bugAnim.z;\nvBugTint = bugAnim.w;');
    // After the lighting, before tone mapping: a flat white, so a dark shell flashes as bright as a pale one.
    // Chilled: frosted towards pale ice, keeping its light and shade; burning: a magenta glow over it.
    if (sh.fragmentShader.includes('#include <opaque_fragment>'))
      sh.fragmentShader =
        'varying float vBugHit;\nvarying float vBugTint;\n' +
        sh.fragmentShader.replace(
          '#include <opaque_fragment>',
          '#include <opaque_fragment>\n' +
            'if (vBugTint > 0.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.62, 0.86, 1.0) * (0.55 + 0.6 * dot(gl_FragColor.rgb, vec3(0.33))), 0.6 * vBugTint);\n' +
            'else if (vBugTint < 0.0) gl_FragColor.rgb += vec3(1.0, 0.31, 0.82) * (-0.45 * vBugTint);\n' +
            'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), vBugHit);',
        );
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// The bug materials are only ever drawn here, so they take the rig in place.
export const SHELL_MAT = rigged(BUG_PLASTIC, 'bug-rim-rig');
export const GHOST_MAT = rigged(BUG_XRAY, 'bug-xray-rig');
export const GLOW_MAT = rigged(EMBER, 'bug-ember-rig');
export const CORE_MAT = rigged(CORE, 'bug-core-rig');
export const WING_MAT = rigged(WING, 'bug-wing-rig');
export const JELLY_MAT = rigged(JELLY, 'bug-jelly-rig');
/** The shell's shadow, with its legs swinging. */
export const DEPTH_MAT = rigged(new THREE.MeshDepthMaterial(), 'bug-depth-rig');

interface Baked {
  shell: THREE.BufferGeometry;
  glow?: THREE.BufferGeometry;
  core?: THREE.BufferGeometry;
  wing?: THREE.BufferGeometry;
  jelly?: THREE.BufferGeometry;
}

/** A kind's model flattened into one geometry per material, each vertex tagged with its rig. */
export function bake(kind: EnemyKind): Baked {
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
export function strideOf(shell: THREE.BufferGeometry | undefined): number {
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
