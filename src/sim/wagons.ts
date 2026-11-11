// Wagons (§10.1, docs/design/wagons.md): kills charge the train, a full charge stops the fight for a
// pick of three, and each picked wagon rides behind the engine with an attack of its own.

import { DT, ENEMIES, HERO, TRAIN, WAGONS, WALL } from './config';
import { trackPoint } from './board';
import { blast, damageEnemy, inRange, trainDamage, trainRange, wagonMul } from './combat';
import { Prng } from './rng';
import type { Enemy, WagonKind, WagonOpt } from './types';
import type { World } from './world';

export const WAGON_KINDS: WagonKind[] = ['arc', 'missile', 'frost', 'plasma', 'mine', 'magnet'];
/** The first pick always shows these: the plainest to see (lightning, a missile, bugs slowing). */
const FIRST: WagonKind[] = ['arc', 'missile', 'frost'];

/**
 * The card taken for a player who does not choose: a repair when the fence is low, else an upgrade
 * (the wagon already on the board gets visibly stronger), else a new wagon, else a supply that works.
 * Neutral among kinds: the first of each sort as dealt, no wagon is favoured.
 */
export function fallback(w: World, opts: WagonOpt[]): number {
  const supply = (k: WagonOpt['kind']) => k === 'gold' || k === 'repair' || k === 'skill';
  const rank = (o: WagonOpt) => (o.kind === 'repair' && w.wallHp < w.wallMax * 0.4 ? 4 : supply(o.kind) ? (o.kind === 'gold' ? 0 : 1) : o.lv > 1 ? 3 : 2);
  return opts.reduce((best, o, i) => (rank(o) > rank(opts[best]) ? i : best), 0);
}

export interface Wagon {
  kind: WagonKind;
  lv: number;
  /** Seconds to its next attack. */
  t: number;
}

export interface Offer {
  opts: WagonOpt[];
  /** Seconds left before the clock takes the `def` card for the player. */
  t: number;
  /** Which pick of the run this is, from 1. */
  n: number;
  /** The card the clock takes: the one a player who does not choose most likely wants (`fallback`). */
  def: number;
}

interface Mine {
  x: number;
  z: number;
  t: number;
  damage: number;
}

export class Wagons {
  list: Wagon[] = [];
  /** Charge towards the next pick, and that pick's cost. */
  charge = 0;
  picks = 0;
  offer: Offer | null = null;
  /** Frost on the ground: where, how long it stays. */
  frost: { x: number; z: number; t: number }[] = [];
  /** Lv3 mines lying where they burst, waiting for a bug. */
  mines: Mine[] = [];
  private frostT = 0;
  /** Scratch list for an attack's bugs in reach. */
  private near: Enemy[] = [];
  private readonly rng: Prng;

  /** The kinds a pick may deal: the ones unlocked in the base (§10.1.12). */
  private readonly kinds: readonly WagonKind[];

  constructor(seed: number, kinds: readonly WagonKind[] = WAGON_KINDS) {
    this.rng = new Prng(seed * 7 + 3);
    this.kinds = WAGON_KINDS.filter((k) => kinds.includes(k));
  }

  /** What the next charge-earned pick costs. */
  need(): number {
    return WAGONS.charge * Math.pow(WAGONS.growth, this.charged);
  }

  /** Picks opened by charge (not by a basket), so a basket does not raise the next cost. */
  private charged = 0;

  lv(kind: WagonKind): number {
    return this.list.find((g) => g.kind === kind)?.lv ?? 0;
  }

  /**
   * A kill's charge: the bug's base gold, never scaled by the gold stat or endless growth. The pick
   * itself waits for the next tick's `step`, after the waves: a last kill that wins the level, or a
   * fence that falls on the same tick (`due` checks it, `over` is only set after), ends the run
   * instead of opening a pick nobody can use.
   */
  feed(e: Enemy): void {
    this.charge += ENEMIES[e.kind].gold * (e.tough ? 2 : 1);
  }

  /** Fight time before which a charge may not open a pick: the first minute, then `apart` after each pick. */
  private next: number = WAGONS.firstAt;

