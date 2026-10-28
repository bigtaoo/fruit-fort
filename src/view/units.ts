// Everything that moves: fruits with a level badge, enemies with HP bars and blob shadows,
// projectiles, and the effects layer (fx.ts). Models come from models.ts.

import * as THREE from 'three';
import { ENEMIES, FRUITS } from '../sim/config';
import { cellX, cellZ } from '../sim/board';
import type { World } from '../sim/world';
import type { FruitKind } from '../sim/types';
import { Fx } from './fx';
import { animateEnemy, makeEnemyModel, makeFruitModel, toon } from './models';

interface FruitView {
  id: number;
  level: number;
  group: THREE.Group;
  model: THREE.Group;
  /** Invisible box for pointer picking; the model's parts are too fiddly to raycast. */
  hit: THREE.Mesh;
  label: THREE.Sprite;
  pop: number;
  kick: number;
}

interface EnemyView {
  group: THREE.Group;
  model: THREE.Group;
  bar: THREE.Mesh;
  barBack: THREE.Mesh;
  hp: number;
  flash: number;
}

const hitGeo = new THREE.BoxGeometry(1, 1.1, 1);
hitGeo.translate(0, 0.55, 0);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const barGeo = new THREE.PlaneGeometry(1, 0.12);
const shadowGeo = new THREE.CircleGeometry(1, 20);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });

function fruitSize(level: number): number {
  return 0.75 + level * 0.1;
}

function labelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a2410';
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffe066';
  g.beginPath();
  g.arc(32, 32, 23, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3a2410';
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Projectile look per fruit: seed, nut, melon chunk, grape, lemon drop. */
function projMesh(kind: FruitKind): THREE.Mesh {
  switch (kind) {
    case 'strawberry': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon(0xffe27a));
      m.scale.set(0.8, 0.8, 1.5);
      return m;
    }
    case 'coconut': return new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), toon(FRUITS.coconut.color));
    case 'watermelon': return new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 3), toon(0xf05060));
    case 'grape': return new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), toon(FRUITS.grape.color));
    case 'lemon': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toon(FRUITS.lemon.color));
      m.scale.set(0.8, 1.3, 0.8);
      return m;
    }
  }
}

export class Units {
  readonly fx: Fx;
  private fruits = new Map<number, FruitView>();
  private enemies = new Map<number, EnemyView>();
  private projs = new Map<number, THREE.Mesh>();
  private labels = new Map<number, THREE.SpriteMaterial>();
  private clock = 0;
  /** Cell being dragged and where the pointer holds it, so that fruit follows the pointer. */
  drag: { cell: number; x: number; z: number } | null = null;

  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {
    this.fx = new Fx(scene);
  }

  private labelMat(level: number): THREE.SpriteMaterial {
    let m = this.labels.get(level);
    if (!m) this.labels.set(level, (m = new THREE.SpriteMaterial({ map: labelTexture(String(level)), depthTest: false })));
    return m;
  }

  private makeFruit(kind: FruitKind, level: number, id: number): FruitView {
    const group = new THREE.Group();
    const model = makeFruitModel(kind, level);
    group.add(model);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    group.add(hit);
    const label = new THREE.Sprite(this.labelMat(level));
    label.scale.set(0.42, 0.42, 1);
    label.renderOrder = 10;
    group.add(label);
    this.scene.add(group);
    return { id, level, group, model, hit, label, pop: 1, kick: 0 };
  }

  /** Drop every view (a new run reuses ids). */
  reset(): void {
    for (const v of this.fruits.values()) this.scene.remove(v.group);
    for (const v of this.enemies.values()) this.scene.remove(v.group);
    for (const m of this.projs.values()) this.scene.remove(m);
    this.fruits.clear();
    this.enemies.clear();
    this.projs.clear();
    this.fx.reset();
  }

  /** Mark a fruit for the squash-and-grow pop (summon or merge). */
  pop(cell: number, w: World): void {
    const f = w.cells[cell];
    const v = f && this.fruits.get(f.id);
    if (v) v.pop = 1;
  }

  /** Recoil when a fruit fires. */
  kick(cell: number, w: World): void {
    const f = w.cells[cell];
    const v = f && this.fruits.get(f.id);
    if (v) v.kick = 1;
  }

  ring(x: number, z: number, r: number, color: number, life = 0.35): void {
    this.fx.ring(x, z, r, color, life);
  }

