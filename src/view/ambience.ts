// Ambience: motion in the set that has nothing to do with the fight. Ice motes drifting in the air,
// motes rising in the reactor's column, white glints on the crystal tips, pale mist lying on the
// outer ice, steam hissing from vents by the outcrops; a red alarm on the reactor when the boss comes
// and the motes lifting after a win. Only white, ice blue and a faint cyan, small, slow and faint:
// purple is the bugs', red the damage, gold the crystals and orange the pickups, and nothing here may
// read as a shot, a bug or something to grab.
// Three draws in all (motes, mist, steam) plus the vent plates, every one animated on the GPU from a
// clock uniform: the CPU only sets a few uniforms a frame. The quality ladder halves it ('fx', 'pixel')
// or hides it ('min').

import * as THREE from 'three';
import { WALL } from '../sim/config';
import type { World } from '../sim/world';
import { LEVELS } from './quality';
import type { Stage } from './scene';
import { GLINTS, OUTCROPS } from './terrain';

/** Air motes: drift on the wind, wrap in a box round the field. */
const AIR = 60;
/** Motes rising in the reactor's glass sleeve, between the core (0.17) and the glass (0.3). */
const COLUMN = 12;
/** Mist wisps on the ring of outer ice, well outside the fence. */
const MIST = 14;
const MIST_IN = WALL + 1.9;
const MIST_OUT = 13;
/** Puffs a vent keeps in the air, and how long one lives. */
const PUFFS = 6;
const PUFF_LIFE = 2.6;
/** Order of the puffs' ages, so the first half (all a halved level draws) is still spread out. */
const PUFF_AGES = [0, 1 / 2, 1 / 6, 2 / 3, 1 / 3, 5 / 6];
/** The boss alarm's length, seconds: three red flashes on the reactor and the light dipped. */
const ALARM = 2.4;
/** How much the sky and the sun dip at the alarm's peak. */
const ALARM_DIM = 0.2;
const RED = new THREE.Color(0xff3a3a);

/** Shared billboard vertex: a quad from PlaneGeometry(1, 1) turned to the camera round `p`. */
const BILLBOARD = /* glsl */ `
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 2.0;
`;

const MOTES_VERT = /* glsl */ `
  attribute vec4 aSeed;
  attribute vec3 aInfo;
  uniform float uTime;
  uniform float uRise;
  uniform float uWin;
  uniform vec3 uIce;
  uniform vec3 uCyan;
  varying vec2 vUv;
  varying float vA;
  varying float vStar;
  varying vec3 vCol;
  void main() {
    vec3 p;
    float size;
    vStar = 0.0;
    if (aInfo.x < 0.5) {
      // Air: the wind carries them +x and a little +z; each sways and now and then twinkles.
      float x = mod(aSeed.x + uTime * 0.22 + 14.0, 28.0) - 14.0;
      float z = mod(aSeed.y + uTime * 0.05 + 11.0, 22.0) - 11.0;
      float h = mod(aSeed.z + uRise, 3.2);
      p = vec3(x + sin(uTime * 0.6 + aSeed.w * 6.28) * 0.25, 0.3 + h, z + cos(uTime * 0.5 + aSeed.w * 9.0) * 0.2);
      float tw = pow(max(0.0, sin(uTime * aInfo.y + aInfo.z)), 24.0);
      vA = (0.45 + 0.55 * tw + 0.4 * uWin) * smoothstep(0.0, 0.4, h) * smoothstep(3.2, 2.6, h)
        * smoothstep(14.0, 12.0, abs(x)) * smoothstep(11.0, 9.0, abs(z));
      size = (0.13 + 0.09 * tw) * (1.0 + 0.6 * uWin);
      vCol = mix(uIce, vec3(1.0), max(tw, uWin * 0.5));
    } else if (aInfo.x < 1.5) {
      // Column: round and up the reactor's sleeve, fading in at the bottom and out at the top.
      float h = fract(aSeed.z + uTime * 0.35);
      float a = aSeed.w * 6.2831853 + uTime * 1.3;
      p = vec3(cos(a) * aSeed.x, 1.15 + h * 0.95, sin(a) * aSeed.x);
      vA = 0.85 * sin(3.1415927 * h);
      size = 0.07;
      vCol = uCyan;
    } else {
      // Glint: a short white star on a crystal tip every few seconds.
      float f = pow(max(0.0, sin(uTime * aInfo.y + aInfo.z)), 90.0);
      p = aSeed.xyz;
      vA = f;
      size = 0.42 * f;
      vStar = 1.0;
      vCol = vec3(1.0);
    }
    ${BILLBOARD}
  }
`;

