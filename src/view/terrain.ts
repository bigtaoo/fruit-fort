// The ground of the battle: the ice basin round the fort, its dark basalt outcrops and the
// violet crystal clusters at their feet. Split from scifi.ts, which keeps the palette (LAND) and the
// fort's own pieces. Everything here is static and cheap on purpose: one draw for the ground, one for
// all the rocks and two for all the crystals, whatever the number of outcrops.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAND } from './scifi';

/** A colour given as 'rgba(r,g,b,a)': the colour and the alpha apart. */
function rgba(s: string): [THREE.Color, number] {
  const m = s.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/)!;
  return [new THREE.Color(`rgb(${m[1]},${m[2]},${m[3]})`), Number(m[4])];
}

/**
 * The colour a value the plate texture stores ends up as in the shader. The texture holds the
 * linear tints as if they were sRGB bytes, which is what the old canvas did and the ice was tuned
 * to; the seam and rim colours have to go through the same decode to match it.
 */
function decoded(c: THREE.Color): THREE.Color {
  return new THREE.Color().setRGB(c.r, c.g, c.b, THREE.LinearSRGBColorSpace).convertSRGBToLinear();
}

/**
 * Big ice plates, tiling: a Voronoi cell per plate, each a slightly different tint with a faint
 * frosting towards its middle. The cracks are not painted in: the alpha holds them instead (below
 * half a dark seam, above it the lit rim on one side of the seam), so the ground shader can fade
 * them out with distance rather than tile the same hard lines to the horizon. A DataTexture, not a
 * canvas: a canvas premultiplies the alpha and would eat the colour where it is low.
 */
function iceTexture(): THREE.DataTexture {
  const S = 512;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Seeds with their wrapped copies, so the tile has no seam.
  const n = 16;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const px = rnd() * S;
    const py = rnd() * S;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) pts.push([px + ox, py + oy, i]);
  }
  // Each plate its own tint: one of the palette's, a little lighter or darker, so no two neighbours
  // match exactly. The shader widens or narrows these differences with distance from the fort.
  const tints = Array.from({ length: n }, (_, i) => new THREE.Color(LAND.plates[i % LAND.plates.length]).multiplyScalar(0.94 + rnd() * 0.12));
  const [, seamK] = rgba(LAND.seam);
  const [rim, rimK] = rgba(LAND.rim);
  const data = new Uint8Array(S * S * 4);
  const col = new THREE.Color();
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      let d1 = Infinity;
      let d2 = Infinity;
      let cell = 0;
      let nx = 0;
      let ny = 0;
      for (const [sx, sy, i] of pts) {
        const d = (sx - px) ** 2 + (sy - py) ** 2;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          cell = i;
          nx = sx;
          ny = sy;
        } else if (d < d2) d2 = d;
      }
      // Distance to the crack, roughly: the gap between the nearest two seeds' distances.
      const edge = (Math.sqrt(d2) - Math.sqrt(d1)) / 2;
      col.copy(tints[cell]).lerp(rim, 0.08 * Math.max(0, 1 - Math.sqrt(d1) / 140));
      // Soft-edged so the crack doesn't stair-step when the shader thins it.
      const seam = seamK * (1 - THREE.MathUtils.smoothstep(edge, 0.6, 1.5));
      const lit = edge > 1.1 && edge < 3.2 && px - nx + (py - ny) < 0 ? rimK * (1 - (edge - 1.1) / 2.1) : 0;
      const o = (py * S + px) * 4;
      data[o] = col.r * 255;
      data[o + 1] = col.g * 255;
      data[o + 2] = col.b * 255;
      data[o + 3] = Math.round((0.5 + 0.5 * (lit - seam)) * 255);
    }
  }
  const t = new THREE.DataTexture(data, S, S);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * Soft, tiling value noise for the ground at large: broad patches of slightly lighter and darker ice
 * that keep the plate tile from reading as a repeat. It once also laid pale frost drifts over the
 * ice out past the rail; seen from the battle camera those read as washed-out blotches on the near
 * ground (owner, 2026-11-02), so the ground now only varies in tone, never towards white.
 */
