// A greedy player for the headless sim and balance runs: cast when ready, steer the train
// towards the enemy nearest the wall (or an event on the track), and buy the stat with the
// best value for its price, saving up for it rather than buying something cheaper.

import { HAPPENINGS, STAT_KEYS } from './config';
import { trainRange } from './combat';
import type { World } from './world';
import type { StatKey } from './types';

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
    case 'multi': return 1.5;
    case 'range': return 0.5;
    case 'move': return 0.4;
    case 'gold': return w.wave < 10 ? 0.8 : 0.2;
    case 'wall': return 0.3;
  }
}

export function botAct(w: World): void {
  if (w.busy()) return;
  if (w.heroReady() && w.enemies.length > 3) w.cast();
  steer(w);
  shop(w);
}

function shop(w: World): void {
  for (;;) {
    const want: StatKey | undefined = w.wallHp < w.wallMax * 0.4 && !w.maxed('wall') ? 'wall' : bestStat(w);
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
  const h = w.happening;
  const atWall = w.enemies.some((e) => e.d <= 0);
  if (h && !atWall && (h.kind === 'bug' ? HAPPENINGS.bug.life : HAPPENINGS.basket.life) - h.t >= REACTION) return h.angle;
  let near = w.enemies[0];
  for (const e of w.enemies) if (e.d < near.d) near = e;
  if (!near) return null;
  // Already in reach: no need to turn.
  const p = w.trainPos();
  if (Math.hypot(near.x - p.x, near.z - p.z) <= trainRange(w) - 0.3) return null;
  return Math.atan2(near.z, near.x);
}
