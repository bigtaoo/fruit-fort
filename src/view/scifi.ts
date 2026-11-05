// The sci-fi set, built to the concept in docs/art/scifi_r2: the palette of the ice basin (whose
// ground, rocks and crystals are in terrain.ts), a reactor tower in the middle, a wide mag-rail bed
// round it, and the troopers who ride the hover rail-tank (tank.ts). Not the picnic pieces reskinned:
// only the contracts scene.ts drives (the locomotive's and the hero's) are shared.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RAIL } from './models';

/**
 * The ground's colours: a deep, muted slate-blue ice by default (owner, 2026-10-31: the orange sand
 * was too dark and heavy; 2026-11-02: the pale blue ice made everything blue, so the ground went
 * darker and greyer and leaves the saturated cyan to the fort, the tank and the HUD); `?ground=sand` brings back the orange-red desert to compare. `fog` is the ground
 * far off, which the fog and sky take; `plates` are the ice plates' tints, `seam` the cracks between
 * them and `rim` the lit edge along each crack; `rocks` are the outcrops' tints (dark basalt: a
 * graphite blue, a graphite teal and a gunmetal, so the outcrops differ but stay well clear of the
 * violet crystals) and `sheen` the cold rim and worn tops on them; `shade` darkens round the wall
 * and the tower's foot; `bounce` is the light the ground throws back up.
 */
const LANDS = {
  frost: { fog: 0x4c5868, plates: ['#9ea8b6', '#97a2b1', '#a6afbc', '#919cac'], seam: 'rgba(14,26,48,0.65)', rim: 'rgba(180,200,224,0.45)', rocks: [0x485264, 0x42545c, 0x505466], sheen: 0x9cc4ec, shade: 0x16305c, bounce: 0x6a94c8 },
  sand: { fog: 0xd9824a, plates: ['#d8884f', '#d4824c', '#dc9058', '#cc7a44'], seam: 'rgba(120,45,20,0.5)', rim: 'rgba(255,205,150,0.5)', rocks: [0xb4582c, 0x9a4624, 0xc86a38], sheen: 0xf2d2a8, shade: 0x5a2410, bounce: 0xb0603a },
};
export const LAND = LANDS[typeof location !== 'undefined' && new URLSearchParams(location.search).get('ground') === 'sand' ? 'sand' : 'frost'];
/** Our side's glow: shields, rail lights, the tank's trim and the reactor. */
export const CYAN = 0x40e0ff;
export const TURN = Math.PI / 2;

/** An off-white, not 0xf2f6fa: under the key light, the clearcoat and the grade a near-white clips flat. */
export const WHITE = 0xd2dbe6;
export const white = new THREE.MeshPhysicalMaterial({ color: WHITE, roughness: 0.45, metalness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.3 });
export const gunmetal = new THREE.MeshStandardMaterial({ color: 0x4a5462, roughness: 0.4, metalness: 0.6 });
export const dark = new THREE.MeshStandardMaterial({ color: 0x262c36, roughness: 0.5, metalness: 0.5 });

export function glow(color: number, k: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.3 });
}

export function part<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true;
  });
  return o;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(geo, mat);
}

function block(w: number, h: number, d: number, r: number, mat: THREE.Material): THREE.Mesh {
  return mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
}

/** A ring swept round the y axis from a cross-section given as (distance out, height) points. */
function lathe(points: [number, number][], mat: THREE.Material, segments = 160): THREE.Mesh {
  return mesh(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments), mat);
}

/**
 * The reactor everyone is after, in place of the cake: a tower about 2.6 high on a two-tier
 * octagonal gunmetal base (dark, as in the concept, so the tower is not one more white block on the
 * pale ice). A white shell holds a glowing cyan energy column in a glass sleeve, two thin cyan
 * rings float round it (`animateReactor` turns and bobs them) and a glowing beacon sits on the cap.
 */
