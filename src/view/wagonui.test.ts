import { describe, expect, it } from 'vitest';
import { cardText } from './wagonui';
import { ECON } from '../sim/config';

describe('cardText', () => {
  it('promises a full fence in a level and a share of it in endless', () => {
    const repair = { kind: 'repair' as const, lv: 0 };
    const full = cardText(repair, 100, false);
    const part = cardText(repair, 100, true);
    expect(part).not.toBe(full);
    expect(part).toContain(`${Math.round(ECON.endlessCardRepair * 100)}%`);
    expect(part).not.toMatch(/[{}]/);
  });

  it('fills the gold card either way and leaves the wagons alone', () => {
    expect(cardText({ kind: 'gold', lv: 0 }, 250, true)).toContain('250');
    expect(cardText({ kind: 'arc', lv: 1 }, 0, true)).toBe(cardText({ kind: 'arc', lv: 1 }, 0, false));
  });
});
