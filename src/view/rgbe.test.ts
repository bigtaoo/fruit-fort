import { describe, expect, it } from 'vitest';
import { decodeRgbe, encodeRgbe, halfToFloat } from './rgbe';

describe('rgbe', () => {
  it('reads half floats', () => {
    expect(halfToFloat(0x3c00)).toBe(1);
    expect(halfToFloat(0xc000)).toBe(-2);
    expect(halfToFloat(0x0001)).toBeCloseTo(2 ** -24);
    expect(halfToFloat(0x7c00)).toBe(Infinity);
  });

  it('keeps colours within one step of the brightest channel', () => {
    const src = Float32Array.from([0, 0, 0, 1, 1, 0.5, 0.25, 1, 42.9, 3, 0.01, 1, 0.003, 0.002, 0.001, 1, 255.9 / 256, 0, 0, 1]);
    const back = decodeRgbe(encodeRgbe(src));
    for (let i = 0; i < src.length; i += 4) {
      const top = Math.max(src[i], src[i + 1], src[i + 2]);
      for (let c = 0; c < 3; c++) expect(Math.abs(back[i + c] - src[i + c])).toBeLessThanOrEqual(top / 256 + 1e-9);
      expect(back[i + 3]).toBe(1);
    }
  });

  it('clamps negatives to black', () => {
    expect(Array.from(decodeRgbe(encodeRgbe(Float32Array.from([-1, -2, -3, 1]))))).toEqual([0, 0, 0, 1]);
  });
});
