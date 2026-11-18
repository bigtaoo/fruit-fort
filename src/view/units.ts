// Everything that moves except the train (scene.ts): enemies with HP bars and blob shadows (drawn
// a kind at a time by horde.ts), projectiles, the golden bug or supply pod on the track, and the
// effects layer (fx.ts). The bugs' models come from swarm.ts, the two pickups from pickups.ts.

import * as THREE from 'three';
import { ENEMIES, FRUITS, standOff } from '../sim/config';
import type { World } from '../sim/world';
import type { EnemyKind, HappeningKind, Projectile, Shooter } from '../sim/types';
import { busy } from '../platform/busy';
import { bugStatus } from './bugstatus';
import { flyShot, wagonShot } from './wagonshots';
import { Fx } from './fx';
import { Horde } from './horde';
import { plastic } from './models';
import { makeBug, makePod } from './pickups';
import { bodyScale, spreadBugs } from './spread';
import type { WarmStage } from './scene';

interface HappeningView {
  id: number;
  kind: HappeningKind;
  group: THREE.Group;
  model: THREE.Group;
  ring: THREE.Mesh;
}

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

/**
 * The hero's shots: a long white-hot core in an additive glow, pointed along its flight, so a shot
 * reads as a laser bolt from the far side of the ring. Cyan, or gold for a crit. The geometry and
 * materials are shared by every bolt; the trail is the colour in `userData.trail`.
 */
const boltCoreGeo = new THREE.CapsuleGeometry(0.07, 0.8, 2, 6).rotateX(Math.PI / 2);
const boltGlowGeo = new THREE.CapsuleGeometry(0.17, 0.95, 3, 8).rotateX(Math.PI / 2);
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
  g.userData.crit = crit;
  if (crit) g.scale.setScalar(1.35);
  return g;
}

