// The three heroes, built in code as chibi robots (owner, 2026-11-05: the Tripo meshes looked lumpy,
// their per-triangle paint jagged and the flat cyan visor faceless). Each wears a dark glass face with
// glowing eyes and has its own head, so they tell apart in the portrait: the marine a round helmet
// with two slanted eyes, the engineer a TV head with one round eye and an antenna, the heavy a broad
// square helmet with a brow and two angry eyes. Colour roles as before (design.md 我方配色): dark
// gunmetal body that reads on the white tank, the helmet and pads the one warm spot, cyan or amber
// only in the lights.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { HeroKind } from '../sim/types';
import { TURN, glow, mesh, part } from './scifi';

interface Look {
  /** The helmet and shoulder pads. */
  shell: number;
  /** The eyes. */
  eye: number;
  /** The blaster's muzzle. */
  trim: number;
  head: 'dome' | 'tv' | 'brute';
}

const LOOKS: Record<HeroKind, Look> = {
  farmer: { shell: 0xff8a30, eye: 0x6ff0ff, trim: 0xff8a30, head: 'dome' },
  beekeeper: { shell: 0xf2b134, eye: 0x6ff0ff, trim: 0xff8a30, head: 'tv' },
  chef: { shell: 0xe8622e, eye: 0xffc040, trim: 0xffc040, head: 'brute' },
};

interface Mats { armour: THREE.Material; dark: THREE.Material; shell: THREE.Material; glass: THREE.Material; eye: THREE.Material; trim: THREE.Material; light: THREE.Material; tip: THREE.Material }

/** One set per hero, shared by the rider and its portrait. */
const sets = new Map<HeroKind, Mats>();

function mats(kind: HeroKind): Mats {
  let m = sets.get(kind);
  if (!m) {
    const look = LOOKS[kind];
    m = {
      armour: new THREE.MeshPhysicalMaterial({ color: 0x3a4352, roughness: 0.42, metalness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1d222b, roughness: 0.55, metalness: 0.4 }),
      shell: new THREE.MeshPhysicalMaterial({ color: look.shell, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12 }),
      // Near-black glass, so the eyes are the only light in the face.
      glass: new THREE.MeshPhysicalMaterial({ color: 0x0c1424, roughness: 0.08, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
      eye: new THREE.MeshBasicMaterial({ color: look.eye, toneMapped: false }),
      trim: glow(look.trim, 0.7),
      light: glow(0x6ff0ff, 1.2),
      tip: glow(0xff8a30, 1.2),
    };
    sets.set(kind, m);
  }
  return m;
}

function box(w: number, h: number, d: number, r: number, mat: THREE.Material, segments = 2): THREE.Mesh {
  return mesh(new RoundedBoxGeometry(w, h, d, segments, r), mat);
}

/** A flat bar with round ends, `w` long and `h` high, for an eye. */
function bar(w: number, h: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  const r = h / 2;
  s.moveTo(-w / 2 + r, -r);
  s.lineTo(w / 2 - r, -r);
  s.absarc(w / 2 - r, 0, r, -TURN, TURN);
  s.lineTo(-w / 2 + r, r);
  s.absarc(-w / 2 + r, 0, r, TURN, 3 * TURN);
  return new THREE.ShapeGeometry(s, 6);
}

/** The head of each hero, its centre at the origin, facing +z. */
function head(kind: HeroKind, m: Mats): THREE.Group {
  const h = new THREE.Group();
  const look = LOOKS[kind];
  if (look.head === 'dome') {
    // Round helmet, a wide glass face, two eyes slanted up at the outside, ear pods with a lit ring.
    h.add(part(mesh(new THREE.SphereGeometry(0.3, 32, 22), m.shell), 0, 0, 0));
    h.add(part(box(0.44, 0.26, 0.2, 0.1, m.glass, 4), 0, -0.03, 0.2));
    for (const s of [-1, 1]) {
      const e = part(mesh(bar(0.13, 0.06), m.eye), s * 0.085, -0.02, 0.302);
      e.rotation.z = -s * 0.28;
      h.add(e);
      h.add(part(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 20).rotateZ(TURN), m.armour), s * 0.29, -0.02, 0));
      h.add(part(mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 20).rotateY(TURN), m.light), s * 0.33, -0.02, 0));
    }
    h.add(part(box(0.08, 0.1, 0.34, 0.03, m.armour), 0, 0.27, -0.02));
  } else if (look.head === 'tv') {
    // A rounded square set, a dark screen with one round eye in a ring, an antenna.
    h.add(part(box(0.56, 0.46, 0.46, 0.14, m.shell, 4), 0, 0, 0));
    h.add(part(box(0.44, 0.32, 0.06, 0.08, m.glass, 3), 0, -0.01, 0.215));
    h.add(part(mesh(new THREE.CircleGeometry(0.075, 28), m.eye), 0, 0, 0.248));
    h.add(part(mesh(new THREE.RingGeometry(0.1, 0.115, 28), m.eye), 0, 0, 0.248));
    for (const s of [-1, 1]) h.add(part(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 20).rotateZ(TURN), m.armour), s * 0.3, 0, 0));
    h.add(part(mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.26, 6), m.dark), 0.16, 0.34, -0.05));
    h.add(part(mesh(new THREE.SphereGeometry(0.035, 10, 8), m.tip), 0.16, 0.48, -0.05));
  } else {
    // A broad square helmet with a brow over a visor slit, two eyes slanted down at the middle, a jaw plate.
    h.add(part(box(0.5, 0.4, 0.44, 0.13, m.shell, 4), 0, 0, 0));
    h.add(part(box(0.52, 0.08, 0.12, 0.03, m.shell), 0, 0.06, 0.19));
    h.add(part(box(0.4, 0.13, 0.06, 0.04, m.glass), 0, -0.03, 0.21));
    for (const s of [-1, 1]) {
      const e = part(mesh(bar(0.11, 0.05), m.eye), s * 0.08, -0.03, 0.243);
      e.rotation.z = s * 0.3;
      h.add(e);
    }
    h.add(part(box(0.22, 0.1, 0.06, 0.03, m.armour), 0, -0.16, 0.2));
    h.add(part(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 14).rotateX(TURN), m.light), 0, 0.17, 0.2));
  }
  return h;
}

