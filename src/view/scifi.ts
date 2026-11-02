// The sci-fi set, built to the concept in docs/art/scifi_r2: a basin of
// cracked ice plates ringed by blue rock walls, a reactor tower in the middle, a wide mag-rail bed
// round it, the big hover rail-tank and the troopers who ride it. Not the picnic pieces reskinned:
// only the contracts scene.ts drives (the locomotive's and the hero's) are shared.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { HeroKind } from '../sim/types';
import { RAIL } from './models';

/**
 * The ground's colours: pale blue frost by default (owner, 2026-10-31: the orange sand was too
 * dark and heavy); `?ground=sand` brings back the orange-red desert to compare. `fog` is the ground
 * far off, which the fog and sky take; `plates` are the ice plates' tints, `seam` the cracks between
 * them and `rim` the lit edge along each crack; `shade` darkens round the wall and the tower's foot;
 * `bounce` is the light the ground throws back up.
 */
const LANDS = {
  frost: { fog: 0xa8cdee, plates: ['#b4d6f2', '#a8cdee', '#bcdcf5', '#a2c8ea'], seam: 'rgba(52,100,170,0.55)', rim: 'rgba(240,250,255,0.7)', rocks: [0x5f80b4, 0x4e6ea4, 0x7896c4], shade: 0x1e3a66, bounce: 0x88aee0 },
  sand: { fog: 0xd9824a, plates: ['#d8884f', '#d4824c', '#dc9058', '#cc7a44'], seam: 'rgba(120,45,20,0.5)', rim: 'rgba(255,205,150,0.5)', rocks: [0xb4582c, 0x9a4624, 0xc86a38], shade: 0x5a2410, bounce: 0xb0603a },
};
export const LAND = LANDS[typeof location !== 'undefined' && new URLSearchParams(location.search).get('ground') === 'sand' ? 'sand' : 'frost'];
/** Our side's glow: shields, rail lights, the tank's trim and the reactor. */
const CYAN = 0x40e0ff;
const TURN = Math.PI / 2;
/** The tank is built at the locomotive's size and drawn this much bigger, so it fills the wide rail. */
const TANK_SCALE = 1.35;

const white = new THREE.MeshPhysicalMaterial({ color: 0xf2f6fa, roughness: 0.35, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 });
const gunmetal = new THREE.MeshStandardMaterial({ color: 0x4a5462, roughness: 0.4, metalness: 0.6 });
const dark = new THREE.MeshStandardMaterial({ color: 0x262c36, roughness: 0.5, metalness: 0.5 });

function glow(color: number, k: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.3 });
}

function part<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true;
  });
  return o;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
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
 * Big ice plates, tiling: a Voronoi cell per plate, each a slightly different tint, with a dark
 * crack between plates and a lit rim on one side of it.
 */
function iceTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
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
  const tints = LAND.plates.map((h) => new THREE.Color(h));
  const seam = new THREE.Color(LAND.seam.replace(/rgba\((\d+),(\d+),(\d+),[^)]+\)/, 'rgb($1,$2,$3)'));
  const seamK = Number(LAND.seam.match(/,([\d.]+)\)$/)![1]);
  const rim = new THREE.Color(LAND.rim.replace(/rgba\((\d+),(\d+),(\d+),[^)]+\)/, 'rgb($1,$2,$3)'));
  const rimK = Number(LAND.rim.match(/,([\d.]+)\)$/)![1]);
  const img = x.createImageData(S, S);
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
      col.copy(tints[cell % tints.length]);
      // A faint frosting towards each plate's middle.
      col.lerp(rim, 0.08 * Math.max(0, 1 - Math.sqrt(d1) / 140));
      if (edge < 1.1) col.lerp(seam, seamK);
      else if (edge < 3.2 && (px - nx) + (py - ny) < 0) col.lerp(rim, rimK * (1 - (edge - 1.1) / 2.1));
      const o = (py * S + px) * 4;
      img.data[o] = col.r * 255;
      img.data[o + 1] = col.g * 255;
      img.data[o + 2] = col.b * 255;
      img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * The ground: a plane `size` across of big cracked ice plates that takes the shadows, and the rock
 * walls that make it a basin: low clusters of big blue boulders in the four corners of the view,
 * with a few violet alien crystals, all well out from `clear` so they frame the fight and hide no bug
 * at the wall. Nothing small lies scattered about.
 */
