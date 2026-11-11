// Wagons on the board (§10.1): each picked wagon rides the rail behind the tank, one low-poly model
// per kind shaped to be told from above (makeWagon), and the look of their attacks: arcs, plasma,
// frost blown out to the ground, blasts, Lv3 mines lying in wait, kill gold drawn to the magnet. Each
// kind shows it is at work in its own way, small and on its own body (wagonwork.ts), and kicks when
// it fires. The fence posts in front of the train duck so they do not hide it (fenceduck.ts).

import * as THREE from 'three';
import { TRAIN, WAGONS } from '../sim/config';
import type { SimEvent, WagonKind } from '../sim/types';
import type { World } from '../sim/world';
import { duckAt } from './fenceduck';
import { flatten } from './flatten';
import type { Fx } from './fx';
import type { Stage } from './scene';
import { dark, glow, gunmetal, white } from './scifi';
import { TRACK_TOP } from './trainpose';
import { work, type WorkCar } from './wagonwork';

/**
 * Each wagon's colour, one hue apiece so six kinds read as six at a glance (2026-11-11 review: three
 * pairs shared a hue): on its painted deck, its glow, its card and its attack. Second review the same day:
 * none of them orange (the hero, the tank and the bugs own it) and frost a pale ice, not the fence's cyan.
 */
export const WAGON_COLOR: Record<WagonKind, number> = {
  arc: 0xa77bff, missile: 0x4f86ff, frost: 0xb4e2ff, plasma: 0xff4fd2, mine: 0x8cff4a, magnet: 0xffcc33,
};

/** Drawn this much bigger than its model (about 0.95 long), as big as the gap between cars allows. */
const SCALE = 1.6;
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, n = 8) => new THREE.CylinderGeometry(r, r, h, n);
const ring = (r: number, t: number, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, 16, arc);
const glows = new Map<number, THREE.Material>();
const lit = (c: number) => glows.get(c) ?? (glows.set(c, glow(c, 1.6)), glows.get(c)!);
const paints = new Map<number, THREE.Material>();
/** The kind's own colour as matte paint, a little lighter: the deck the player sees from above. */
const paint = (c: number) =>
  paints.get(c) ?? (paints.set(c, new THREE.MeshStandardMaterial({ color: new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.2), roughness: 0.55, metalness: 0.15 })), paints.get(c)!);

function add(g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, 0, rz);
  m.castShadow = true;
  g.add(m);
  return m;
}

/**
 * A wagon's model at level lv, nose to +z like the tank. The camera looks down at 56 degrees, so each
 * kind is shaped to be told from above: a deck painted its colour, and on it an outline of its own
 * (rings of a coil, a rack of tubes, a tank, a caged orb, a drum, a horseshoe). Glow only on the part
 * that works (the coil's tip, the warheads, the orb); the rest is paint and metal, so a Lv3 is not a
 * blob of light. Levels show in shape: Lv2 adds the kind's second part, Lv3 a bigger top and armour
 * down both flanks; and as one, two, three white lamps across the nose.
 */
