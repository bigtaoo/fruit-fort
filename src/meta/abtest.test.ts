import { describe, expect, it } from 'vitest';
import { World } from '../sim/world';
import { STATS } from '../sim/config';
import { Analytics } from '../platform/analytics';
import type { Platform, PlatformStorage, TrackData } from '../platform/types';
import { AB_KEY, CHEAP_BUY, armMods, armTag, joinTest, pickArm } from './abtest';
import { newSave, worldOptions } from './progress';

function memStorage(init: Record<string, string> = {}): PlatformStorage & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    preload: async () => {},
    get: async (k) => data[k] ?? null,
    set: async (k, v) => void (data[k] = v),
  };
}

describe('A/B split buy1', () => {
  it('keeps a stored arm, leaves returning players out and draws first-timers at even odds', () => {
    expect(pickArm('buy1_b', 5)).toBe('b');
    expect(pickArm('buy1_a', 0, () => 0.9)).toBe('a');
    expect(pickArm(null, 3)).toBe(null);
    expect(pickArm('old_x', 3)).toBe(null);
    expect(pickArm(null, 0, () => 0.2)).toBe('a');
    expect(pickArm(null, 0, () => 0.7)).toBe('b');
  });

  it('stores the drawn arm once and reads it back', async () => {
    const s = memStorage();
    const arm = await joinTest(s, 0);
    expect(s.data[AB_KEY]).toBe(`buy1_${arm}`);
    expect(await joinTest(s, 4)).toBe(arm);
    const old = memStorage();
    expect(await joinTest(old, 2)).toBe(null);
    expect(old.data[AB_KEY]).toBeUndefined();
  });

  it('tags events with the arm, nothing outside the test', () => {
    expect(armTag('a')).toEqual({ ab: 'buy1_a' });
    expect(armTag(null)).toEqual({});
    const sent: TrackData[] = [];
    const analytics = new Analytics({ track: (_e: string, d: TrackData) => sent.push(d) } as unknown as Platform);
    analytics.tag = armTag('b');
    analytics.track('x', { s: 1 });
    analytics.once('y');
    expect(sent).toEqual([{ s: 1, ab: 'buy1_b' }, { ab: 'buy1_b' }]);
  });

  it('gives arm b the cheap economy in level 1-1 only', () => {
    expect(armMods('b', 0)).toBe(CHEAP_BUY);
    expect(armMods('a', 0)).toBeUndefined();
    expect(armMods(null, 0)).toBeUndefined();
    expect(armMods('b', 1)).toBeUndefined();
    expect(armMods('b', 'endless')).toBeUndefined();
    const save = newSave('2026-11-10');
    expect(worldOptions(save, 0, 'b').mods).toBe(CHEAP_BUY);
    expect(worldOptions(save, 0, 'a').mods).toBeUndefined();
  });

  it('prices cards from costMul and costGrowth and starts with the extra gold', () => {
    const plain = new World({ seed: 3 });
    const cheap = new World({ seed: 3, mods: CHEAP_BUY });
    expect(cheap.gold).toBe(plain.gold + 40);
    expect(cheap.statCost('dmg')).toBe(Math.round(STATS.dmg.cost * 0.4));
    cheap.gold = 1e9;
    cheap.buy('dmg');
    const growth = 1 + (STATS.dmg.growth - 1) * 0.35;
    expect(cheap.statCost('dmg')).toBe(Math.round(STATS.dmg.cost * 0.4 * growth));
  });
});
