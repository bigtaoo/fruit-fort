// Everything that moves except the train (scene.ts): enemies with HP bars and blob shadows (drawn
// a kind at a time by horde.ts), projectiles, the golden bug or supply pod on the track, and the
// effects layer (fx.ts). The bugs' models come from swarm.ts, the two pickups from pickups.ts; the
// pickup on the track is drawn by happening.ts, and the shaders are warmed by warm.ts.

import * as THREE from 'three';
import { ENEMIES, isBoss, standOff } from '../sim/config';
import type { World } from '../sim/world';
import type { EnemyKind } from '../sim/types';
import { bugStatus } from './bugstatus';
import { flyShot } from './wagonshots';
import { projMesh } from './projectiles';
import { Fx } from './fx';
import { Horde } from './horde';
import { HappeningSprite } from './happening';
import { bodyScale, spreadBugs } from './spread';
import type { WarmStage } from './scene';
import { Warmer } from './warm';

/**
 * The fastest a bug's legs cycle (radians a second, about 5 steps): past it a small fast bug's legs
 * blur on a phone, so it slides a little instead.
 */
const MAX_STEP = 32;
/** Widest a hit's white flare is drawn: a small bug's (about 0.9), not the boss's 5 or more, which washed out the screen. */
const GLINT_MAX = 1.3;

/** A bug as drawn: its place and the view-only state horde.ts draws it from. */
interface EnemyView {
  x: number;
  y: number;
  z: number;
  /** Which way it faces, set when it appears (bugs walk straight in). */
  yaw: number;
  hp: number;
  flash: number;
  hits: number;
  /** Drawn height of the body, for where the glint and the bar sit. */
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
  /** Its leg phase, stepped on by how far it has walked, so its feet keep pace with the ground. */
  walk: number;
  /** Where it was last frame, nudges left out, for how far it walked since. */
  wx: number;
  /** Knock-back from the last bolt (1 at the hit, eased out) along the shot's ground direction. */
  kick: number;
  /** Body size (ENEMIES), for how far a hit pushes it. */
  size: number;
  /** Eased status tint for the body (bugstatus.ts): ice when slowed, magenta when burning. */
  tint: number;
  kx: number;
  kz: number;
  wz: number;
  /** HP the bar's white trail still shows (Potion Siege's damage trail), and the view clock of the last hit. */
  trail: number;
  hitAt: number;
}

/** Seconds the damage trail holds after the last hit, and the fraction of its bar it drains a second. */
const TRAIL_WAIT = 0.25;
const TRAIL_DRAIN = 1.5;
/** How white a bug flashes at the moment of a hit (it fades with the flare, in about 0.15 s). */
const HIT_WHITE = 0.8;
/** Seconds a bar's jump on a hit lasts. */
const BAR_POP = 0.18;
/** A tough bug (LevelDef.tough) is drawn this much bigger; like any bug, its health bar shows once it is hit. */
const TOUGH = 1.35;

export class Units {
  readonly fx: Fx;
  readonly horde: Horde;
  private enemies = new Map<number, EnemyView>();
  private projs = new Map<number, THREE.Object3D>();
  private happening: HappeningSprite;
  private warmer: Warmer;
  private clock = 0;
  /** Where a bug's bite lands on the fence, for the fence to flinch. */
  onBite: ((x: number, z: number) => void) | null = null;
  /** How open the fence is where a bug stands (0 whole to 1 down), so a bug at a gap steps into it. */
  gapAt: ((x: number, z: number) => number) | null = null;

  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {
    this.fx = new Fx(scene);
    this.horde = new Horde(scene);
    this.happening = new HappeningSprite(scene);
    this.warmer = new Warmer(scene, this.fx, this.horde);
  }

  /** Drop every view (a new run reuses ids). */
  reset(): void {
    for (const m of this.projs.values()) this.scene.remove(m);
    this.happening.reset();
    this.enemies.clear();
    this.projs.clear();
    this.fx.reset();
    this.horde.begin();
    this.horde.end(this.camera);
  }

  ring(x: number, z: number, r: number, color: number, life = 0.35): void {
    this.fx.ring(x, z, r, color, life);
  }

  /** The opening's shaders, before the game shows (Warmer.warm). */
  warm(stage: WarmStage, onScene?: (ms: number) => void, onPrime?: (ms: number) => void): (kinds: readonly EnemyKind[]) => Promise<void> {
    return this.warmer.warm(stage, onScene, onPrime);
  }

  /** The rest, a step at a time once the game is on screen (Warmer.warmRest). */
  warmRest(stage: WarmStage, drawn?: () => number, only?: readonly EnemyKind[]): Promise<void> {
    return this.warmer.warmRest(stage, drawn, only);
  }

  /** Everything warmed so far, again after a quality step (Warmer.rewarm). */
  rewarm(stage: WarmStage, drawn?: () => number): Promise<void> {
    return this.warmer.rewarm(stage, drawn);
  }

