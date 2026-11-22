// What a run's events tell the guide and the analytics (split out of main.ts): a buy, a reversal or a
// cast ends the guide's step and goes into the first-minute funnel; deaths, waves and happenings are
// tracked (docs/platform.md).

import { STAT_KEYS } from './sim/config';
import type { RunMode } from './meta/progress';
import type { Analytics } from './platform';
import type { Funnel } from './platform/funnel';
import type { SimEvent } from './sim/types';
import type { World } from './sim/world';
import type { Guide } from './view/guide';

/**
 * How a wagon card was taken, for the event id (Playgama counts by id; the payload may not reach
 * the console): tapped, taken by the clock, or paid at once because only one card was left.
 */
function pickHow(auto: boolean, wait: number): 'tap' | 'auto' | 'paid' {
  return !auto ? 'tap' : wait === 0 ? 'paid' : 'auto';
}

/**
 * What the player did with their gold this run, for `run_end`: one number per stat, the levels they
 * bought inside the fight (`lv` minus what training had already given them), plus the gold they never
 * spent and the lowest the fence got.
 *
 * Measured in the headless sim 2026-11-15, what you buy decides the run far more than how fast you
 * tap: on 1-10, the same player buying cheapest-first lost ten times out of ten, and the same player
 * with the fence in their list won at 21% fence - a 40-point swing on 1-7 and 1-10 between a
 * damage-only list and a value one. Nothing in the telemetry could see that, because `run_end` knew
 * the wave, the kills and the stars but never what was bought, so a run lost for want of a fence
 * upgrade read exactly like a run lost to a hard level. One number per stat, bounded and small, keeps
 * the field summaries usable; a joined string could not be summarized numerically.
 */
export function shopFields(w: World): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of STAT_KEYS) out[`buy_${k}`] = (w.lv[k] ?? 0) - (w.trained[k] ?? 0);
  out.gold_left = Math.round(w.gold);
  out.fence_low = Math.round(w.wallLow * 100);
  return out;
}

export function trackEvent(ev: SimEvent, world: World, mode: RunMode, analytics: Analytics, funnel: Funnel, guide: Guide): void {
  if (ev.t === 'buy') {
    guide.done('buy');
    if (ev.stat === 'multi') guide.done('multi');
    analytics.once('first_buy', { t: Math.round(world.time), stat: ev.stat });
    funnel.step('first_buy', { stat: ev.stat });
  } else if (ev.t === 'reverse') {
    guide.done('reverse');
    analytics.once('first_reverse', { t: Math.round(world.time) });
    funnel.step('first_reverse');
  } else if (ev.t === 'cast') {
    guide.done('cast');
    funnel.step('first_cast', { hero: world.heroKind });
  } else if (ev.t === 'over') funnel.step('first_death', { wave: world.wave, run_t: Math.round(world.time) });
  else if (ev.t === 'happen') analytics.track('happening_shown', { kind: ev.kind, wave: world.wave });
  else if (ev.t === 'grab') {
    analytics.track('happening_grabbed', { kind: ev.kind, wave: world.wave });
    funnel.step('first_grab', { kind: ev.kind });
    guide.done(ev.kind === 'basket' ? 'basket' : 'goldbug');
  } else if (ev.t === 'offer') {
    funnel.step('first_offer', { run_t: Math.round(world.time) });
    analytics.track(`wagon_offer_${Math.min(ev.n, 10)}`, { n: ev.n, wave: world.wave, opts: ev.opts.map((o) => o.kind + o.lv).join(','), s: Math.round(world.time) });
  } else if (ev.t === 'pick') analytics.track(`wagon_pick_${pickHow(ev.auto, ev.wait)}_${ev.opt.kind}`, { n: ev.n, id: ev.opt.kind, lv: ev.opt.lv, auto: ev.auto ? 1 : 0, ms: Math.round(ev.wait * 1000) });
  else if (ev.t === 'escape') analytics.track('happening_missed', { kind: ev.kind, wave: world.wave });
  // Milestones (§9.6). Playgama counts by event id, so the first nine get an id of their own: what we
  // need to read is how far a run gets before someone takes the way out, and whether the card is being
  // used at all or just clocked past. `mile_bank` is the only event in the game a player ends a run with
  // on purpose - held against `run_end`'s wave it says whether the exit lands at a high point or a wall.
  else if (ev.t === 'mile') analytics.track(`mile_${Math.min(ev.n, 9)}`, { n: ev.n, wave: world.wave, next: ev.next });
  else if (ev.t === 'bank') analytics.track('mile_bank', { n: ev.n, wave: world.wave, t: Math.round(world.time) });
  if (ev.t === 'wave' && (ev.wave === 3 || ev.wave === 5 || ev.wave === 10)) funnel.step(`wave_${ev.wave}`, { run_t: Math.round(world.time) });
  else if (ev.t === 'wave' && ev.wave > 1) analytics.track('wave_cleared', { wave: ev.wave - 1, mode });
}
