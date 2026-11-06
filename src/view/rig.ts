// The tank and its hero between events (split out of main.ts): the train placed on its rail with its
// wheels turning and steam on each chuff, the warp onto the track at a run's start, the hero turning
// to aim and back, the skill's motes round the tank, and the fence's bites and mends.

import { ENEMIES, TRAIN } from '../sim/config';
import { trainRange } from '../sim/combat';
import type { World } from '../sim/world';
import type { Fx } from './fx';
import { chimney, SKILL_GLOW, trainAt } from './juice';
import { animateHero } from './models';
import { chuffs, kickTrain, paintFence, placeTrain, shotCurve, type Stage } from './scene';

/** How long a shot rocks the hero (shotCurve), and how long after the last it keeps facing that way. */
const SHOT_TIME = 0.22;
const AIM_HOLD = 1.4;

export class TankRig {
  /** Wheel turns so far, from the distance driven. */
  private odo = 0;
  private lastAngle: number | null = null;
  /** The tank warps in on the first frame of a run, once the train is placed. */
  private warpIn = false;
  /** The hero's last shot: the world yaw towards its target and when, on the view clock. */
  private aim = 0;
  private shotAt = -99;
  /** The hero's yaw on its seat, turning towards the target while it shoots and back ahead after. */
  private facing = 0;
  /** How far the hero's arms are raised to aim (0..1), eased in while it shoots and down after. */
  private aimed = 0;

  constructor(
    private stage: Stage,
    private fx: Fx,
  ) {}

  /** A run starts: the wheels from rest, and the warp onto the track on the next frame. */
  reset(): void {
    this.odo = 0;
    this.lastAngle = null;
    this.warpIn = true;
  }

  /** The hero shot from (x, z) at (tx, tz). */
  shot(x: number, z: number, tx: number, tz: number, clock: number): void {
    this.aim = Math.atan2(tx - x, tz - z);
    // A shot during the last one rises from the pose it is in (shotCurve's rise is linear), not from rest.
    this.shotAt = clock - 0.12 * SHOT_TIME * shotCurve((clock - this.shotAt) / SHOT_TIME);
  }

  /** The train on its rail this frame (`alpha` between the last two sim steps), its warp and its steam. */
  train(w: World, alpha: number, clock: number): void {
    const { stage, fx } = this;
    const tr = w.train;
    const angle = tr.prev + (tr.angle - tr.prev) * alpha;
    const lastOdo = this.odo;
    if (this.lastAngle !== null) this.odo += (Math.abs(angle - this.lastAngle) * TRAIN.radius) / 0.17;
    this.lastAngle = angle;
    placeTrain(stage, angle, tr.dir, trainRange(w), this.odo, clock);
    if (this.warpIn) {
      this.warpIn = false;
      const p = trainAt(stage);
      fx.ring(p.x, p.z, 2.4, 0x60e0ff, 0.5);
      fx.puff(p.x, 1, p.z, 0x60e0ff, { size: 2, grow: 1.8, life: 0.4, rise: 0, glow: true, opacity: 0.9 });
      fx.burst(p.x, p.z, 0xb8f8ff, { count: 16, speed: 2.5, up: 4, size: 0.08, alt: 0xffffff, y: 0.8, life: 0.6 });
      kickTrain(stage, 'buy', clock);
    }
    // A soft steam puff from the chimney on each chuff (twice a wheel turn, ~3 a second at base
    // speed) that swells as it rises; capped so a long frame doesn't dump a cloud.
    const beats = w.over ? 0 : Math.min(2, chuffs(lastOdo, this.odo));
    for (let i = 0; i < beats; i++) {
      const c = chimney(stage);
      fx.puff(c.x, 1.3, c.z, 0xf2f4f8, { size: 0.36, grow: 2.6, life: 1.1, rise: 1.4, opacity: 1 });
    }
  }

  /** The fence's damage this frame, and the sparkles of a mended post. */
  fence(w: World): void {
    const fx = this.fx;
    // A mended post: gold sparkles and white glints rise from it, wood chips hop off.
    // The bugs at the fence (combat.ts: d <= 0) eat it where they stand, each at its own rate.
    const biters = w.enemies.filter((e) => e.d <= 0).map((e) => ({ x: e.x, z: e.z, rate: ENEMIES[e.kind].wallDps }));
    for (const m of paintFence(this.stage, w.wallHp / w.wallMax, biters)) {
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        fx.emit(m.x + Math.cos(a) * 0.3, 0.3 + Math.random() * 0.6, m.z + Math.sin(a) * 0.3, 0, 1.4 + Math.random(), 0, i % 2 ? 0xffffff : 0xffe066, 0.07, 0.7, 0, false);
        fx.emit(m.x, 0.5, m.z, Math.cos(a) * 1.6, 2 + Math.random() * 1.5, Math.sin(a) * 1.6, 0xd9a05b, 0.06, 0.5, 9);
      }
    }
  }

  /** The hero's pose and the sparkles of its skill. */
  hero(w: World, clock: number, dt: number): void {
    const { stage, fx } = this;
    const at = trainAt(stage);
    const hero = stage.hero.children[0];
    const casting = w.hero.buffT > 0;
    if (hero) {
      // Turn to face the target (quickly, by the short way round), and ahead again once it stops shooting.
      const want = clock - this.shotAt < AIM_HOLD ? this.aim - stage.train.rotation.y : 0;
      const turn = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
      const f = this.facing + turn * (1 - Math.exp(-dt * 18));
      this.facing = Math.atan2(Math.sin(f), Math.cos(f));
      stage.hero.rotation.y = this.facing;
      this.aimed += ((clock - this.shotAt < AIM_HOLD ? 1 : 0) - this.aimed) * (1 - Math.exp(-dt * 14));
      animateHero(hero, clock, casting, shotCurve((clock - this.shotAt) / SHOT_TIME), this.aimed);
    }
    // Marine's overdrive: violet and white energy motes spiral up round the tank.
    if (casting && w.heroKind === 'farmer' && Math.random() < dt * 30) {
      const a = clock * 5 + Math.random() * 6;
      fx.emit(at.x + Math.cos(a) * 0.7, 0.6, at.z + Math.sin(a) * 0.7, -Math.sin(a) * 1.2, 2.4 + Math.random(), Math.cos(a) * 1.2, Math.random() < 0.6 ? SKILL_GLOW.farmer : 0xffffff, 0.06, 0.6, 0, false);
    }
    // Sparks crackle round the Engineer while its zap is out.
    if (casting && w.heroKind === 'beekeeper' && Math.random() < dt * 20) {
      const a = clock * 6 + Math.random() * 6;
      fx.emit(at.x + Math.cos(a) * 0.8, 1.5 + Math.random() * 0.4, at.z + Math.sin(a) * 0.8, -Math.sin(a) * 3, 0, Math.cos(a) * 3, 0x6fe8ff, 0.06, 0.3, 0, false);
    }
    // A full charge sparkles above the hero until the player casts.
    if (w.heroReady() && Math.random() < dt * 8) {
      fx.emit(at.x + (Math.random() - 0.5), 1.9, at.z + (Math.random() - 0.5), 0, 1.2, 0, 0x7ff0ff, 0.07, 0.7, 0, false);
    }
  }
}
