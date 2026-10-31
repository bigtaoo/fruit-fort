// The sci-fi set's bugs (theme.ts, `?theme=scifi`), built to the concept in docs/art/scifi_r2/e_bugs:
// chunky, rounded, dark purple chitin, big glowing yellow-orange eyes and a glowing weak spot on the
// back. Each kind has its own silhouette so they read apart at phone size.
//
// Same conventions as the picnic bugs (models.ts): about one unit long, feet at y = 0, head to +z,
// and the userData animateEnemy drives: `legs` (swung about x), `wings` (flapped about z, each with
// its `side`) and `blobs` (squashed). The chitin is vertex-coloured on CHITIN, which bugSkin swaps
// for the rim-lit bug plastic with an x-ray ghost; the glowing bits are EMBER and CORE.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnemyKind } from '../sim/types';

export const CHITIN = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
/**
 * The glow of eyes and weak spots, and a paler core in each. They mark the stencil like the chitin,
 * so the x-ray ghost of a bug's back never paints over its own eyes.
 */
const lit = (color: number, emissive: number, k: number) =>
  Object.assign(new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: k, roughness: 0.3 }), {
    stencilWrite: true,
    stencilRef: 1,
    stencilZPass: THREE.ReplaceStencilOp,
  });
export const EMBER = lit(0xffa418, 0xff8a00, 1.0);
export const CORE = lit(0xfff0b0, 0xffd870, 1.0);
const WING = new THREE.MeshStandardMaterial({ color: 0xd8ccff, emissive: 0x5038a0, emissiveIntensity: 0.4, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2 });

/** Chitin: the body, raised plates, the dark legs and sockets, the purple accents and the blobs. */
const SHELL = 0x34204f;
const PLATE = 0x4b2c74;
const DEEP = 0x1d1130;
const ACCENT = 0x6c38a8;
const BLOB = 0x7038b8;

const sphere = new THREE.SphereGeometry(1, 20, 14);
/** Fine enough for painted stripes to come out crisp. */
const fine = new THREE.SphereGeometry(1, 48, 32);
const dome = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const rod = new THREE.CylinderGeometry(1, 1, 1, 8);
const spike = new THREE.ConeGeometry(1, 1, 10);
const ring = new THREE.TorusGeometry(1, 0.22, 8, 20);

type Paint = number | ((p: THREE.Vector3) => number);
const v = new THREE.Vector3();

/** A bug part's pieces, merged into one mesh each for the chitin, the glow and the cores. */
class Kit {
  private shell: THREE.BufferGeometry[] = [];
  private glow: THREE.BufferGeometry[] = [];
  private core: THREE.BufferGeometry[] = [];

  /** A piece of chitin (`paint` a colour or a colour per vertex, in place) or, without it, of glow. */
  add(geo: THREE.BufferGeometry, paint: Paint | 'glow' | 'core', x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0): this {
    const g = geo.clone().applyMatrix4(
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)),
    );
    if (paint === 'glow') this.glow.push(g);
    else if (paint === 'core') this.core.push(g);
    else this.shell.push(colour(g, paint));
    return this;
  }

  /** A rod from `a` to `b` with a ball at `b` for the joint. */
  limb(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): this {
    const d = v.subVectors(b, a);
    const g = rod.clone().applyMatrix4(
      new THREE.Matrix4().compose(
        a.clone().add(b).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()),
        new THREE.Vector3(r, d.length(), r),
      ),
    );
    this.shell.push(colour(g, color));
    return this.add(sphere, color, b.x, b.y, b.z, r * 1.25);
  }

  /** A big glowing eye with a pale core, in a dark socket, looking ahead and a little out to `s`. */
  eye(s: number, x: number, y: number, z: number, r: number): this {
    this.add(ring, DEEP, x, y, z - r * 0.25, r * 1.05, r * 1.05, r * 1.4, 0, s * 0.4, 0);
    this.add(sphere, 'glow', x, y, z, r);
    return this.add(sphere, 'core', x + s * r * 0.15, y + r * 0.3, z + r * 0.72, r * 0.32);
  }

  /** A glowing weak spot sunk in the shell with a dark rim, its top at (x, y, z), tilted by `rx`. */
  spot(x: number, y: number, z: number, r: number, rx = 0, rz = 0): this {
    this.add(ring, DEEP, x, y - r * 0.15, z, r * 1.05, r * 1.05, r * 1.6, Math.PI / 2 + rx, 0, rz);
    this.add(sphere, 'glow', x, y - r * 0.2, z, r, r * 0.45, r, rx, 0, rz);
    return this.add(sphere, 'core', x, y - r * 0.02, z, r * 0.45, r * 0.2, r * 0.45, rx, 0, rz);
  }

  build(into: THREE.Object3D): void {
    const put = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!geos.length) return;
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = mat === CHITIN;
      into.add(m);
    };
    put(this.shell, CHITIN);
    put(this.glow, EMBER);
    put(this.core, CORE);
  }
}

