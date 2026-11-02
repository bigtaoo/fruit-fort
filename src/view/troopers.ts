// The three heroes as Tripo meshes (docs/art/tripo_heroes): one untextured shell each, rounded off in
// Blender (scripts/art/hero_cleanup.py, ~2,500 triangles), painted here by region and skinned onto
// shoulder pivots, so `animateHero` still swings the arms.
// The GLBs are inlined (about 80 KB each as base64), so a hero is built synchronously like the rest of
// the scene; a missing file falls back to the trooper built in code (scifi.ts makeTrooper).

import * as THREE from 'three';
import type { HeroKind } from '../sim/types';
import { makeTrooper, WHITE } from './scifi';

const FILES = import.meta.glob('../assets/heroes/*.glb', { query: '?inline', import: 'default', eager: true }) as Record<string, string>;

/** Which mesh each hero slot wears. */
const FILE: Record<HeroKind, string> = { farmer: 'marine', beekeeper: 'engineer', chef: 'heavy' };

/** How tall the finished hero stands, as the code trooper did. */
const HEIGHT = 1.15;

/** How much of animateHero's arm swing the skinned arms follow. */
const REACH = 0.55;

type Slot = 'armour' | 'shell' | 'dark' | 'metal' | 'visor' | 'trim';
/** First rule that matches a triangle (its centre `c` and face normal `n`, model units, 1 tall) wins; the rest is armour. */
type Rule = [Slot, (c: THREE.Vector3, n: THREE.Vector3) => boolean];

interface Look {
  colours: Record<Slot, number>;
  rules: Rule[];
  /** The shoulder joints at (±x, y): the arm is what lies further out than about `x`, below `y` and above `low` (the boots reach as far out). */
  arm: { x: number; y: number; low: number };
}

const LOOKS: Record<HeroKind, Look> = {
  farmer: {
    colours: { armour: WHITE, shell: WHITE, dark: 0x262c36, metal: 0x4a5462, visor: 0x7a4cff, trim: 0xff8a30 },
    rules: [
      ['visor', (c, n) => c.y > 0.62 && c.y < 0.9 && n.z > 0.45 && c.z > 0.12 && Math.abs(c.x) < 0.2],
      ['dark', (c) => c.y < 0.2],
      ['metal', (c) => c.z < -0.16 && c.y < 0.62],
    ],
    arm: { x: 0.22, y: 0.55, low: 0.24 },
  },
  beekeeper: {
    colours: { armour: WHITE, shell: WHITE, dark: 0x262c36, metal: 0x4a5462, visor: 0x30d8ff, trim: 0xff8a30 },
    rules: [
      ['visor', (c, n) => c.y > 0.5 && c.y < 0.86 && n.z > 0.45 && c.z > 0.08 && Math.abs(c.x) < 0.18],
      ['trim', (c) => c.y > 0.5 && c.y < 0.82 && Math.abs(c.x) > 0.19],
      ['visor', (c) => c.y > 0.9],
      ['trim', (c) => c.y < 0.1 || (c.y < 0.32 && Math.abs(c.x) > 0.26)],
      ['dark', (c) => (c.y < 0.3 && Math.abs(c.x) < 0.2) || (c.y > 0.42 && c.y < 0.5)],
    ],
    arm: { x: 0.22, y: 0.42, low: 0.13 },
  },
  chef: {
    colours: { armour: 0xff8a30, shell: 0xff8a30, dark: 0x262c36, metal: 0x4a5462, visor: 0xffc040, trim: 0xffc040 },
    rules: [
      ['visor', (c, n) => c.y > 0.55 && c.y < 0.85 && n.z > 0.5 && c.z > 0.1 && Math.abs(c.x) < 0.18],
      ['dark', (c) => c.y < 0.15],
    ],
    arm: { x: 0.28, y: 0.55, low: 0.15 },
  },
};

interface Shell {
  pos: Float32Array;
  nrm: Float32Array;
  idx: Uint32Array;
}

const shells = new Map<string, Shell | null>();

/** The positions, normals and indices of the one mesh in a Tripo GLB given as a data URL; null if there is none. */
function shell(name: string): Shell | null {
  if (shells.has(name)) return shells.get(name)!;
  const url = Object.entries(FILES).find(([path]) => path.endsWith(`/${name}.glb`))?.[1];
  let out: Shell | null = null;
  if (url) {
    const bytes = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (ch) => ch.charCodeAt(0));
    const buf = bytes.buffer;
    const view = new DataView(buf);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLength)));
    const bin = 20 + jsonLength + 8;
    const read = (i: number): Float32Array | Uint32Array => {
      const a = json.accessors[i];
      const at = bin + (json.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0);
      if (a.componentType === 5126) return new Float32Array(buf.slice(at, at + a.count * (a.type === 'VEC3' ? 12 : 4)));
      if (a.componentType === 5125) return new Uint32Array(buf.slice(at, at + a.count * 4));
      return Uint32Array.from(new Uint16Array(buf.slice(at, at + a.count * 2)));
    };
    const p = json.meshes[0].primitives[0];
    out = { pos: read(p.attributes.POSITION) as Float32Array, nrm: read(p.attributes.NORMAL) as Float32Array, idx: read(p.indices) as Uint32Array };
  }
  shells.set(name, out);
  return out;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

