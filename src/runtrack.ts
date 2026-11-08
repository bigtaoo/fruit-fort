// What a run's events tell the guide and the analytics (split out of main.ts): a buy, a reversal or a
// cast ends the guide's step and goes into the first-minute funnel; deaths, waves and happenings are
// tracked (docs/platform.md).

import type { RunMode } from './meta/progress';
import type { Analytics } from './platform';
import type { Funnel } from './platform/funnel';
import type { SimEvent } from './sim/types';
import type { World } from './sim/world';
import type { Guide } from './view/guide';

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
  } else if (ev.t === 'escape') analytics.track('happening_missed', { kind: ev.kind, wave: world.wave });
  if (ev.t === 'wave' && (ev.wave === 3 || ev.wave === 5 || ev.wave === 10)) funnel.step(`wave_${ev.wave}`, { run_t: Math.round(world.time) });
  else if (ev.t === 'wave' && ev.wave > 1) analytics.track('wave_cleared', { wave: ev.wave - 1, mode });
}
