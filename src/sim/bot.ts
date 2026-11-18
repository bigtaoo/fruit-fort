// A greedy player for the headless sim and balance runs: cast when ready, steer the train
// towards the enemy nearest the wall (or an event on the track), and buy the stat with the
// best value for its price, saving up for it rather than buying something cheaper.

import { HAPPENINGS, STAT_KEYS } from './config';
import type { World } from './world';
import type { StatKey, WagonOpt } from './types';

/** A player needs a moment to see an event and decide to go for it. */
const REACTION = 1.2;
/** Only turn round when the other way is shorter by at least this much, in radians. */
const TURN_MARGIN = 0.4;

/** How much the bot values one level of each stat, per gold. */
function weight(w: World, k: StatKey): number {
  switch (k) {
    case 'dmg': return 1;
    case 'spd': return 0.9;
    case 'crit': return 0.6;
    case 'heavy': return w.level?.tough || w.enemies.some((e) => e.kind === 'boss') ? 0.8 : 0.5;
    case 'splash': return 0.8;
    case 'wagon': return 0.25 * (w.wg?.list.length ?? 0);
    case 'gold': return w.wave < 10 ? 0.8 : 0.2;
    case 'wall': return 0.3;
    default: return 0; // training only
  }
}

export function botAct(w: World): void {
  const offer = w.wg?.offer;
  if (offer) w.pickWagon(pickCard(offer.opts));
  if (w.busy()) return;
  if (w.heroReady() && w.enemies.length > 3) w.cast();
  steer(w);
  shop(w);
}

/** Wagon cards (§10.1) by a fixed taste: upgrades first, attack wagons over the rest. */
const CARD: Record<WagonOpt['kind'], number> = { arc: 5, missile: 4, plasma: 4, mine: 3, frost: 3, magnet: 2, skill: 1, repair: 1, gold: 1 };
export function pickCard(opts: WagonOpt[]): number {
  const score = (o: WagonOpt) => CARD[o.kind] + (o.lv > 1 ? 3 : 0);
  return opts.reduce((best, o, i) => (score(o) > score(opts[best]) ? i : best), 0);
}

// A fence under 40% is an emergency, and in a level the fence card answers it: a flat 150 back and
// the bar jumps clear. In endless it does not - the new segment arrives as damaged as the rest
// (§9.2), the bar moves by ECON.endlessRepair, and the loop below buys level after level in one tick
// chasing a 40% it barely climbs towards. The rule is a level rule now, and in endless the fence is
// bought on weight() like every other stat. It costs the bot waves (77 -> 74 fresh, 90 -> 85 trained,
// measured 2026-11-15): the panic was buying max health, which is worth something even when it mends
// nothing. That is the point - a player reading "mends 5%" would not pour a wave's gold into it, so
// neither should the instrument. The balance scripts' hand policy never comes through here at all.
function shop(w: World): void {
  for (;;) {
    const panic = w.level && w.wallHp < w.wallMax * 0.4 && !w.maxed('wall');
    const want: StatKey | undefined = panic ? 'wall' : bestStat(w);
    if (!want || !w.buy(want)) return;
  }
}

function bestStat(w: World): StatKey | undefined {
  let best: StatKey | undefined;
  let bestScore = 0;
  for (const k of STAT_KEYS) {
    if (w.maxed(k)) continue;
    const score = weight(w, k) / w.statCost(k);
    if (score > bestScore) [best, bestScore] = [k, score];
  }
  return best;
}

/** Signed shortest turn from angle a to angle b, in (-π, π]. */
function delta(a: number, b: number): number {
  const d = (((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return d === -Math.PI ? Math.PI : d;
}

function steer(w: World): void {
  const target = goal(w);
  if (target === null) return;
  const d = delta(w.train.angle, target);
  if (Math.sign(d) !== w.train.dir && Math.abs(d) < Math.PI - TURN_MARGIN) w.reverse();
}

/** Where on the track the bot wants to be: an event it has seen, or opposite the enemy nearest the wall. */
function goal(w: World): number | null {
  const h = w.happenings.now;
  const atWall = w.enemies.some((e) => e.d <= 0);
  if (h && !atWall && (h.kind === 'bug' ? HAPPENINGS.bug.life : HAPPENINGS.basket.life) - h.t >= REACTION) return h.angle;
  let near = w.enemies[0];
  for (const e of w.enemies) if (e.d < near.d) near = e;
  if (!near) return null;
  // Already in reach: no need to turn.
  const p = w.trainPos();
  if (Math.hypot(near.x - p.x, near.z - p.z) <= w.train.range(w) - 0.3) return null;
  return Math.atan2(near.z, near.x);
}