  /** Fruit hit boxes and labels for pointer picking, minus the one being dragged. */
  pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const v of this.fruits.values()) {
      if (this.drag && v.hit.userData.cell === this.drag.cell) continue;
      out.push(v.hit, v.label);
    }
    return out;
  }

  sync(w: World, alpha: number, dt: number): void {
    this.clock += dt;
    this.syncFruits(w, dt);
    this.syncEnemies(w, alpha, dt);
    this.syncProjectiles(w, alpha, dt);
    this.fx.update(dt);
  }

  private syncFruits(w: World, dt: number): void {
    const seen = new Set<number>();
    for (let cell = 0; cell < 9; cell++) {
      const f = w.cells[cell];
      if (!f) continue;
      seen.add(f.id);
      let v = this.fruits.get(f.id);
      if (!v) this.fruits.set(f.id, (v = this.makeFruit(f.kind, f.level, f.id)));
      if (v.level !== f.level) {
        // A new level is a new look (ripeness, crown, halo): rebuild the model.
        v.group.remove(v.model);
        v.model = makeFruitModel(f.kind, f.level);
        v.group.add(v.model);
        v.level = f.level;
        v.label.material = this.labelMat(f.level);
        v.pop = 1;
      }
      const s = fruitSize(f.level);
      const pop = v.pop > 0 ? 1 + Math.sin(v.pop * Math.PI) * 0.35 : 1;
      v.pop = Math.max(0, v.pop - dt * 3);
      const kick = v.kick > 0 ? 1 + Math.sin(v.kick * Math.PI) * 0.12 : 1;
      v.kick = Math.max(0, v.kick - dt * 6);
      const breathe = 1 + Math.sin(this.clock * 3 + f.id) * 0.03;
      v.hit.userData.cell = cell;
      v.label.userData.cell = cell;
      v.model.scale.set(s * pop * kick, (s / pop / kick) * breathe, s * pop * kick);
      for (const c of v.model.children) if (c.userData.spin) c.rotation.z += dt * 2;
      v.hit.scale.setScalar(s);
      v.label.position.set(0.32 * s, s * 0.95 + 0.1, 0.3 * s);
      const dragging = this.drag && this.drag.cell === cell;
      if (dragging) v.group.position.set(this.drag!.x, 0.8, this.drag!.z);
      else v.group.position.set(cellX(cell), 0.3, cellZ(cell));
    }
    for (const [id, v] of this.fruits) {
      if (seen.has(id)) continue;
      this.scene.remove(v.group);
      this.fruits.delete(id);
    }
  }

  private syncEnemies(w: World, alpha: number, dt: number): void {
    const seen = new Set<number>();
    for (const e of w.enemies) {
      seen.add(e.id);
      let v = this.enemies.get(e.id);
      const def = ENEMIES[e.kind];
      if (!v) {
        const group = new THREE.Group();
        const model = makeEnemyModel(e.kind);
        model.scale.setScalar(def.size * 1.25);
        model.position.y = e.flying ? 1.6 : 0;
        model.rotation.y = Math.atan2(e.dirX, e.dirZ);
        group.add(model);
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.03;
        shadow.scale.setScalar(def.size * (e.flying ? 0.5 : 0.75));
        group.add(shadow);
        const y = model.position.y + def.size * 1.3 + 0.3;
        const barBack = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x3a2410, depthTest: false }));
        const bar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: e.kind === 'boss' ? 0xff7a1a : 0xe03030, depthTest: false }));
        barBack.position.y = bar.position.y = y;
        barBack.renderOrder = 5;
        bar.renderOrder = 6;
        group.add(barBack, bar);
        this.scene.add(group);
        this.enemies.set(e.id, (v = { group, model, bar, barBack, hp: e.hp, flash: 0 }));
      }
      v.group.position.set(e.px + (e.x - e.px) * alpha, 0, e.pz + (e.z - e.pz) * alpha);
      if (e.hp < v.hp) v.flash = 1;
      v.hp = e.hp;
      const frac = Math.max(0, e.hp / e.maxHp);
      const show = frac < 1;
      v.bar.visible = v.barBack.visible = show;
      const width = def.size + 0.4;
      v.barBack.scale.x = width;
      v.bar.scale.x = Math.max(0.02, frac) * width;
      v.barBack.quaternion.copy(this.camera.quaternion);
      v.bar.quaternion.copy(this.camera.quaternion);
      // Keep the red bar left-aligned on the backing in screen space.
      v.bar.position.copy(v.barBack.position).add(new THREE.Vector3((frac - 1) * width * 0.5, 0, 0.01).applyQuaternion(this.camera.quaternion));
      // Slowed enemies move their legs at the slowed pace; a hit makes them swell for a moment.
      const chewing = e.d <= 0 && !e.flying;
      animateEnemy(v.model, this.clock * (e.slowMul < 1 ? e.slowMul : 1), e.id, chewing);
      const s = def.size * 1.25 * (1 + v.flash * 0.15);
      v.model.scale.setScalar(s);
      v.flash = Math.max(0, v.flash - dt * 8);
      if (e.flying) v.model.position.y = 1.6 + Math.sin(this.clock * 4 + e.id) * 0.12;
      // Status: lemon slow drips yellow, beekeeper poison bubbles green, chewing throws wood chips.
      const p = v.group.position;
      if (e.slowT > 0 && Math.random() < dt * 6) this.fx.emit(p.x, v.model.position.y + 0.3, p.z, 0, -0.5, 0, FRUITS.lemon.color, 0.06, 0.5, 4);
      if (e.poisonT > 0 && Math.random() < dt * 8) this.fx.emit(p.x + (Math.random() - 0.5) * 0.4, v.model.position.y + 0.4, p.z, 0, 1.2, 0, 0x8ee04a, 0.07, 0.6, -1, false);
      if (chewing && Math.random() < dt * 5) this.fx.burst(p.x + e.dirX * 0.3, p.z + e.dirZ * 0.3, 0xa87444, { count: 2, speed: 1.5, up: 2.5, size: 0.06, life: 0.5 });
    }
    for (const [id, v] of this.enemies) {
      if (seen.has(id)) continue;
      this.scene.remove(v.group);
      this.enemies.delete(id);
    }
  }

  private syncProjectiles(w: World, alpha: number, dt: number): void {
    const seen = new Set<number>();
    for (const p of w.projectiles) {
      seen.add(p.id);
      let m = this.projs.get(p.id);
      if (!m) {
        m = projMesh(p.kind);
        m.scale.multiplyScalar(1 + p.level * 0.12);
        this.scene.add(m);
        this.projs.set(p.id, m);
      }
      m.position.set(p.px + (p.x - p.px) * alpha, p.py + (p.y - p.py) * alpha, p.pz + (p.z - p.pz) * alpha);
      m.rotation.x += dt * 10;
      m.rotation.y += dt * 7;
    }
    for (const [id, m] of this.projs) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      this.projs.delete(id);
    }
  }
}
