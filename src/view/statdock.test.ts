import { describe, expect, it } from 'vitest';
import { lvText, statText } from './statdock';
import { CRIT, ECON, STATS } from '../sim/config';

describe('lvText', () => {
  it('shows the run cap, so a maxed training still reads as one gold can raise', () => {
    expect(lvText('multi', 1, 0)).toBe('Lv1/6');
    expect(lvText('dmg', 4, 0)).toBe('Lv4');
  });

  it('puts a crystal in front of levels training gave', () => {
    const s = lvText('multi', 1, 1);
    expect(s).toMatch(/Lv1\/6$/);
    expect(s.startsWith('Lv')).toBe(false);
  });
});

describe('statText', () => {
  it('tells an endless run the fence card is not the repair a level gets', () => {
    const lvl = statText('wall', 0, false);
    const endless = statText('wall', 0, true);
    expect(lvl).toContain(String(STATS.wall.per));
    expect(endless).not.toBe(lvl);
    expect(endless).toContain(String(STATS.wall.per));
    expect(endless).toContain(`${Math.round(ECON.endlessRepair * 100)}%`);
    expect(endless).not.toMatch(/[{}]/);
  });

  it('still swaps the crit card once its chance is capped', () => {
    expect(statText('crit', CRIT.rateLevels, false)).not.toBe(statText('crit', 0, false));
    expect(statText('dmg', 0, true)).toBe(statText('dmg', 0, false));
  });
});