export function makeDesert(size: number, clear: number, rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const map = iceTexture();
  map.repeat.set(size / 8, size / 8);
  const ground = mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 }));
  ground.receiveShadow = true;
  g.add(ground);
  const rockMats = LAND.rocks.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true }));
  const crystal = new THREE.MeshStandardMaterial({ color: 0xc080ff, emissive: 0x8a3ae0, emissiveIntensity: 0.9, roughness: 0.2, flatShading: true });
  // Corners at both aspect ratios: landscape's are wide and shallow, portrait's narrow and deep.
  const corners = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4, 0.42, Math.PI - 0.42, Math.PI + 0.42, -0.42, TURN - 0.5, TURN + 0.5, -TURN - 0.5, -TURN + 0.5];
  for (const [ci, ca] of corners.entries()) {
    const near = clear + 3.4 + rng() * 1.2;
    const count = 4 + Math.floor(rng() * 3);
    for (let k = 0; k < count; k++) {
      const a = ca + (rng() - 0.5) * 0.4;
      const r = near + k * 0.7 + rng() * 0.8;
      const s = 0.7 + rng() * 0.6 + k * 0.25;
      const rock = mesh(new THREE.IcosahedronGeometry(1, 0), rockMats[(ci + k) % 3]);
      rock.scale.set(s * (1 + rng() * 0.4), s * (0.55 + rng() * 0.35), s * (1 + rng() * 0.4));
      rock.rotation.set(rng() * 0.4, rng() * Math.PI, rng() * 0.4);
      g.add(part(rock, Math.cos(a) * r, s * 0.15, Math.sin(a) * r));
    }
    if (ci % 2) continue;
    const cluster = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const h = 0.35 + rng() * 0.45;
      const c = mesh(new THREE.ConeGeometry(0.09 + rng() * 0.05, h, 5).translate(0, h / 2, 0), crystal);
      c.position.set((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3);
      c.rotation.set((rng() - 0.5) * 0.7, rng() * 3, (rng() - 0.5) * 0.7);
      cluster.add(c);
    }
    g.add(part(cluster, Math.cos(ca + 0.2) * (near - 0.7), 0, Math.sin(ca + 0.2) * (near - 0.7)));
  }
  return g;
}

/**
 * The reactor everyone is after, in place of the cake: a tower about 2.6 high on a two-tier
 * octagonal base. A white shell holds a glowing cyan energy column in a glass sleeve, two thin cyan
 * rings float round it (`animateReactor` turns and bobs them) and an amber beacon sits on the cap.
 */
export function makeReactor(): THREE.Group {
  const g = new THREE.Group();
  g.userData.flames = [];
  const edge = glow(CYAN, 0.9);
  // Base: dark octagon with a cyan edge, a white tier on it, four white buttresses at the tower's foot.
  g.add(part(mesh(new THREE.CylinderGeometry(1.22, 1.34, 0.2, 8).rotateY(Math.PI / 8), gunmetal), 0, 0.1, 0));
  g.add(part(mesh(new THREE.TorusGeometry(1.25, 0.035, 6, 8).rotateX(TURN).rotateY(Math.PI / 8), edge), 0, 0.2, 0));
  g.add(part(mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.16, 8).rotateY(Math.PI / 8), white), 0, 0.28, 0));
  for (let i = 0; i < 4; i++) {
    const fin = part(block(0.16, 0.7, 0.5, 0.05, white), 0, 0.62, 0.5);
    fin.rotation.x = -0.35;
    const arm = new THREE.Group().add(fin);
    arm.rotation.y = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(arm);
    arm.add(part(mesh(new THREE.BoxGeometry(0.04, 0.4, 0.02), edge), 0, 0.62, 0.76));
  }
  // Lower shell, then the glass sleeve with the energy column in it, framed by four white struts.
  g.add(part(mesh(new THREE.CylinderGeometry(0.42, 0.58, 0.72, 8).rotateY(Math.PI / 8), white), 0, 0.72, 0));
  g.add(part(mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 8).rotateY(Math.PI / 8), gunmetal), 0, 1.1, 0));
  const core = mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.0, 20), glow(0x8ff4ff, 1.5));
  core.position.y = 1.62;
  g.add(core);
  const sleeve = mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x80e8ff, emissive: 0x2ab8f0, emissiveIntensity: 0.4, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, roughness: 0.1 }));
  sleeve.position.y = 1.62;
  g.add(sleeve);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(part(block(0.09, 1.02, 0.09, 0.03, white), Math.cos(a) * 0.33, 1.62, Math.sin(a) * 0.33));
  }
  // Collar, cap and beacon.
  g.add(part(mesh(new THREE.CylinderGeometry(0.36, 0.44, 0.22, 8).rotateY(Math.PI / 8), white), 0, 2.2, 0));
  g.add(part(mesh(new THREE.TorusGeometry(0.4, 0.025, 6, 8).rotateX(TURN).rotateY(Math.PI / 8), edge), 0, 2.12, 0));
  g.add(part(mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.2, 8).rotateY(Math.PI / 8), gunmetal), 0, 2.41, 0));
  const beacon = mesh(new THREE.SphereGeometry(0.08, 16, 10), glow(0xffb040, 2));
  beacon.position.y = 2.56;
  g.add(beacon);
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