  /** Fight time of the last pick (null before any): the leave event says how long ago it was. */
  lastAt: number | null = null;

  /** Basket picks not yet dealt: a basket in the first minute, or while (or just after) another pick is up, waits its turn. */
  owed = 0;

  /** A basket's pick: dealt by the next `step` the rules allow (the first minute is over, the last pick far enough back). */
  owe(): void {
    this.owed++;
  }

  /** Open the next pick if one is owed or the charge is full (and the first minute, or the last pick, is far enough back). */
  due(w: World): void {
    if (this.offer || w.over || w.wallHp <= 0 || w.time < this.next) return;
    if (this.owed > 0) this.owed--;
    else if (this.charge >= this.need()) {
      this.charge -= this.need();
      this.charged++;
    } else return;
    this.open(w);
  }

  /** Stop the fight and deal the cards. */
  open(w: World): void {
    if (this.offer) return;
    const opts = this.deal(w);
    this.offer = { opts, t: WAGONS.autoPick, n: this.picks + 1, def: fallback(w, opts) };
    // Every wagon at Lv3 with a whole fence and a full skill leaves only gold: no choice, so it is
    // paid at once instead of stopping the fight for one card (`wagon_pick_paid_gold`, no offer).
    if (opts.length < 2) return void this.pick(w, 0, true);
    w.events.push({ t: 'offer', n: this.offer.n, opts });
  }

  private deal(w: World): WagonOpt[] {
    const rng = this.rng;
    const count = this.lv('magnet') >= 3 ? 4 : 3;
    const shuffle = <T>(a: T[]): T[] => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    // The first pick: the plainest three, topped up from the others unlocked if one is not.
    const first = [...FIRST.filter((k) => this.kinds.includes(k)), ...this.kinds.filter((k) => !FIRST.includes(k))].slice(0, 3);
    if (this.list.length === 0 && this.picks === 0 && first.length) return shuffle(first).map((kind) => ({ kind, lv: 1 }));
    const news: WagonOpt[] = this.list.length >= WAGONS.max ? [] : this.kinds.filter((k) => this.lv(k) === 0).map((kind) => ({ kind, lv: 1 }));
    const ups: WagonOpt[] = this.list.filter((g) => g.lv < WAGONS.maxLv).map((g) => ({ kind: g.kind, lv: g.lv + 1 }));
    shuffle(news);
    shuffle(ups);
    const out: WagonOpt[] = [];
    // At least one new wagon and one upgrade while both exist; the rest from either.
    if (news.length) out.push(news.shift()!);
    if (ups.length) out.push(ups.shift()!);
    const rest = shuffle([...news, ...ups]);
    while (out.length < count && rest.length) out.push(rest.shift()!);
    // Only supplies that do something: no repair for a whole fence, no charge for a full skill.
    const supply: WagonOpt[] = [{ kind: 'gold', lv: 0 }];
    if (w.wallHp < w.wallMax) supply.push({ kind: 'repair', lv: 0 });
    if (w.hero.charge < HERO.chargeMax) supply.push({ kind: 'skill', lv: 0 });
    shuffle(supply);
    while (out.length < count && supply.length) out.push(supply.shift()!);
    return shuffle(out);
  }

  /** The player (or the clock) takes card i. */
  pick(w: World, i: number, auto = false): boolean {
    const o = this.offer;
    if (!o || i < 0 || i >= o.opts.length) return false;
    const opt = o.opts[i];
    this.offer = null;
    this.picks++;
    if (opt.kind === 'gold') w.gold += WAGONS.supplyGold * w.statCost('dmg');
    else if (opt.kind === 'repair') w.wallHp = w.wallMax;
    else if (opt.kind === 'skill') w.hero.charge = HERO.chargeMax;
    else {
      const g = this.list.find((x) => x.kind === opt.kind);
      if (g) g.lv = opt.lv;
      else this.list.push({ kind: opt.kind, lv: 1, t: 0.5 + 0.4 * this.list.length });
    }
    w.events.push({ t: 'pick', n: o.n, opt, auto, wait: Math.round((WAGONS.autoPick - o.t) * 10) / 10 });
    // A charge that filled meanwhile (say, under a basket's pick) waits: never two picks back to back.
    this.next = Math.max(this.next, w.time + WAGONS.apart);
    this.lastAt = w.time;
    return true;
  }

