// The hover rail-tank, shaped after the tank in docs/art/scifi_r2/d_tank_heroes.png: a chunky faceted
// wedge of dark graphite armour traced with cyan light, over a black belly, a side pod each side with
// an orange plate and a cyan intake, two big hexagonal cyan eyes in a dark recess at the nose and a turret with twin thick
// barrels. Every static piece is baked into one mesh per material (about a dozen draw calls in all),
// as the phones we aim at are draw-call bound.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CYAN, TURN, dark, glow, gunmetal, mesh, part } from './scifi';

/** The tank is built at the locomotive's size and drawn this much bigger, so it fills the wide rail. */
const TANK_SCALE = 1.35;

/**
 * Graphite, not the concept art's white: on the pale ice a white hull washed out and read as a toy.
 * Steel blue, polished, lets the cyan lines carry the look; any darker and it sinks into the black rail.
 */
const armour = new THREE.MeshPhysicalMaterial({ color: 0x3e4c62, roughness: 0.3, metalness: 0.65, clearcoat: 0.6, clearcoatRoughness: 0.2 });
const pale = new THREE.MeshStandardMaterial({ color: 0x5c6878, roughness: 0.35, metalness: 0.7 });
const orange = new THREE.MeshStandardMaterial({ color: 0xff8a2a, roughness: 0.4, metalness: 0.1 });
/** The glow strips and side lights, and the brighter eyes, muzzles and mast tip. */
const strip = glow(CYAN, 1.6);
const eye = glow(0x38dcff, 1.7);

type Paint = 'armour' | 'pale' | 'gunmetal' | 'dark' | 'orange' | 'strip' | 'eye';
const PAINT: Record<Paint, THREE.Material> = { armour, pale, gunmetal, dark, orange, strip, eye };

/**
 * Collects pieces by paint, each moved into place, and bakes them into one mesh per paint. Faceted
 * pieces get one normal per face, so the armour reads as cut panels; round ones keep their own.
 */
class Kit {
  private pieces = new Map<Paint, THREE.BufferGeometry[]>();
  private at = new THREE.Object3D();

  add(paint: Paint, geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, facet = true): void {
    this.at.position.set(x, y, z);
    this.at.rotation.set(rx, ry, rz);
    this.at.updateMatrix();
    geo.applyMatrix4(this.at.matrix);
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.clearGroups();
    if (facet) g.computeVertexNormals();
    if (g !== geo) geo.dispose();
    const list = this.pieces.get(paint) ?? [];
    list.push(g);
    this.pieces.set(paint, list);
  }

  /** The same piece on both sides, built by `make(side)` for side -1 (left) and 1 (right). */
  pair(paint: Paint, make: (s: number) => THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, facet = true): void {
    for (const s of [-1, 1]) this.add(paint, make(s), s * x, y, z, rx, s * ry, s * rz, facet);
  }

  bake(into: THREE.Object3D): void {
    for (const [paint, list] of this.pieces) {
      const m = mesh(mergeGeometries(list), PAINT[paint]);
      m.castShadow = m.receiveShadow = paint !== 'strip' && paint !== 'eye';
      into.add(m);
      list.forEach((g) => g.dispose());
    }
    this.pieces.clear();
  }
}

/**
 * A flat slab from `y0` to `y1` whose plan is `outline` ([x, z] corners, any winding), its edges cut
 * at 45 degrees `cut` wide all round (the outline is the slab's top face, the cut grows out of it).
 */
function slab(outline: [number, number][], y0: number, y1: number, cut: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0 - 2 * cut, bevelEnabled: true, bevelThickness: cut, bevelSize: cut, bevelSegments: 1, curveSegments: 1 });
  return geo.rotateX(-TURN).translate(0, y0 + cut, 0);
}

/** A box centred on the origin with its top and bottom edges cut `r` wide (28 triangles). */
function box(w: number, h: number, d: number, cut: number): THREE.BufferGeometry {
  const r = Math.min(cut, w * 0.3, h * 0.3, d * 0.3);
  const x = w / 2 - r;
  const z = d / 2 - r;
  return slab([[-x, -z], [x, -z], [x, z], [-x, z]], -h / 2, h / 2, r);
}

/** A prism of `sides` sides `r` round and `len` long along z, a flat face up for the hexagons. */
function prism(r: number, len: number, sides: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, len, sides).rotateY(sides === 6 ? Math.PI / 6 : 0).rotateX(TURN);
}

/** A round tube `r` round and `len` long along z (smooth-shaded). */
function tube(r: number, len: number, r2 = r): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r2, len, 10).rotateX(TURN);
}

