// The hero's train on the ring: where it is and which way it drives, its gun, its stats from the levels
// bought this run, and its own crit stream. World holds one and steps it. Split from combat.ts.

import { CRIT, DT, HEAVY_KINDS, POISON, STATS, TRAIN, WATER } from './config';
import { trackPoint } from './board';
import { Prng } from './rng';
import { inRange } from './shots';
import type { World } from './world';
import type { Enemy } from './types';

export class Train {
  /** Angle in radians (unbounded, so it interpolates) and last tick's. */
  angle = Math.PI / 2;
  prev = Math.PI / 2;
  dir: 1 | -1 = 1;
  /** Gun cooldown, and the carry of multishot's fractional target (§4.4). */
  shotT = 0;
  extra = 0;
  private readonly crit: Prng;

  constructor(seed: number) {
    this.crit = new Prng(seed * 2 + 2);
  }

  reverse(): void {
    this.dir = this.dir === 1 ? -1 : 1;
  }

  // ---- stats, from the levels bought this run ---------------------------------------------

  /** One shot's damage before crit: the dmg stat multiplies, the village hero level adds. */
  damage(w: World): number {
    return TRAIN.damage * Math.pow(1 + STATS.dmg.per, w.lv.dmg) * (1 + TRAIN.perLevel * ((w.meta.heroLv ?? 1) - 1));
  }

  /** Attack speed multiplier: the spd stat and the farmer's water. */
  speedMul(w: World): number {
    let mul = 1 + STATS.spd.per * w.lv.spd;
    if (w.heroKind === 'farmer' && w.hero.buffT > 0) mul += WATER.speed;
    return mul;
  }

  range(w: World): number {
    return TRAIN.range + STATS.range.per * w.lv.range;
  }

  critChance(w: World): number {
    return STATS.crit.per * Math.min(w.lv.crit, CRIT.rateLevels);
  }

  /** A crit's damage multiplier: x2, and past the chance's cap the crit card raises it. */
  critMul(w: World): number {
    return TRAIN.critMul + CRIT.dmgPer * Math.max(0, w.lv.crit - CRIT.rateLevels);
  }

  /** The wagon stat's multiplier on every wagon's work. */
  wagonMul(w: World): number {
    return 1 + STATS.wagon.per * w.lv.wagon;
  }

  /** The heavy stat's multiplier on damage to a big bug, 1 on the rest. */
  heavyMul(w: World, e: Enemy): number {
    return w.lv.heavy && (e.tough || HEAVY_KINDS.includes(e.kind)) ? 1 + STATS.heavy.per * w.lv.heavy : 1;
  }

  /**
   * Enemies one volley hits, each with its own shot. Fractional: `volley` spends the carry so half a
   * target means the extra shot lands every other volley (§4.4).
   */
  shots(w: World): number {
    return 1 + STATS.multi.per * w.lv.multi;
  }

  /** This volley's whole target count: the floor, plus one when the carried fraction passes 1. */
  volley(w: World): number {
    const n = this.shots(w);
    const whole = Math.floor(n);
    this.extra += n - whole;
    if (this.extra < 1 - 1e-9) return whole;
    this.extra -= 1;
    return whole + 1;
  }

  /** Track speed in units per second: the move stat and the farmer's overdrive. */
  move(w: World): number {
    const boost = w.heroKind === 'farmer' && w.hero.buffT > 0 ? WATER.move : 0;
    return TRAIN.speed * (1 + STATS.move.per * w.lv.move + boost);
  }

  /** Damage per second against one target, crits averaged in; for the HUD and the bot. */
  dps(w: World): number {
    return (this.damage(w) * (1 + this.critChance(w) * (this.critMul(w) - 1)) * this.speedMul(w)) / TRAIN.interval;
  }

  // ---- the step -----------------------------------------------------------------------------

  /** Drive along the track, then fire when the gun is ready and something is in reach. */
  step(w: World): void {
    this.prev = this.angle;
    this.angle += (this.dir * this.move(w) * DT) / TRAIN.radius;
    this.shotT -= DT * this.speedMul(w);
    if (this.shotT > 0) return;
    this.shotT = this.shoot(w) ? TRAIN.interval : 0;
  }

  /** Fire at the enemies nearest the wall within reach of the train, air too. False when there is none. */
  private shoot(w: World): boolean {
    const { x, z } = trackPoint(this.angle);
    const range = this.range(w);
    const list = w.enemies.filter((e) => e.hp > 0 && inRange(e, x, z, range)).sort((a, b) => a.d - b.d || a.id - b.id);
    if (list.length === 0) return false;
    const base = this.damage(w);
    const poison = w.heroKind === 'beekeeper' ? POISON.share : 0;
    for (const e of list.slice(0, this.volley(w))) {
      // A bug the plasma wagon burned (Lv3) takes a crit; the draw is made either way, so the stream stays in step.
      const crit = this.crit.float() < this.critChance(w) || e.burnT > 0;
      const damage = crit ? base * this.critMul(w) : base;
      w.shots.add({
        id: w.nextId++, kind: 'hero', x, y: 1.2, z, px: x, py: 1.2, pz: z,
        targetId: e.id, tx: e.x, tz: e.z, damage, crit, poison: poison * damage,
      });
    }
    w.events.push({ t: 'fire', x, z, tx: list[0].x, tz: list[0].z, kind: 'hero' });
    return true;
  }
}
