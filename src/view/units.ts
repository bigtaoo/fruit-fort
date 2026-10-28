// Grey-box meshes for everything that moves: fruit cubes with a level label, enemy blocks with
// HP bars, projectiles, and short-lived rings for hits, bursts and merges.

import * as THREE from 'three';
import { ENEMIES, FRUITS } from '../sim/config';
import { cellX, cellZ } from '../sim/board';
import type { World } from '../sim/world';
import type { EnemyKind, Fruit, FruitKind } from '../sim/types';

interface FruitView {
  id: number;
  level: number;
  group: THREE.Group;
  label: THREE.Sprite;
  pop: number;
}

interface EnemyView {
  group: THREE.Group;
  bar: THREE.Mesh;
}

interface Ring {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  r: number;
}

const fruitGeo = new THREE.BoxGeometry(1, 1, 1);
const enemyGeo = new THREE.BoxGeometry(1, 1, 1);
const projGeo = new THREE.SphereGeometry(0.14, 8, 6);
const ringGeo = new THREE.RingGeometry(0.85, 1, 32);
const barGeo = new THREE.PlaneGeometry(1, 0.12);

function fruitSize(level: number): number {
  return 0.55 + level * 0.09;
}

function labelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 38px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  return new THREE.CanvasTexture(c);
}

export class Units {
  private fruits = new Map<number, FruitView>();
  private enemies = new Map<number, EnemyView>();
  private projs = new Map<number, THREE.Mesh>();
  private rings: Ring[] = [];
  private fruitMats = new Map<FruitKind, THREE.Material>();
  private enemyMats = new Map<EnemyKind, THREE.Material>();
  private labels = new Map<number, THREE.SpriteMaterial>();
  /** Cell being dragged and where the pointer holds it, so that cube follows the pointer. */
  drag: { cell: number; x: number; z: number } | null = null;

  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {}

  private fruitMat(kind: FruitKind): THREE.Material {
    let m = this.fruitMats.get(kind);
    if (!m) this.fruitMats.set(kind, (m = new THREE.MeshLambertMaterial({ color: FRUITS[kind].color })));
    return m;
  }

  private enemyMat(kind: EnemyKind): THREE.Material {
    let m = this.enemyMats.get(kind);
    if (!m) this.enemyMats.set(kind, (m = new THREE.MeshLambertMaterial({ color: ENEMIES[kind].color })));
    return m;
  }

  private labelMat(level: number): THREE.SpriteMaterial {
    let m = this.labels.get(level);
    if (!m) this.labels.set(level, (m = new THREE.SpriteMaterial({ map: labelTexture(String(level)), depthTest: false })));
    return m;
  }

  private makeFruit(f: Fruit): FruitView {
    const group = new THREE.Group();
    const cube = new THREE.Mesh(fruitGeo, this.fruitMat(f.kind));
    cube.castShadow = true;
    group.add(cube);
    const label = new THREE.Sprite(this.labelMat(f.level));
    label.scale.set(0.5, 0.5, 1);
    label.renderOrder = 10;
    group.add(label);
    this.scene.add(group);
    return { id: f.id, level: f.level, group, label, pop: 1 };
  }

  /** Drop every view (a new run reuses ids). */
  reset(): void {
    for (const v of this.fruits.values()) this.scene.remove(v.group);
    for (const v of this.enemies.values()) this.scene.remove(v.group);
    for (const m of this.projs.values()) this.scene.remove(m);
    for (const r of this.rings) this.scene.remove(r.mesh);
    this.fruits.clear();
    this.enemies.clear();
    this.projs.clear();
    this.rings = [];
  }

  /** Mark a fruit for the squash-and-grow pop (summon or merge). */
  pop(cell: number, w: World): void {
    const f = w.cells[cell];
    const v = f && this.fruits.get(f.id);
    if (v) v.pop = 1;
  }

