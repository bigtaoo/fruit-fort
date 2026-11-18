// Bugs coming onto the field: a wave's spawn queue and its lead-in, the king's swarm, a mold's spores.
// Owns the queue and its own random stream; World holds one and asks it for bugs. Split from world.ts.

import { DT, ENEMIES, HP_GROWTH, endlessHp, LOCUST, MOLD, standOff } from './config';
import { approach } from './board';
import { LEAD_BUGS, type LevelDef } from './levels';
import { Prng } from './rng';
import { planWave, type Spawn } from './waves';
import type { World } from './world';
import type { Enemy, EnemyKind } from './types';

export class Spawner {
  /** The wave's bugs still to come, by seconds into the wave. */
  queue: Spawn[] = [];
  private readonly rng: Prng;

  constructor(seed: number) {
    this.rng = new Prng(seed * 2 + 1);
  }

  /** Queue wave `wave` (of level `lv`, or endless); true when it brings the boss. */
  plan(wave: number, lv: LevelDef | null): boolean {
    this.queue = planWave(wave, this.rng, lv ? { pool: lv.pool, fronts: lv.fronts, boss: wave === lv.waves, front: wave === 1 ? lv.open : undefined, swarm: lv.swarm, pace: wave <= (lv.paceTo ?? Infinity) ? lv.pace : undefined, tough: lv.tough && wave >= lv.tough.from && wave <= lv.tough.to ? lv.tough : undefined } : {});
    if (wave === 1 && lv?.lead) this.leadIn(lv.lead);
    return this.queue.some((s) => s.kind === 'boss');
  }

  /** Put on the field every queued bug due by `t` seconds into the wave. */
  release(w: World, t: number): void {
    while (this.queue.length > 0 && this.queue[0].at <= t) this.spawn(w, this.queue.shift()!);
  }

  /** The locust king calls a swarm from where it stands. */
  swarm(w: World): void {
    for (const e of [...w.enemies]) {
      if (e.kind !== 'boss' || e.hp <= 0 || (e.trickT -= DT) > 0) continue;
      e.trickT = LOCUST.every;
      for (let i = 0; i < LOCUST.count; i++) {
        const side = (i - (LOCUST.count - 1) / 2) * LOCUST.spread;
        this.behind(w, 'locust', e, 0, side, e.maxHp * LOCUST.hpShare);
      }
      w.events.push({ t: 'trick', x: e.x, z: e.z });
    }
  }

  /** Dead molds burst into spores where they fell. */
  spores(w: World, molds: Enemy[]): void {
    for (const m of molds) {
      for (let i = 0; i < MOLD.spores; i++) {
        const side = (i - (MOLD.spores - 1) / 2) * MOLD.spacing;
        this.behind(w, 'spore', m, 0, side, m.maxHp * MOLD.hpShare);
      }
    }
  }

  /** Wave 1's first LEAD_BUGS come now, walked in by `lead`, 2/3 and 1/3 of it; the rest keep their gaps after them. */
  private leadIn(lead: number): void {
    const queue = this.queue;
    const n = Math.min(LEAD_BUGS, queue.length);
    if (n === 0) return;
    const base = queue[n - 1].at;
    queue.forEach((s, i) => {
      if (i < n) {
        s.at = 0;
        s.lead = (lead * (n - i)) / n;
      } else s.at -= base;
    });
  }

  private spawn(w: World, s: Spawn): void {
    const p = approach(s.angle);
    if (s.lead) {
      p.x += p.dirX * s.lead;
      p.z += p.dirZ * s.lead;
      p.d -= s.lead;
    }
    const e = w.addEnemy(s.kind, p.x, p.z, p.dirX, p.dirZ, p.d, ENEMIES[s.kind].hp * (w.level ? Math.pow(HP_GROWTH, w.wave - 1) : endlessHp(w.wave)) * (w.mods.enemyHp ?? 1) * (w.level?.hp ?? 1) * (s.kind === 'boss' ? w.level?.boss ?? 1 : 1) * (s.tough ?? 1));
    e.tough = !!s.tough;
    if (s.kind === 'boss') e.trickT = LOCUST.every;
  }

  /** Same line as the parent, `back` further out, so children follow it in to the wall. */
  private behind(w: World, kind: EnemyKind, p: Enemy, back: number, side: number, hp: number): Enemy {
    // Sideways shift is perpendicular to the walk, so it barely changes the distance to the wall.
    const x = p.x - p.dirX * back - p.dirZ * side;
    const z = p.z - p.dirZ * back + p.dirX * side;
    const len = Math.hypot(x, z);
    return w.addEnemy(kind, x, z, -x / len, -z / len, p.d + standOff(p.kind) + back, hp);
  }
}
