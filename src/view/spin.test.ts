import { describe, expect, it } from 'vitest';
import { SPIN, spinOff } from './spin';

describe('spinOff', () => {
  it('starts at the full swing, overshoots a little and settles at SPIN', () => {
    expect(spinOff(Math.PI, 0)).toBeCloseTo(Math.PI);
    expect(spinOff(Math.PI, SPIN / 2)).toBeLessThan(Math.PI / 2);
    const tail = [0.7, 0.8, 0.9].map((f) => spinOff(Math.PI, f * SPIN));
    expect(Math.min(...tail)).toBeLessThan(0);
    expect(Math.min(...tail)).toBeGreaterThan(-0.15 * Math.PI);
    expect(spinOff(Math.PI, SPIN)).toBe(0);
    expect(spinOff(Math.PI, -0.1)).toBe(0);
  });
});
