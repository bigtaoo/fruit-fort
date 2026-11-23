// Shots in the air and what they do when they land: a hit, the splash stat, a wagon's blast, a mine
// left lying. Owns the shots in flight; World holds one and steps it. Split from combat.ts.

import { ARMOR_FLOOR, DT, POISON, PROJECTILE_SPEED, SPLASH, STATS, WAGONS } from './config';
import type { World } from './world';
import type { Enemy, Projectile } from './types';

/**
 * Can anything of the player's pick this bug as a target? Alive, and above the ground: a buried
 * digger (§9.5) is not in the game as far as the train, the wagons, the bees and every blast are
 * concerned. Everything that looks for something to hit asks this, so there is one place to read.
 */
export function hittable(e: Enemy): boolean {
  return e.hp > 0 && !e.buried;
}

export function inRange(e: Enemy, x: number, z: number, range: number): boolean {
  const dx = e.x - x;
  const dz = e.z - z;
  return dx * dx + dz * dz <= range * range;
}

export class Shots {
  /** The shots in the air: the train's and the wagons'. */
  list: Projectile[] = [];

  add(p: Projectile): void {
    this.list.push(p);
  }

  /** Damage one bug: the heavy stat, the frost wagon's frailty and its armor (less what acid ate) count. */
  hit(w: World, e: Enemy, amount: number): void {
    if (e.hp <= 0) return;
    e.hits++;
    amount *= w.train.heavyMul(w, e);
    if (e.frailT > 0) amount *= WAGONS.frost.frail;
    // A warden's field (§9.9) only stands against shots - this is the one place it is read, so the
    // beekeeper's bees and poison go straight through it. Killing the warden is the other answer.
    if (e.ward > 0) amount *= 1 - e.ward;
    const armor = Math.max(0, e.armor - e.corrode);
    e.hp -= Math.max(amount * ARMOR_FLOOR, amount - armor);
  }

  /** Damage every ground or air bug within r of (x, z) but `skip`; returns how many it hit. */
  blast(w: World, x: number, z: number, r: number, damage: number, skip?: Enemy): number {
    let n = 0;
    for (const e of w.enemies)
      if (e !== skip && hittable(e) && inRange(e, x, z, r)) {
        this.hit(w, e, damage);
        n++;
      }
    w.events.push({ t: 'boom', x, z, r });
    return n;
  }

  /** Fly every shot towards its target (its last place if it died) and land the ones that got there. */
  step(w: World): void {
    const keep = [];
    for (const p of this.list) {
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
      const t = w.enemyById.get(p.targetId);
      if (t && t.hp > 0) {
        p.tx = t.x;
        p.tz = t.z;
      }
      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      const dist = Math.hypot(dx, dz);
      const step = PROJECTILE_SPEED * DT;
      if (dist > step) {
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        p.y = 0.5 + Math.min(1, dist / 4);
        keep.push(p);
        continue;
      }
      this.land(w, p, t && t.hp > 0 ? t : undefined);
    }
    this.list = keep;
  }

  private land(w: World, p: Projectile, target?: Enemy): void {
    if (target) {
      if (p.poison > 0) {
        target.poison = Math.max(target.poison, p.poison);
        target.poisonT = POISON.time;
      }
      this.hit(w, target, p.damage);
    }
    // The splash stat: a train shot hurts the bugs round the one it hit, a share of its damage each.
    const splash = p.kind === 'hero' && w.lv.splash > 0 ? SPLASH.radius : undefined;
    if (splash) {
      const dmg = p.damage * STATS.splash.per * w.lv.splash;
      for (const e of w.enemies) if (e !== target && hittable(e) && inRange(e, p.tx, p.tz, splash)) this.hit(w, e, dmg);
    }
    w.events.push({ t: 'hit', x: p.tx, z: p.tz, kind: p.kind, crit: p.crit, splash });
    // Wagons (§10.1): a missile's or a mine's blast, and a Lv3 mine left lying there.
    // Only a mine whose blast hit nothing is left lying: one that hit has gone off.
    const hit = p.splash ? this.blast(w, p.tx, p.tz, p.splash.r, p.damage * p.splash.mul, target) : 0;
    if (p.linger && !hit && w.wg) w.wg.lay({ x: p.tx, z: p.tz, t: p.linger, damage: p.damage });
  }
}