function toneTexture(): THREE.DataTexture {
  const S = 128;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const layer = (cells: number) => {
    const g = Array.from({ length: cells * cells }, rnd);
    return (x: number, y: number) => {
      const fx = (x / S) * cells;
      const fy = (y / S) * cells;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const at = (i: number, j: number) => g[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
      const u = THREE.MathUtils.smootherstep(fx - ix, 0, 1);
      const v = THREE.MathUtils.smootherstep(fy - iy, 0, 1);
      return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), u), THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), u), v);
    };
  };
  const broad = layer(3);
  // A finer layer in green: where its peaks are, the ground shader lights the cracks (GROUND_DETAIL).
  const patches = layer(5);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 4;
      data[o] = broad(x, y) * 255;
      data[o + 1] = patches(x, y) * 255;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/**
 * Sparse detail on the ice past the fence, worked out in the ground's own shader so it costs no
 * draw: glowing fissures, acid scorches and bits of wreckage. Without it the lower half of a
 * portrait screen was one even field of plates. The marks sit one chance per cell of a world grid,
 * so they come at a steady spacing that shrinks with distance and helps read depth; each keeps
 * inside its cell, so there are no neighbour lookups. Violet glow, never cyan: cyan is our side.
 * Expects `r`, `far`, `crack`, `icec` and `groundGlow` from the plate code before it.
 */
const GROUND_DETAIL = `
  float keep = smoothstep(4.8, 5.8, r) * (1.0 - smoothstep(16.0, 24.0, r));
  // Fissures: in a few broad patches the dark seams glow, as if the swarm's energy ran under the ice.
  float vein = smoothstep(0.56, 0.68, texture2D(toneMap, vGround / 29.0 + 0.37).g) * keep;
  groundGlow += vec3(0.42, 0.12, 1.0) * max(-crack, 0.0) * vein * 1.1;
  vec2 cellP = vGround / 2.9;
  vec2 cid = floor(cellP);
  vec3 h = fract(vec3(cid.xyx) * vec3(0.1031, 0.1030, 0.0973));
  h += dot(h, h.yzx + 33.33);
  h = fract((h.xxy + h.yzz) * h.zyx);
  // From the mark's centre, in world units; the centre wanders inside the cell.
  vec2 lp = (fract(cellP) - 0.5 - (h.xy - 0.5) * 0.36) * 2.9;
  if (h.z < 0.13) {
    // A scorch: acid burnt into the ice, dark and ragged, with a faint violet ember round its edge.
    float ang = atan(lp.y, lp.x);
    float d = length(lp) / ((0.45 + 0.35 * h.x) * (1.0 + 0.14 * sin(ang * 3.0 + h.y * 6.3) + 0.07 * sin(ang * 7.0 + h.x * 6.3)));
    icec *= 1.0 - 0.55 * (1.0 - smoothstep(0.15, 1.0, d)) * keep;
    groundGlow += vec3(0.4, 0.1, 0.75) * (smoothstep(0.55, 0.8, d) - smoothstep(0.8, 1.0, d)) * keep * 0.12;
  } else if (h.z < 0.34) {
    // Wreckage: two torn plates of armour lying flat, dark metal with a lit edge and a short shadow
    // away from the sun.
    float a = h.x * 6.283;
    vec2 p1 = mat2(cos(a), sin(a), -sin(a), cos(a)) * lp;
    vec2 p2 = mat2(cos(a + 0.7), sin(a + 0.7), -sin(a + 0.7), cos(a + 0.7)) * (lp - vec2(0.5, 0.32));
    vec2 b1 = vec2(0.36, 0.13) * (0.7 + 0.6 * h.y);
    vec2 b2 = vec2(0.2, 0.1);
    vec2 q1 = abs(p1) - b1;
    vec2 q2 = abs(p2) - b2;
    float d1 = length(max(q1, 0.0)) + min(max(q1.x, q1.y), 0.0);
    float d2 = length(max(q2, 0.0)) + min(max(q2.x, q2.y), 0.0);
    float d = min(d1, d2);
    vec2 s1 = abs(mat2(cos(a), sin(a), -sin(a), cos(a)) * (lp - vec2(0.06, -0.06))) - b1;
    float shade = 1.0 - smoothstep(0.0, 0.05, length(max(s1, 0.0)) + min(max(s1.x, s1.y), 0.0));
    icec *= 1.0 - 0.4 * shade * keep;
    float body = (1.0 - smoothstep(-0.01, 0.01, d)) * keep;
    float lit = (smoothstep(-0.045, -0.025, d) - smoothstep(-0.01, 0.01, d)) * step(0.0, d1 < d2 ? p1.y : p2.y);
    icec = mix(icec, vec3(0.13, 0.14, 0.17) + vec3(0.3, 0.33, 0.38) * lit, body);
  }
`;

