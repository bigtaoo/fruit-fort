// Pointer input: drag a fruit to merge, move or swap it, drop it on the bin to sell, tap the
// hero to cast.

import * as THREE from 'three';
import { CELL } from '../sim/config';
import { HERO_CELL } from '../sim/board';
import type { World } from '../sim/world';
import type { Hud } from './hud';
import type { Units } from './units';

export interface InputHost {
  world(): World;
  onDrop(from: number, to: number): void;
  onSell(cell: number): void;
  onCast(): void;
}

const PICK_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6);

export class Input {
  /** Cells the dragged fruit would merge with, for tile highlighting. */
  targets = new Set<number>();
  private from = -1;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private hit = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement, private camera: THREE.Camera, private units: Units, private hud: Hud, private host: InputHost) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', () => this.cancel());
  }

  private ground(e: PointerEvent): THREE.Vector3 | null {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.ray.intersectPlane(PICK_PLANE, this.hit);
  }

  private cellAt(p: THREE.Vector3 | null): number {
    if (!p) return -1;
    const half = CELL * 1.5;
    if (Math.abs(p.x) >= half || Math.abs(p.z) >= half) return -1;
    return Math.floor((p.z + half) / CELL) * 3 + Math.floor((p.x + half) / CELL);
  }

  private overBin(e: PointerEvent): boolean {
    const r = this.hud.sellBin.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  private down(e: PointerEvent): void {
    const w = this.host.world();
    if (w.over) return;
    const p = this.ground(e);
    const cell = this.cellAt(p);
    if (cell === HERO_CELL) {
      this.host.onCast();
      return;
    }
    if (cell < 0 || !w.cells[cell]) return;
    this.from = cell;
    this.units.drag = { cell, x: p!.x, z: p!.z };
    this.targets.clear();
    for (let c = 0; c < 9; c++) if (w.canMerge(cell, c)) this.targets.add(c);
  }

  private move(e: PointerEvent): void {
    if (this.from < 0 || !this.units.drag) return;
    const p = this.ground(e);
    if (p) {
      this.units.drag.x = p.x;
      this.units.drag.z = p.z;
    }
    this.hud.setSellHot(this.overBin(e), this.host.world().sellValue(this.from));
  }

  private up(e: PointerEvent): void {
    if (this.from < 0) return;
    const from = this.from;
    const bin = this.overBin(e);
    const to = this.cellAt(this.ground(e));
    this.cancel();
    if (bin) this.host.onSell(from);
    else if (to >= 0 && to !== from) this.host.onDrop(from, to);
  }

  private cancel(): void {
    this.from = -1;
    this.units.drag = null;
    this.targets.clear();
    this.hud.setSellHot(false, 0);
  }
}
