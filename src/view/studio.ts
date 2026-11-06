// The studio environment (the armour's sheen) baked offline by scripts/bake-env.ts, so the game no longer
// builds it at load: PMREMGenerator's own shaders cost ~1 s of main-thread compiles on a slow phone
// (2026-11-06). boot.ts downloads the file after the models and the game chunk and unzips it here;
// scene.ts turns it into the texture (bakedEnv), or builds it the old way if it didn't arrive.
// No three.js here: boot.ts imports it.

import url from '../assets/env/studio.rgbe.gz?url';

export const STUDIO_URL = url;

/** The baked cube size; bake-env.ts must be run with the same size. 64 is ~67 KB and looks as 256 did. */
export const STUDIO_SIZE = 64;

/** The CubeUV texture's width and height for a cube size (PMREMGenerator._allocateTargets). */
export function cubeUvShape(size: number): { width: number; height: number } {
  return { width: 3 * Math.max(size, 16 * 7), height: 4 * size };
}

let arrived: (b: Promise<Uint8Array | null>) => void = () => {};
const bytes = new Promise<Uint8Array | null>((ok) => (arrived = ok));

/** The file's texels; a server may already have unzipped it (Content-Encoding: gzip for a .gz). */
async function gunzip(buf: ArrayBuffer): Promise<Uint8Array | null> {
  try {
    const head = new Uint8Array(buf, 0, 2);
    const zipped = head[0] === 0x1f && head[1] === 0x8b;
    if (zipped && typeof DecompressionStream !== 'function') return null;
    const stream = zipped ? new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')) : null;
    const out = stream ? new Uint8Array(await new Response(stream).arrayBuffer()) : new Uint8Array(buf);
    const { width, height } = cubeUvShape(STUDIO_SIZE);
    return out.length === width * height * 4 ? out : null;
  } catch (err) {
    console.warn('[studio] could not unzip the environment', err);
    return null;
  }
}

/** Keep the downloaded file (null if it failed) and start unzipping it; boot.ts always calls this once. */
export function keepStudio(buf: ArrayBuffer | null): void {
  arrived(buf && buf.byteLength > 2 ? gunzip(buf) : Promise.resolve(null));
}

/** The baked texels as RGBE bytes once they have arrived, or null if they are missing (build the environment instead). */
export function studioBytes(): Promise<Uint8Array | null> {
  return bytes;
}