/** Turn and bob the reactor's rings and pulse its column. */
export function animateReactor(g: THREE.Object3D, t: number): void {
  const rings = g.userData.rings as THREE.Object3D[] | undefined;
  if (!rings) return;
  rings.forEach((r, i) => {
    r.rotation.y = t * (i ? -0.9 : 0.7);
    r.position.y = (r.userData.y as number) + Math.sin(t * 1.6 + i * 2) * 0.05;
  });
  const core = g.userData.core as THREE.Mesh;
  (core.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + 0.25 * Math.sin(t * 4);
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
  const line = glow(CYAN, 0.8);
  for (const r of [radius - RAIL, radius + RAIL]) {
    const guide = mesh(new THREE.TorusGeometry(r, 0.02, 6, 160).rotateX(TURN), line);
    guide.position.y = Math.min(top, 0.06);
    g.add(guide);
  }
  // Light blocks in pairs by each curb, every few degrees.
  const n = 44;
  const lights = new THREE.InstancedMesh(new RoundedBoxGeometry(0.2, 0.03, 0.08, 2, 0.012), glow(CYAN, 1.1), n * 2);
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

/**
 * The hover rail-tank, built about 1.8 long and drawn `TANK_SCALE` bigger, nose towards +z: a white
 * hull over a dark skirt with a cyan band, a twin-barrelled turret up front, a hatch at the back the
 * trooper rides in (`userData.seat`) and four glowing hover pads under it. Same contract as
 * `makeLocomotive`: everything above the pads is in `userData.body`; `userData.stack` (pivot at its
 * foot) is the capacitor mast behind the hatch, which stretches with each pulse; no wheels or rods.
 */
export function makeHoverTank(): THREE.Group {
  const g = new THREE.Group();
  g.scale.setScalar(TANK_SCALE);
  g.userData.wheels = [];
  g.userData.gear = [];
  const body = new THREE.Group();
  g.add(body);
  g.userData.body = body;
  const band = glow(CYAN, 0.9);
  // Pads and the glow they throw on the bed.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      body.add(part(mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.06, 16), band), sx * 0.3, 0.17, sz * 0.52));
    }
  }
  const halo = mesh(new THREE.PlaneGeometry(1.2, 2.0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  halo.position.y = -0.08;
  g.add(halo);
  body.add(part(block(0.86, 0.18, 1.7, 0.07, dark), 0, 0.3, 0));
  body.add(part(block(0.9, 0.05, 1.44, 0.02, band), 0, 0.36, 0));
  body.add(part(block(0.8, 0.26, 1.5, 0.1, white), 0, 0.49, -0.02));
  // Side armour skirts with a dark vent each.
  for (const sx of [-1, 1]) {
    body.add(part(block(0.08, 0.2, 1.1, 0.03, white), sx * 0.44, 0.44, -0.05));
    body.add(part(block(0.02, 0.06, 0.5, 0.01, dark), sx * 0.485, 0.46, -0.05));
  }
  // Prow: a lower wedge with two headlights.
  const prow = part(block(0.66, 0.16, 0.36, 0.06, white), 0, 0.41, 0.82);
  prow.rotation.x = 0.25;
  body.add(prow);
  for (const sx of [-1, 1]) body.add(part(mesh(new THREE.SphereGeometry(0.05, 12, 8), glow(0xcff8ff, 2.5)), sx * 0.22, 0.45, 0.98));
  // Turret with twin barrels, cyan muzzles.
  const turret = new THREE.Group();
  turret.add(part(mesh(new THREE.CylinderGeometry(0.28, 0.33, 0.2, 8), white), 0, 0, 0));
  turret.add(part(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.07, 8), white), 0, 0.13, 0));
  turret.add(part(mesh(new THREE.TorusGeometry(0.235, 0.018, 6, 8).rotateX(TURN).rotateY(Math.PI / 8), band), 0, 0.1, 0));
  turret.add(part(block(0.4, 0.04, 0.06, 0.015, band), 0, 0.02, 0.29));
  for (const sx of [-1, 1]) {
    const barrel = part(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.66, 12).rotateX(TURN), gunmetal), sx * 0.1, 0.03, 0.4);
    const muzzle = part(mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.07, 12).rotateX(TURN), band), sx * 0.1, 0.03, 0.75);
    turret.add(barrel, muzzle);
  }
  turret.position.set(0, 0.72, 0.3);
  body.add(turret);
  // The hatch at the back: a dark well with a white coaming and its lid swung open behind.
  body.add(part(mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.08, 16), white), 0, 0.64, -0.42));
  body.add(part(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.09, 16), dark), 0, 0.645, -0.42));
  const lid = part(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 16), white), 0, 0.76, -0.66);
  lid.rotation.x = -1.2;
  body.add(lid);
  // The trooper stands in the well, up to the waist.
  const seat = part(new THREE.Group(), 0, 0.46, -0.42);
  body.add(seat);
  g.userData.seat = seat;
  // The capacitor mast: a dark post with cyan coils and a glowing tip.
  const stack = part(new THREE.Group(), 0.3, 0.62, -0.72);
  stack.add(part(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 10), dark), 0, 0.21, 0));
  for (const y of [0.12, 0.22, 0.32]) stack.add(part(mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 16).rotateX(TURN), band), 0, y, 0));
  stack.add(part(mesh(new THREE.SphereGeometry(0.06, 12, 8), glow(0xcff8ff, 3)), 0, 0.45, 0));
  body.add(stack);
  g.userData.stack = stack;
  return g;
}

