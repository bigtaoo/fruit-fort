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
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 4;
      data[o] = broad(x, y) * 255;
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
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;\nuniform sampler2D toneMap;\nuniform vec3 seamColor, rimColor;')
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
        diffuseColor.rgb *= icec;`,
      );
  };
  mat.customProgramCacheKey = () => 'ice-ground';
  return mat;
}

/**
 * One rock: a lumpy, rounded block of alien basalt `w` × `h` × `d`, its top pressed into a flat
 * shelf like the end of a basalt column. Rounded and smooth-shaded to sit with the fort's soft
 * shapes; vertex colours carry the rock's tint, darker at the foot, and a faint worn sheen on the
 * faces that look up. No snow caps any more (owner, 2026-11-02: they read as a winter scene, not a
 * sci-fi one); the cold edge comes from the material's rim instead (rockMaterial).
 */
function boulder(rng: () => number, w: number, h: number, d: number, tint: THREE.Color): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 2);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const ph = [rng() * 6.3, rng() * 6.3, rng() * 6.3];
  // A slightly tilted shelf, so the tops are not all level.
  const tx = (rng() - 0.5) * 0.3;
  const tz = (rng() - 0.5) * 0.3;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // Squarer than a ball (a superellipsoid): steep sides and a broad top, like a block of cliff.
    v.set(Math.sign(v.x) * Math.abs(v.x) ** 0.6, Math.sign(v.y) * Math.abs(v.y) ** 0.5, Math.sign(v.z) * Math.abs(v.z) ** 0.6);
    // Broad lumps, and shallow vertical flutes round the sides: the columns of a basalt cliff face.
    const flute = 0.045 * Math.sin(9 * Math.atan2(v.z, v.x) + ph[2]) * (1 - Math.abs(v.y));
    const bump = 1 + 0.11 * Math.sin(2.6 * v.x + ph[0]) * Math.sin(2.2 * v.y + ph[1]) + flute;
    v.multiplyScalar(bump);
    const cap = 0.7 + tx * v.x + tz * v.z;
    if (v.y > cap) v.y = cap + (v.y - cap) * 0.3;
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
    const strata = 1 + 0.1 * Math.sin(p.getY(i) * 11);
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
 * the bugs' x-ray shows them through a rock as they come out from behind it.
 */
const OUTCROPS: [number, number, number, boolean][] = [
  [9.6, -3.9, 1.1, true],
  [-6.1, -4.1, 0.95, true],
  [6.4, -5.4, 0.95, false],
  [-7.4, -9.6, 1.1, false],
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
 * rather than the matte look of stone, plus a thin cold rim where a face turns away from the camera
 * that lifts the dark shapes off the ice. The rim is a few lines in the standard shader, not a light
 * or a second mesh: no extra draw. Grey-blue, not violet or cyan, so it neither blends with the
 * crystals nor trips our side's cyan glow (CYAN_KEY).
 */
function rockMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.2 });
  const rim = { value: new THREE.Color(LAND.sheen) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = rim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float edge = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        totalEmissiveRadiance += rimColor * (edge * edge * edge) * 0.9;`,
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
function makeCrystals(rng: () => number): THREE.Group {
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
 * outcrops that make it a basin and the crystal clusters at their feet. Nothing small lies
 * scattered about: the fight is the busy part of the picture.
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
  return g;
}
