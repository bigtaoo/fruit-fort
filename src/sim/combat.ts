// Enemies walking and chewing the wall, fruits picking targets and firing, projectiles landing.

import { ARMOR_FLOOR, DT, FRUITS, LEVEL_DAMAGE_MUL, MERGE_BURST, POWER_STEP, PROJECTILE_SPEED, ENEMIES, HERO, seedCount } from './config';
import { cellX, cellZ, isCorner, neighbours } from './board';
import type { World } from './world';
import type { Enemy, Fruit, FruitKind } from './types';

export function fruitDamage(w: World, f: Fruit): number {
  return FRUITS[f.kind].damage * Math.pow(LEVEL_DAMAGE_MUL, f.level - 1) * (1 + POWER_STEP * w.power[f.kind]);
}

/** Attack speed multiplier for the fruit in this cell: hero buff plus adjacent grapes. */
export function speedMul(w: World, cell: number): number {
  let mul = 1;
  if (w.hero.buffT > 0) mul += HERO.buffSpeed;
  for (const n of neighbours(cell)) {
    const g = w.cells[n];
    const aura = g && FRUITS[g.kind].aura;
    if (g && aura) mul += aura.base + aura.perLevel * (g.level - 1);
  }
  return mul;
}

export function stepEnemies(w: World): void {
  for (const e of w.enemies) {
    e.px = e.x;
    e.pz = e.z;
    if (e.slowT > 0 && (e.slowT -= DT) <= 0) e.slowMul = 1;
    if (e.corrodeT > 0 && (e.corrodeT -= DT) <= 0) e.corrode = 0;
    if (e.d > 0) {
      const step = Math.min(e.d, e.speed * e.slowMul * DT);
      e.x += e.dirX * step;
      e.z += e.dirZ * step;
      e.d -= step;
    } else {
      w.wallHp -= ENEMIES[e.kind].wallDps * DT;
    }
  }
}

function inRange(e: Enemy, x: number, z: number, range: number): boolean {
  const dx = e.x - x;
  const dz = e.z - z;
  return dx * dx + dz * dz <= range * range;
}

/** Enemies this fruit can hit, best target first. */
function targets(w: World, cell: number, kind: FruitKind): Enemy[] {
  const def = FRUITS[kind];
  const x = cellX(cell);
  const z = cellZ(cell);
  const out = w.enemies.filter((e) => e.hp > 0 && (def.antiAir || !e.flying) && inRange(e, x, z, def.range));
  if (def.heaviest) out.sort((a, b) => b.hp - a.hp || a.id - b.id);
  else out.sort((a, b) => a.d - b.d || a.id - b.id);
  return out;
}

export function stepFruits(w: World): void {
  for (let cell = 0; cell < 9; cell++) {
    const f = w.cells[cell];
    if (!f) continue;
    f.cooldown -= DT * speedMul(w, cell);
    if (f.cooldown > 0) continue;
    const list = targets(w, cell, f.kind);
    if (list.length === 0) {
      f.cooldown = 0;
      continue;
    }
    const def = FRUITS[f.kind];
    f.cooldown += def.interval;
    const shots = f.kind === 'strawberry' ? Math.min(list.length, seedCount(f.level)) : 1;
    const splash = def.splash ? (isCorner(cell) ? def.splashCorner ?? def.splash : def.splash) : 0;
    for (let i = 0; i < shots; i++) {
      const t = list[i];
      w.projectiles.push({
        id: w.nextId++, kind: f.kind, level: f.level,
        x: cellX(cell), y: 1, z: cellZ(cell), px: cellX(cell), py: 1, pz: cellZ(cell),
        targetId: t.id, tx: t.x, tz: t.z, damage: fruitDamage(w, f), splash,
      });
    }
  }
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
    land(w, p.kind, p.level, p.tx, p.tz, p.damage, p.splash, t && t.hp > 0 ? t : undefined);
  }
  w.projectiles = keep;
}

function land(w: World, kind: FruitKind, level: number, x: number, z: number, damage: number, splash: number, target?: Enemy): void {
  const def = FRUITS[kind];
  const hit: Enemy[] = [];
  if (splash > 0) {
    for (const e of w.enemies) if (e.hp > 0 && !e.flying && inRange(e, x, z, splash)) hit.push(e);
  } else if (target) {
    hit.push(target);
  }
  for (const e of hit) {
    if (def.slow) {
      e.slowMul = Math.min(e.slowMul, def.slow.mul);
      e.slowT = def.slow.time;
    }
    if (def.corrode) {
      e.corrode = Math.max(e.corrode, def.corrode.perLevel * level);
      e.corrodeT = def.corrode.time;
    }
    damageEnemy(e, damage);
  }
  w.events.push({ t: 'hit', x, z, r: splash, kind });
}

/** The burst a fresh merge throws at the nearest enemy group. */
export function mergeBurst(w: World, cell: number, f: Fruit): void {
  const x = cellX(cell);
  const z = cellZ(cell);
  let best: Enemy | undefined;
  let bestD = MERGE_BURST.reach * MERGE_BURST.reach;
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) return;
  const dmg = fruitDamage(w, f) * MERGE_BURST.mul;
  for (const e of w.enemies) if (e.hp > 0 && inRange(e, best.x, best.z, MERGE_BURST.radius)) damageEnemy(e, dmg);
  w.events.push({ t: 'burst', x: best.x, z: best.z, r: MERGE_BURST.radius });
}