/**
 * The current in the ground's seams, shared by reference with the ice shader: x is how far from the
 * fort the idle pulse's front is (off the board when none runs), y the whole web's flash (0..1), z
 * the time for the flicker. Driven by animateCurrent; nothing is redrawn, only these three numbers.
 */
export const GROUND_CURRENT = { value: new THREE.Vector3(-20, 0, 0) };

/** How often an idle pulse runs out from the reactor (seconds, plus up to a second at random), and how long it takes. */
const PULSE_EVERY = 3;
const PULSE_TIME = 1.7;
/** A short arc between two seams now and then: seconds between (plus as much again at random), and how long one shows. */
const ARC_EVERY = 3.5;
const ARC_TIME = 0.13;
const current = { last: 0, flash: 0, pulseAt: -99, nextPulse: 2, arcAt: -99, nextArc: 4 };
let arc: THREE.Group | null = null;

/** Light the whole web of seams at once (a skill, a boss, the win); `k` is how bright, 0..1. */
export function groundFlash(k = 1): void {
  current.flash = Math.max(current.flash, k);
  current.nextArc = Math.min(current.nextArc, current.last + 0.05);
}

/** Advance the current: the idle pulse, the flash fading, and the odd arc. `t` is the stage clock. */
export function animateCurrent(t: number): void {
  const c = current;
  const dt = Math.min(0.1, Math.max(0, t - c.last));
  c.last = t;
  c.flash = Math.max(0, c.flash - dt * 2.2);
  if (t >= c.nextPulse) {
    c.pulseAt = t;
    c.nextPulse = t + PULSE_EVERY + Math.random();
  }
  const p = (t - c.pulseAt) / PULSE_TIME;
  GROUND_CURRENT.value.set(p < 1 ? 3.6 + p * 12 : -20, c.flash * c.flash, t);
  if (!arc) return;
  if (t >= c.nextArc) {
    c.arcAt = t;
    c.nextArc = t + ARC_EVERY + Math.random() * ARC_EVERY;
    strikeArc(arc);
  }
  const a = (t - c.arcAt) / ARC_TIME;
  arc.visible = a < 1;
  // It stutters while it shows, not a steady line.
  if (arc.visible) ((arc.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.random() < 0.3 ? 0.25 : 0.55;
}

/** The arc's two strips: a wide faint cyan halo under a thin white core, both lying on the ground. */
function makeArc(): THREE.Group {
  const g = new THREE.Group();
  const mat = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  g.add(new THREE.Mesh(new THREE.BufferGeometry(), mat(0x30c8ff, 0.55)));
  g.add(new THREE.Mesh(new THREE.BufferGeometry(), mat(0xe8fbff, 0.95)));
  g.children[1].position.y = 0.005;
  g.visible = false;
  g.renderOrder = 2;
  return g;
}

const ARC_POINTS = 8;
/** A new jagged path for the arc somewhere in the band round the fort, and its two strips along it. */
function strikeArc(g: THREE.Group): void {
  const a = Math.random() * Math.PI * 2;
  const r = 4.3 + Math.random() * 4;
  const x0 = Math.cos(a) * r;
  const z0 = Math.sin(a) * r;
  const d = a + Math.PI / 2 + (Math.random() - 0.5) * 1.2;
  const len = 1.5 + Math.random() * 1.3;
  const pts: [number, number][] = [];
  for (let i = 0; i < ARC_POINTS; i++) {
    const s = i / (ARC_POINTS - 1);
    const j = i === 0 || i === ARC_POINTS - 1 ? 0 : (Math.random() - 0.5) * 0.45;
    pts.push([x0 + Math.cos(d) * len * s - Math.sin(d) * j, z0 + Math.sin(d) * len * s + Math.cos(d) * j]);
  }
  strip(g.children[0] as THREE.Mesh, pts, 0.32);
  strip(g.children[1] as THREE.Mesh, pts, 0.07);
}

/** A flat strip `w` wide along `pts` at y 0.04. */
function strip(m: THREE.Mesh, pts: [number, number][], w: number): void {
  const pos = new Float32Array(pts.length * 6);
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[Math.max(0, i - 1)];
    const [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    // Thinner at the ends.
    const h = (w / 2) * (i === 0 || i === pts.length - 1 ? 0.3 : 1);
    const nx = (-(bz - az) / l) * h;
    const nz = ((bx - ax) / l) * h;
    pos.set([pts[i][0] + nx, 0.04, pts[i][1] + nz, pts[i][0] - nx, 0.04, pts[i][1] - nz], i * 6);
    if (i > 0) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
  }
  m.geometry.dispose();
  m.geometry = new THREE.BufferGeometry();
  m.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.geometry.setIndex(idx);
}

/**
 * The ice ground's material: the plate texture with a hierarchy laid over it by distance from the
 * fort, so it reads as a basin rather than a floor of tiles. Near the fort the plates differ more
 * in tint and their cracks are crisp; further out the tints even out, the cracks thin and the ice
 * darkens and cools towards the board's edge, where it should recede rather than compete with the
 * fight.
 */
function iceMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 });
  const uniforms = {
    toneMap: { value: toneTexture() },
    seamColor: { value: decoded(rgba(LAND.seam)[0]) },
    rimColor: { value: decoded(rgba(LAND.rim)[0]) },
    uCurrent: GROUND_CURRENT,
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;\nuniform sampler2D toneMap;\nuniform vec3 seamColor, rimColor, uCurrent;')
      .replace(
        '#include <map_fragment>',
        `
        vec4 ice = texture2D(map, vMapUv);
        // The smallest mip is the tile's average tint: plates vary about it.
        vec3 mean = texture(map, vMapUv, 12.0).rgb;
        float tone = texture2D(toneMap, vGround / 37.0).r;
        float r = length(vGround);
        float near = 1.0 - smoothstep(4.0, 6.5, r);
        float far = smoothstep(5.5, 11.0, r);
        vec3 plate = mean + (ice.rgb - mean) * mix(1.0, 2.2, near) * mix(1.0, 0.3, far);
        plate *= 0.93 + 0.14 * tone;
        float crack = (ice.a * 2.0 - 1.0) * mix(1.0, 0.2, far);
        vec3 icec = crack < 0.0 ? mix(plate, seamColor, -crack) : mix(plate, rimColor, crack);
        icec *= mix(vec3(1.0), vec3(0.7, 0.78, 0.92), far);
        vec3 groundGlow = vec3(0.0);
        ${GROUND_DETAIL}
        // The current in the seams (see GROUND_CURRENT): a cyan front running out from the reactor,
        // flickering along its length, and the whole web lit at once on a flash, fading outwards.
        float seam = max(1.0 - ice.a * 2.0, 0.0);
        float front = exp(-pow((r - uCurrent.x) / 1.2, 2.0));
        float flick = 0.7 + 0.3 * sin(vGround.x * 6.0 + vGround.y * 4.3 + uCurrent.z * 31.0);
        float lit = front * flick * (1.0 - smoothstep(9.0, 16.0, r)) + uCurrent.y * 0.8 * (1.0 - smoothstep(5.0, 14.0, r));
        groundGlow += vec3(0.18, 0.75, 1.0) * seam * seam * lit * 2.6;
        diffuseColor.rgb *= icec;`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += groundGlow;');
  };
  mat.customProgramCacheKey = () => 'ice-ground';
  return mat;
}