const MOTES_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying float vA;
  varying float vStar;
  varying vec3 vCol;
  void main() {
    float d = pow(max(0.0, 1.0 - length(vUv)), 2.0);
    float s = max(0.0, 1.0 - abs(vUv.x) * 7.0) * max(0.0, 1.0 - abs(vUv.y))
      + max(0.0, 1.0 - abs(vUv.y) * 7.0) * max(0.0, 1.0 - abs(vUv.x));
    float k = mix(d, d * 0.7 + s, vStar) * vA;
    if (k < 0.004) discard;
    gl_FragColor = vec4(vCol, k);
  }
`;

const MIST_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uAlpha;
  varying vec2 vUv;
  varying float vA;
  varying float vSeed;
  void main() {
    // Round the ring very slowly, swelling and fading in and out; stretched along the ring.
    float a = aSeed.x + uTime * 0.012;
    float breathe = 0.5 + 0.5 * sin(uTime * 0.15 + aSeed.w * 6.2831853);
    float size = aSeed.z * (0.9 + 0.2 * breathe);
    vec2 out_ = vec2(cos(a), sin(a));
    vec2 along = vec2(-out_.y, out_.x);
    vec2 w = out_ * aSeed.y + along * position.x * size * 1.7 + out_ * position.y * size;
    gl_Position = projectionMatrix * viewMatrix * vec4(w.x, 0.02, w.y, 1.0);
    vUv = position.xy * 2.0;
    vA = uAlpha * breathe;
    vSeed = aSeed.w * 20.0;
  }
`;

const MIST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vA;
  varying float vSeed;
  void main() {
    float d = pow(max(0.0, 1.0 - length(vUv)), 1.6);
    // Lumpy, not a clean ellipse.
    d *= 0.7 + 0.3 * sin(vUv.x * 4.0 + vSeed) * sin(vUv.y * 3.0 - vSeed);
    float k = d * vA;
    if (k < 0.003) discard;
    gl_FragColor = vec4(uColor, k);
  }
`;

const STEAM_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uAlpha;
  varying vec2 vUv;
  varying float vA;
  void main() {
    float age = fract(uTime / ${PUFF_LIFE.toFixed(1)} + aSeed.z);
    // Whether the vent was hissing when this puff left it: each vent breathes on and off.
    float born = uTime - age * ${PUFF_LIFE.toFixed(1)};
    float on = smoothstep(-0.2, 0.4, sin(born * 0.35 + aSeed.w * 2.4));
    vec3 p = vec3(aSeed.x + 0.3 * age + sin(age * 5.0 + aSeed.z * 20.0) * 0.06, 0.1 + age * 1.5, aSeed.y + 0.08 * age);
    float size = mix(0.25, 0.9, sqrt(age));
    vA = uAlpha * on * smoothstep(0.0, 0.12, age) * (1.0 - age);
    ${BILLBOARD}
  }
`;

const STEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vA;
  void main() {
    float k = pow(max(0.0, 1.0 - length(vUv)), 1.5) * vA;
    if (k < 0.003) discard;
    gl_FragColor = vec4(uColor, k);
  }