function materials(kind: HeroKind, colours: Record<Slot, number>): Record<Slot, THREE.Material> {
  const metallic = kind === 'chef' ? 0.35 : 0.1;
  return {
    armour: new THREE.MeshPhysicalMaterial({ color: colours.armour, roughness: 0.4, metalness: metallic, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    shell: new THREE.MeshPhysicalMaterial({ color: colours.shell, roughness: 0.4, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
    dark: new THREE.MeshStandardMaterial({ color: colours.dark, roughness: 0.5, metalness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: colours.metal, roughness: 0.4, metalness: 0.6 }),
    visor: new THREE.MeshPhysicalMaterial({ color: colours.visor, emissive: colours.visor, emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.3, clearcoat: 1 }),
    trim: new THREE.MeshStandardMaterial({ color: colours.trim, emissive: colours.trim, emissiveIntensity: 0.25, roughness: 0.35 }),
  };
}

/**
 * A hero about 1.15 tall, facing +z, with the same contract as `makeTrooper`: the arms are pivots at
 * the shoulders in `userData.arms`, each with `userData.side`. Tripo fuses the arms to the body, so
 * rather than cut them off (which tears) the shell is skinned: the pivots are bones and each vertex
 * follows its shoulder by a weight that fades in across the arm's inner edge and out over the
 * shoulder. `animateHero` sets a pivot's rotation outright (0.25 out at rest), so the skeleton is
 * bound in that pose and idle is the mesh's own. The mesh is named in `userData.skin` so `flatten`
 * leaves it whole.
 */
export function makeHero(kind: HeroKind): THREE.Group {
  const s = shell(FILE[kind]);
  if (!s) return makeTrooper(kind);
  const look = LOOKS[kind];
  const mats = materials(kind, look.colours);
  const slots = Object.keys(mats) as Slot[];
  // Sort the triangles by slot so each material draws one run of the index.
  const bySlot = slots.map(() => [] as number[]);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const e = new THREE.Vector3();
  for (let t = 0; t < s.idx.length / 3; t++) {
    a.fromArray(s.pos, s.idx[t * 3] * 3);
    b.fromArray(s.pos, s.idx[t * 3 + 1] * 3);
    c.fromArray(s.pos, s.idx[t * 3 + 2] * 3);
    n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
    c.add(a).add(b).divideScalar(3);
    const slot = look.rules.find(([, test]) => test(c, n))?.[0] ?? (c.y > 0.55 ? 'shell' : 'armour');
    bySlot[slots.indexOf(slot)].push(t);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(s.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(s.nrm, 3));
  const index: number[] = [];
  bySlot.forEach((tris, i) => {
    geo.addGroup(index.length, tris.length * 3, i);
    for (const t of tris) index.push(s.idx[t * 3], s.idx[t * 3 + 1], s.idx[t * 3 + 2]);
  });
  geo.setIndex(index);
  // Bone 0 is the body; 1 and 2 the left and right shoulders.
  const { x: ax, y: ay, low } = look.arm;
  const count = s.pos.length / 3;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    const x = s.pos[v * 3];
    const y = s.pos[v * 3 + 1];
    const w = smoothstep(ax - 0.03, ax + 0.02, Math.abs(x)) * (1 - smoothstep(ay - 0.06, ay + 0.08, y)) * smoothstep(low - 0.04, low + 0.03, y);
    skinIndex[v * 4 + 1] = x < 0 ? 1 : 2;
    skinWeight[v * 4] = 1 - w;
    skinWeight[v * 4 + 1] = w;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  const root = new THREE.Bone();
  const arms: THREE.Bone[] = [];
  for (const side of [-1, 1]) {
    const bone = new THREE.Bone();
    bone.position.set(side * ax, ay, 0);
    bone.rotation.z = side * 0.25;
    bone.userData.side = side;
    root.add(bone);
    arms.push(bone);
  }
  const skin = new THREE.SkinnedMesh(geo, slots.map((k) => mats[k]));
  skin.castShadow = skin.receiveShadow = true;
  skin.add(root);
  skin.bind(new THREE.Skeleton([root, ...arms]));
  // The bound bones sit inside the mesh's own frame, so the scale goes on a group above it.
  const body = new THREE.Group();
  body.scale.setScalar(HEIGHT);
  body.add(skin);
  const g = new THREE.Group();
  g.add(body);
  // A fused arm swung right up (animateHero raises it 2.6 to cast) drags the torso into slivers, so the
  // pivots handed out only carry the swing over to the bones at REACH of its size.
  g.userData.arms = arms.map((bone) => {
    const rest = bone.rotation.z;
    return { userData: bone.userData, rotation: { get z() { return bone.rotation.z; }, set z(v: number) { bone.rotation.z = rest + (v - rest) * REACH; } } };
  });
  g.userData.skin = skin;
  return g;
}