/**
 * One rock: an irregular, chiselled block of alien basalt `w` × `h` × `d`, its top pressed into a
 * tilted shelf like the end of a basalt column. A coarse, jittered mesh with a few flat cuts across
 * it, flat-shaded by the material, so it breaks into facets that catch the light one by one: the
 * old smooth, rounded blocks read as plastic toys (owner, 2026-11-02). Vertex colours carry the
 * rock's tint, darker at the foot, and a faint worn sheen on the faces that look up. No snow caps
 * (owner, 2026-11-02: they read as a winter scene); the cold edge comes from the material's rim.
 */
function boulder(rng: () => number, w: number, h: number, d: number, tint: THREE.Color): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 1);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position as THREE.BufferAttribute;
  // A slightly tilted shelf, so the tops are not all level.
  const tx = (rng() - 0.5) * 0.4;
  const tz = (rng() - 0.5) * 0.4;
  // Three flat cuts through the sides at random angles: the broken planes of a split block.
  const cuts = Array.from({ length: 3 }, () => {
    const a = rng() * Math.PI * 2;
    return [new THREE.Vector3(Math.cos(a), (rng() - 0.3) * 0.8, Math.sin(a)).normalize(), 0.62 + rng() * 0.2] as const;
  });
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // Squarer than a ball (a superellipsoid): steep sides and a broad top, like a block of cliff.
    v.set(Math.sign(v.x) * Math.abs(v.x) ** 0.6, Math.sign(v.y) * Math.abs(v.y) ** 0.5, Math.sign(v.z) * Math.abs(v.z) ** 0.6);
    // Each corner pushed in or out a little, so no two faces are alike.
    v.multiplyScalar(0.9 + rng() * 0.2);
    for (const [n, o] of cuts) {
      const k = v.dot(n) - o;
      if (k > 0) v.addScaledVector(n, -k);
    }
    const cap = 0.7 + tx * v.x + tz * v.z;
    if (v.y > cap) v.y = cap + (v.y - cap) * 0.2;
    p.setXYZ(i, v.x * w, (v.y + 0.25) * h, v.z * d);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const sheen = new THREE.Color(LAND.sheen);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = THREE.MathUtils.clamp(p.getY(i) / (h * 1.2), 0, 1);
    // The shelf a shade lighter, as if worn smooth: a hint, never a cap.
    const up = THREE.MathUtils.smoothstep(nrm.getY(i), 0.72, 0.92) * THREE.MathUtils.smoothstep(y, 0.55, 0.85);
    // Faint strata across the sides: layered mineral, not one lump of stone.
    const strata = 1 + 0.1 * Math.sin(p.getY(i) * 11) + (rng() - 0.5) * 0.1;
    c.copy(tint).multiplyScalar((0.6 + 0.5 * y) * strata).lerp(sheen, up * 0.2);
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Where the outcrops stand: [x, z, size, crystals at its foot]. A few large, composed groups rather
 * than many scattered rocks, set to frame the basin at both aspect ratios: the top corners and left
 * edge of a landscape view, the long sides of a portrait one, and never in the bottom corners the
 * skill button and the stat dock cover. Out past where the bugs gather, so none hides the fight;
 * the bugs' x-ray shows them through a rock as they come out from behind it. The far-left one sits
 * low and to the side: further back, a landscape view tucked its top under the HUD's wave counter.
 */
