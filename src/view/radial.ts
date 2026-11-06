// A round glow as a texture, built from plain pixels: drawing it on a 2D canvas cost ~300 ms on a slow
// phone at load (making the first 2D context), for 64x64 and 128x128 pixels.

import * as THREE from 'three';

/** A point on the glow: `at` 0 (centre) to 1 (edge), colour 0-255 and alpha 0-1, as a canvas colour stop. */
export type Stop = [at: number, r: number, g: number, b: number, a: number];

/** `size` pixels square, the colour running through `stops` from the centre out (straight, not premultiplied). */
export function radialTexture(size: number, stops: readonly Stop[]): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x + 0.5 - c, y + 0.5 - c) / c);
      let i = 1;
      while (i < stops.length - 1 && stops[i][0] < d) i++;
      const a = stops[i - 1];
      const b = stops[i];
      const t = b[0] > a[0] ? Math.min(1, Math.max(0, (d - a[0]) / (b[0] - a[0]))) : 1;
      const o = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) data[o + k] = Math.round(a[k + 1] + (b[k + 1] - a[k + 1]) * t);
      data[o + 3] = Math.round((a[4] + (b[4] - a[4]) * t) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
