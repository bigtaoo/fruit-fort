// Everything that moves except the train (scene.ts): enemies with HP bars and blob shadows,
// projectiles, the golden bug or fruit basket on the track, and the effects layer (fx.ts).
// Models come from models.ts.

import * as THREE from 'three';
import { ENEMIES, FRUITS } from '../sim/config';
import type { World } from '../sim/world';
import type { FruitKind, HappeningKind, Shooter } from '../sim/types';
import { Fx } from './fx';
import { animateEnemy, makeEnemyModel, toon } from './models';

interface HappeningView {
  id: number;
  kind: HappeningKind;
  group: THREE.Group;
  model: THREE.Group;
  ring: THREE.Mesh;
}

interface EnemyView {
  group: THREE.Group;
  model: THREE.Group;
  bar: THREE.Mesh;
  barBack: THREE.Mesh;
  hp: number;
  flash: number;
}

const barGeo = new THREE.PlaneGeometry(1, 0.12);
const shadowGeo = new THREE.CircleGeometry(1, 20);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });

/** A golden beetle with flapping wings: drive through it for gold. */
function makeBug(): THREE.Group {
  const g = new THREE.Group();
  const gold = toon(0xffc21a, { emissive: 0x6a4a00 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), gold);
  body.scale.set(1, 0.75, 1.25);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), toon(0x3a2410));
  head.position.set(0, 0.02, 0.38);
  g.add(head);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6), toon(0xfff6c8, { opacity: 0.8 }));
    wing.scale.set(1, 0.12, 0.55);
    wing.position.set(side * 0.3, 0.22, -0.05);
    wing.userData.wing = side;
    g.add(wing);
  }
  return g;
}

/** A wicker basket of mixed fruit: drive through it for a free level. */
function makeBasket(): THREE.Group {
  const g = new THREE.Group();
  const wicker = toon(0xb07a3c);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.45, 14, 1, true), wicker);
  pot.position.y = 0.22;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14), wicker);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 20, Math.PI), wicker);
  handle.position.y = 0.42;
  g.add(pot, floor, handle);
  const kinds: FruitKind[] = ['strawberry', 'grape', 'lemon', 'coconut'];
  kinds.forEach((k, i) => {
    const a = (i / kinds.length) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), toon(FRUITS[k].color));
    m.position.set(Math.cos(a) * 0.22, 0.48, Math.sin(a) * 0.22);
    g.add(m);
  });
  return g;
}

const BEANS = [0xff6fae, 0xffd84a, 0x7fe07a, 0x7fc8ff, 0xffa04a];

/** Projectile look per fruit: seed, nut, melon chunk, grape, lemon drop. */
function projMesh(kind: Shooter): THREE.Mesh {
  switch (kind) {
    // The hero's shot: a jelly bean in a random sweet colour.
    case 'hero': {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.1, 4, 8), new THREE.MeshBasicMaterial({ color: BEANS[Math.floor(Math.random() * BEANS.length)] }));
      m.rotation.z = Math.PI / 2;
      return m;
    }
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
  private enemies = new Map<number, EnemyView>();
  private projs = new Map<number, THREE.Mesh>();
  private happening: HappeningView | null = null;
  private clock = 0;

  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {
    this.fx = new Fx(scene);
  }

  /** Drop every view (a new run reuses ids). */
  reset(): void {
    for (const v of this.enemies.values()) this.scene.remove(v.group);
    for (const m of this.projs.values()) this.scene.remove(m);
    if (this.happening) this.scene.remove(this.happening.group);
    this.happening = null;
    this.enemies.clear();
    this.projs.clear();
    this.fx.reset();
  }

  ring(x: number, z: number, r: number, color: number, life = 0.35): void {
    this.fx.ring(x, z, r, color, life);
  }

  sync(w: World, alpha: number, dt: number): void {
    this.clock += dt;
    this.syncEnemies(w, alpha, dt);
    this.syncProjectiles(w, alpha, dt);
    this.syncHappening(w);
    this.fx.update(dt);
  }

  /** The bug crawls along the track (wings flapping); the basket sits and sways. Both pulse a ring to say "come here". */
  private syncHappening(w: World): void {
    const h = w.happening;
    if (this.happening && (!h || h.id !== this.happening.id)) {
      this.scene.remove(this.happening.group);
      this.happening = null;
    }
    if (!h) return;
    let v = this.happening;
    if (!v) {
      const group = new THREE.Group();
      const model = h.kind === 'bug' ? makeBug() : makeBasket();
      model.scale.setScalar(h.kind === 'bug' ? 1.3 : 1.4);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      group.add(model, ring);
      this.scene.add(group);
      this.happening = v = { id: h.id, kind: h.kind, group, model, ring };
    }
    v.group.position.set(h.x, 0, h.z);
    const t = this.clock;
    if (h.kind === 'bug') {
      v.model.position.y = 0.35 + Math.abs(Math.sin(t * 6)) * 0.1;
      // Face along the track the way it crawls.
      v.model.rotation.y = Math.atan2(-h.turn * Math.sin(h.angle), h.turn * Math.cos(h.angle));
      for (const c of v.model.children) if (c.userData.wing) c.rotation.z = c.userData.wing * Math.sin(t * 30) * 0.6;
    } else {
      v.model.rotation.z = Math.sin(t * 4) * 0.08;
    }
    const pulse = (t * 1.5) % 1;
    v.ring.scale.setScalar(0.8 + pulse * 0.6);
    (v.ring.material as THREE.MeshBasicMaterial).opacity = (1 - pulse) * 0.8;
    // Blink in the last two seconds before it goes.
    v.model.visible = h.t > 2 || Math.sin(t * 20) > -0.3;
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
