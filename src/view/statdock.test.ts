import { describe, expect, it } from 'vitest';
import { lvText } from './statdock';

describe('lvText', () => {
  it('shows the run cap, so a maxed training still reads as one gold can raise', () => {
    expect(lvText('multi', 1, 0)).toBe('Lv1/3');
    expect(lvText('dmg', 4, 0)).toBe('Lv4');
  });

  it('puts a crystal in front of levels training gave', () => {
    const s = lvText('multi', 1, 1);
    expect(s).toMatch(/Lv1\/3$/);
    expect(s.startsWith('Lv')).toBe(false);
  });
});
