// Enemies walking and chewing the wall, fruits picking targets and firing, projectiles landing.

import { ARMOR_FLOOR, CARD, DT, FRUITS, HERO, LEVEL_DAMAGE_MUL, MERGE_BURST, META, PROJECTILE_SPEED, ENEMIES, POISON, SNAIL, WATER, seedCount } from './config';
import { HERO_CELL, cellX, cellZ, isCorner, neighbours } from './board';
import type { World } from './world';
import type { Enemy, Fruit, FruitKind, Projectile } from './types';

export function fruitDamage(w: World, f: Fruit): number {
  const meta = 1 + META.fruitDmg * ((w.meta.fruitLv?.[f.kind] ?? 1) - 1);
  return FRUITS[f.kind].damage * Math.pow(LEVEL_DAMAGE_MUL, f.level - 1) * (1 + CARD.dmg * w.boost[f.kind].dmg) * meta;
}

/** Attack speed multiplier for the fruit in this cell: hero buff, cards and adjacent grapes. */
export function speedMul(w: World, cell: number): number {
  const f = w.cells[cell];
  let mul = 1 + CARD.allSpeed * w.allSpeed + (f ? CARD.spd * w.boost[f.kind].spd : 0);
  if (w.heroKind === 'farmer' && w.hero.buffT > 0) mul += WATER.speed;
  for (const n of neighbours(cell)) {
    const g = w.cells[n];
    const aura = g && FRUITS[g.kind].aura;
    if (g && aura) mul += aura.base + aura.perLevel * (g.level - 1) + CARD.aura * w.boost[g.kind].aura;
  }
  return mul;
}

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
  const out = w.enemies.filter((e) => e.hp > 0 && (def.antiAir || !e.flying) && inRange(e, x, z, def.range + CARD.rng * w.boost[kind].rng));
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
    const poison = w.heroKind === 'beekeeper' && neighbours(cell).includes(HERO_CELL) ? POISON.share : 0;
    const splash = (def.splash ? (isCorner(cell) ? def.splashCorner ?? def.splash : def.splash) : 0) * (1 + CARD.aoe * w.boost[f.kind].aoe);
    for (let i = 0; i < shots; i++) {
      const t = list[i];
      w.projectiles.push({
        id: w.nextId++, kind: f.kind, level: f.level,
        x: cellX(cell), y: 1, z: cellZ(cell), px: cellX(cell), py: 1, pz: cellZ(cell),
        targetId: t.id, tx: t.x, tz: t.z, damage: fruitDamage(w, f), splash, poison: poison * fruitDamage(w, f),
      });
    }
    w.events.push({ t: 'fire', cell, kind: f.kind });
  }
}

/** The hero's damage now: it grows with the waves and the hero's level, so it keeps mattering. */
export function heroDamage(w: World): number {
  return HERO.damage * Math.pow(HERO.waveGrowth, Math.max(0, w.wave - 1)) * (1 + HERO.perLevel * ((w.meta.heroLv ?? 1) - 1));
}

/** The hero fires at the enemy nearest the wall in reach, air included. False when there is none. */
export function heroShoot(w: World): boolean {
  let t: Enemy | undefined;
  for (const e of w.enemies) {
    if (e.hp > 0 && inRange(e, 0, 0, HERO.range) && (!t || e.d < t.d || (e.d === t.d && e.id < t.id))) t = e;
  }
  if (!t) return false;
  const x = cellX(HERO_CELL);
  const z = cellZ(HERO_CELL);
  w.projectiles.push({
    id: w.nextId++, kind: 'hero', level: 1, x, y: 1.4, z, px: x, py: 1.4, pz: z,
    targetId: t.id, tx: t.x, tz: t.z, damage: heroDamage(w), splash: 0, poison: 0,
  });
  w.events.push({ t: 'fire', cell: HERO_CELL, kind: 'hero' });
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
  const { kind, level, tx: x, tz: z, damage, splash } = p;
  const def = kind === 'hero' ? null : FRUITS[kind];
  const hit: Enemy[] = [];
  if (splash > 0) {
    for (const e of w.enemies) if (e.hp > 0 && !e.flying && inRange(e, x, z, splash)) hit.push(e);
  } else if (target) {
    hit.push(target);
  }
  for (const e of hit) {
    if (def?.slow && kind !== 'hero') {
      e.slowMul = Math.min(e.slowMul, def.slow.mul);
      e.slowT = def.slow.time + CARD.slow * w.boost[kind].slow;
    }
    if (def?.corrode) {
      e.corrode = Math.max(e.corrode, def.corrode.perLevel * level);
      e.corrodeT = def.corrode.time;
    }
    if (p.poison > 0) {
      e.poison = Math.max(e.poison, p.poison);
      e.poisonT = POISON.time;
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