function colour(g: THREE.BufferGeometry, paint: Paint): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const c = new THREE.Color();
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    c.setHex(typeof paint === 'number' ? paint : paint(v.fromBufferAttribute(pos, i))).toArray(out, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}

const p = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * A leg on each side at each `z`: hip, knee up and out, foot on the ground further out. Each hangs
 * from a pivot at the hip, so swinging it about x walks the foot fore and aft.
 */
function legs(g: THREE.Group, zs: number[], hip: [number, number], knee: [number, number], foot: number, r: number, splay = 0.12): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    zs.forEach((z, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * hip[0], hip[1], z);
      // The front legs reach forward and the back ones back, round the middle.
      const lean = (i - (zs.length - 1) / 2) * -splay;
      new Kit()
        .limb(p(0, 0, 0), p(s * (knee[0] - hip[0]), knee[1] - hip[1], lean * 0.5), r, DEEP)
        .limb(p(s * (knee[0] - hip[0]), knee[1] - hip[1], lean * 0.5), p(s * (foot - hip[0]), r - hip[1], lean), r * 0.8, DEEP)
        .build(pivot);
      g.add(pivot);
      out.push(pivot);
    });
  }
  return out;
}

/** Two feelers from the top of the head, bending out, with a purple bead on the end. */
function feelers(k: Kit, x: number, y: number, z: number, len: number): void {
  for (const s of [-1, 1]) {
    const a = p(s * x, y, z);
    const b = p(s * (x + len * 0.25), y + len * 0.65, z + len * 0.1);
    const c = p(s * (x + len * 0.5), y + len * 0.9, z + len * 0.4);
    k.limb(a, b, 0.018, DEEP).limb(b, c, 0.016, DEEP).add(sphere, ACCENT, c.x, c.y, c.z, 0.04);
  }
}

/** Small swarmer: round abdomen with the weak spot, round head, big eyes, six thin legs, feelers. */
function swarmer(): THREE.Group {
  const g = new THREE.Group();
  const k = new Kit()
    .add(sphere, SHELL, 0, 0.42, -0.18, 0.27, 0.24, 0.3)
    .add(sphere, PLATE, 0, 0.55, -0.2, 0.2, 0.12, 0.22)
    .spot(0, 0.67, -0.2, 0.09)
    .add(sphere, DEEP, 0, 0.4, 0.05, 0.15)
    .add(sphere, SHELL, 0, 0.46, 0.24, 0.24, 0.22, 0.22)
    .eye(-1, -0.11, 0.5, 0.4, 0.085)
    .eye(1, 0.11, 0.5, 0.4, 0.085);
  for (const s of [-1, 1]) k.add(spike, DEEP, s * 0.06, 0.33, 0.45, 0.03, 0.1, 0.03, Math.PI / 2, 0, s * 0.5);
  feelers(k, 0.06, 0.64, 0.28, 0.3);
  k.build(g);
  g.userData.legs = legs(g, [-0.14, 0.02, 0.16], [0.12, 0.38], [0.28, 0.56], 0.38, 0.03);
  return g;
}

