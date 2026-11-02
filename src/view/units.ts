// Everything that moves except the train (scene.ts): enemies with HP bars and blob shadows,
// projectiles, the golden bug or supply pod on the track, and the effects layer (fx.ts).
// Models come from models.ts, the two pickups from pickups.ts.

import * as THREE from 'three';
import { ENEMIES, FRUITS, standOff } from '../sim/config';
import type { World } from '../sim/world';
import type { HappeningKind, Projectile, Shooter } from '../sim/types';
import { Fx, softDot } from './fx';
import { animateEnemy, makeEnemyModel, plastic } from './models';
import { makeBug, makePod } from './pickups';
import { bodyScale, spreadBugs } from './spread';

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
  /** The HP bar: a dark outline, the empty track on it and the fill on top. */
  barEdge: THREE.Mesh;
  barBack: THREE.Mesh;
  bar: THREE.Mesh;
  /** A white flare over the bug that blinks when a shot lands on it. */
  glint: THREE.Sprite;
  hp: number;
  flash: number;
  /** Drawn height of the body, for where the glint sits. */
  tall: number;
  /** View clock when it appeared: it grows in, so one born in a visible corner doesn't pop. */
  born: number;
  /** How far it has stepped into a gap in the fence (0 to 1, eased), and the drawn offset that gives. */
  inGap: number;
  ox: number;
  oz: number;
  /** A small sideways nudge, eased, that keeps it from being drawn inside its neighbours (spread.ts). */
  sx: number;
  sz: number;
}

// HP bars: shared across every bug, so a big swarm costs no new materials. Bright enough to read
// on the dark purple bugs, with a near-black edge so a bar stands out from the one behind it.
const barGeo = new THREE.PlaneGeometry(1, 1);
const BAR_H = 0.17;
const BAR_EDGE = 0.045;
const barEdgeMat = new THREE.MeshBasicMaterial({ color: 0x0a0612, depthTest: false });
const barBackMat = new THREE.MeshBasicMaterial({ color: 0x3d2448, depthTest: false });
const barFillMat = new THREE.MeshBasicMaterial({ color: 0xff4d5e, depthTest: false });
const barBossMat = new THREE.MeshBasicMaterial({ color: 0xffa62a, depthTest: false });
/** The hit flare: one additive material for all, each bug only scales its own sprite. */
const glintMat = new THREE.SpriteMaterial({ map: softDot(), color: 0xfff4e0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
const tmpV = new THREE.Vector3();
const shadowGeo = new THREE.PlaneGeometry(2, 2);
/** Blob shadow: dark in the middle, fading to nothing at the rim, so it has no edge to cut. */
function blobTexture(): THREE.Texture {
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot((x + 0.5) / S * 2 - 1, (y + 0.5) / S * 2 - 1);
      // alphaMap reads the green channel: written to all four.
      data.fill(Math.round(255 * Math.max(0, 1 - d * d) ** 1.4), (y * S + x) * 4, (y * S + x) * 4 + 4);
    }
  }
  const t = new THREE.DataTexture(data, S, S);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTexture(), transparent: true, opacity: 0.5, depthWrite: false });
/** Just above the ground, so the flat disc never z-fights the sand. */
const SHADOW_Y = 0.07;


/**
 * The hero's shots: a long white-hot core in an additive glow, pointed along its flight, so a shot
 * reads as a laser bolt from the far side of the ring. Cyan, or gold for a crit. The geometry and
 * materials are shared by every bolt; the trail is the colour in `userData.trail`.
 */
const boltCoreGeo = new THREE.CapsuleGeometry(0.055, 0.5, 2, 6).rotateX(Math.PI / 2);
const boltGlowGeo = new THREE.CapsuleGeometry(0.14, 0.62, 3, 8).rotateX(Math.PI / 2);
const boltCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const glowMat = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
const BOLT_GLOW = [glowMat(0x40d8ff), glowMat(0x6ff0ff)];
const CRIT_GLOW = glowMat(0xffc040);

function makeBolt(crit: boolean): THREE.Object3D {
  const g = new THREE.Group();
  const glow = crit ? CRIT_GLOW : BOLT_GLOW[Math.floor(Math.random() * BOLT_GLOW.length)];
  g.add(new THREE.Mesh(boltCoreGeo, boltCoreMat), new THREE.Mesh(boltGlowGeo, glow));
  g.userData.trail = glow.color.getHex();
  g.userData.bolt = true;
  if (crit) g.scale.setScalar(1.35);
  return g;
}

/** Projectile look per shooter: the hero's bolt, or (picnic leftovers) seed, nut, melon chunk, grape, lemon drop. */
function projMesh(p: Projectile): THREE.Object3D {
  const kind: Shooter = p.kind;
  switch (kind) {
    case 'hero': return makeBolt(p.crit);
    case 'strawberry': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), plastic(0xffe27a));
      m.scale.set(0.8, 0.8, 1.5);
      return m;
    }
    case 'coconut': return new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), plastic(FRUITS.coconut.color));
    case 'watermelon': return new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 3), plastic(0xf05060));
    case 'grape': return new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), plastic(FRUITS.grape.color));
    case 'lemon': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), plastic(FRUITS.lemon.color));
      m.scale.set(0.8, 1.3, 0.8);
      return m;
    }
  }
}