export function makeReactor(): THREE.Group {
  const g = new THREE.Group();
  g.userData.flames = [];
  const edge = glow(CYAN, 0.55);
  // Base: dark octagon with a cyan edge, a gunmetal tier on it with its own cyan edge, four gunmetal
  // buttresses at the tower's foot.
  g.add(part(mesh(new THREE.CylinderGeometry(1.22, 1.34, 0.2, 8).rotateY(Math.PI / 8), dark), 0, 0.1, 0));
  g.add(part(mesh(new THREE.TorusGeometry(1.25, 0.035, 6, 8).rotateX(TURN).rotateY(Math.PI / 8), edge), 0, 0.2, 0));
  g.add(part(mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.16, 8).rotateY(Math.PI / 8), gunmetal), 0, 0.28, 0));
  g.add(part(mesh(new THREE.TorusGeometry(0.92, 0.025, 6, 8).rotateX(TURN).rotateY(Math.PI / 8), edge), 0, 0.36, 0));
  for (let i = 0; i < 4; i++) {
    const fin = part(block(0.16, 0.7, 0.5, 0.05, gunmetal), 0, 0.62, 0.5);
    fin.rotation.x = -0.35;
    const arm = new THREE.Group().add(fin);
    arm.rotation.y = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(arm);
    arm.add(part(mesh(new THREE.BoxGeometry(0.04, 0.4, 0.02), edge), 0, 0.62, 0.76));
  }
  // Lower shell, then the glass sleeve with the energy column in it, framed by four gunmetal struts.
  g.add(part(mesh(new THREE.CylinderGeometry(0.42, 0.58, 0.72, 8).rotateY(Math.PI / 8), white), 0, 0.72, 0));
  g.add(part(mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 8).rotateY(Math.PI / 8), gunmetal), 0, 1.1, 0));
  const core = mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.0, 20), glow(0x8ff4ff, 1.5));
  core.position.y = 1.62;
  g.add(core);
  const sleeve = mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x80e8ff, emissive: 0x2ab8f0, emissiveIntensity: 0.2, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, roughness: 0.1 }));
  sleeve.position.y = 1.62;
  g.add(sleeve);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(part(block(0.09, 1.02, 0.09, 0.03, gunmetal), Math.cos(a) * 0.33, 1.62, Math.sin(a) * 0.33));
  }
  // Collar, cap and the beacon: a white-hot orb in a soft cyan halo, so the tower has a bright point to
  // read from across the field. The halo is a sprite, not a light: no extra lighting cost on a phone.
  g.add(part(mesh(new THREE.CylinderGeometry(0.36, 0.44, 0.22, 8).rotateY(Math.PI / 8), white), 0, 2.2, 0));
  g.add(part(mesh(new THREE.TorusGeometry(0.4, 0.025, 6, 8).rotateX(TURN).rotateY(Math.PI / 8), edge), 0, 2.12, 0));
  g.add(part(mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.2, 8).rotateY(Math.PI / 8), gunmetal), 0, 2.41, 0));
  const beacon = mesh(new THREE.SphereGeometry(0.13, 16, 10), glow(0xc8faff, 1.4));
  beacon.position.y = 2.64;
  g.add(beacon);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: 0x7ff0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.y = 2.64;
  halo.scale.setScalar(1.5);
  g.add(halo);
  g.userData.halo = halo;
  const rings: THREE.Object3D[] = [];
  for (const [y, rad] of [[1.4, 0.62], [1.86, 0.52]]) {
    const holder = new THREE.Group();
    holder.position.y = y;
    holder.userData.y = y;
    holder.add(mesh(new THREE.TorusGeometry(rad, 0.03, 8, 64).rotateX(TURN), edge));
    // Three small nodes on each ring, so its turning shows.
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      holder.add(part(block(0.1, 0.07, 0.1, 0.02, white), Math.cos(a) * rad, 0, Math.sin(a) * rad));
    }
    g.add(holder);
    rings.push(holder);
  }
  g.userData.rings = rings;
  g.userData.core = core;
  return g;
}

