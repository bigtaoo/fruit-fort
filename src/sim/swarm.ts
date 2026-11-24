// 场上的虫群：活着的虫、它们的 id，以及每一拍的走、钻、啃、收尸。
// 2026-11-24 从 world.ts 拆出来（tech.md §13.2）：这份名单是它自己的状态，World 每一拍叫它走一步，
// 和 Shots / Wagons / Tides 是同一个形状——方法拿 World 当上下文，不反过来替 World 存东西。
import { DT, ENEMIES, HERO, isBoss, MOLE, QUEEN, SNAIL, standOff, WARDEN } from './config';
import { WAVES, diggerSurface, waveBite, waveSpeed } from './wavedefs';
import { inRange } from './shots';
import { SAFE, biteMul, netted } from './levels';
import type { Enemy, EnemyKind } from './types';
import type { World } from './world';

export class Swarm {
  /** Everything alive on the field, in the order it arrived. */
  list: Enemy[] = [];
  /** The same bugs by id, so a shot in flight can find its target again. */
  byId = new Map<number, Enemy>();
  /** The bugs walk in (held at the guide's line), their status clocks run down, and the ones at the wall chew it. */
  walk(w: World): void {
    const snails = this.list.filter((e) => e.kind === 'snail' && e.hp > 0);
    // §9.9: the two auras. Both are read fresh every tick from whoever is alive, so nothing has to
    // be taken back when the bug carrying them dies - the field is simply not there the next tick.
    const queens = this.list.filter((e) => e.kind === 'queen' && e.hp > 0);
    const wardens = this.list.filter((e) => e.kind === 'warden' && e.hp > 0 && !e.buried);
    for (const e of this.list) {
      // A warden is never shielded, by itself or by another. Two of them standing together used to
      // cover each other, and a `guard` wave (a quarter wardens, so a dozen-odd of them walking as
      // one block) arrived at 45% reduction on top of armor 3 - a spike nothing in the dose table
      // could see. Shoot the teal one first has to stay the answer.
      e.ward = e.kind !== 'warden' && wardens.some((g) => inRange(e, g.x, g.z, WARDEN.radius)) ? WARDEN.cut : 0;
      e.px = e.x;
      e.pz = e.z;
      if (e.slowT > 0 && (e.slowT -= DT) <= 0) e.slowMul = 1;
      if (e.stunT > 0) e.stunT -= DT;
      if (e.corrodeT > 0 && (e.corrodeT -= DT) <= 0) e.corrode = 0;
      if (e.frailT > 0) e.frailT -= DT;
      if (e.burnT > 0) e.burnT -= DT;
      if (e.poisonT > 0) {
        e.hp -= e.poison * DT;
        if ((e.poisonT -= DT) <= 0) e.poison = 0;
      }
      if (isBoss(e.kind) && netted(w.level) && w.time - w.waveStart > SAFE.bossAfter) e.hp -= (e.maxHp / SAFE.bossFade) * DT;
      // A digger breaks ground once it is close enough (§9.5), and is an ordinary bug from then on.
      if (e.kind === 'mole') this.mole(w, e);
      else if (e.buried && e.d <= diggerSurface(w.wave)) {
        e.buried = false;
        w.events.push({ t: 'surface', x: e.x, z: e.z });
      }
      // The guide's hold (§12.2): a bug comes no closer than holdAt until the player acts.
      const room = w.holdAt === null ? e.d : e.d - w.holdAt;
      if (room > 0) {
        const step = Math.min(room, pace(e, snails, queens) * DT);
        e.x += e.dirX * step;
        e.z += e.dirZ * step;
        e.d -= step;
      } else if (e.d <= 0 && !e.buried) {
        // A mole underground (§9.9) does not chew: the dive buys it seconds nothing can touch, and
        // pays for them in seconds it is not eating. That trade is the whole kind.
        // A bomber does not chew (§9.5): it stands against the fence with its fuse lit and goes off
        // `bomber.fuse` seconds later for `bomber.blast` of the whole pool at once. Those seconds are
        // the point of the kind - it is 26 hp standing still inside everything's reach, so a train
        // that is keeping up shoots it off the fence and pays nothing, and a train that is swamped
        // pays all of it. The fence card does not answer it; killing things does.
        if (e.kind === 'bomber') {
          e.fuseT += DT;
          if (e.fuseT >= WAVES.bomber.fuse) {
            w.wallHp -= w.wallMax * WAVES.bomber.blast * (w.mods.bite ?? 1);
            w.events.push({ t: 'blast', x: e.x, z: e.z });
            e.hp = 0;
          }
        } else w.wallHp -= ENEMIES[e.kind].wallDps * biteMul(w.level, w.wallHp / w.wallMax) * waveBite(w.wave) * (w.mods.bite ?? 1) * DT;
        if (w.level?.safe) w.wallHp = Math.max(w.wallHp, SAFE.floor * w.wallMax);
      }
    }
  }