  sync(w: World, alpha: number, dt: number): void {
    this.clock += dt;
    this.syncEnemies(w, alpha, dt);
    this.syncProjectiles(w, alpha, dt);
    this.happening.sync(w, this.clock);
    this.fx.update(dt);
  }

  private syncEnemies(w: World, alpha: number, dt: number): void {
    const seen = new Set<number>();
    const h = this.horde;
    h.begin();
    spreadBugs(w.enemies, this.enemies, dt);
    for (const e of w.enemies) {
      seen.add(e.id);
      let v = this.enemies.get(e.id);
      const def = ENEMIES[e.kind];
      if (!v) {
        const tall = bodyScale(def.size) * h.top(e.kind) * (e.tough ? TOUGH : 1);
        this.enemies.set(e.id, (v = { x: 0, y: 0, z: 0, yaw: Math.atan2(e.dirX, e.dirZ), hp: e.hp, flash: 0, tall, born: this.clock, inGap: 0, ox: 0, oz: 0, sx: 0, sz: 0, walk: e.id, wx: NaN, wz: 0, kick: 0, size: def.size * (e.tough ? TOUGH : 1), kx: 0, kz: 0, trail: e.hp, hitAt: -99, hits: e.hits, tint: 0 }));
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
      v.x = e.px + (e.x - e.px) * alpha + v.ox;
      v.z = e.pz + (e.z - e.pz) * alpha + v.oz;
      // A buried digger (§9.5) is drawn under the ground: nothing can shoot it until it comes up, so
      // it is sunk out of sight, carries no health bar, and all the player gets is the mound of earth
      // riding over it - which is the point of the kind, a bug on its way in that damage cannot answer.
      v.y = e.flying ? 1.6 + Math.sin(this.clock * 4 + e.id) * 0.12 : e.buried ? -bodyScale(def.size) * 0.66 : 0;
      if (e.buried) {
        // Dirt pushed up along its line about three times a second, so the mound reads as moving.
        const beat = this.clock * 3 + e.id * 0.37;
        if (beat - Math.floor(beat) < dt * 3) this.fx.puff(v.x, 0.12, v.z, 0x8a6a46, { size: 0.3, grow: 1.8, life: 0.45, rise: 0.15, opacity: 0.7 });
      }
      // Under steady fire (the boss) it re-flares only once the last flare has mostly faded: a flicker, not a lamp.
      // Only a hit flares it; poison ticking the health down does not (it flickered for the whole 3 s).
      if (e.hits > v.hits) {
        if (v.flash < 0.35) v.flash = 1;
        v.hitAt = this.clock;
      }
      v.hits = e.hits;
      v.hp = e.hp;
      // The HP just lost stays on the bar in white, holds a moment after the last hit, then drains
      // down to the fill (as in Potion Siege): under steady fire it piles up, so a big hit reads big.
      if (v.trail <= e.hp) v.trail = e.hp;
      else if (this.clock - v.hitAt > TRAIL_WAIT) v.trail = Math.max(e.hp, v.trail - e.maxHp * TRAIL_DRAIN * dt);
      // A walking bug's legs step by the ground it covers, so a slowed one's slow with it; a
      // flyer's dangle, and one at the wall chews, legs and nod on the clock (the nod about its own
      // sideways axis). A hit makes it swell and flare white for a moment, both smaller on a big bug.
      const chewing = e.d <= 0 && !stepping;
      const slow = e.stunT > 0 ? 0 : e.slowMul < 1 ? e.slowMul : 1;
      const t = this.clock * slow;
      const grown = bodyScale(def.size) * (e.tough ? TOUGH : 1);
      const wx = v.x - v.sx;
      const wz = v.z - v.sz;
      const stride = h.stride(e.kind) * grown;
      // One standing short of the fence (the guide holds it, §12.2) treads slowly in place.
      const moved = Number.isNaN(v.wx) ? 0 : Math.hypot(wx - v.wx, wz - v.wz);
      // A big bug moves big: its chew, nod and rear, and its hit's white wash and flare, scale down with
      // its size (the boss to about half), or a boss under steady fire strobes white.
      const heavy = Math.min(1, 0.6 / def.size);
      if (chewing || e.flying || !stride) v.walk += dt * slow * (chewing ? 14 * (0.5 + 0.5 * heavy) : 8);
      else if (e.d > 0 && moved < 1e-4) v.walk += dt * slow * 3;
      else v.walk += Math.min(moved / stride, dt * MAX_STEP);
      v.wx = wx;
      v.wz = wz;
      // A bolt shoves it back along the shot and it rears; it snaps out on the hit and eases home in
      // a quarter second. Lighter bugs go further (the boss barely rocks). Picture only.
      const kk = v.kick * v.kick;
      v.x += v.kx * kk;
      v.z += v.kz * kk;
      v.kick = Math.max(0, v.kick - dt * 4);
      const ph = v.walk;
      const s = grown * (1 + v.flash * 0.22 * heavy * heavy) * Math.min(1, (this.clock - v.born) / 0.4);
      const tint = bugStatus(this.fx, e, v, this.clock, dt);
      // A bomber at the fence strobes as its fuse runs down (§9.5), faster the closer it is to going
      // off: the warning is the whole of the player's answer to the kind, so it is on the bug itself.
      const fuse = e.fuseT > 0 ? 0.3 + 0.7 * Math.abs(Math.sin(this.clock * (8 + 16 * e.fuseT))) : 0;
      h.bug(e.kind, v.x, v.y, v.z, v.yaw, (chewing ? Math.max(0, Math.sin(ph)) * 0.25 * heavy : 0) - kk * 0.4 * heavy * heavy, s, ph, t * 40 + e.id, Math.max(v.flash * v.flash * HIT_WHITE * heavy, fuse), tint);
      h.shadow(v.x, v.z, e.flying ? def.size * 0.5 : e.buried ? v.size * 1.25 + 0.3 : v.size * 0.9 + 0.22);
      // The bar sits just over the bug's back, so a big one's bar clears a small one's in front;
      // every other bug's is a notch higher, so a clump's bars stagger instead of stacking. Hidden
      // at full health, the fill left-aligned on the track; a hit makes it jump for a moment.
      const frac = Math.max(0, e.hp / e.maxHp);
      const pop = Math.max(0, 1 - (this.clock - v.hitAt) / BAR_POP);
      if (frac < 1 && !e.buried) h.bar(v.x, v.y + v.tall + 0.24 + (e.id % 2) * 0.17, v.z, v.size * 0.9 + 0.3, frac, Math.min(1, v.trail / e.maxHp), pop * pop, isBoss(e.kind));
      if (v.flash > 0.02) h.glint(v.x, v.y + v.tall * 0.55, v.z, Math.min(GLINT_MAX, v.tall * 2.4) * heavy * v.flash, this.camera);
      v.flash = Math.max(0, v.flash - dt * 7);
      // Chewing throws shield sparks (statuses: bugstatus.ts, drawn with the body above).
      // Sparks fly off the shield, half a body ahead, now and then while it chews.
      const reach = standOff(e.kind) * (1 - v.inGap * 0.5);
      const bx = v.x + e.dirX * reach;
      const bz = v.z + e.dirZ * reach;
      if (chewing && Math.random() < dt * 5) {
        this.fx.burst(bx, bz, 0x6fe8ff, { count: 2, speed: 1.5, up: 2.5, size: 0.06, life: 0.5 });
        this.onBite?.(bx, bz);
      }
    }
    for (const id of this.enemies.keys()) if (!seen.has(id)) this.enemies.delete(id);
    h.end(this.camera);
  }

  /** A bolt that landed knocks its bug back along the shot and sprays hot sparks on through it. */
  private impact(m: THREE.Object3D): void {
    const u = m.userData as { dx?: number; dz?: number; target?: number; crit?: boolean; trail: number };
    const v = u.target === undefined ? undefined : this.enemies.get(u.target);
    if (!v || u.dx === undefined || u.dz === undefined) return;
    const push = Math.min(0.4, (0.16 / v.size) * (u.crit ? 1.6 : 1));
    v.kick = 1;
    v.kx = u.dx * push;
    v.kz = u.dz * push;
    for (let i = 0; i < (u.crit ? 7 : 4); i++) {
      const sp = 3 + Math.random() * 3;
      this.fx.emit(v.x, v.y + v.tall * 0.5, v.z, u.dx * sp + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.5, u.dz * sp + (Math.random() - 0.5) * 2, i % 2 ? 0xffffff : u.trail, 0.07, 0.25, 6);
    }
  }

  private syncProjectiles(w: World, alpha: number, dt: number): void {
    const seen = new Set<number>();
    for (const p of w.shots.list) {
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
        const d = Math.hypot(ax - m.position.x, az - m.position.z);
        if (d > 0.05) {
          m.userData.dx = (ax - m.position.x) / d;
          m.userData.dz = (az - m.position.z) / d;
        }
        m.userData.target = p.targetId;
        if (dt > 0) {
          // A fading streak of its glow colour behind it, and a white-hot spark or two.
          const c = m.userData.trail as number;
          this.fx.emit(m.position.x, m.position.y, m.position.z, 0, 0, 0, c, 0.1, 0.2, 0);
          if (Math.random() < 0.5) this.fx.emit(m.position.x, m.position.y, m.position.z, (Math.random() - 0.5) * 1.5, Math.random(), (Math.random() - 0.5) * 1.5, 0xffffff, 0.05, 0.18, 2);
        }
      } else if (m.userData.wagon) {
        flyShot(this.fx, m, ax, az, dt, this.clock);
      } else {
        m.rotation.x += dt * 10;
        m.rotation.y += dt * 7;
        if (dt > 0) this.fx.emit(m.position.x, m.position.y, m.position.z, 0, 0, 0, ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex(), 0.07, 0.16, 0);
      }
    }
    for (const [id, m] of this.projs) {
      if (seen.has(id)) continue;
      if (m.userData.bolt) this.impact(m);
      this.scene.remove(m);
      this.projs.delete(id);
    }
  }
}
