// Wagons on the board (§10.1): each picked wagon rides the rail behind the tank, one low-poly model
// per kind (Lv2 adds a glow band, Lv3 a bigger top), and the look of their attacks: arcs, plasma,
// frost on the ground, blasts, and Lv3 mines lying in wait.

import * as THREE from 'three';
import { TRAIN, WAGONS } from '../sim/config';
import type { SimEvent, WagonKind } from '../sim/types';
import type { World } from '../sim/world';
import { flatten } from './flatten';
import type { Fx } from './fx';
import type { Stage } from './scene';
import { dark, glow, gunmetal, white } from './scifi';
import { TRACK_TOP } from './trainpose';

/** Each wagon's colour: on its model, its card and its attack. Attack cyan/orange, defence ice, economy gold. */
export const WAGON_COLOR: Record<WagonKind, number> = {
  arc: 0x7fd8ff, missile: 0xff8a2a, frost: 0xa8f0ff, plasma: 0xff6a3a, mine: 0xffd040, magnet: 0xffc23a,
};

const SCALE = 1.35;
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, n = 8) => new THREE.CylinderGeometry(r, r, h, n);
const glows = new Map<number, THREE.Material>();
const lit = (c: number) => glows.get(c) ?? (glows.set(c, glow(c, 1.6)), glows.get(c)!);

function add(g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, 0, rz);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** A wagon's model at level lv, about 0.95 long (drawn SCALE bigger), nose to +z like the tank. */
function makeWagon(kind: WagonKind, lv: number): THREE.Group {
  const g = new THREE.Group();
  const c = lit(WAGON_COLOR[kind]);
  // The same chassis under every kind: a dark hover sled, a white deck, the coupler.
  add(g, box(0.56, 0.12, 0.72), dark, 0, 0.12, 0);
  add(g, box(0.5, 0.1, 0.66), white, 0, 0.23, 0);
  add(g, box(0.08, 0.06, 0.2), gunmetal, 0, 0.14, 0.42);
  add(g, box(0.5, 0.02, 0.6), c, 0, 0.065, 0);
  const top = new THREE.Group();
  top.position.y = 0.28;
  g.add(top);
  switch (kind) {
    case 'arc':
      add(top, cyl(0.07, 0.42), gunmetal, 0, 0.21, 0);
      for (const y of [0.1, 0.2, 0.3]) add(top, new THREE.TorusGeometry(0.12, 0.025, 6, 12), c, 0, y, 0, Math.PI / 2);
      add(top, new THREE.IcosahedronGeometry(0.09, 0), c, 0, 0.47, 0);
      break;
    case 'missile':
      add(top, box(0.38, 0.16, 0.5), gunmetal, 0, 0.08, 0);
      for (const x of [-0.1, 0.1]) {
        add(top, cyl(0.055, 0.42), white, x, 0.2, 0.02, Math.PI / 2 - 0.5);
        add(top, new THREE.ConeGeometry(0.055, 0.12, 8), c, x, 0.32, 0.2, Math.PI / 2 - 0.5);
      }
      break;
    case 'frost':
      add(top, cyl(0.17, 0.52, 10), white, 0, 0.16, 0, Math.PI / 2);
      add(top, cyl(0.175, 0.06, 10), c, 0, 0.16, 0.12, Math.PI / 2);
      add(top, cyl(0.175, 0.06, 10), c, 0, 0.16, -0.12, Math.PI / 2);
      add(top, new THREE.OctahedronGeometry(0.08, 0), c, 0, 0.38, 0);
      break;
    case 'plasma':
      add(top, box(0.3, 0.18, 0.44), gunmetal, 0, 0.09, 0);
      for (const s of [-1, 1]) add(top, new THREE.ConeGeometry(0.08, 0.22, 8), c, s * 0.24, 0.1, 0, 0, s * Math.PI / 2);
      add(top, new THREE.SphereGeometry(0.1, 10, 8), c, 0, 0.24, 0);
      break;
    case 'mine':
      add(top, cyl(0.16, 0.2, 10), dark, 0, 0.1, -0.06);
      add(top, cyl(0.165, 0.05, 10), c, 0, 0.1, -0.06);
      add(top, cyl(0.06, 0.3), gunmetal, 0, 0.2, 0.14, 0.6);
      break;
    case 'magnet': {
      const u = new THREE.TorusGeometry(0.16, 0.05, 6, 14, Math.PI);
      add(top, u, c, 0, 0.08, 0);
      add(top, box(0.1, 0.06, 0.1), white, -0.16, 0.06, 0);
      add(top, box(0.1, 0.06, 0.1), white, 0.16, 0.06, 0);
      break;
    }
  }
  // Lv2: a glow band round the deck. Lv3: a bigger top with a crown of light.
  if (lv >= 2) add(g, box(0.54, 0.04, 0.7), c, 0, 0.29, 0);
  if (lv >= 3) {
    top.scale.setScalar(1.3);
    add(g, new THREE.TorusGeometry(0.2, 0.025, 6, 16), c, 0, 0.82, 0, Math.PI / 2);
  }
  g.scale.setScalar(SCALE);
  // One draw per material, not one per part: 8-13 parts and their shadows per wagon, four wagons.
  flatten(g);
  return g;
}

interface Car {
  kind: WagonKind;
  lv: number;
  group: THREE.Group;
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
      car = { kind: g.kind, lv: g.lv, group: makeWagon(g.kind, g.lv), at: clock, ring: true };
      this.stage.scene.add(car.group);
      this.cars[i] = car;
    });
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
      g.scale.setScalar(SCALE * (pop < 1 ? 0.6 + 0.4 * pop + 0.15 * Math.sin(pop * Math.PI) : 1));
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
        fx.ring(ev.x, ev.z, ev.r, WAGON_COLOR.frost, Math.min(1.2, ev.life), 0.04);
        fx.puff(ev.x, 0.15, ev.z, 0xdff8ff, { size: ev.r * 1.6, grow: 1.1, life: ev.life * 0.6, rise: 0, opacity: 0.35 });
        return true;
      case 'boom':
        fx.puff(ev.x, 0.5, ev.z, 0xffb040, { size: ev.r * 1.8, grow: 1.6, life: 0.3, rise: 0, glow: true, opacity: 1 });
        fx.ring(ev.x, ev.z, ev.r * 1.2, 0xff8a2a, 0.35, 0.08);
        fx.burst(ev.x, ev.z, 0xff8a2a, { count: 10, speed: 3, up: 3, size: 0.09, alt: 0xfff0b0, y: 0.4 });
        this.stage.shake = Math.max(this.stage.shake, 0.05);
        return true;
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