  /** While cards are up the fight stands still: only the auto-pick clock runs. */
  wait(w: World): void {
    const o = this.offer!;
    if ((o.t -= DT) <= 0) this.pick(w, o.def, true);
  }

  /** Charge filled, 0..1, for the HUD. */
  fill(): number {
    return Math.min(1, this.charge / this.need());
  }

  /** May a full charge open a pick now? Not in the first minute, nor within `apart` of the last pick. */
  ready(w: World): boolean {
    return w.time >= this.next;
  }

  // ---- the wagons at work ---------------------------------------------------------------

  /** Where wagon i rides: behind the engine, on the side it came from (the view smooths a reversal). */
  angle(w: World, i: number, side: number = w.train.dir): number {
    return w.train.angle - (side * (WAGONS.first + WAGONS.gap * i)) / TRAIN.radius;
  }

  step(w: World): void {
    this.due(w);
    let n = 0;
    for (const m of this.frost) if ((m.t -= DT) > 0) this.frost[n++] = m;
    this.frost.length = n;
    this.stepMines(w);
    this.list.forEach((g, i) => {
      const at = trackPoint(this.angle(w, i));
      if (g.kind === 'frost') this.chill(w, g, at);
      if (g.kind === 'magnet' || (g.t -= DT) > 0) return;
      g.t += this.attack(w, g, at);
    });
  }

  /** One attack; returns seconds to the next. */
  private attack(w: World, g: Wagon, at: { x: number; z: number }): number {
    const lv = g.lv - 1;
    const base = trainDamage(w) * wagonMul(w);
    // Idle wagons re-check every tick: the bugs in reach go into a reused list, nothing is built when there are none.
    const near = (reach: number, flying = true): Enemy[] => {
      const out = this.near;
      out.length = 0;
      for (const e of w.enemies) if (e.hp > 0 && (flying || !e.flying) && inRange(e, at.x, at.z, reach)) out.push(e);
      return out;
    };
    switch (g.kind) {
      case 'arc': {
        const C = WAGONS.arc;
        const inReach = near(trainRange(w));
        if (inReach.length === 0) return DT;
        const hit = inReach.sort((a, b) => a.d - b.d || a.id - b.id).slice(0, C.targets[lv]);
        for (const e of hit) {
          damageEnemy(w, e, base * C.mul[lv]);
          if (g.lv >= 3) e.stunT = Math.max(e.stunT, C.stun);
        }
        w.events.push({ t: 'zap', x: at.x, z: at.z, to: hit.map((e) => ({ x: e.x, z: e.z })) });
        return C.every;
      }
      case 'missile': {
        const C = WAGONS.missile;
        const d = (e: Enemy) => Math.hypot(e.x - at.x, e.z - at.z);
        const inReach = near(C.reach);
        if (inReach.length === 0) return DT;
        const far = inReach.sort((a, b) => d(b) - d(a) || a.id - b.id).slice(0, C.count[lv]);
        for (const e of far) this.launch(w, 'missile', at, e, base * C.mul, g.lv >= 3 ? { r: C.splash, mul: C.splashMul } : undefined);
        return C.every;
      }
      case 'plasma': {
        const C = WAGONS.plasma;
        const dmg = base * C.perSec[lv] * C.every;
        const hit = near(C.reach);
        // Nothing in reach: no jets, and it fires the moment a bug comes in.
        if (hit.length === 0) return DT;
        for (const e of hit) {
          damageEnemy(w, e, dmg);
          if (g.lv >= 3) e.burnT = C.burn;
        }
        // The view jets flame at a few of them (the rest burn all the same).
      w.events.push({ t: 'burn', x: at.x, z: at.z, r: C.reach, to: hit.slice(0, 4).map((e) => ({ x: e.x, z: e.z })) });
        return C.every;
      }
      case 'mine': {
        const C = WAGONS.mine;
        const piles = this.piles(near(Infinity, false), C.count[lv]);
        if (piles.length === 0) return DT;
        for (const e of piles) this.launch(w, 'mine', at, e, base * C.mul, { r: C.radius, mul: 1 }, g.lv >= 3 ? C.linger : undefined);
        return C.every;
      }
      default:
        return 1;
    }
  }