/** Carapace: a wide low armoured dome with a ridge and plates, a small head, front pincers, thick legs. */
function carapace(): THREE.Group {
  const g = new THREE.Group();
  const k = new Kit()
    .add(dome, SHELL, 0, 0.16, -0.08, 0.42, 0.34, 0.42)
    .add(ring, DEEP, 0, 0.16, -0.08, 0.43, 0.43, 0.25, Math.PI / 2)
    .add(new THREE.TorusGeometry(1, 0.05, 6, 20, Math.PI / 2), PLATE, 0, 0.16, -0.08, 0.43, 0.35, 1, 0, -Math.PI / 2)
    .spot(0, 0.47, -0.2, 0.1, -0.35)
    .add(sphere, SHELL, 0, 0.22, 0.34, 0.19, 0.15, 0.15)
    .eye(-1, -0.09, 0.25, 0.44, 0.07)
    .eye(1, 0.09, 0.25, 0.44, 0.07);
  for (const s of [-1, 1]) {
    k.add(sphere, PLATE, s * 0.22, 0.36, -0.12, 0.15, 0.08, 0.2, 0, 0, s * 0.6);
    // Pincers: an arm forward and a curved claw turned in.
    const a = p(s * 0.15, 0.18, 0.36);
    const b = p(s * 0.27, 0.14, 0.48);
    k.limb(a, b, 0.04, DEEP).add(spike, ACCENT, s * 0.2, 0.12, 0.56, 0.045, 0.16, 0.045, Math.PI / 2, 0, s * 0.7);
  }
  k.build(g);
  g.userData.legs = legs(g, [-0.24, -0.04, 0.16], [0.3, 0.2], [0.48, 0.3], 0.52, 0.042, 0.2);
  return g;
}

/** Flyer: a round body, a big head with big eyes, legs hanging, two see-through wings that buzz. */
function flyer(): THREE.Group {
  const g = new THREE.Group();
  const k = new Kit()
    .add(sphere, DEEP, 0, 0.42, -0.3, 0.16, 0.14, 0.2)
    .add(sphere, SHELL, 0, 0.46, -0.06, 0.22, 0.2, 0.22)
    .spot(0, 0.65, -0.1, 0.08, -0.25)
    .add(sphere, SHELL, 0, 0.5, 0.2, 0.2)
    .eye(-1, -0.1, 0.55, 0.33, 0.1)
    .eye(1, 0.1, 0.55, 0.33, 0.1);
  feelers(k, 0.05, 0.66, 0.24, 0.24);
  k.build(g);
  g.userData.legs = legs(g, [-0.1, 0.02, 0.12], [0.1, 0.34], [0.2, 0.28], 0.22, 0.02, 0.2).map((l) => {
    // They hang under it in flight instead of standing.
    l.position.y += 0.02;
    l.scale.y = 0.75;
    return l;
  });
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.12, 0.62, -0.04);
    const wing = new THREE.Mesh(sphere, WING);
    wing.position.set(s * 0.34, 0.04, -0.1);
    wing.scale.set(0.36, 0.015, 0.15);
    wing.rotation.y = s * 0.45;
    pivot.add(wing);
    pivot.userData.side = s;
    g.add(pivot);
    wings.push(pivot);
  }
  g.userData.wings = wings;
  return g;
}