function makeWagon(kind: WagonKind, lv: number): THREE.Group {
  const g = new THREE.Group();
  const col = WAGON_COLOR[kind];
  const c = lit(col);
  const pc = paint(col);
  // The same chassis under every kind: a dark hover sled, the painted deck, a tow bar out front and a
  // hitch behind that meet the next car's, a thin underglow; and a bogie with two wheels down each side,
  // so it reads as a car on the rail and not a box (11-11 review).
  add(g, box(0.56, 0.12, 0.72), dark, 0, 0.12, 0);
  add(g, box(0.5, 0.1, 0.66), pc, 0, 0.23, 0);
  add(g, box(0.07, 0.05, 0.3), gunmetal, 0, 0.13, 0.47);
  add(g, box(0.12, 0.07, 0.1), gunmetal, 0, 0.13, -0.4);
  for (const s of [-1, 1]) {
    add(g, box(0.05, 0.07, 0.56), dark, s * 0.3, 0.07, 0);
    for (const z of [-0.2, 0.2]) add(g, cyl(0.08, 0.05, 10), gunmetal, s * 0.31, 0.08, z, 0, Math.PI / 2);
  }
  add(g, box(0.5, 0.02, 0.6), c, 0, 0.065, 0);
  const top = new THREE.Group();
  top.position.y = 0.28;
  g.add(top);
  switch (kind) {
    case 'arc':
      // A tesla coil: from above, rings narrowing up a post to a glowing tip.
      add(top, cyl(0.17, 0.05, 12), gunmetal, 0, 0.025, 0);
      add(top, cyl(0.05, 0.4), gunmetal, 0, 0.2, 0);
      [0.16, 0.13, 0.1].forEach((r, i) => add(top, ring(r, 0.025), white, 0, 0.1 + i * 0.1, 0, Math.PI / 2));
      add(top, new THREE.IcosahedronGeometry(0.09, 0), c, 0, 0.45, 0);
      // Lv2+: two small coils either side (it strikes four bugs, not three).
      if (lv >= 2) {
        for (const s of [-1, 1]) {
          add(top, cyl(0.035, 0.22), gunmetal, s * 0.19, 0.11, -0.16);
          add(top, ring(0.06, 0.018), white, s * 0.19, 0.12, -0.16, Math.PI / 2);
          add(top, new THREE.IcosahedronGeometry(0.05, 0), c, s * 0.19, 0.25, -0.16);
        }
      }
      break;
    case 'missile':
      // A launcher block painted its colour, tubes raised forward, glowing warheads.
      add(top, box(0.4, 0.16, 0.48), pc, 0, 0.08, -0.04);
      for (const x of lv >= 2 ? [-0.15, -0.05, 0.05, 0.15] : [-0.1, 0.1]) {
        add(top, cyl(0.05, 0.42), gunmetal, x, 0.2, 0.02, Math.PI / 2 - 0.5);
        add(top, new THREE.ConeGeometry(0.05, 0.12, 8), c, x, 0.32, 0.2, Math.PI / 2 - 0.5);
      }
      break;
    case 'frost':
      // A long ice-blue tank on its side, white bands, an ice crystal on top.
      add(top, cyl(0.18, 0.56, 12), pc, 0, 0.17, 0, Math.PI / 2);
      for (const z of [-0.14, 0.14]) add(top, cyl(0.185, 0.05, 12), white, 0, 0.17, z, Math.PI / 2);
      add(top, new THREE.OctahedronGeometry(0.1, 0), c, 0, 0.42, 0);
      // Lv2+: cooling fins down both flanks (a stronger, longer chill).
      if (lv >= 2) for (const s of [-1, 1]) for (const z of [-0.14, 0, 0.14]) add(top, box(0.12, 0.025, 0.06), white, s * 0.22, 0.17, z, 0, s * 0.3);
      break;
    case 'plasma':
      // A glowing orb in a gunmetal cage, nozzles out both sides.
      add(top, box(0.3, 0.12, 0.4), gunmetal, 0, 0.06, 0);
      add(top, new THREE.SphereGeometry(0.13, 12, 8), c, 0, 0.24, 0);
      add(top, ring(0.17, 0.022), white, 0, 0.24, 0, Math.PI / 2);
      add(top, ring(0.17, 0.018), white, 0, 0.24, 0);
      for (const s of [-1, 1]) add(top, new THREE.ConeGeometry(0.08, 0.22, 8), white, s * 0.25, 0.1, 0, 0, s * Math.PI / 2);
      // Lv2+: a second pair of nozzles, fore and aft (hotter jets).
      if (lv >= 2) for (const s of [-1, 1]) add(top, new THREE.ConeGeometry(0.06, 0.18, 8), white, 0, 0.1, s * 0.27, s * Math.PI / 2);
      break;
    case 'mine':
      // Drums of mines with painted lids, a chute out the back.
      for (const x of lv >= 2 ? [-0.12, 0.12] : [0]) {
        const r = lv >= 2 ? 0.12 : 0.16;
        add(top, cyl(r, 0.2, 12), dark, x, 0.1, 0.04);
        add(top, cyl(r - 0.03, 0.02, 12), pc, x, 0.205, 0.04);
        add(top, cyl(r + 0.005, 0.04, 12), c, x, 0.06, 0.04);
      }
      add(top, box(0.18, 0.04, 0.24), gunmetal, 0, 0.04, -0.26, -0.4);
      break;
    case 'magnet': {
      // A horseshoe lying flat, open to the front: painted, with bright pole tips.
      const u = (s: number, y: number) => {
        const m = add(top, ring(0.17 * s, 0.06 * s, Math.PI), pc, 0, y, 0, -Math.PI / 2);
        for (const x of [-0.17 * s, 0.17 * s]) add(top, box(0.12 * s, 0.12 * s, 0.1 * s), white, x, y, 0.05 * s);
        return m;
      };
      add(top, cyl(0.04, 0.12), gunmetal, 0, 0.06, -0.1);
      u(1, 0.14);
      // Lv2+: a second, smaller horseshoe inside the first (a wider pull).
      if (lv >= 2) u(0.55, 0.2);
      break;
    }
  }
  // Its level as white lamps across the nose, like Lv on the card: one, two, three.
  for (let i = 0; i < lv; i++) add(g, box(0.07, 0.02, 0.06), lit(0xffffff), (i - (lv - 1) / 2) * 0.11, 0.285, 0.29);
  // Lv3: a bigger top and armour down both flanks, a wider outline from above.
  if (lv >= 3) {
    top.scale.setScalar(1.3);
    for (const s of [-1, 1]) add(g, box(0.06, 0.16, 0.6), gunmetal, s * 0.3, 0.2, 0);
  }
  g.scale.setScalar(SCALE);
  // One draw per material, not one per part: 8-16 parts and their shadows per wagon, four wagons.
  flatten(g);
  return g;
}