/**
 * A hero about 1.15 tall, facing +z: a big head over a small gunmetal body, a blaster in the right
 * hand. The arms are pivots at the shoulders in `userData.arms`, each with `userData.side`, which
 * `animateHero` swings.
 */
export function makeHero(kind: HeroKind): THREE.Group {
  const m = mats(kind);
  const heavy = kind === 'chef';
  const g = new THREE.Group();
  // Legs and boots (mostly down the hatch), hips.
  for (const s of [-1, 1]) {
    g.add(part(box(0.15, 0.3, 0.17, 0.06, m.dark), s * 0.1, 0.16, 0));
    g.add(part(box(0.18, 0.1, 0.22, 0.05, m.armour), s * 0.1, 0.05, 0.02));
  }
  g.add(part(box(0.36, 0.1, 0.24, 0.05, m.dark), 0, 0.35, 0));
  // Torso with a warm chest plate and a light, a backpack.
  const tw = heavy ? 0.5 : 0.4;
  g.add(part(box(tw, 0.3, 0.28, 0.11, m.armour, 3), 0, 0.53, 0));
  g.add(part(box(tw * 0.62, 0.14, 0.05, 0.04, m.shell), 0, 0.58, 0.13));
  g.add(part(mesh(new THREE.SphereGeometry(0.03, 10, 8), m.light), 0, 0.58, 0.165));
  g.add(part(box(0.28, 0.28, 0.12, 0.05, m.armour), 0, 0.56, -0.19));
  g.add(part(mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.06, 16), m.dark), 0, 0.7, 0));
  g.add(part(head(kind, m), 0, heavy ? 0.84 : 0.9, 0));
  // Arms: shoulder pad, sleeve and glove on a pivot at the shoulder; the blaster in the right hand.
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = part(new THREE.Group(), s * (heavy ? 0.31 : 0.25), 0.64, 0);
    pivot.rotation.z = s * 0.25;
    pivot.userData.side = s;
    const pad = heavy ? 0.24 : 0.17;
    pivot.add(part(box(pad, 0.13, pad, 0.06, m.shell, 3), s * 0.03, 0.03, 0));
    pivot.add(part(box(0.11, 0.22, 0.11, 0.05, m.dark), s * 0.02, -0.13, 0));
    pivot.add(part(box(0.14, 0.12, 0.14, 0.05, m.armour), s * 0.02, -0.28, 0));
    if (s > 0) {
      const gun = new THREE.Group();
      gun.add(part(box(0.08, 0.1, 0.3, 0.03, m.armour), 0, 0, 0.08));
      gun.add(part(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 10).rotateX(TURN), m.trim), 0, 0.01, 0.27));
      gun.position.set(s * 0.02, -0.32, 0.04);
      pivot.add(gun);
    }
    g.add(pivot);
    arms.push(pivot);
  }
  g.userData.arms = arms;
  return g;
}