/** Sieger: a hunched bug under a huge round striped shell with a glowing spiral eye on each side. */
function sieger(): THREE.Group {
  const g = new THREE.Group();
  const cz = -0.14;
  const k = new Kit()
    // Stripes round the shell from front to back.
    .add(fine, (q) => (Math.floor((q.z - cz + 1) * 9) % 2 ? ACCENT : PLATE), 0, 0.5, cz, 0.34, 0.4, 0.38)
    .spot(0, 0.9, cz - 0.02, 0.09)
    .add(sphere, DEEP, 0, 0.3, 0.12, 0.26, 0.2, 0.22)
    .add(sphere, SHELL, 0, 0.32, 0.3, 0.2, 0.19, 0.18)
    .eye(-1, -0.09, 0.37, 0.43, 0.08)
    .eye(1, 0.09, 0.37, 0.43, 0.08);
  for (const s of [-1, 1]) {
    // A spiral boss on the flank: two rings in from the rim and the glow in the middle.
    k.add(ring, SHELL, s * 0.3, 0.5, cz, 0.22, 0.22, 0.3, 0, Math.PI / 2)
      .add(ring, SHELL, s * 0.33, 0.5, cz, 0.12, 0.12, 0.25, 0, Math.PI / 2)
      .add(sphere, 'glow', s * 0.32, 0.5, cz, 0.04, 0.06, 0.06)
      .add(spike, DEEP, s * 0.06, 0.24, 0.44, 0.03, 0.1, 0.03, Math.PI / 2, 0, s * 0.5);
  }
  k.build(g);
  g.userData.legs = legs(g, [-0.2, 0.02, 0.22], [0.2, 0.2], [0.38, 0.3], 0.42, 0.04, 0.2);
  return g;
}

/** Acid blob: a lumpy purple blob with glowing nuggets in it, two big eyes; the lumps wobble. */
function acidBlob(): THREE.Group {
  const g = new THREE.Group();
  const blobs: THREE.Object3D[] = [];
  for (const [x, y, z, r] of [[0, 0.4, 0, 0.4], [0.3, 0.26, -0.12, 0.26], [-0.3, 0.25, -0.08, 0.25], [0.08, 0.66, -0.16, 0.24], [-0.16, 0.2, 0.28, 0.18], [0.22, 0.16, 0.24, 0.14]]) {
    const b = new THREE.Group();
    b.position.set(x, y, z);
    b.scale.setScalar(r);
    const k = new Kit().add(sphere, blobs.length % 2 ? BLOB : ACCENT, 0, 0, 0);
    // A glowing nugget showing through the top of each lump.
    if (r > 0.2) k.spot(0.2, 0.96, -0.1, 0.3, -0.2, -0.2);
    k.build(b);
    g.add(b);
    blobs.push(b);
  }
  new Kit().eye(-1, -0.13, 0.48, 0.36, 0.09).eye(1, 0.13, 0.48, 0.36, 0.09).build(g);
  g.userData.blobs = blobs;
  return g;
}

/** The little blob an acid blob splits into: one round lump, big eyes, a glow on top. */
function droplet(): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Group();
  b.position.y = 0.42;
  b.scale.setScalar(0.42);
  new Kit().add(sphere, ACCENT, 0, 0, 0).spot(0, 0.98, -0.15, 0.32, -0.15).build(b);
  g.add(b);
  new Kit().eye(-1, -0.15, 0.5, 0.33, 0.13).eye(1, 0.15, 0.5, 0.33, 0.13).build(g);
  g.userData.blobs = [b];
  return g;
}

/** Leaper: long body, pointed wings folded on the back, huge bent hind legs, four small front ones. */
function leaper(): THREE.Group {
  const g = new THREE.Group();
  const k = new Kit()
    .add(new THREE.CapsuleGeometry(1, 3, 6, 14), SHELL, 0, 0.34, -0.12, 0.13, 0.12, 0.13, Math.PI / 2)
    .add(sphere, PLATE, 0, 0.42, 0.12, 0.17, 0.15, 0.18)
    .spot(0, 0.57, 0.1, 0.08)
    .add(sphere, SHELL, 0, 0.44, 0.34, 0.17)
    .eye(-1, -0.09, 0.49, 0.45, 0.07)
    .eye(1, 0.09, 0.49, 0.45, 0.07);
  for (const s of [-1, 1]) k.add(spike, ACCENT, s * 0.07, 0.48, -0.24, 0.08, 0.52, 0.02, -Math.PI / 2 + 0.12, s * 0.12, s * 0.3);
  feelers(k, 0.05, 0.58, 0.38, 0.28);
  k.build(g);
  const front = legs(g, [0.08, 0.24], [0.1, 0.3], [0.22, 0.36], 0.26, 0.022);
  const hind: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    // Thigh up and back to a high knee, shin down and back to the foot.
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.13, 0.36, -0.06);
    new Kit()
      .limb(p(0, 0, 0), p(s * 0.1, 0.3, -0.26), 0.05, DEEP)
      .add(sphere, PLATE, s * 0.05, 0.16, -0.13, 0.06, 0.15, 0.06, 0.7, 0, 0)
      .limb(p(s * 0.1, 0.3, -0.26), p(s * 0.14, 0.02 - 0.36, -0.42), 0.025, DEEP)
      .build(pivot);
    g.add(pivot);
    hind.push(pivot);
  }
  g.userData.legs = [...front, ...hind];
  return g;
}

