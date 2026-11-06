// Compile the post passes' shaders ahead (scene.ts warm). Left to the first draw, their 17 programs compiled
// there one after another on the main thread, ~1 s of a slow phone's loading.

import * as THREE from 'three';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** OutputPass's define for each tone mapping, which it only sets at its first render (OutputPass.js). */
const TONE: Partial<Record<THREE.ToneMapping, string>> = {
  [THREE.LinearToneMapping]: 'LINEAR_TONE_MAPPING',
  [THREE.ReinhardToneMapping]: 'REINHARD_TONE_MAPPING',
  [THREE.CineonToneMapping]: 'CINEON_TONE_MAPPING',
  [THREE.ACESFilmicToneMapping]: 'ACES_FILMIC_TONE_MAPPING',
  [THREE.AgXToneMapping]: 'AGX_TONE_MAPPING',
  [THREE.NeutralToneMapping]: 'NEUTRAL_TONE_MAPPING',
  [THREE.CustomToneMapping]: 'CUSTOM_TONE_MAPPING',
};

/** Give an OutputPass now the defines its first render would, in the same order (they are part of the program). */
function outputDefines(renderer: THREE.WebGLRenderer, pass: OutputPass): void {
  const d: Record<string, string> = {};
  if (THREE.ColorManagement.getTransfer(renderer.outputColorSpace) === THREE.SRGBTransfer) d.SRGB_TRANSFER = '';
  const tone = TONE[renderer.toneMapping];
  if (tone) d[tone] = '';
  pass.material.defines = d;
}

/** Every material a pass draws with: its own fields, and arrays of them (the bloom's blur steps). */
export function passMaterials(pass: Pass): THREE.Material[] {
  const out: THREE.Material[] = [];
  for (const v of Object.values(pass)) {
    if (v instanceof THREE.Material) out.push(v);
    else if (Array.isArray(v)) for (const m of v) if (m instanceof THREE.Material) out.push(m);
  }
  return [...new Set(out)];
}

/**
 * Start compiling the passes' programs alongside (compileAsync), each against the kind of target it draws
 * into: the last pass to the screen, the rest to linear buffers like `buffer`; that target is part of a program.
 */
export function compilePasses(renderer: THREE.WebGLRenderer, passes: readonly Pass[], buffer: THREE.WebGLRenderTarget): Promise<unknown> {
  // Like the passes' own full-screen triangle: no normals, which would make another program.
  const plane = new THREE.PlaneGeometry(2, 2).deleteAttribute('normal');
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const was = renderer.getRenderTarget();
  const ready = passes.map((p, i) => {
    if (p instanceof OutputPass) outputDefines(renderer, p);
    const quads = new THREE.Scene();
    for (const m of passMaterials(p)) quads.add(new THREE.Mesh(plane, m));
    renderer.setRenderTarget(i === passes.length - 1 ? null : buffer);
    return renderer.compileAsync(quads, camera);
  });
  renderer.setRenderTarget(was);
  return Promise.all(ready).finally(() => plane.dispose());
}
