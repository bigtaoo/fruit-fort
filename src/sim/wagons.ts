// Wagons (§10.1, docs/design/wagons.md): kills charge the train, a full charge stops the fight for a
// pick of three, and each picked wagon rides behind the engine with an attack of its own.

import { DT, ENEMIES, HERO, TRAIN, WAGONS, WALL } from './config';
import { trackPoint } from './board';
import { blast, damageEnemy, inRange, trainDamage, trainRange } from './combat';
import { Prng } from './rng';
import type { Enemy, WagonKind, WagonOpt } from './types';
import type { World } from './world';

export const WAGON_KINDS: WagonKind[] = ['arc', 'missile', 'frost', 'plasma', 'mine', 'magnet'];
/** The first pick always shows these: the plainest to see (lightning, a missile, bugs slowing). */
const FIRST: WagonKind[] = ['arc', 'missile', 'frost'];

export interface Wagon {
  kind: WagonKind;
  lv: number;
  /** Seconds to its next attack. */
  t: number;
}

export interface Offer {
  opts: WagonOpt[];
  /** Seconds left before the first card is picked for the player. */
  t: number;
  /** Which pick of the run this is, from 1. */
  n: number;
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
  private readonly rng: Prng;

  constructor(seed: number) {
    this.rng = new Prng(seed * 7 + 3);
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

  /** A kill's charge: the bug's base gold, never scaled by the gold stat or endless growth. */
  feed(w: World, e: Enemy): void {
    this.charge += ENEMIES[e.kind].gold * (e.tough ? 2 : 1);
    this.due(w);
  }

  /** Fight time before which a charge may not open a pick: the first minute, then `apart` after each pick. */
  private next: number = WAGONS.firstAt;

  /** Basket picks not yet dealt: a basket in the first minute, or while (or just after) another pick is up, waits its turn. */
  owed = 0;

  /** A basket's pick: dealt as soon as the rules allow (the first minute is over, the last pick far enough back). */
  owe(w: World): void {
    this.owed++;
    this.due(w);
  }

  /** Open the next pick if one is owed or the charge is full (and the first minute, or the last pick, is far enough back). */
  due(w: World): void {
    if (this.offer || w.time < this.next) return;
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
    const opts = this.deal();
    this.offer = { opts, t: WAGONS.autoPick, n: this.picks + 1 };
    w.events.push({ t: 'offer', n: this.offer.n, opts });
  }

  private deal(): WagonOpt[] {
    const rng = this.rng;
    const count = this.lv('magnet') >= 3 ? 4 : 3;
    const shuffle = <T>(a: T[]): T[] => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    if (this.list.length === 0 && this.picks === 0) return shuffle([...FIRST]).map((kind) => ({ kind, lv: 1 }));
    const news: WagonOpt[] = this.list.length >= WAGONS.max ? [] : WAGON_KINDS.filter((k) => this.lv(k) === 0).map((kind) => ({ kind, lv: 1 }));
    const ups: WagonOpt[] = this.list.filter((g) => g.lv < WAGONS.maxLv).map((g) => ({ kind: g.kind, lv: g.lv + 1 }));
    shuffle(news);
    shuffle(ups);
    const out: WagonOpt[] = [];
    // At least one new wagon and one upgrade while both exist; the rest from either.
    if (news.length) out.push(news.shift()!);
    if (ups.length) out.push(ups.shift()!);
    const rest = shuffle([...news, ...ups]);
    while (out.length < count && rest.length) out.push(rest.shift()!);
    const supply: WagonOpt[] = [{ kind: 'gold', lv: 0 }, { kind: 'repair', lv: 0 }, { kind: 'skill', lv: 0 }];
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
    return true;
  }

  /** While cards are up the fight stands still: only the auto-pick clock runs. */
  wait(w: World): void {
    const o = this.offer!;
    if ((o.t -= DT) <= 0) this.pick(w, 0, true);
  }

  /** Charge filled, 0..1, for the HUD. */
  fill(): number {
    return Math.min(1, this.charge / this.need());
  }

  // ---- the wagons at work ---------------------------------------------------------------

  /** Where wagon i rides: behind the engine, on the side it came from (the view smooths a reversal). */
  angle(w: World, i: number, side: number = w.train.dir): number {
    return w.train.angle - (side * (WAGONS.first + WAGONS.gap * i)) / TRAIN.radius;
  }

  step(w: World): void {
    this.due(w);
    this.frost = this.frost.filter((m) => (m.t -= DT) > 0);
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
    const base = trainDamage(w);
    const live = w.enemies.filter((e) => e.hp > 0);
    switch (g.kind) {
      case 'arc': {
        const C = WAGONS.arc;
        const hit = live.filter((e) => inRange(e, at.x, at.z, trainRange(w))).sort((a, b) => a.d - b.d || a.id - b.id).slice(0, C.targets[lv]);
        if (hit.length === 0) return DT;
        for (const e of hit) {
          damageEnemy(e, base * C.mul[lv]);
          if (g.lv >= 3) e.stunT = Math.max(e.stunT, C.stun);
        }
        w.events.push({ t: 'zap', x: at.x, z: at.z, to: hit.map((e) => ({ x: e.x, z: e.z })) });
        return C.every;
      }
      case 'missile': {
        const C = WAGONS.missile;
        const d = (e: Enemy) => Math.hypot(e.x - at.x, e.z - at.z);
        const far = live.filter((e) => d(e) <= C.reach).sort((a, b) => d(b) - d(a) || a.id - b.id).slice(0, C.count[lv]);
        if (far.length === 0) return DT;
        for (const e of far) this.launch(w, 'missile', at, e, base * C.mul, g.lv >= 3 ? { r: C.splash, mul: C.splashMul } : undefined);
        return C.every;
      }
      case 'plasma': {
        const C = WAGONS.plasma;
        const dmg = base * C.perSec[lv] * C.every;
        for (const e of live) {
          if (!inRange(e, at.x, at.z, C.reach)) continue;
          damageEnemy(e, dmg);
          if (g.lv >= 3) e.burnT = C.burn;
        }
        w.events.push({ t: 'burn', x: at.x, z: at.z, r: C.reach });
        return C.every;
      }
      case 'mine': {
        const C = WAGONS.mine;
        const piles = this.piles(live, C.count[lv]);
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
      const p = { x: (at.x / len) * C.out, z: (at.z / len) * C.out, t: C.life[lv] };
      this.frost.push(p);
      w.events.push({ t: 'frost', x: p.x, z: p.z, r: C.radius, life: p.t });
    }
    const slow = 1 - C.slow[lv];
    for (const e of w.enemies) {
      if (e.flying || e.d > C.out + C.radius - WALL || !this.frost.some((p) => inRange(e, p.x, p.z, C.radius))) continue;
      if (e.slowMul > slow) e.slowMul = slow;
      e.slowT = Math.max(e.slowT, 0.2);
      if (g.lv >= 3) e.frailT = Math.max(e.frailT, 0.2);
    }
  }

  private stepMines(w: World): void {
    const C = WAGONS.mine;
    this.mines = this.mines.filter((m) => {
      const touch = w.enemies.some((e) => e.hp > 0 && !e.flying && inRange(e, m.x, m.z, C.touch));
      if (touch) blast(w, m.x, m.z, C.radius, m.damage);
      return !touch && (m.t -= DT) > 0;
    });
  }

  /** Magnet: extra kill gold, as a multiplier. */
  goldMul(): number {
    const lv = this.lv('magnet');
    return lv ? 1 + WAGONS.magnet.gold[lv - 1] : 1;
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