/** Brood queen: a big thorax, a crown of horns, pincers, and a huge egg sac studded with glowing eggs. */
function broodQueen(): THREE.Group {
  const g = new THREE.Group();
  const k = new Kit()
    .add(fine, (q) => (Math.floor((q.z + 1) * 10) % 2 ? PLATE : SHELL), 0, 0.44, -0.3, 0.34, 0.32, 0.36)
    .add(sphere, SHELL, 0, 0.42, 0.08, 0.24, 0.22, 0.22)
    .add(sphere, PLATE, 0, 0.56, 0.06, 0.18, 0.1, 0.18)
    .spot(0, 0.66, 0.06, 0.08)
    .add(sphere, SHELL, 0, 0.5, 0.3, 0.19, 0.18, 0.17)
    .eye(-1, -0.09, 0.54, 0.42, 0.075)
    .eye(1, 0.09, 0.54, 0.42, 0.075)
    .eye(-1, -0.16, 0.44, 0.38, 0.035)
    .eye(1, 0.16, 0.44, 0.38, 0.035);
  // Eggs over the top and back of the sac.
  for (const [a, b] of [[0, 0.5], [0.6, 0.6], [-0.6, 0.6], [0.3, 1.0], [-0.3, 1.0], [0.9, 1.1], [-0.9, 1.1], [0, 1.3]]) {
    const x = Math.sin(a) * Math.sin(b);
    const y = Math.cos(b);
    const z = -Math.cos(a) * Math.sin(b);
    k.add(sphere, 'glow', x * 0.32, 0.44 + y * 0.31, -0.3 + z * 0.35, 0.055);
  }
  // A crown of five horns curving up off the head, with lit tips.
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.45;
    const x = Math.sin(a) * 0.13;
    const z = 0.28 - Math.cos(a) * 0.04;
    const h = i === 2 ? 0.24 : 0.18;
    k.add(spike, ACCENT, x, 0.66 + h / 2, z, 0.035, h, 0.035, -0.25, 0, -a * 0.6);
    k.add(sphere, 'glow', x - Math.sin(a * 0.6) * h * 0.5, 0.66 + h * 0.95, z - h * 0.12, 0.02);
  }
  for (const s of [-1, 1]) {
    const a = p(s * 0.14, 0.36, 0.36);
    const b = p(s * 0.27, 0.3, 0.48);
    k.limb(a, b, 0.045, DEEP).add(spike, ACCENT, s * 0.2, 0.28, 0.58, 0.05, 0.18, 0.05, Math.PI / 2, 0, s * 0.7);
  }
  k.build(g);
  g.userData.legs = legs(g, [-0.18, 0.0, 0.16], [0.18, 0.32], [0.44, 0.5], 0.56, 0.05, 0.2);
  return g;
}

const SWARM_MODELS: Record<EnemyKind, () => THREE.Group> = {
  caterpillar: swarmer,
  beetle: carapace,
  crow: flyer,
  snail: sieger,
  mold: acidBlob,
  spore: droplet,
  locust: leaper,
  boss: broodQueen,
};

/** A sci-fi bug of this kind, one unit long; models.ts dresses it with bugSkin. */
export function makeSwarmBug(kind: EnemyKind): THREE.Group {
  return SWARM_MODELS[kind]();
}
