// The tides of an endless run (§9.4, docs/design/battle.md): every TIDES.every waves the player is
// dealt three bargains, and each one gives the bugs something for the rest of the run and pays the
// player now. Owns its offer, its own random stream and the list of what has been taken; World holds
// one and steps it. Chapter levels never see a tide. Split from world.ts.
//
// Why it exists: endless had exactly one decision in it - which card to buy next - and past wave 20
// the answer was always the cheapest, so the run became reading numbers against bugs that never
// changed. A tide is a decision with a price on both sides, and it is what makes two runs from the
// same save different runs.
//
// Texts: the `tide` group of the i18n tables, all fifteen languages.

import { DT, STAT_KEYS, TIDES } from './config';
import { Prng } from './rng';
import type { StatKey, TideGift, TideOpt, TidePress } from './types';
import type { World } from './world';

const PRESSES: readonly TidePress[] = ['swift', 'hardy', 'gnaw', 'swarm'];
const GIFTS: readonly TideGift[] = ['wagon', 'gold', 'levels', 'mend'];

interface TideOffer {
  opts: TideOpt[];
  /** Seconds left on the auto-pick clock. */
  t: number;
  /** Which tide of the run this is, from 1. */
  n: number;
}

export class Tides {
  offer: TideOffer | null = null;
  /** Every card taken, in order: the HUD lists them and the run's telemetry counts them. */
  readonly taken: TideOpt[] = [];
  /** The wave the last offer was dealt for, so a wave deals at most one tide. */
  private dealt = 0;
  private readonly rng: Prng;

  constructor(seed: number) {
    this.rng = new Prng(seed * 2 + 7);
  }

  /**
   * Due on every `TIDES.every`th wave from `TIDES.from`. It never opens on top of a wagon pick: the
   * two share the card strip, and waiting costs nothing since the wave has only just turned.
   */
  step(w: World): void {
    if (this.offer) {
      if ((this.offer.t -= DT) <= 0) this.pick(w, 0, true);
      return;
    }
    if (w.level || w.over || w.wallHp <= 0) return;
    if (w.wave < TIDES.from || (w.wave - TIDES.from) % TIDES.every !== 0) return;
    if (w.wave === this.dealt || w.wg?.offer) return;
    // 只在那口气里开（§9.8）：一张要读的卡落在打仗中间，读它的代价就是围栏。
    if (!w.pace.breathing) return;
    this.dealt = w.wave;
    const opts = this.deal(w);
    this.offer = { opts, t: TIDES.autoPick, n: this.taken.length + 1 };
    w.events.push({ t: 'tideoffer', n: this.offer.n, opts });
  }

  /** The player (or the clock, which takes the first card) takes card i. */
  pick(w: World, i: number, auto = false): boolean {
    const o = this.offer;
    if (!o || i < 0 || i >= o.opts.length) return false;
    const opt = o.opts[i];
    this.offer = null;
    this.taken.push(opt);
    this.press(w, opt.press);
    this.give(w, opt.gift);
    w.events.push({ t: 'tidepick', n: o.n, opt, auto });
    return true;
  }

  /** How many tides of each press the run is carrying, for the HUD's tide bar. */
  count(p: TidePress): number {
    return this.taken.filter((o) => o.press === p).length;
  }

  // ---- dealing ----------------------------------------------------------------------------

  /** Three cards, no two sharing a press or a gift, and no gift that would do nothing. */
  private deal(w: World): TideOpt[] {
    const press = this.shuffle([...PRESSES]).slice(0, TIDES.cards);
    const gifts = GIFTS.filter((g) => (g === 'wagon' ? !!w.wg : g === 'mend' ? w.wallHp < w.wallMax : true));
    const gift = this.shuffle([...gifts]);
    // Fewer gifts than cards (no wagons in the run and a whole fence): the rest take gold.
    return press.map((p, i) => ({ press: p, gift: gift[i] ?? 'gold' }));
  }

  private shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---- the two halves of a card -----------------------------------------------------------

  /**
   * What the bugs keep, for the rest of the run. Speed and health are read as a bug spawns, so a
   * tide shapes the waves after it and never the bugs already on the field - the card is a promise
   * about the run, not a punch in the face.
   */
  private press(w: World, p: TidePress): void {
    const m = w.mods;
    if (p === 'swift') m.enemySpeed = (m.enemySpeed ?? 1) * TIDES.press.swift;
    else if (p === 'hardy') m.enemyHp = (m.enemyHp ?? 1) * TIDES.press.hardy;
    else if (p === 'gnaw') m.bite = (m.bite ?? 1) * TIDES.press.gnaw;
    else m.count = (m.count ?? 1) * TIDES.press.swarm;
  }

  /** What the player is paid, now. */
  private give(w: World, g: TideGift): void {
    if (g === 'wagon') w.wg?.owe();
    else if (g === 'gold') w.gold += TIDES.gift.gold * w.statCost('dmg');
    else if (g === 'mend') w.wallHp = Math.min(w.wallMax, w.wallHp + w.wallMax * TIDES.gift.mend);
    else for (const k of this.free(w)) w.levelUp(k);
  }

  /**
   * The stats a `levels` card raises: one level each on `TIDES.gift.levels` different cards, drawn at
   * random rather than taken off the cheapest, which would only ever hand out damage and attack speed.
   */
  private free(w: World): StatKey[] {
    return this.shuffle(STAT_KEYS.filter((k) => !w.maxed(k))).slice(0, TIDES.gift.levels);
  }
}