  /** The bugs at the heart of the biggest piles at the fence (else the ones nearest it), one per pile. */
  private piles(live: Enemy[], n: number): Enemy[] {
    if (live.length === 0) return live; // idle between waves: nothing built
    const r = WAGONS.mine.radius;
    const near = live.filter((e) => !e.flying).sort((a, b) => a.d - b.d || a.id - b.id).slice(0, 24);
    const score = new Map(near.map((e) => [e, near.filter((o) => inRange(o, e.x, e.z, r)).length - e.d]));
    const out: Enemy[] = [];
    for (const e of [...near].sort((a, b) => score.get(b)! - score.get(a)! || a.id - b.id)) {
      if (out.length >= n) break;
      if (out.every((o) => !inRange(o, e.x, e.z, r))) out.push(e);
    }
    return out;
  }

  private launch(w: World, kind: 'missile' | 'mine', at: { x: number; z: number }, e: Enemy, damage: number, splash?: { r: number; mul: number }, linger?: number): void {
    w.projectiles.push({
      id: w.nextId++, kind, x: at.x, y: 1, z: at.z, px: at.x, py: 1, pz: at.z,
      // A mine is thrown at a spot, a missile follows its bug.
      targetId: kind === 'mine' ? -1 : e.id, tx: e.x, tz: e.z, damage, crit: false, poison: 0, splash, linger,
    });
  }

  /** Lay frost on the bugs' side of the fence, beside the wagon, and slow whatever stands in any. */
  private chill(w: World, g: Wagon, at: { x: number; z: number }): void {
    const C = WAGONS.frost;
    const lv = g.lv - 1;
    if ((this.frostT -= DT) <= 0) {
      this.frostT = C.every;
      const len = Math.hypot(at.x, at.z) || 1;
      const p = { x: (at.x / len) * C.out, z: (at.z / len) * C.out, t: C.life[lv] * wagonMul(w) };
      this.frost.push(p);
      w.events.push({ t: 'frost', x: p.x, z: p.z, r: C.radius, life: p.t });
    }
    const slow = 1 - C.slow[lv];
    for (const e of w.enemies) {
      if (e.flying || e.d > C.out + C.radius - WALL || !this.inFrost(e)) continue;
      if (e.slowMul > slow) e.slowMul = slow;
      e.slowT = Math.max(e.slowT, 0.2);
      if (g.lv >= 3) e.frailT = Math.max(e.frailT, 0.2);
    }
  }

  private inFrost(e: Enemy): boolean {
    for (const p of this.frost) if (inRange(e, p.x, p.z, WAGONS.frost.radius)) return true;
    return false;
  }

  /** Lying mines go off under the first bug on foot, or run out; the list is kept in place, tick after tick. */
  private stepMines(w: World): void {
    const C = WAGONS.mine;
    let n = 0;
    for (const m of this.mines) {
      const touch = w.enemies.some((e) => e.hp > 0 && !e.flying && inRange(e, m.x, m.z, C.touch));
      if (touch) blast(w, m.x, m.z, C.radius, m.damage);
      if (!touch && (m.t -= DT) > 0) this.mines[n++] = m;
    }
    this.mines.length = n;
  }

  /** Magnet: extra kill gold, as a multiplier. */
  goldMul(w: World): number {
    const lv = this.lv('magnet');
    return lv ? 1 + WAGONS.magnet.gold[lv - 1] * wagonMul(w) : 1;
  }

  /** Magnet: does the wagon pull in an event at this track angle? */
  pulls(w: World, angle: number): boolean {
    const i = this.list.findIndex((g) => g.kind === 'magnet');
    if (i < 0) return false;
    const reach = WAGONS.magnet.reach[this.list[i].lv - 1];
    const a = trackPoint(this.angle(w, i));
    const b = trackPoint(angle);
    return Math.hypot(a.x - b.x, a.z - b.z) <= reach;
  }
}
