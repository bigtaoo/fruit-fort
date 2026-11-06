// RGBE (Radiance) texels: 8-bit red, green and blue sharing one 8-bit exponent, for the baked studio
// environment (scripts/bake-env.ts writes it, studio.ts reads it into half floats for the GPU).

/** A half float's bits as a number. */
export function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const m = h & 0x3ff;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}

/** RGBA floats (alpha ignored) as RGBE bytes, four per texel. */
export function encodeRgbe(rgba: Float32Array): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = Math.max(0, rgba[i]);
    const g = Math.max(0, rgba[i + 1]);
    const b = Math.max(0, rgba[i + 2]);
    const v = Math.max(r, g, b);
    if (v < 1e-32) continue;
    const e = Math.ceil(Math.log2(v + 1e-30));
    // Round to the nearest step; a channel that would round up to 256 takes the next exponent.
    let k = 2 ** (8 - e);
    let ex = e;
    if (Math.round(v * k) > 255) {
      ex++;
      k /= 2;
    }
    out[i] = Math.round(r * k);
    out[i + 1] = Math.round(g * k);
    out[i + 2] = Math.round(b * k);
    out[i + 3] = ex + 128;
  }
  return out;
}

/** RGBE bytes as RGBA floats (alpha 1). */
export function decodeRgbe(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 4) {
    const e = bytes[i + 3];
    const k = e ? 2 ** (e - 128 - 8) : 0;
    out[i] = bytes[i] * k;
    out[i + 1] = bytes[i + 1] * k;
    out[i + 2] = bytes[i + 2] * k;
    out[i + 3] = 1;
  }
  return out;
}