  /**
   * 巨型鼹鼠 (§9.9). It arrives underground and the distance brings it up (`trickT` is Infinity for
   * that first stretch); from then on its own clock dives it again every `MOLE.every` seconds for
   * `MOLE.under` of them. While it is down nothing can target it (`hittable`) and it does not chew,
   * so a boss fight against it is a row of windows instead of one long bar - the king asks whether
   * the adds can be cleared, the mole asks whether the damage can be spent while it is spendable.
   */
  private mole(w: World, e: Enemy): void {
    if (e.buried && e.trickT === Infinity) {
      if (e.d > MOLE.surfaceAt) return;
    } else if ((e.trickT -= DT) > 0) return;
    e.buried = !e.buried;
    e.trickT = e.buried ? MOLE.under : MOLE.every;
    if (!e.buried) w.events.push({ t: 'surface', x: e.x, z: e.z });
  }

  /** Take the dead off the field: their gold and charge paid, a mold's spores let loose. */
  reap(w: World): void {
    if (!this.list.some((e) => e.hp <= 0)) return;
    // On a level with a safety net the boss's locusts die with it (2026-11-06: a player who barely
    // bought was left with ~60 locusts to shoot one by one, ~8 minutes, after the boss fell). Since
    // 2026-11-14 this follows the net rather than `safe`: the net keeps a weak player alive on 1-8 to
    // 2-3, so without it their boss wave was a stalemate - scripts/ladder.ts measured a player who
    // buys nothing at 11-15 minutes on 1-8..1-10, a won fight that will not end, which is the shape
    // the telemetry says they quit on.
    const boss = (alive: boolean) => this.list.some((e) => isBoss(e.kind) && e.hp > 0 === alive);
    if (netted(w.level) && boss(false) && !boss(true)) for (const e of this.list) if (e.kind === 'locust') e.hp = 0;
    const alive: Enemy[] = [];
    for (const e of this.list) {
      if (e.hp > 0) {
        alive.push(e);
        continue;
      }
      this.byId.delete(e.id);
      // A bomber that went off (§9.5) is not a kill: no gold, no charge, nothing fed to a wagon and
      // no death for the view to draw - the blast was its ending.
      if (e.kind === 'bomber' && e.fuseT >= WAVES.bomber.fuse) continue;
      const paid = ENEMIES[e.kind].gold * (e.tough ? 2 : 1) * w.incomeMul() * (w.wg?.goldMul(w) ?? 1);
      w.gold += paid;
      w.kills++;
      w.hero.charge = Math.min(HERO.chargeMax, w.hero.charge + w.killCharge(e));
      w.wg?.feed(e);
      w.events.push({ t: 'kill', x: e.x, z: e.z, kind: e.kind, gold: Math.round(paid) });
    }
    const molds = this.list.filter((e) => e.hp <= 0 && e.kind === 'mold');
    this.list = alive;
    w.spawner.spores(w, molds);
  }

  /** Put an enemy on the field walking towards the centre, `d` short of the wall; it stops `standOff` before it. */
  add(w: World, kind: EnemyKind, x: number, z: number, dirX: number, dirZ: number, d: number, hp: number): Enemy {
    const def = ENEMIES[kind];
    const e: Enemy = {
      id: w.nextId++, kind, dirX, dirZ, x, z, px: x, pz: z,
      hp, maxHp: hp, speed: def.speed * (w.mods.enemySpeed ?? 1) * waveSpeed(w.wave), armor: def.armor, flying: def.flying,
      d: d - standOff(kind), slowMul: 1, slowT: 0, stunT: 0, corrode: 0, corrodeT: 0, poison: 0, poisonT: 0, hits: 0, trickT: 0, frailT: 0, burnT: 0, tough: false, buried: kind === 'digger' || kind === 'mole', fuseT: 0, ward: 0,
    };
    this.list.push(e);
    this.byId.set(e.id, e);
    return e;
  }
}

/**
 * How fast this enemy walks now: its own pace, slowed, hurried by a queen near it (§9.9), a mole
 * under the ground digging faster than it walks, and held back by a snail just ahead.
 */
function pace(e: Enemy, snails: Enemy[], queens: Enemy[]): number {
  if (e.stunT > 0) return 0;
  let v = e.speed * e.slowMul;
  if (e.kind === 'mole' && e.buried) v *= MOLE.dig;
  // The queen hurries herself too: she is the slowest thing in the game without it.
  if (queens.some((q) => inRange(e, q.x, q.z, QUEEN.radius))) v *= QUEEN.speed;
  if (e.flying || e.kind === 'snail') return v;
  for (const s of snails) {
    if (s.d + standOff(s.kind) < e.d + standOff(e.kind) && s.d > 0 && inRange(e, s.x, s.z, SNAIL.radius)) v = Math.min(v, s.stunT > 0 ? 0 : s.speed * s.slowMul);
  }
  return v;
}
