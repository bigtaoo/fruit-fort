// The bugs modelled in Tripo (docs/art/bugs_r3/tripo): swarmer, carapace, leaper and the crystal
// siege tortoise. One untextured shell each (scripts/art/hero_cleanup.py, 1,600–1,800 triangles),
// facing +z with its feet on y = 0, about one unit long. Here it is split and painted for horde.ts:
//
// - Legs: whatever lies outside the body's ellipse in plan is cut into its connected pieces, and each
//   piece is a leg swung about x at its root, written straight into the vertex rig (`bugRig`), so the
//   hip bends instead of tearing.
// - Glow: thin bands across the back where head, thorax, abdomen and plates meet, and lines along
//   it (the spine, plate rows), as in the concept art. (The decimated meshes are too smooth for their own creases to
//   find the seams, so each kind says where they are.)
// - Paint: dark purple chitin, a shade lighter on top and on the legs, near black underneath.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { findGlb } from './glb';

const FILES = import.meta.glob('../assets/bugs/*.glb', { query: '?inline', import: 'default', eager: true }) as Record<string, string>;

/** Rig code of a leg in `bugRig.w` (horde.ts): 16 + its number. */
const LEG = 16;
/** Half the width of a seam band. */
const SEAM = 0.014;

export interface XenoLook {
  file: string;
  /** The body in plan: an ellipse `a` across and `b` long either side of z = `cz`. */
  body: [a: number, b: number, cz: number];
  /** Closer than this to the middle is body too (a head or tail poking out past the ellipse). */
  spine: number;
  /** Where the seams cross the back, in z: each glows as a thin band. */
  seams: number[];
  /** Seams running along the back at x, from z `from` back to `to` (the spine). */
  ribs?: [x: number, from: number, to: number][];
  /** Seams at any angle, each from (x0, z0) to (x1, z1) in plan (a tortoise's plates). */
  lines?: [x0: number, z0: number, x1: number, z1: number][];
  /** Faces that glow besides the seams (the tortoise's crystals), by centre and face normal. */
  glow?: (c: THREE.Vector3, n: THREE.Vector3) => boolean;
  /** Faces painted in the accent (crystal violet) instead of chitin. */
  accent?: (c: THREE.Vector3, n: THREE.Vector3) => boolean;
  scale?: number;
}

export interface XenoPaint {
  top: number;
  side: number;
  under: number;
  leg: number;
  accent: number;
  chitin: THREE.Material;
  glow: THREE.Material;
}