/** The hull, pods, nose and tail: everything of the body but the turret, hatch and mast. */
function hull(k: Kit): void {
  // Black belly, then the armoured hull on it: a wedge, widest just ahead of the middle.
  k.add('dark', slab([[-0.3, -0.84], [0.3, -0.84], [0.36, -0.6], [0.36, 0.6], [0.24, 0.84], [-0.24, 0.84], [-0.36, 0.6], [-0.36, -0.6]], 0.13, 0.31, 0.04), 0, 0, 0);
  k.add('armour', slab([[-0.28, -0.84], [0.28, -0.84], [0.34, -0.62], [0.36, 0.42], [0.26, 0.8], [-0.26, 0.8], [-0.36, 0.42], [-0.34, -0.62]], 0.29, 0.5, 0.06), 0, 0, 0);
  // Cyan light along the hull's shoulders.
  k.pair('strip', () => box(0.035, 0.03, 1.04, 0.01), 0.35, 0.47, -0.1, 0, -0.02);
  // Upper deck, nosing down a little, and a pale glacis plate sloping off its front.
  k.add('armour', slab([[-0.22, -0.78], [0.22, -0.78], [0.27, -0.6], [0.28, 0.3], [0.18, 0.5], [-0.18, 0.5], [-0.28, 0.3], [-0.27, -0.6]], 0.46, 0.6, 0.04), 0, 0, 0, 0.03);
  k.add('pale', box(0.42, 0.05, 0.3, 0.02), 0, 0.53, 0.68, 0.42);
  // Lighter panels down both sides of the deck, a cyan line down each, split from the turret by a
  // lit seam, so the top view is not one dark sheet.
  k.pair('pale', () => box(0.12, 0.03, 0.5, 0.01), 0.2, 0.632, -0.5, 0, 0, -0.1);
  k.pair('strip', () => box(0.035, 0.014, 0.44, 0.006), 0.2, 0.652, -0.5, 0, 0, -0.1);
  k.add('strip', box(0.5, 0.02, 0.04, 0.008), 0, 0.612, -0.14);
  // Dark louvres across the glacis.
  for (const z of [0.6, 0.67, 0.74]) k.add('dark', box(0.26, 0.02, 0.035, 0.008), 0, 0.575 - (z - 0.6) * 0.45, z, 0.42);
  // Nose: a dark recess under a pale brow, two big hexagonal eyes in dark frames.
  k.add('dark', box(0.48, 0.2, 0.12, 0.03), 0, 0.37, 0.84);
  k.add('pale', box(0.5, 0.05, 0.14, 0.02), 0, 0.485, 0.86, -0.2);
  k.pair('dark', () => prism(0.1, 0.06, 6), 0.11, 0.37, 0.89);
  k.pair('eye', () => prism(0.075, 0.06, 6), 0.11, 0.37, 0.905);
  // Side pods: long white sponsons, their front corner cut, a cyan intake in each nose.
  k.pair('armour', (s) => slab([[-0.07 * s, -0.5], [0.07 * s, -0.5], [0.07 * s, 0.62], [0.03 * s, 0.76], [-0.07 * s, 0.76]], 0.2, 0.44, 0.04), 0.44, 0, 0.02);
  k.pair('gunmetal', () => box(0.17, 0.08, 1.2, 0.03), 0.44, 0.2, 0.1);
  k.pair('dark', () => prism(0.075, 0.06, 6), 0.42, 0.32, 0.8);
  k.pair('eye', () => prism(0.05, 0.06, 6), 0.42, 0.32, 0.815);
  // Orange armour plates on the pods, tipped outward, and an orange stripe down the pod's flank.
  k.pair('orange', () => box(0.15, 0.04, 0.46, 0.015), 0.45, 0.45, 0.18, 0, 0, -0.18);
  k.pair('orange', () => box(0.02, 0.05, 0.3, 0.01), 0.555, 0.37, -0.28);
  // Pod flanks: a dark vent and a cyan glow strip low down, a cyan side light at the front.
  k.pair('dark', () => box(0.02, 0.06, 0.42, 0.01), 0.555, 0.37, 0.22);
  k.pair('strip', () => box(0.02, 0.025, 0.95, 0.01), 0.552, 0.26, 0.05);
  k.pair('strip', () => box(0.03, 0.05, 0.08, 0.01), 0.55, 0.36, 0.62);
  // Hover pads under the pods, gunmetal housings with a cyan glow face.
  for (const z of [-0.42, 0.5]) {
    k.pair('gunmetal', () => new THREE.CylinderGeometry(0.14, 0.12, 0.08, 8), 0.42, 0.15, z);
    k.pair('strip', () => new THREE.CylinderGeometry(0.11, 0.11, 0.03, 8), 0.42, 0.11, z);
  }
  // Tail: a dark grille between two thrusters with cyan cores.
  k.add('dark', box(0.32, 0.1, 0.06, 0.02), 0, 0.42, -0.88);
  k.pair('gunmetal', () => prism(0.075, 0.1, 8), 0.2, 0.36, -0.88);
  k.pair('strip', () => prism(0.05, 0.02, 8), 0.2, 0.36, -0.935);
}

