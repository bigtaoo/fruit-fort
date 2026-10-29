// Pointer input: drag a fruit to merge, feed, move or swap it, drop it on the bin to sell, drag
// to and from the tray, tap the hero to cast, tap the golden bug or basket to grab it. Cells are
// picked by raycasting what is drawn (fruit cubes, level labels, tiles): a tall cube's top or
// label sits far behind its tile in screen space.

import * as THREE from 'three';
import { CELL } from '../sim/config';
import { HERO_CELL, TRAY } from '../sim/board';
import type { World } from '../sim/world';
import type { Hud } from './hud';
import type { Units } from './units';

export interface InputHost {
  world(): World;
  onDrop(from: number, to: number): void;
  onSell(cell: number): void;
  onCast(): void;
  onGrab(): void;
}

/** How close (CSS px) a tap must land to the bug or basket; generous, they are small and moving. */
const GRAB_PX = 56;

const PICK_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6);

export class Input {
  /** Cells the dragged fruit would merge with or feed, for tile highlighting. */
  targets = new Set<number>();
  private from = -1;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private hit = new THREE.Vector3();

  /** Cell under the dragged fruit, for hover highlighting. */
  hover = -1;

  constructor(private canvas: HTMLCanvasElement, private camera: THREE.Camera, private units: Units, private hud: Hud, private host: InputHost, private tiles: THREE.Object3D[]) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    hud.tray.addEventListener('pointerdown', (e) => this.downTray(e));
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

  /** The cell drawn under the pointer: nearest fruit or tile hit, else the ground plane. */
  private pick(e: PointerEvent): number {
    const p = this.ground(e);
    const hits = this.ray.intersectObjects([...this.units.pickables(), ...this.tiles], false);
    for (const h of hits) if (typeof h.object.userData.cell === 'number') return h.object.userData.cell;
    return this.cellAt(p);
  }

  private cellAt(p: THREE.Vector3 | null): number {
    if (!p) return -1;
    const half = CELL * 1.5;
    if (Math.abs(p.x) >= half || Math.abs(p.z) >= half) return -1;
    return Math.floor((p.z + half) / CELL) * 3 + Math.floor((p.x + half) / CELL);
  }

  private over(e: PointerEvent, el: HTMLElement): boolean {
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  /** A tap near the bug or basket on screen. It sits off the board, so it never starts a drag. */
  private nearHappening(e: PointerEvent): boolean {
    const at = this.units.happeningAt();
    if (!at) return false;
    const r = this.canvas.getBoundingClientRect();
    at.project(this.camera);
    const x = r.left + ((at.x + 1) / 2) * r.width;
    const y = r.top + ((1 - at.y) / 2) * r.height;
    return Math.hypot(e.clientX - x, e.clientY - y) <= GRAB_PX;
  }

  private down(e: PointerEvent): void {
    const w = this.host.world();
    if (w.over) return;
    if (this.nearHappening(e)) {
      this.host.onGrab();
      return;
    }
    const cell = this.pick(e);
    const p = this.ground(e);
    if (cell === HERO_CELL) {
      this.host.onCast();
      return;
    }
    if (cell < 0 || !w.cells[cell] || !p) return;
    this.start(cell, p.x, p.z);
  }

  private downTray(e: PointerEvent): void {
    const w = this.host.world();
    if (w.over || !w.tray) return;
    e.preventDefault();
    const p = this.ground(e);
    this.start(TRAY, p?.x ?? 0, p?.z ?? 4);
  }

  private start(cell: number, x: number, z: number): void {
    const w = this.host.world();
    this.from = cell;
    this.hover = -1;
    this.units.drag = { cell, x, z };
    this.targets.clear();
    for (let c = 0; c < 9; c++) if (w.canMerge(cell, c) || w.canFeed(cell, c)) this.targets.add(c);
  }

  private move(e: PointerEvent): void {
    if (this.from < 0 || !this.units.drag) return;
    // The wall fell mid-drag: drop it now rather than carry a fruit over the result card.
    if (this.host.world().over) return this.cancel();
    const p = this.ground(e);
    if (p) {
      this.units.drag.x = p.x;
      this.units.drag.z = p.z;
    }
    const over = this.pick(e);
    this.hover = over !== this.from ? over : -1;
    this.hud.setSellHot(this.over(e, this.hud.sellBin), this.host.world().sellValue(this.from));
    this.hud.setTrayHot(this.from !== TRAY && this.over(e, this.hud.tray));
  }

  private up(e: PointerEvent): void {
    if (this.from < 0) return;
    const from = this.from;
    const bin = this.over(e, this.hud.sellBin);
    const to = this.over(e, this.hud.tray) ? TRAY : this.pick(e);
    this.cancel();
    if (bin) this.host.onSell(from);
    else if (to >= 0 && to !== from) this.host.onDrop(from, to);
  }

  private cancel(): void {
    this.from = -1;
    this.hover = -1;
    this.units.drag = null;
    this.targets.clear();
    this.hud.setSellHot(false, 0);
    this.hud.setTrayHot(false);
  }
}