`;

/** A batch of quads drawn once each per instance, with `attrs` as per-instance attributes. */
function batch(attrs: Record<string, [Float32Array, number]>, mat: THREE.ShaderMaterial, count: number): THREE.Mesh<THREE.InstancedBufferGeometry> {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  for (const [name, [data, size]] of Object.entries(attrs)) geo.setAttribute(name, new THREE.InstancedBufferAttribute(data, size));
  geo.instanceCount = count;
  const mesh = new THREE.Mesh(geo, mat);
  // The quads are placed in the shader: the base quad's bounds say nothing about where they are.
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

function shader(vertexShader: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending, flat = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending,
    // The mist lies a hair over the ice: pull it forward in depth so it never flickers into it.
    polygonOffset: flat,
    polygonOffsetFactor: flat ? -1 : 0,
    polygonOffsetUnits: flat ? -4 : 0,
  });
}

/** Where the vents stand: beside each outcrop, on the side away from its crystals, and one lower right. */
function ventSpots(): [number, number][] {
  const spots: [number, number][] = OUTCROPS.map(([x, z, s]) => {
    const l = Math.hypot(x, z);
    const ux = x / l;
    const uz = z / l;
    return [x - ux * 1.7 * s - uz * 1.1, z - uz * 1.7 * s + ux * 1.1];
  });
  spots.push([5.4, 4.2]);
  return spots;
}

/** The vent plates: a gunmetal octagon with three dark slots each, all in one vertex-coloured mesh. */
function ventPlates(spots: [number, number][]): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, hex: number) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(col, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  };
  for (const [x, z] of spots) {
    const turn = Math.atan2(z, x);
    parts.push(paint(new THREE.CylinderGeometry(0.34, 0.4, 0.07, 8).rotateY(turn).translate(x, 0.035, z), 0x4a5462));
    for (const k of [-1, 0, 1]) parts.push(paint(new THREE.BoxGeometry(0.42, 0.02, 0.06).translate(0, 0.072, k * 0.13).rotateY(turn).translate(x, 0, z), 0x12161c));
  }
  const geo = mergeAll(parts);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 }));
  m.receiveShadow = true;
  return m;
}

/** Merge non-indexed geometries with the same attributes (position, normal, color). */
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const total = parts.reduce((n, g) => n + g.attributes[name].array.length, 0);
    const data = new Float32Array(total);
    let at = 0;
    for (const g of parts) {
      data.set(g.attributes[name].array as Float32Array, at);
      at += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(data, 3));
  }
  return out;
}

export class Ambience {
  private motes: THREE.Mesh<THREE.InstancedBufferGeometry>;
  private mist: THREE.Mesh<THREE.InstancedBufferGeometry>;
  private steam: THREE.Mesh<THREE.InstancedBufferGeometry>;
  private vents: number;
  /** Motes that always draw (column, glints) before the air motes the level may halve. */
  private fixed: number;
  private uniforms = { uTime: { value: 0 }, uRise: { value: 0 }, uWin: { value: 0 } };
  private alarmT = 0;
  private hadBoss = false;
  private lights: { light: THREE.Light; base: number }[] = [];
  private reactor: { mat: THREE.MeshStandardMaterial; base: THREE.Color }[] = [];
  private halo?: THREE.SpriteMaterial;
  private haloBase = new THREE.Color();

  constructor(stage: Stage) {
    const rnd = Math.random;
    // Motes: column first, then glints, then air (so a halved level only trims the air).
    const glints = GLINTS.length;
    const n = COLUMN + glints + AIR;
    const seed = new Float32Array(n * 4);
    const info = new Float32Array(n * 3);
    let i = 0;
    for (let k = 0; k < COLUMN; k++, i++) {
      seed.set([0.22 + rnd() * 0.05, 0, k / COLUMN, rnd()], i * 4);
      info.set([1, 0, 0], i * 3);
    }
    for (const g of GLINTS) {
      seed.set([g.x, g.y, g.z, 0], i * 4);
      // Rate ~0.8-1.3 rad/s: one flash each 5-8 s, each on its own beat.
      info.set([2, 0.8 + rnd() * 0.5, rnd() * 40], i * 3);
      i++;
    }
    for (let k = 0; k < AIR; k++, i++) {
      seed.set([rnd() * 28 - 14, rnd() * 22 - 11, rnd() * 3.2, rnd()], i * 4);
      info.set([0, 0.3 + rnd() * 0.5, rnd() * 60], i * 3);
    }
    this.fixed = COLUMN + glints;
    const u = this.uniforms;
    this.motes = batch(
      { aSeed: [seed, 4], aInfo: [info, 3] },
      shader(MOTES_VERT, MOTES_FRAG, { ...u, uIce: { value: new THREE.Color(0xcfe6ff) }, uCyan: { value: new THREE.Color(0xa8f6ff) } }, THREE.AdditiveBlending),
      n,
    );

    const mist = new Float32Array(MIST * 4);
    for (let k = 0; k < MIST; k++) {
      mist.set([(k / MIST) * Math.PI * 2 + rnd() * 0.3, MIST_IN + 1.6 + rnd() * (MIST_OUT - MIST_IN - 1.6), 3 + rnd() * 2, rnd()], k * 4);
    }
    this.mist = batch({ aSeed: [mist, 4] }, shader(MIST_VERT, MIST_FRAG, { uTime: u.uTime, uAlpha: { value: 0.32 }, uColor: { value: new THREE.Color(0xdfe8f2) } }, THREE.NormalBlending, true), MIST);

    const spots = ventSpots();
    this.vents = spots.length;
    const puffs = new Float32Array(spots.length * PUFFS * 4);
    // Puff-major: the first `vents` puffs are one per vent, so a halved count keeps every vent going.
    PUFF_AGES.forEach((age, k) => spots.forEach(([x, z], v) => puffs.set([x, z, age, v], (k * spots.length + v) * 4)));
    this.steam = batch({ aSeed: [puffs, 4] }, shader(STEAM_VERT, STEAM_FRAG, { uTime: u.uTime, uAlpha: { value: 0.42 }, uColor: { value: new THREE.Color(0xe8eef6) } }, THREE.NormalBlending), spots.length * PUFFS);

    stage.scene.add(ventPlates(spots), this.mist, this.steam, this.motes);
    stage.scene.traverse((o) => {
      if (o instanceof THREE.HemisphereLight || o instanceof THREE.DirectionalLight) this.lights.push({ light: o, base: o.intensity });
    });
    const d = stage.cake.userData;
    for (const mesh of [d.beacon, d.core] as (THREE.Mesh | undefined)[]) {
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        this.reactor.push({ mat, base: mat.emissive.clone() });
      }
    }
    const halo = d.halo as THREE.Sprite | undefined;
    if (halo) {
      this.halo = halo.material;
      this.haloBase.copy(halo.material.color);
    }
  }

  /** A frame: `t` is the view clock, `level` the quality level. Call after animateStage. */
  update(dt: number, t: number, world: World, level: number): void {
    const share = LEVELS[level].ambience;
    const u = this.uniforms;
    u.uTime.value = t;
    // The win lifts the motes: they rise faster and brighten; back to calm as the next run starts.
    const win = world.over && world.won ? 1 : 0;
    u.uWin.value += (win - u.uWin.value) * (1 - Math.exp(-dt * (win ? 1.5 : 4)));
    // Accumulated here, not uTime times a speed in the shader, so a change of speed doesn't jump them.
    u.uRise.value = (u.uRise.value + dt * (0.04 + u.uWin.value * 0.9)) % 3.2;
    this.motes.visible = this.mist.visible = this.steam.visible = share > 0;
    this.motes.geometry.instanceCount = this.fixed + Math.round(AIR * share);
    this.mist.geometry.instanceCount = Math.round(MIST * share);
    this.steam.geometry.instanceCount = this.vents * Math.round(PUFFS * share);
    // The boss coming in sounds the alarm: the reactor flashes red three times and the light dips.
    const boss = world.enemies.some((e) => e.kind === 'boss');
    if (boss && !this.hadBoss && !world.over) this.alarmT = ALARM;
    this.hadBoss = boss;
    if (this.alarmT > -1) this.alarm(dt);
  }

  /** Run the alarm down; one last call at the end puts the colours and lights back. */
  private alarm(dt: number): void {
    this.alarmT -= dt;
    const on = this.alarmT > 0;
    if (!on) this.alarmT = -1;
    const s = on ? Math.sin(((ALARM - this.alarmT) / ALARM) * 3 * Math.PI) ** 2 : 0;
    for (const r of this.reactor) r.mat.emissive.copy(r.base).lerp(RED, s * 0.85);
    if (this.halo) this.halo.color.copy(this.haloBase).lerp(RED, s * 0.85);
    for (const { light, base } of this.lights) light.intensity = base * (1 - ALARM_DIM * s);
  }
}