interface Car extends WorkCar {
  /** View clock when it was hitched or upgraded, for its pop-in. */
  at: number;
  /** The pick's ring still to show, where the car first stands. */
  ring: boolean;
}

const mineGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.1, 8);

export class WagonView {
  private cars: Car[] = [];
  /** Which side of the tank the wagons ride, eased through a reversal (-1..1). */
  private side = 1;
  private mines: THREE.Mesh[] = [];
  private duck: { x: number; z: number }[] = [];

  constructor(
    private stage: Stage,
    private fx: Fx,
  ) {}

  /** A new run: no wagons. */
  reset(): void {
    for (const c of this.cars) this.drop(c);
    this.cars = [];
    this.side = 1;
  }

  update(w: World, alpha: number, clock: number, dt: number): void {
    const wg = w.wg;
    const list = wg?.list ?? [];
    if (list.length < this.cars.length) this.reset();
    list.forEach((g, i) => {
      let car = this.cars[i];
      if (car && car.lv === g.lv && car.kind === g.kind) return;
      if (car) this.drop(car);
      car = { kind: g.kind, lv: g.lv, group: makeWagon(g.kind, g.lv), at: clock, ring: true, lastT: g.t, shot: -1 };
      this.stage.scene.add(car.group);
      this.cars[i] = car;
    });
    // The tank and its wagons duck the posts in front of them (fenceduck.ts).
    this.duck.length = 0;
    this.duck.push(this.stage.train.position);
    for (const car of this.cars) this.duck.push(car.group.position);
    duckAt(this.duck);
    if (!wg) return;
    const tr = w.train;
    // Through a reversal the wagons swing round behind the tank's new tail.
    this.side += Math.sign(tr.dir - this.side) * Math.min(Math.abs(tr.dir - this.side), dt * 5);
    const angle = tr.prev + (tr.angle - tr.prev) * alpha;
    const side = Math.abs(this.side) < 0.3 ? Math.sign(this.side || 1) * 0.3 : this.side;
    this.cars.forEach((car, i) => {
      const a = angle - (side * (WAGONS.first + WAGONS.gap * i)) / TRAIN.radius;
      const g = car.group;
      const pop = Math.min(1, (clock - car.at) / 0.35);
      g.position.set(Math.cos(a) * TRAIN.radius, TRACK_TOP + 0.05 * Math.sin(clock * 4 + i * 1.7) + (1 - pop) * 1.2, Math.sin(a) * TRAIN.radius);
      g.rotation.y = Math.atan2(-Math.sign(side) * Math.sin(a), Math.sign(side) * Math.cos(a));
      const kick = work(this.fx, car, wg.list[i], clock, dt, WAGON_COLOR[car.kind]);
      g.position.y -= kick * 0.08;
      g.scale.setScalar(SCALE * (pop < 1 ? 0.6 + 0.4 * pop + 0.15 * Math.sin(pop * Math.PI) : 1 + kick * 0.06));
      if (car.ring) this.fx.ring(g.position.x, g.position.z, 1.4, 0x60e0ff, 0.5);
      car.ring = false;
      if (pop < 1 && dt > 0 && Math.random() < 0.5) this.fx.emit(g.position.x, 0.4, g.position.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, WAGON_COLOR[car.kind], 0.08, 0.5);
    });
    this.syncMines(w, clock);
  }

  /** Take a wagon off the board and free its geometry (the materials are shared). */
  private drop(car: Car): void {
    this.stage.scene.remove(car.group);
    car.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }

  /** Lv3 mines on the ground, blinking. */
  private syncMines(w: World, clock: number): void {
    const list = w.wg?.mines ?? [];
    while (this.mines.length < list.length) {
      const m = new THREE.Mesh(mineGeo, lit(WAGON_COLOR.mine));
      this.stage.scene.add(m);
      this.mines.push(m);
    }
    this.mines.forEach((m, i) => {
      const p = list[i];
      m.visible = !!p;
      if (p) {
        m.position.set(p.x, 0.08, p.z);
        m.scale.setScalar(Math.sin(clock * 10 + i) > 0 ? 1.15 : 0.9);
      }
    });
  }

  /** A wagon's sim event on the board; false if it is not one. */
  event(ev: SimEvent): boolean {
    const fx = this.fx;
    switch (ev.t) {
      case 'zap':
        // A jagged chain of light from the coil to each bug, a flash where it strikes.
        for (const p of ev.to) {
          bolt(fx, ev.x, 1.1, ev.z, p.x, 0.5, p.z, WAGON_COLOR.arc);
          fx.puff(p.x, 0.5, p.z, 0xe0f8ff, { size: 0.7, grow: 1.4, life: 0.14, rise: 0, glow: true, opacity: 1 });
        }
        return true;
      case 'burn':
        // Jets of plasma both ways off the wagon, out to its reach.
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = ev.r * (2.2 + Math.random() * 1.6);
          fx.emit(ev.x, 0.5, ev.z, Math.cos(a) * v, 0.6, Math.sin(a) * v, Math.random() < 0.4 ? 0xffd070 : WAGON_COLOR.plasma, 0.13, 0.32, 0);
        }
        return true;
      case 'frost':
        // A patch every 0.35 s along the rail: kept faint, or a frost wagon paints a chain of bright rings.
        // Blown out from the wagon (on the rail, inward along the same line) to where it lies.
        {
          const k = TRAIN.radius / (Math.hypot(ev.x, ev.z) || 1);
          fx.stream(ev.x * k, 0.7, ev.z * k, ev.x, 0.2, ev.z, 0xc8f6ff, 2, 0.3, 0.12);
        }
        fx.ring(ev.x, ev.z, ev.r, WAGON_COLOR.frost, Math.min(0.8, ev.life), 0.04, 0.35);
        fx.puff(ev.x, 0.15, ev.z, 0xdff8ff, { size: ev.r * 1.6, grow: 1.1, life: ev.life * 0.6, rise: 0, opacity: 0.16 });
        return true;
      case 'boom':
        fx.puff(ev.x, 0.5, ev.z, 0xffb040, { size: ev.r * 1.8, grow: 1.6, life: 0.3, rise: 0, glow: true, opacity: 1 });
        fx.ring(ev.x, ev.z, ev.r * 1.2, WAGON_COLOR.missile, 0.35, 0.08);
        fx.burst(ev.x, ev.z, WAGON_COLOR.missile, { count: 10, speed: 3, up: 3, size: 0.09, alt: 0xe8f0ff, y: 0.4 });
        this.stage.shake = Math.max(this.stage.shake, 0.05);
        return true;
      case 'kill': {
        // The magnet's share of the kill gold: a spark from the bug to the wagon. Juice still shows the kill.
        const m = ev.gold > 0 ? this.cars.find((c) => c.kind === 'magnet') : undefined;
        if (m) fx.stream(ev.x, 0.4, ev.z, m.group.position.x, m.group.position.y + 0.5, m.group.position.z, WAGON_COLOR.magnet, 2, 0.45, 0.09);
        return false;
      }
      case 'pick': {
        // A new or upgraded wagon rings where it pops in (update); a supply rings at the tank.
        const p = this.stage.train.position;
        if (ev.opt.lv === 0) fx.ring(p.x, p.z, 1.4, 0x60e0ff, 0.5);
        return true;
      }
    }
    return false;
  }
}

/** Lightning: a few jagged segments, each drawn as a short run of sparks. */
function bolt(fx: Fx, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void {
  const n = 4;
  let [px, py, pz] = [x0, y0, z0];
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const j = i < n ? 0.3 : 0;
    const x = x0 + (x1 - x0) * k + (Math.random() - 0.5) * j;
    const y = y0 + (y1 - y0) * k + (Math.random() - 0.5) * j;
    const z = z0 + (z1 - z0) * k + (Math.random() - 0.5) * j;
    for (let s = 0; s < 3; s++) {
      const u = s / 3;
      fx.emit(px + (x - px) * u, py + (y - py) * u, pz + (z - pz) * u, 0, 0, 0, s ? color : 0xffffff, 0.09, 0.16, 0, false);
    }
    [px, py, pz] = [x, y, z];
  }
}