  ring(x: number, z: number, r: number, color: number, life = 0.35): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.05, z);
    this.scene.add(mesh);
    this.rings.push({ mesh, age: 0, life, r });
  }

  /** Fruit cubes and labels for pointer picking, minus the one being dragged. */
  pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const v of this.fruits.values()) {
      const cube = v.group.children[0];
      if (this.drag && cube.userData.cell === this.drag.cell) continue;
      out.push(cube, v.label);
    }
    return out;
  }

  sync(w: World, alpha: number, dt: number): void {
    this.syncFruits(w, dt);
    this.syncEnemies(w, alpha);
    this.syncProjectiles(w, alpha);
    this.syncRings(dt);
  }

  private syncFruits(w: World, dt: number): void {
    const seen = new Set<number>();
    for (let cell = 0; cell < 9; cell++) {
      const f = w.cells[cell];
      if (!f) continue;
      seen.add(f.id);
      let v = this.fruits.get(f.id);
      if (!v) this.fruits.set(f.id, (v = this.makeFruit(f)));
      if (v.level !== f.level) {
        v.level = f.level;
        v.label.material = this.labelMat(f.level);
        v.pop = 1;
      }
      const s = fruitSize(f.level);
      const pop = v.pop > 0 ? 1 + Math.sin(v.pop * Math.PI) * 0.35 : 1;
      v.pop = Math.max(0, v.pop - dt * 3);
      const cube = v.group.children[0];
      cube.userData.cell = cell;
      v.label.userData.cell = cell;
      cube.scale.set(s * pop, s / pop, s * pop);
      cube.position.y = s / 2;
      v.label.position.y = s + 0.35;
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

  private syncEnemies(w: World, alpha: number): void {
    const seen = new Set<number>();
    for (const e of w.enemies) {
      seen.add(e.id);
      let v = this.enemies.get(e.id);
      const def = ENEMIES[e.kind];
      if (!v) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(enemyGeo, this.enemyMat(e.kind));
        const s = def.size;
        // Grey-box silhouettes: long caterpillar, flat wide snail, tall mold, everything else a block.
        const shape = { caterpillar: [1, 0.8, 1.8], snail: [1.1, 0.55, 1.5], mold: [1, 1.1, 1], locust: [0.8, 0.6, 1.6] }[e.kind as string] ?? [1, 0.8, 1];
        body.scale.set(s * shape[0], e.flying ? s * 0.4 : s * shape[1], s * shape[2]);
        body.position.y = e.flying ? 1.6 : s * 0.4;
        body.castShadow = true;
        // Face the way it walks: the body's long axis is z.
        body.rotation.y = Math.atan2(e.dirX, e.dirZ);
        group.add(body);
        const bar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xe03030, depthTest: false }));
        bar.position.y = body.position.y + s * 0.6 + 0.3;
        bar.renderOrder = 5;
        group.add(bar);
        this.scene.add(group);
        this.enemies.set(e.id, (v = { group, bar }));
      }
      v.group.position.set(e.px + (e.x - e.px) * alpha, 0, e.pz + (e.z - e.pz) * alpha);
      const frac = Math.max(0, e.hp / e.maxHp);
      v.bar.visible = frac < 1;
      v.bar.scale.x = Math.max(0.02, frac) * (def.size + 0.3);
      v.bar.quaternion.copy(this.camera.quaternion);
      const body = v.group.children[0] as THREE.Mesh;
      // Slowed enemies squash a little so the lemon effect reads.
      body.scale.x = def.size * (e.slowMul < 1 ? 0.75 : 1);
    }
    for (const [id, v] of this.enemies) {
      if (seen.has(id)) continue;
      this.scene.remove(v.group);
      this.enemies.delete(id);
    }
  }

  private syncProjectiles(w: World, alpha: number): void {
    const seen = new Set<number>();
    for (const p of w.projectiles) {
      seen.add(p.id);
      let m = this.projs.get(p.id);
      if (!m) {
        m = new THREE.Mesh(projGeo, this.fruitMat(p.kind));
        m.scale.setScalar(1 + p.level * 0.15);
        this.scene.add(m);
        this.projs.set(p.id, m);
      }
      m.position.set(p.px + (p.x - p.px) * alpha, p.py + (p.y - p.py) * alpha, p.pz + (p.z - p.pz) * alpha);
    }
    for (const [id, m] of this.projs) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      this.projs.delete(id);
    }
  }

  private syncRings(dt: number): void {
    this.rings = this.rings.filter((r) => {
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      const s = r.r * (0.4 + 0.6 * k);
      r.mesh.scale.set(s, s, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      return true;
    });
  }
}