let halo: THREE.CanvasTexture | undefined;
/** A soft round glow, white in the middle, for the beacon's halo. */
function haloTexture(): THREE.CanvasTexture {
  if (halo) return halo;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  halo = new THREE.CanvasTexture(c);
  halo.colorSpace = THREE.SRGBColorSpace;
  return halo;
}

/** Turn and bob the reactor's rings, pulse its column and breathe the beacon's halo with it. */
export function animateReactor(g: THREE.Object3D, t: number): void {
  const rings = g.userData.rings as THREE.Object3D[] | undefined;
  if (!rings) return;
  rings.forEach((r, i) => {
    r.rotation.y = t * (i ? -0.9 : 0.7);
    r.position.y = (r.userData.y as number) + Math.sin(t * 1.6 + i * 2) * 0.05;
  });
  const core = g.userData.core as THREE.Mesh;
  (core.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + 0.25 * Math.sin(t * 4);
  const glowAt = g.userData.halo as THREE.Sprite | undefined;
  if (glowAt) {
    glowAt.scale.setScalar(1.5 + 0.2 * Math.sin(t * 4));
    glowAt.material.opacity = 0.75 + 0.2 * Math.sin(t * 4);
  }
}

/**
 * The mag rail: a wide dark bed, about twice the tank's track, with a raised white curb along both
 * edges, cyan light blocks set in the bed by each curb and two thin cyan guide lines `RAIL` either
 * side of the tank's ring. The most visible circle on the screen. Guide lines at `top`.
 */
export function makeMagRail(radius: number, top: number): THREE.Group {
  const g = new THREE.Group();
  const half = 0.66;
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x343c4a, roughness: 0.6, metalness: 0.4 });
  const bed = lathe([[radius + half, 0.04], [radius - half, 0.04]], bedMat);
  bed.receiveShadow = true;
  g.add(bed);
  // A recessed darker channel down the middle, where the field runs.
  const channel = lathe([[radius + 0.16, 0.045], [radius - 0.16, 0.045]], new THREE.MeshStandardMaterial({ color: 0x1e242e, roughness: 0.5, metalness: 0.5 }));
  channel.receiveShadow = true;
  g.add(channel);
  // Curbs: a rounded white lip either side, its outer face down to the ground.
  for (const s of [-1, 1]) {
    const e = radius + s * half;
    const w = 0.14;
    const curb = lathe(
      s > 0
        ? [[e + w, 0], [e + w, 0.1], [e + w - 0.02, 0.14], [e + 0.02, 0.14], [e, 0.1], [e, 0.04]]
        : [[e, 0.04], [e, 0.1], [e - 0.02, 0.14], [e - w + 0.02, 0.14], [e - w, 0.1], [e - w, 0]],
      white,
    );
    curb.castShadow = curb.receiveShadow = true;
    g.add(curb);
  }
  const line = glow(CYAN, 0.35);
  for (const r of [radius - RAIL, radius + RAIL]) {
    const guide = mesh(new THREE.TorusGeometry(r, 0.02, 6, 160).rotateX(TURN), line);
    guide.position.y = Math.min(top, 0.06);
    g.add(guide);
  }
  // Light blocks in pairs by each curb, every few degrees. Plain boxes: rounding 1 cm corners cost 300
  // triangles a block (26k a frame for 88), and nobody sees it from the camera.
  const n = 44;
  const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.03, 0.08), glow(CYAN, 0.45), n * 2);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    for (const [k, r] of [radius - half + 0.12, radius + half - 0.12].entries()) {
      d.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
      d.rotation.y = -a - TURN;
      d.updateMatrix();
      lights.setMatrixAt(i * 2 + k, d.matrix);
    }
  }
  g.add(lights);
  return g;
}