export const OUTCROPS: [number, number, number, boolean][] = [
  [9.6, -3.9, 1.1, true],
  [-6.1, -4.1, 0.95, true],
  [6.4, -5.4, 0.95, false],
  [-9.2, -6.9, 1.0, false],
];

/**
 * The rock outcrops, merged into one mesh. Each is a tall flat-topped block with two or three
 * lower ones stepping down in front of it (towards the fort), so it reads as a small cliff with a
 * face rather than a heap. They take no shadow pass: they stand outside the sun's shadow box.
 */
function makeRocks(rng: () => number): THREE.Mesh {
  const tints = LAND.rocks.map((h) => new THREE.Color(h));
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [i, [x, z, s]] of OUTCROPS.entries()) {
    const tint = tints[i % tints.length];
    // Face the fort: local +z points at the origin.
    const face = Math.atan2(-x, -z);
    const pieces: [number, number, number, number, number][] = [
      // [across, towards the fort, width, height, depth]
      [0, 0, 1.25, 2.1, 1.0],
      [1.05 + rng() * 0.3, -0.3, 0.9, 1.5, 0.85],
      [-0.95 - rng() * 0.3, 0.05, 0.85, 1.15, 0.8],
      [0.35, 0.9, 0.7, 0.6, 0.55],
    ];
    for (const [a, f, w, h, d] of pieces) {
      const k = 0.9 + rng() * 0.2;
      const shade = tint.clone().offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.06);
      const geo = boulder(rng, w * s * k, h * s * k, d * s * k, shade);
      q.setFromAxisAngle(up, face + (rng() - 0.5) * 0.6);
      const off = new THREE.Vector3(a * s, -0.15 * s, f * s).applyAxisAngle(up, face);
      m.compose(new THREE.Vector3(x, 0, z).add(off), q, new THREE.Vector3(1, 1, 1));
      parts.push(geo.applyMatrix4(m));
    }
  }
  const rocks = new THREE.Mesh(mergeGeometries(parts), rockMaterial());
  rocks.receiveShadow = true;
  return rocks;
}