/** Turret on the deck ahead of the hatch: a faceted armoured housing with twin thick barrels. */
function turret(k: Kit): void {
  const z0 = 0.16;
  k.add('dark', new THREE.CylinderGeometry(0.28, 0.3, 0.05, 8), 0, 0.61, z0);
  k.add('armour', slab([[-0.17, -0.22], [0.17, -0.22], [0.23, -0.08], [0.22, 0.14], [0.13, 0.24], [-0.13, 0.24], [-0.22, 0.14], [-0.23, -0.08]], 0.62, 0.8, 0.04), 0, 0, z0);
  k.pair('strip', () => box(0.03, 0.03, 0.32, 0.01), 0.228, 0.74, z0 - 0.04);
  k.add('pale', slab([[-0.11, -0.14], [0.11, -0.14], [0.13, 0.04], [0.08, 0.12], [-0.08, 0.12], [-0.13, 0.04]], 0.8, 0.83, 0.01), 0, 0, z0);
  k.add('eye', box(0.06, 0.03, 0.03, 0.01), 0.1, 0.78, z0 + 0.27);
  // Mantlet across the front, and the barrels, raised a touch.
  k.add('dark', box(0.46, 0.15, 0.1, 0.03), 0, 0.71, z0 + 0.27);
  const lift = -0.05;
  for (const s of [-1, 1]) {
    const x = s * 0.14;
    const at = (z: number): [number, number, number] => [x, 0.72 - (z - z0 - 0.27) * lift, z];
    k.add('armour', tube(0.085, 0.3), ...at(0.48), lift, 0, 0, false);
    k.add('gunmetal', tube(0.065, 0.14), ...at(0.68), lift, 0, 0, false);
    k.add('dark', tube(0.095, 0.09), ...at(0.78), lift, 0, 0, false);
    k.add('eye', tube(0.07, 0.02), ...at(0.83), lift, 0, 0, false);
    k.add('dark', tube(0.032, 0.02), ...at(0.842), lift, 0, 0, false);
  }
}

/**
 * The hover rail-tank, built about 1.8 long and drawn `TANK_SCALE` bigger, nose towards +z. Same
 * contract as `makeLocomotive`: everything above the pads' glow is in `userData.body`; the trooper
 * rides in the hatch at the back (`userData.seat`); `userData.stack` (pivot at its foot) is the
 * antenna mast behind the hatch, which stretches with each pulse; no wheels or rods.
 */
export function makeHoverTank(): THREE.Group {
  const g = new THREE.Group();
  g.scale.setScalar(TANK_SCALE);
  g.userData.wheels = [];
  g.userData.gear = [];
  const body = new THREE.Group();
  g.add(body);
  g.userData.body = body;
  const halo = mesh(new THREE.PlaneGeometry(1.3, 2.0).rotateX(-TURN), new THREE.MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  halo.position.y = -0.08;
  g.add(halo);
  const k = new Kit();
  hull(k);
  turret(k);
  // The hatch: an armoured coaming round a dark well, its lid swung open behind.
  k.add('armour', new THREE.CylinderGeometry(0.25, 0.27, 0.08, 8), 0, 0.62, -0.42, 0, Math.PI / 8);
  k.add('dark', new THREE.CylinderGeometry(0.2, 0.2, 0.09, 8), 0, 0.625, -0.42, 0, Math.PI / 8);
  k.add('armour', new THREE.CylinderGeometry(0.23, 0.23, 0.04, 8), 0, 0.76, -0.66, -1.2, Math.PI / 8);
  k.bake(body);
  // The trooper stands in the well, up to the waist.
  const seat = part(new THREE.Group(), 0, 0.46, -0.42);
  body.add(seat);
  g.userData.seat = seat;
  // The antenna mast: a dark post with cyan coils and a glowing tip.
  const stack = part(new THREE.Group(), 0.22, 0.6, -0.68);
  stack.add(part(mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.42, 6), dark), 0, 0.21, 0));
  const coils: THREE.BufferGeometry[] = [0.12, 0.22, 0.32].map((y) => new THREE.TorusGeometry(0.055, 0.016, 4, 8).rotateX(TURN).translate(0, y, 0));
  coils.push(new THREE.SphereGeometry(0.055, 8, 6).translate(0, 0.45, 0));
  stack.add(mesh(mergeGeometries(coils.map((c) => c.toNonIndexed())), eye));
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
