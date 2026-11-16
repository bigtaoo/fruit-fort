import { describe, expect, it } from 'vitest';
import { LEVELS, levelKinds } from './levels';

describe('levelKinds', () => {
  it('is the pool plus what comes with it: spores behind the mold, the boss wave and its locusts', () => {
    expect(levelKinds({ waves: 6, hp: 1, pool: ['caterpillar'] }).sort()).toEqual(['boss', 'caterpillar', 'locust']);
    expect(levelKinds({ waves: 10, hp: 1, pool: ['caterpillar', 'mold'] })).toContain('spore');
    // Level 1-1 warms three of the eight kinds, which is the saving on a machine that started low.
    expect(levelKinds(LEVELS[0]).length).toBeLessThan(8);
  });
});