let halo: THREE.CanvasTexture | undefined;
/** A soft cyan oval of light: the pads' glow on the rail bed. */
function haloTexture(): THREE.CanvasTexture {
  if (halo) return halo;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(90,230,255,0.75)');
  g.addColorStop(0.5, 'rgba(60,200,255,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  halo = new THREE.CanvasTexture(c);
  halo.colorSpace = THREE.SRGBColorSpace;
  return halo;
}

/**
 * Each hero as a chibi trooper: armour, the helmet's shell, its visor and the trim. The marine (the
 * starter, farmer slot) is white with a violet visor; the engineer (beekeeper) wears orange plates
 * and a cyan visor and has an antenna; the heavy (chef) is gunmetal and red with an amber visor and
 * big shoulder pads.
 */
const TROOPERS: Record<HeroKind, { armour: number; helmet: number; visor: number; trim: number }> = {
  farmer: { armour: 0xf2f6fa, helmet: 0xf2f6fa, visor: 0x7a4cff, trim: CYAN },
  beekeeper: { armour: 0xff8a30, helmet: 0xf2f6fa, visor: 0x30d8ff, trim: 0xffc040 },
  chef: { armour: 0x5a6474, helmet: 0xe2553a, visor: 0xffb030, trim: 0xff7040 },
};

/**
 * A trooper about 1.15 tall, facing +z, big round helmet over a small armoured body, a blaster in
 * the right hand. Same contract as `makeHeroModel`: the arms are pivots at the shoulders in
 * `userData.arms`, each with `userData.side`, which `animateHero` swings.
 */
export function makeTrooper(kind: HeroKind): THREE.Group {
  const look = TROOPERS[kind];
  const g = new THREE.Group();
  const armour = new THREE.MeshPhysicalMaterial({ color: look.armour, roughness: 0.4, metalness: kind === 'chef' ? 0.5 : 0.1, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const shell = new THREE.MeshPhysicalMaterial({ color: look.helmet, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.15 });
  const visor = new THREE.MeshPhysicalMaterial({ color: look.visor, emissive: look.visor, emissiveIntensity: 0.35, roughness: 0.05, metalness: 0.3, clearcoat: 1 });
  const trim = glow(look.trim, 0.8);
  const heavy = kind === 'chef';
  // Legs and hips (mostly down the hatch), torso with a chest plate and a light.
  for (const s of [-1, 1]) g.add(part(block(0.15, 0.36, 0.17, 0.05, dark), s * 0.1, 0.18, 0));
  g.add(part(block(0.38, 0.12, 0.26, 0.05, gunmetal), 0, 0.38, 0));
  g.add(part(block(heavy ? 0.5 : 0.42, 0.34, 0.3, 0.1, armour), 0, 0.58, 0));
  g.add(part(block(0.26, 0.18, 0.04, 0.03, dark), 0, 0.6, 0.15));
  g.add(part(mesh(new THREE.SphereGeometry(0.035, 10, 8), trim), 0, 0.62, 0.175));
  // Backpack with a cyan cell.
  g.add(part(block(0.3, 0.3, 0.14, 0.05, gunmetal), 0, 0.6, -0.2));
  g.add(part(block(0.06, 0.2, 0.03, 0.015, trim), 0, 0.6, -0.28));
  // Helmet: a big round shell with a wide visor across the front, a dark neck ring under it.
  g.add(part(mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.06, 16), dark), 0, 0.76, 0));
  const head = new THREE.Group();
  head.position.y = 0.95;
  head.add(part(mesh(new THREE.SphereGeometry(0.3, 28, 20), shell), 0, 0, 0));
  const glass = mesh(new THREE.SphereGeometry(0.305, 28, 16, -0.95, 1.9, 1.1, 0.75), visor);
  glass.rotation.y = TURN;
  head.add(part(glass, 0, 0, 0));
  // A band of trim round the helmet's crown, and the side pods.
  head.add(part(mesh(new THREE.TorusGeometry(0.29, 0.02, 6, 32).rotateX(TURN), trim), 0, 0.1, 0));
  for (const s of [-1, 1]) head.add(part(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 14).rotateZ(TURN), gunmetal), s * 0.3, -0.02, 0));
  if (kind === 'beekeeper') {
    head.add(part(mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.3, 6), dark), 0.22, 0.3, -0.06));
    head.add(part(mesh(new THREE.SphereGeometry(0.03, 10, 8), trim), 0.22, 0.46, -0.06));
  }
  g.add(head);
  // Arms: shoulder pad, sleeve and glove on a pivot at the shoulder; a blaster in the right hand.
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = part(new THREE.Group(), s * (heavy ? 0.3 : 0.26), 0.7, 0);
    pivot.rotation.z = s * 0.25;
    pivot.userData.side = s;
    const pad = heavy ? 0.22 : 0.16;
    pivot.add(part(block(pad, 0.1, pad, 0.04, armour), s * 0.03, 0.02, 0));
    pivot.add(part(block(0.11, 0.26, 0.11, 0.04, dark), s * 0.02, -0.15, 0));
    pivot.add(part(block(0.12, 0.09, 0.12, 0.04, armour), s * 0.02, -0.3, 0));
    if (s > 0) {
      const gun = new THREE.Group();
      gun.add(part(block(0.08, 0.1, 0.3, 0.02, gunmetal), 0, 0, 0.08));
      gun.add(part(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 10).rotateX(TURN), trim), 0, 0.01, 0.27));
      gun.position.set(s * 0.02, -0.34, 0.04);
      pivot.add(gun);
    }
    g.add(pivot);
    arms.push(pivot);
  }
  g.userData.arms = arms;
  return g;
}