export class Units {
  readonly fx: Fx;
  private enemies = new Map<number, EnemyView>();
  private projs = new Map<number, THREE.Object3D>();
  private happening: HappeningView | null = null;
  private clock = 0;
  /** Where a bug's bite lands on the fence, for the fence to flinch. */
  onBite: ((x: number, z: number) => void) | null = null;
  /** How open the fence is where a bug stands (0 whole to 1 down), so a bug at a gap steps into it. */
  gapAt: ((x: number, z: number) => number) | null = null;

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
      const model = h.kind === 'bug' ? makeBug() : makePod();
      model.scale.setScalar(h.kind === 'bug' ? 1.3 : 1.4);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28), new THREE.MeshBasicMaterial({ color: h.kind === 'bug' ? 0xffe066 : 0x7dff9a, transparent: true, depthWrite: false }));
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
      // The pod hovers, turns slowly and its thruster flickers.
      v.model.position.y = 0.12 + Math.sin(t * 3) * 0.06;
      v.model.rotation.y = t * 0.8;
      for (const c of v.model.children) if (c.userData.thrust) c.scale.y = 0.85 + Math.sin(t * 37) * 0.15;
    }
    const pulse = (t * 1.5) % 1;
    v.ring.scale.setScalar(0.8 + pulse * 0.6);
    (v.ring.material as THREE.MeshBasicMaterial).opacity = (1 - pulse) * 0.8;
    // Blink in the last two seconds before it goes.
    v.model.visible = h.t > 2 || Math.sin(t * 20) > -0.3;
  }

  private syncEnemies(w: World, alpha: number, dt: number): void {
    const seen = new Set<number>();
    spreadBugs(w.enemies, this.enemies, dt);
    for (const e of w.enemies) {
      seen.add(e.id);
      let v = this.enemies.get(e.id);
      const def = ENEMIES[e.kind];
      if (!v) {
        const group = new THREE.Group();
        const model = makeEnemyModel(e.kind);
        model.scale.setScalar(bodyScale(def.size));
        model.position.y = e.flying ? 1.6 : 0;
        model.rotation.y = Math.atan2(e.dirX, e.dirZ);
        group.add(model);
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = SHADOW_Y;
        shadow.scale.setScalar(e.flying ? def.size * 0.5 : def.size * 0.9 + 0.22);
        group.add(shadow);
        // The bar sits just over the bug's back, so a big one's bar clears a small one's in front;
        // every other bug's is a notch higher, so a clump's bars stagger instead of stacking.
        const tall = bodyScale(def.size) * 0.8;
        const barEdge = new THREE.Mesh(barGeo, barEdgeMat);
        const barBack = new THREE.Mesh(barGeo, barBackMat);
        const bar = new THREE.Mesh(barGeo, e.kind === 'boss' ? barBossMat : barFillMat);
        barEdge.position.y = barBack.position.y = model.position.y + tall + 0.24 + (e.id % 2) * 0.17;
        barEdge.scale.y = BAR_H + BAR_EDGE * 2;
        barBack.scale.y = bar.scale.y = BAR_H;
        const glint = new THREE.Sprite(glintMat);
        glint.visible = false;
        group.add(barEdge, barBack, bar, glint);
        this.scene.add(group);
        this.enemies.set(e.id, (v = { group, model, barEdge, barBack, bar, glint, hp: e.hp, flash: 0, tall, born: this.clock, inGap: 0, ox: 0, oz: 0, sx: 0, sz: 0 }));
      }
      // Where the fence is down, a bug that reached it walks on into the gap and chews there: drawn
      // up to a stand-off further in, so it stands in the fence line with its head past it. Only the
      // picture moves; the sim still has it at its stand-off, eating at the same rate (§16.18).
      const atFence = e.d <= 0 && !e.flying;
      const gap = atFence && this.gapAt ? this.gapAt(e.x, e.z) : 0;
      const stepping = Math.abs(gap - v.inGap) > 0.1;
      v.inGap += (gap - v.inGap) * Math.min(1, dt * 1.5);
      const into = v.inGap * standOff(e.kind);
      v.ox = e.dirX * into + v.sx;
      v.oz = e.dirZ * into + v.sz;
      v.group.position.set(e.px + (e.x - e.px) * alpha + v.ox, 0, e.pz + (e.z - e.pz) * alpha + v.oz);
      if (e.hp < v.hp) v.flash = 1;
      v.hp = e.hp;
      this.placeBar(v, e.hp / e.maxHp, def.size);
      // Slowed enemies move their legs at the slowed pace; a hit makes them swell and flare white
      // for a moment. A flyer over the fence swoops down to peck it.
      const chewing = e.d <= 0 && !stepping;
      animateEnemy(v.model, this.clock * (e.slowMul < 1 ? e.slowMul : 1), e.id, chewing);
      const s = bodyScale(def.size) * (1 + v.flash * 0.22) * Math.min(1, (this.clock - v.born) / 0.4);
      v.model.scale.setScalar(s);
      v.glint.visible = v.flash > 0.02;
      if (v.glint.visible) {
        v.glint.position.y = v.model.position.y + v.tall * 0.55;
        v.glint.scale.setScalar(v.tall * 2.4 * v.flash);
      }
      v.flash = Math.max(0, v.flash - dt * 7);
      if (e.flying) v.model.position.y = 1.6 + Math.sin(this.clock * 4 + e.id) * 0.12;
      // Status: a slow drips yellow, poison bubbles green, chewing throws shield sparks.
      const p = v.group.position;
      if (e.slowT > 0 && Math.random() < dt * 6) this.fx.emit(p.x, v.model.position.y + 0.3, p.z, 0, -0.5, 0, FRUITS.lemon.color, 0.06, 0.5, 4);
      if (e.poisonT > 0 && Math.random() < dt * 8) this.fx.emit(p.x + (Math.random() - 0.5) * 0.4, v.model.position.y + 0.4, p.z, 0, 1.2, 0, 0x8ee04a, 0.07, 0.6, -1, false);
      // Sparks fly off the shield, half a body ahead, now and then while it chews.
      const reach = standOff(e.kind) * (1 - v.inGap * 0.5);
      const bx = p.x + e.dirX * reach;
      const bz = p.z + e.dirZ * reach;
      if (chewing && Math.random() < dt * 5) {
        this.fx.burst(bx, bz, 0x6fe8ff, { count: 2, speed: 1.5, up: 2.5, size: 0.06, life: 0.5 });
        this.onBite?.(bx, bz);
      }
    }
    for (const [id, v] of this.enemies) {
      if (seen.has(id)) continue;
      this.scene.remove(v.group);
      this.enemies.delete(id);
    }
  }

  /**
   * The HP bar, turned to face the camera: hidden at full health, the fill left-aligned on the track.
   * Nearer bars draw over farther ones whole (edge, track and fill together), so in a clump the
   * front bug's bar is never cut by a neighbour's fill.
   */
  private placeBar(v: EnemyView, hpFrac: number, size: number): void {
    const frac = Math.max(0, hpFrac);
    const show = frac < 1;
    v.bar.visible = v.barBack.visible = v.barEdge.visible = show;
    if (!show) return;
    const q = this.camera.quaternion;
    const width = size * 0.9 + 0.5;
    v.barEdge.scale.x = width + BAR_EDGE * 2;
    v.barBack.scale.x = width;
    v.bar.scale.x = Math.max(0.02, frac) * width;
    v.barEdge.quaternion.copy(q);
    v.barBack.quaternion.copy(q);
    v.bar.quaternion.copy(q);
    v.bar.position.copy(v.barBack.position).add(tmpV.set((frac - 1) * width * 0.5, 0, 0).applyQuaternion(q));
    const order = 1000 - Math.min(900, Math.floor(v.group.position.distanceTo(this.camera.position) * 20)) * 3;
    v.barEdge.renderOrder = order;
    v.barBack.renderOrder = order + 1;
    v.bar.renderOrder = order + 2;
  }

  private syncProjectiles(w: World, alpha: number, dt: number): void {
    const seen = new Set<number>();
    for (const p of w.projectiles) {
      seen.add(p.id);
      let m = this.projs.get(p.id);
      if (!m) {
        m = projMesh(p);
        this.scene.add(m);
        this.projs.set(p.id, m);
      }
      m.position.set(p.px + (p.x - p.px) * alpha, p.py + (p.y - p.py) * alpha, p.pz + (p.z - p.pz) * alpha);
      // Closing on a bug drawn inside a gap (or nudged off its neighbours), the shot bends onto where the bug is drawn.
      const t = this.enemies.get(p.targetId);
      let ax = p.tx;
      let az = p.tz;
      if (t && (t.ox || t.oz)) {
        const k = Math.max(0, 1 - Math.hypot(p.x - p.tx, p.z - p.tz) / 2.5);
        m.position.x += t.ox * k;
        m.position.z += t.oz * k;
        ax += t.ox;
        az += t.oz;
      }
      if (m.userData.bolt) {
        // A bolt points where it is going: at the bug, dipping as it closes (the sim drops it to 0.5).
        m.lookAt(ax, 0.5, az);
        if (dt > 0) {
          // A fading streak of its glow colour behind it, and a white-hot spark or two.
          const c = m.userData.trail as number;
          this.fx.emit(m.position.x, m.position.y, m.position.z, 0, 0, 0, c, 0.1, 0.2, 0);
          if (Math.random() < 0.5) this.fx.emit(m.position.x, m.position.y, m.position.z, (Math.random() - 0.5) * 1.5, Math.random(), (Math.random() - 0.5) * 1.5, 0xffffff, 0.05, 0.18, 2);
        }
      } else {
        m.rotation.x += dt * 10;
        m.rotation.y += dt * 7;
        if (dt > 0) this.fx.emit(m.position.x, m.position.y, m.position.z, 0, 0, 0, ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex(), 0.07, 0.16, 0);
      }
    }
    for (const [id, m] of this.projs) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      this.projs.delete(id);
    }
  }
}
