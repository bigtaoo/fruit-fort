import { describe, expect, it } from 'vitest';
import type { Analytics } from './platform';
import type { Funnel } from './platform/funnel';
import type { SimEvent } from './sim/types';
import { World } from './sim/world';
import type { Guide } from './view/guide';
import { shopFields, trackEvent } from './runtrack';

describe('wagon events', () => {
  it('carry the pick number, how the card was taken and its kind in the event id', () => {
    const ids: string[] = [];
    const analytics = { track: (id: string) => ids.push(id), once: () => {} } as unknown as Analytics;
    const steps: string[] = [];
    const funnel = { step: (s: string) => steps.push(s) } as unknown as Funnel;
    const guide = { done: () => {} } as unknown as Guide;
    const w = new World({ wagons: true });
    const evs: SimEvent[] = [
      { t: 'offer', n: 1, opts: [{ kind: 'arc', lv: 1 }] },
      { t: 'offer', n: 14, opts: [{ kind: 'arc', lv: 1 }] },
      { t: 'pick', n: 1, opt: { kind: 'frost', lv: 1 }, auto: false, wait: 3.2 },
      { t: 'pick', n: 2, opt: { kind: 'repair', lv: 0 }, auto: true, wait: 10 },
      { t: 'pick', n: 3, opt: { kind: 'gold', lv: 0 }, auto: true, wait: 0 },
    ];
    for (const ev of evs) trackEvent(ev, w, 'endless', analytics, funnel, guide);
    expect(steps).toEqual(['first_offer', 'first_offer']); // the funnel sends each step once a session
    expect(ids).toEqual(['wagon_offer_1', 'wagon_offer_10', 'wagon_pick_tap_frost', 'wagon_pick_auto_repair', 'wagon_pick_paid_gold']);
  });
});

describe('shopFields', () => {
  it('reports what gold bought this run, not what training already gave', () => {
    const w = new World({ meta: { statLv: { dmg: 3 } } });
    w.gold = 10000;
    expect(shopFields(w).buy_dmg).toBe(0); // three trained levels are not three purchases
    w.buy('dmg');
    w.buy('wall');
    const f = shopFields(w);
    expect(f.buy_dmg).toBe(1);
    expect(f.buy_wall).toBe(1);
    expect(f.buy_spd).toBe(0);
    expect(f.gold_left).toBeLessThan(10000);
    expect(f.fence_low).toBe(100); // nothing has reached the fence yet
  });
});