/**
 * The rocks' material: dark and a little metallic, so the environment gives them a mineral glint
 * rather than the matte look of stone, flat-shaded so the facets read, plus a thin cold rim where a
 * face turns away from the camera that lifts the dark shapes off the ice. Faint ember-orange veins
 * wind through the lower faces: a warm mineral the cold scene has nowhere else, so they neither
 * blend with the violet crystals nor trip our side's cyan glow (CYAN_KEY). All in the standard
 * shader, not a light or a second mesh: no extra draw.
 */
function rockMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2, flatShading: true });
  const rim = { value: new THREE.Color(LAND.sheen) };
  const ember = { value: new THREE.Color(0xff6a28) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = rim;
    shader.uniforms.veinColor = ember;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRock;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor, veinColor;\nvarying vec3 vRock;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float edge = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        totalEmissiveRadiance += rimColor * (edge * edge * edge) * 0.9;
        // Two sets of wandering lines through the stone; fwidth keeps them a steady, unaliased width.
        float f = sin(vRock.x * 2.3 + vRock.z * 1.7 + 2.2 * sin(vRock.y * 3.1 + vRock.x * 0.9));
        float g = sin(vRock.z * 2.9 - vRock.x * 1.3 + 1.8 * sin(vRock.y * 2.4 - vRock.z * 1.1));
        float vein = max(1.0 - smoothstep(0.0, 0.03 + fwidth(f), abs(f)), 0.6 * (1.0 - smoothstep(0.0, 0.025 + fwidth(g), abs(g))));
        totalEmissiveRadiance += veinColor * vein * (1.0 - smoothstep(0.6, 1.6, vRock.y)) * 0.32;`,
      );
  };
  mat.customProgramCacheKey = () => 'basalt';
  return mat;
}

let violet: THREE.CanvasTexture | undefined;
/** A soft violet pool of light: the crystals' glow on the ice. */
function violetGlow(): THREE.CanvasTexture {
  if (violet) return violet;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(200,120,255,0.7)');
  g.addColorStop(0.45, 'rgba(150,80,255,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  violet = new THREE.CanvasTexture(c);
  violet.colorSpace = THREE.SRGBColorSpace;
  return violet;
}

/**
 * Violet alien crystals as an accent: a tight cluster of five to seven shards at the inner foot of
 * some outcrops, leaning out from a common root, with a soft pool of their light on the ice. The
 * bugs' colour, so they hint at where the swarm comes from. Shards in one mesh, pools in another.
 */
/** The tips of the tallest shards, filled by makeCrystals: where the ambience's white glints flash. */
export const GLINTS: THREE.Vector3[] = [];

function makeCrystals(rng: () => number): THREE.Group {
  GLINTS.length = 0;
  const shards: THREE.BufferGeometry[] = [];
  const pools: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const deep = new THREE.Color(0x5a2aa8);
  const pale = new THREE.Color(0xe6c8ff);
  for (const [x, z, s, has] of OUTCROPS) {
    if (!has) continue;
    // In front of the outcrop, a little to one side.
    const l = Math.hypot(x, z);
    const cx = x - (x / l) * 1.45 * s + (z / l) * 0.6;
    const cz = z - (z / l) * 1.45 * s - (x / l) * 0.6;
    const count = 5 + Math.floor(rng() * 3);
    for (let k = 0; k < count; k++) {
      const h = (k === 0 ? 1.15 : 0.45 + rng() * 0.5) * s;
      const r = 0.09 + h * 0.1;
      const prism = new THREE.CylinderGeometry(r * 0.85, r, h * 0.72, 6, 1).translate(0, h * 0.36, 0);
      const tip = new THREE.ConeGeometry(r * 0.85, h * 0.28, 6, 1).translate(0, h * 0.86, 0);
      const geo = mergeGeometries([prism.toNonIndexed(), tip.toNonIndexed()]);
      geo.deleteAttribute('uv');
      // Deep at the root to pale at the tip.
      const p = geo.attributes.position as THREE.BufferAttribute;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) deep.clone().lerp(pale, p.getY(i) / h).toArray(col, i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const a = rng() * Math.PI * 2;
      const lean = k === 0 ? 0.08 : 0.35 + rng() * 0.35;
      e.set(Math.cos(a) * lean, rng() * Math.PI, Math.sin(a) * lean);
      q.setFromEuler(e);
      const off = k === 0 ? 0 : 0.16 + rng() * 0.2;
      m.compose(new THREE.Vector3(cx + Math.sin(a) * off, -0.05, cz - Math.cos(a) * off), q, new THREE.Vector3(1, 1, 1));
      shards.push(geo.applyMatrix4(m));
      if (k < 3) GLINTS.push(new THREE.Vector3(0, h, 0).applyMatrix4(m));
    }
    pools.push(new THREE.PlaneGeometry(2.4 * s, 2.4 * s).rotateX(-Math.PI / 2).translate(cx, 0.015, cz));
  }
  const g = new THREE.Group();
  const crystal = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x7a2ee0, emissiveIntensity: 0.75, roughness: 0.15, flatShading: true });
  g.add(new THREE.Mesh(mergeGeometries(shards), crystal));
  if (pools.length) g.add(new THREE.Mesh(mergeGeometries(pools), new THREE.MeshBasicMaterial({ map: violetGlow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  return g;
}

/**
 * The battle's ground: a plane `size` across of cracked ice plates that takes the shadows, the rock
 * outcrops that make it a basin and the crystal clusters at their feet. Nothing small stands about
 * as a mesh of its own: the scorches and wreckage are painted by the ground's shader (GROUND_DETAIL).
 */
export function makeTerrain(size: number, rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const map = iceTexture();
  map.repeat.set(size / 8, size / 8);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), iceMaterial(map));
  ground.receiveShadow = true;
  g.add(ground);
  g.add(makeRocks(rng));
  g.add(makeCrystals(rng));
  arc = makeArc();
  g.add(arc);
  return g;
}