/** A Tripo bug as a group of two meshes, chitin and glow, its legs already rigged; null if the file is missing. */
export function makeXeno(look: XenoLook, paint: XenoPaint): THREE.Group | null {
  const s = findGlb(FILES, look.file);
  if (!s) return null;
  const pos = s.pos.slice();
  const count = pos.length / 3;

  // Weld the vertices the export split along hard edges, so neighbours and pieces see across them.
  const weld = new Int32Array(count);
  const keys = new Map<string, number>();
  const first: number[] = [];
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
    let w = keys.get(key);
    if (w === undefined) keys.set(key, (w = first.push(i) - 1));
    weld[i] = w;
  }
  const n = first.length;
  const nbrs = Array.from({ length: n }, () => new Set<number>());
  const nrm = new Float32Array(n * 3);
  for (let t = 0; t < s.idx.length; t += 3) {
    for (let j = 0; j < 3; j++) {
      const a = weld[s.idx[t + j]];
      const b = weld[s.idx[t + ((j + 1) % 3)]];
      if (a === b) continue;
      nbrs[a].add(b);
      nbrs[b].add(a);
    }
  }
  for (let i = 0; i < count; i++) for (let j = 0; j < 3; j++) nrm[weld[i] * 3 + j] += s.nrm[i * 3 + j];
  const at = (w: number, out: THREE.Vector3) => out.fromArray(pos, first[w] * 3);

  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const [ea, eb, ecz] = look.body;
  const outside = new Uint8Array(n);
  for (let w = 0; w < n; w++) {
    at(w, p);
    outside[w] = Math.abs(p.x) > look.spine && (p.x / ea) ** 2 + ((p.z - ecz) / eb) ** 2 > 1 ? 1 : 0;
  }

  // Each connected piece outside the body is a leg (or a scythe, a mandible), pivoting where it meets the body.
  const leg = new Int32Array(n).fill(-1);
  const pivots: THREE.Vector3[] = [];
  for (let w = 0; w < n; w++) {
    if (!outside[w] || leg[w] >= 0) continue;
    const piece = [w];
    leg[w] = pivots.length;
    for (let i = 0; i < piece.length; i++) {
      for (const o of nbrs[piece[i]]) {
        if (outside[o] && leg[o] < 0) {
          leg[o] = pivots.length;
          piece.push(o);
        }
      }
    }
    if (piece.length < 6) {
      for (const o of piece) leg[o] = -1;
      continue;
    }
    const root = piece.filter((o) => [...nbrs[o]].some((x) => !outside[x]));
    const pivot = new THREE.Vector3();
    for (const o of root.length ? root : piece) pivot.add(at(o, q));
    pivots.push(pivot.divideScalar(root.length || piece.length));
  }

  const rig = new Float32Array(count * 4);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  const top = new THREE.Color(paint.top);
  const side = new THREE.Color(paint.side);
  let high = 0;
  for (let i = 1; i < count * 3; i += 3) high = Math.max(high, pos[i]);
  for (let i = 0; i < count; i++) {
    const l = leg[weld[i]];
    if (l >= 0) {
      const v = pivots[l];
      rig.set([v.x, v.y, v.z, LEG + (l % 15)], i * 4);
      c.setHex(paint.leg);
    } else if (s.nrm[i * 3 + 1] < -0.35) c.setHex(paint.under);
    else c.lerpColors(side, top, Math.min(1, (pos[i * 3 + 1] / high) * 1.2) * Math.max(0, s.nrm[i * 3 + 1]));
    c.toArray(col, i * 3);
  }

  // Sort the faces: the crystals' glow, accent, the rest chitin; and cut the seams across the back.
  const shell: number[] = [];
  const glow: number[] = [];
  const ribbon: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const fn = new THREE.Vector3();
  const accent = new THREE.Color(paint.accent);
  // Every seam as a vertical plane through a segment in plan: its normal (nx, nz) and offset, and how
  // far along it the seam runs.
  const cuts = [
    ...look.seams.map((z) => [-2, z, 2, z]),
    ...(look.ribs ?? []).map(([x, from, to]) => [x, from, x, to]),
    ...(look.lines ?? []),
  ].map(([x0, z0, x1, z1]) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const tx = (x1 - x0) / len;
    const tz = (z1 - z0) / len;
    return { nx: -tz, nz: tx, d: -tz * x0 + tx * z0, tx, tz, lo: tx * x0 + tz * z0, hi: tx * x1 + tz * z1 };
  });
  for (let t = 0; t < s.idx.length; t += 3) {
    const tri = [s.idx[t], s.idx[t + 1], s.idx[t + 2]];
    const [i, j, m] = tri;
    a.fromArray(pos, i * 3);
    b.fromArray(pos, j * 3);
    p.fromArray(pos, m * 3);
    fn.subVectors(b, a).cross(q.subVectors(p, a)).normalize();
    p.add(a).add(b).divideScalar(3);
    if (look.glow?.(p, fn)) glow.push(i, j, m);
    else {
      if (look.accent?.(p, fn)) for (const v of tri) accent.toArray(col, v * 3);
      shell.push(i, j, m);
    }
    if (fn.y < 0.25 || tri.some((x) => leg[weld[x]] >= 0)) continue;
    for (const { nx, nz, d, tx, tz, lo, hi } of cuts) {
      const along = tx * p.x + tz * p.z;
      if (along < lo || along > hi) continue;
      // Where the plane crosses this face: a segment, thickened along the plane's normal into a strip.
      const hit: number[] = [];
      for (let e = 0; e < 3; e++) {
        const u = tri[e] * 3;
        const w = tri[(e + 1) % 3] * 3;
        const du = nx * pos[u] + nz * pos[u + 2] - d;
        const dw = nx * pos[w] + nz * pos[w + 2] - d;
        if (du < 0 === dw < 0) continue;
        const f = du / (du - dw);
        for (let k = 0; k < 3; k++) hit.push(pos[u + k] + (pos[w + k] - pos[u + k]) * f + fn.getComponent(k) * 0.004);
      }
      if (hit.length < 6) continue;
      // Wound to face up whichever way the segment runs.
      const up = nz * (hit[3] - hit[0]) - nx * (hit[5] - hit[2]) > 0 ? 1 : -1;
      for (const [o, k] of [[0, -1], [0, 1], [3, 1], [0, -1], [3, 1], [3, -1]]) {
        const sgn = k * up * SEAM;
        ribbon.push(hit[o] + nx * sgn, hit[o + 1], hit[o + 2] + nz * sgn);
      }
    }
  }

  // Grown last, so the body, seams and spine above stay in the file's own units.
  const k = look.scale ?? 1;
  for (let i = 0; i < pos.length; i++) pos[i] *= k;
  for (let i = 0; i < ribbon.length; i++) ribbon[i] *= k;
  for (let i = 0; i < rig.length; i++) if (i % 4 !== 3) rig[i] *= k;
  const geo = (index: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(s.nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('bugRig', new THREE.BufferAttribute(rig, 4));
    g.setIndex(index);
    return g;
  };
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo(shell), paint.chitin));
  // The crystals and the seams together in the glow, unindexed (the seams are all their own vertices).
  const lit = glow.length ? [geo(glow).toNonIndexed()] : [];
  if (ribbon.length) {
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3));
    r.setAttribute('normal', new THREE.Float32BufferAttribute(ribbon.map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    r.setAttribute('bugRig', new THREE.Float32BufferAttribute(new Float32Array((ribbon.length / 3) * 4), 4));
    lit.push(r);
  }
  for (const l of lit) l.deleteAttribute('color');
  if (lit.length) g.add(new THREE.Mesh(lit.length > 1 ? mergeGeometries(lit) : lit[0], paint.glow));
  return g;
}