/** Projectile look per shooter: the hero's bolt, or (picnic leftovers) seed, nut, melon chunk, grape, lemon drop. */
function projMesh(p: Projectile): THREE.Object3D {
  const kind: Shooter = p.kind;
  switch (kind) {
    case 'hero': return makeBolt(p.crit);
    // Wagons (§10.1): a missile, a mine lobbed at a pile (wagonshots.ts).
    case 'missile':
    case 'mine': return wagonShot(p)!;
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

/** The least a warmRest step waits before the next one (ms). */
const WARM_GAP = 250;
/**
 * Frames the play must actually get between two steps. The gap alone is wall clock, and on a machine
 * drawing 4 fps one frame is longer than it, so the compiles ran back to back and the opening stayed at
 * 3-4 fps through the ~15 s a player spends deciding (2026-11-15, an Intel HD 5500 session: first frame
 * at 10.4 s, 3.8 fps at 15.5 s, 60 fps by 30 s, which is when the steps ran out).
 */
const WARM_FRAMES = 10;
/** However slow the frames come, a step waits no longer than this: a hidden page draws none at all. */
const WARM_CAP = 4000;
/** How often the wait looks at the frame count. */
const WARM_POLL = 50;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Nobody is watching: another tab or app is up front, and rAF has stopped. */
const hidden = (): boolean => typeof document !== 'undefined' && document.hidden;

/**
 * Wait before the next warmRest step: WARM_GAP at the least, and past it until the play has had
 * WARM_FRAMES frames since the wait began (at 60 fps they are all in within the gap, so the wait is
 * the gap), at most WARM_CAP from the same moment. `drawn` counts the frames the render loop has put
 * on screen; without it, or while the page is hidden and draws none, only the gap: there is no play to
 * leave room for, and waiting out the cap would only hold the compiles back (a hidden tab, the dev bot).
 */
export async function warmPause(drawn?: () => number): Promise<void> {
  const from = drawn?.() ?? 0;
  const until = performance.now() + WARM_CAP;
  await sleep(WARM_GAP);
  while (drawn && !hidden() && drawn() - from < WARM_FRAMES && performance.now() < until) await sleep(WARM_POLL);
}

/** The effect ring's material and shape, for warm. */
function warmRing(): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

export class Units {
  readonly fx: Fx;
  readonly horde: Horde;
  private enemies = new Map<number, EnemyView>();
  private projs = new Map<number, THREE.Object3D>();
  private happening: HappeningView | null = null;
  private clock = 0;
  /** Warming runs one at a time: a quality change can ask for a re-warm while warmRest is still going. */
  private warming: Promise<unknown> = Promise.resolve();
  /** Where a bug's bite lands on the fence, for the fence to flinch. */
  onBite: ((x: number, z: number) => void) | null = null;
  /** How open the fence is where a bug stands (0 whole to 1 down), so a bug at a gap steps into it. */
  gapAt: ((x: number, z: number) => number) | null = null;

  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {
    this.fx = new Fx(scene);
    this.horde = new Horde(scene);
  }

  /** Drop every view (a new run reuses ids). */
  reset(): void {
    for (const m of this.projs.values()) this.scene.remove(m);
    if (this.happening) this.scene.remove(this.happening.group);
    this.happening = null;
    this.enemies.clear();
    this.projs.clear();
    this.fx.reset();
    this.horde.begin();
    this.horde.end(this.camera);
  }

  ring(x: number, z: number, r: number, color: number, life = 0.35): void {
    this.fx.ring(x, z, r, color, life);
  }

  /**
   * Build the shaders the opening draws before the game shows, not when the first of their kind turns up. Call it
   * as the stage is built: the scene (`stage.warm`, with the environment and the post passes), both bolts and an
   * effect ring start compiling at once. The returned function takes the bug kinds once the save says which (the
   * level the player is on), compiles them, and draws everything once off screen (stage.prime), as the shadow pass
   * builds its depth variants (the bugs' instanced rig) only when it draws. Every other kind waits for warmRest,
   * after the game shows: 2026-11-07, all 57 programs before the first frame kept weak Windows machines (ANGLE
   * translating to D3D) on the loading screen 7-13 s. The compile is waited for without blocking the page
   * (2026-11-06: done in one go it held the main thread 1-5 s).
   */
  warm(stage: WarmStage, onScene?: (ms: number) => void, onPrime?: (ms: number) => void): (kinds: readonly EnemyKind[]) => Promise<void> {
    const g = new THREE.Group();
    g.add(makeBolt(false), makeBolt(true), warmRing());
    this.scene.add(g);
    this.fx.ring(0, 0, 1, 0xffffff);
    const from = performance.now();
    // Timed where it resolves, not where it is awaited: the finisher also waits for the save, so a slow
    // network would otherwise read as a slow machine.
    const scene = stage.warm().then(() => performance.now() - from);
    // Awaited by the finisher; a failure there is that call's, not an unhandled one in between.
    scene.catch(() => {});
    // Through the same queue as the rest: the loading screen gives up waiting after WARM_WAIT, and from
    // then on a quality step can ask for a re-warm while this one is still compiling.
    return (kinds) => this.queue(async () => {
      try {
        this.horde.prepare(kinds);
        this.horde.showAll(true);
        // The stage's own programs first, and what they took picks the quality level (Quality.compiled)
        // before the bugs compile: a step down there turns the shadows off, so the bugs never build the
        // depth variants at all rather than building them and having them thrown away seconds later.
        onScene?.(await scene);
        busy('warm');
        await stage.compile();
        // A frame may have run while they compiled (the loading page times the warming out), and it
        // hides the empty batches again; prime needs them visible.
        this.horde.showAll(true);
        const primeFrom = performance.now();
        stage.prime();
        onPrime?.(performance.now() - primeFrom);
      } finally {
        this.scene.remove(g);
        this.fx.reset();
        this.horde.showAll(false);
      }
    });
  }

  /**
   * The rest, once the game is on screen: every bug kind and the parts only made mid-run (the pickups and the
   * special bug), one at a time with a pause between, so no single frame makes all their programs and shadow
   * variants: 2026-11-11, done in one go it was the 1-9 s freeze players met in wave 1 (performance_sample
   * long_task_wave p50 1, frame_time_max p90 1.9 s). Kinds come in the order levels bring them. A kind drawn
   * before its turn compiles at that draw, as all of them did before warm split. `drawn` counts rendered
   * frames, so the pause between steps is real play and not just wall clock (warmPause). `only` narrows
   * the kinds: on a machine slow enough to have started low (Quality.weak) eight compiles are a cost the
   * run cannot carry, so it warms the ones the level can field and meets the others as they first draw.
   */
  warmRest(stage: WarmStage, drawn?: () => number, only?: readonly EnemyKind[]): Promise<void> {
    return this.queue(async () => {
      const g = new THREE.Group();
      g.add(makeBug(), makePod());
      const steps: (() => void)[] = [() => this.scene.add(g)];
      for (const k of Object.keys(ENEMIES) as EnemyKind[]) {
        if (only && !only.includes(k)) continue;
        steps.push(() => this.horde.prepare([k]));
      }
      for (const step of steps) {
        await warmPause(drawn);
        step();
        this.horde.showAll(true);
        try {
          // Programs already made are skipped; only this step's are new.
          busy('warm');
          await stage.compile();
          // Again: a frame drawn while the compile ran ends in Horde.end -> flush, which hides every
          // batch holding no bugs, and prime would then draw nothing at all.
          this.horde.showAll(true);
          // Empty batches (no instances) draw nothing but build the shadow pass's variants.
          stage.prime();
        } finally {
          this.horde.showAll(false);
          this.scene.remove(g);
        }
      }
    });
  }

  /**
   * Everything warmed so far, once more, because a quality step changed the programs themselves: turning
   * the shadows off (or back on) gives every lit material another variant, and quality.set marks them all
   * for a rebuild. What is on screen rebuilds in the next frame anyway, which is the one hitch the step
   * costs on purpose; what is not on screen - the bug kinds whose batches stand empty - would otherwise
   * rebuild one at a time, each at the first bug of its kind, which is exactly the mid-wave stall warmRest
   * was written to remove (2026-11-16: on a desktop the first step down lands ~5 s in, after warmRest has
   * finished, so all nine steps were being thrown away). One kind per step, paced like warmRest.
   */
  rewarm(stage: WarmStage, drawn?: () => number): Promise<void> {
    return this.queue(async () => {
      const steps: (EnemyKind | null)[] = [null, ...this.horde.prepared()];
      for (const k of steps) {
        await warmPause(drawn);
        this.horde.show(k, true);
        try {
          busy('warm');
          await stage.compile();
          this.horde.show(k, true);
          stage.prime();
        } finally {
          this.horde.show(k, false);
        }
      }
    });
  }

  /** Run after whatever warming is already going, and never let a failure break the next one. */
  private queue(run: () => Promise<void>): Promise<void> {
    const next = this.warming.then(run, run);
    this.warming = next.catch(() => {});
    return next;
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
      v.y = e.flying ? 1.6 + Math.sin(this.clock * 4 + e.id) * 0.12 : 0;
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
      h.bug(e.kind, v.x, v.y, v.z, v.yaw, (chewing ? Math.max(0, Math.sin(ph)) * 0.25 * heavy : 0) - kk * 0.4 * heavy * heavy, s, ph, t * 40 + e.id, v.flash * v.flash * HIT_WHITE * heavy, tint);
      h.shadow(v.x, v.z, e.flying ? def.size * 0.5 : v.size * 0.9 + 0.22);
      // The bar sits just over the bug's back, so a big one's bar clears a small one's in front;
      // every other bug's is a notch higher, so a clump's bars stagger instead of stacking. Hidden
      // at full health, the fill left-aligned on the track; a hit makes it jump for a moment.
      const frac = Math.max(0, e.hp / e.maxHp);
      const pop = Math.max(0, 1 - (this.clock - v.hitAt) / BAR_POP);
      if (frac < 1) h.bar(v.x, v.y + v.tall + 0.24 + (e.id % 2) * 0.17, v.z, v.size * 0.9 + 0.3, frac, Math.min(1, v.trail / e.maxHp), pop * pop, e.kind === 'boss');
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
