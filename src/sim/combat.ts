// Enemies walking and chewing the wall, the train picking targets and firing, projectiles landing.

import { ARMOR_FLOOR, DT, ENEMIES, META, POISON, PROJECTILE_SPEED, SNAIL, STATS, TRAIN, WATER } from './config';
import { trackPoint } from './board';
import type { World } from './world';
import type { Enemy, Projectile } from './types';

// ---- train stats, from the levels bought this run ---------------------------------------

/** One shot's damage before crit: the dmg stat multiplies, the village hero level adds. */
export function trainDamage(w: World): number {
  return TRAIN.damage * Math.pow(1 + STATS.dmg.per, w.lv.dmg) * (1 + TRAIN.perLevel * ((w.meta.heroLv ?? 1) - 1));
}

/** Attack speed multiplier: the spd stat and the farmer's water. */
export function trainSpeedMul(w: World): number {
  let mul = 1 + STATS.spd.per * w.lv.spd;
  if (w.heroKind === 'farmer' && w.hero.buffT > 0) mul += WATER.speed;
  return mul;
}

export function trainRange(w: World): number {
  return TRAIN.range + STATS.range.per * w.lv.range;
}

export function critChance(w: World): number {
  return STATS.crit.per * w.lv.crit;
}

/** Enemies one volley hits, each with its own shot. */
export function trainShots(w: World): number {
  return 1 + STATS.multi.per * w.lv.multi;
}

/** Track speed in units per second. */
export function trainMove(w: World): number {
  return TRAIN.speed * (1 + STATS.move.per * w.lv.move);
}

/** Damage per second against one target, crits averaged in; for the HUD and the bot. */
export function trainDps(w: World): number {
  return (trainDamage(w) * (1 + critChance(w) * (TRAIN.critMul - 1)) * trainSpeedMul(w)) / TRAIN.interval;
}

// ---- enemies ------------------------------------------------------------------------------

/** How fast this enemy walks now: its own pace, slowed, and held back by a snail just ahead. */
function pace(e: Enemy, snails: Enemy[]): number {
  let v = e.speed * e.slowMul;
  if (e.flying || e.kind === 'snail') return v;
  for (const s of snails) {
    if (s.d < e.d && s.d > 0 && inRange(e, s.x, s.z, SNAIL.radius)) v = Math.min(v, s.speed * s.slowMul);
  }
  return v;
}

export function stepEnemies(w: World): void {
  const snails = w.enemies.filter((e) => e.kind === 'snail' && e.hp > 0);
  for (const e of w.enemies) {
    e.px = e.x;
    e.pz = e.z;
    if (e.slowT > 0 && (e.slowT -= DT) <= 0) e.slowMul = 1;
    if (e.corrodeT > 0 && (e.corrodeT -= DT) <= 0) e.corrode = 0;
    if (e.poisonT > 0) {
      e.hp -= e.poison * DT;
      if ((e.poisonT -= DT) <= 0) e.poison = 0;
    }
    if (e.d > 0) {
      const step = Math.min(e.d, pace(e, snails) * DT);
      e.x += e.dirX * step;
      e.z += e.dirZ * step;
      e.d -= step;
    } else {
      w.wallHp -= ENEMIES[e.kind].wallDps * DT;
    }
  }
}

export function inRange(e: Enemy, x: number, z: number, range: number): boolean {
  const dx = e.x - x;
  const dz = e.z - z;
  return dx * dx + dz * dz <= range * range;
}

// ---- the train ----------------------------------------------------------------------------

/** Drive along the track, then fire when the gun is ready and something is in reach. */
export function stepTrain(w: World): void {
  const t = w.train;
  t.prev = t.angle;
  t.angle += (t.dir * trainMove(w) * DT) / TRAIN.radius;
  t.shotT -= DT * trainSpeedMul(w);
  if (t.shotT > 0) return;
  t.shotT = trainShoot(w) ? TRAIN.interval : 0;
}

/** Fire at the enemies nearest the wall within reach of the train, air too. False when there is none. */
function trainShoot(w: World): boolean {
  const { x, z } = trackPoint(w.train.angle);
  const range = trainRange(w);
  const list = w.enemies.filter((e) => e.hp > 0 && inRange(e, x, z, range)).sort((a, b) => a.d - b.d || a.id - b.id);
  if (list.length === 0) return false;
  const base = trainDamage(w);
  const poison = w.heroKind === 'beekeeper' ? POISON.share : 0;
  for (const e of list.slice(0, trainShots(w))) {
    const crit = w.critRng.float() < critChance(w);
    const damage = crit ? base * TRAIN.critMul : base;
    w.projectiles.push({
      id: w.nextId++, kind: 'hero', x, y: 1.2, z, px: x, py: 1.2, pz: z,
      targetId: e.id, tx: e.x, tz: e.z, damage, crit, poison: poison * damage,
    });
  }
  w.events.push({ t: 'fire', x, z, kind: 'hero' });
  return true;
}

export function damageEnemy(e: Enemy, amount: number): void {
  if (e.hp <= 0) return;
  const armor = Math.max(0, e.armor - e.corrode);
  e.hp -= Math.max(amount * ARMOR_FLOOR, amount - armor);
}

export function stepProjectiles(w: World): void {
  const keep = [];
  for (const p of w.projectiles) {
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
    land(w, p, t && t.hp > 0 ? t : undefined);
  }
  w.projectiles = keep;
}

function land(w: World, p: Projectile, target?: Enemy): void {
  if (target) {
    if (p.poison > 0) {
      target.poison = Math.max(target.poison, p.poison);
      target.poisonT = POISON.time;
    }
    damageEnemy(target, p.damage);
  }
  w.events.push({ t: 'hit', x: p.tx, z: p.tz, kind: p.kind, crit: p.crit });
}

/** Skill charge one kill of this enemy gives, with the village hero level. */
export function killCharge(w: World, e: Enemy): number {
  return ENEMIES[e.kind].charge * (1 + META.heroCharge * ((w.meta.heroLv ?? 1) - 1));
}
