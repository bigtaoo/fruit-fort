// The hero's portrait for the skill button and the hero cards (split out of scene.ts): the 3D
// trooper rendered off screen with the stage's renderer.

import * as THREE from 'three';
import type { HeroKind } from '../sim/types';
import type { Stage } from './scene';
import { makeHero } from './troopers';

const portraits = new Map<HeroKind, string>();
/**
 * The hero's 3D trooper rendered head and shoulders, three-quarter on, as a PNG data URL for the skill
 * button, so the HUD shows the same trooper that rides the tank rather than a flat drawing.
 * Drawn once per hero with the stage's renderer into an off-screen target (its colour space set to
 * sRGB so the output is encoded as on screen) and cached.
 */
export function heroPortrait(stage: Stage, kind: HeroKind): string {
  const hit = portraits.get(kind);
  if (hit) return hit;
  // Twice the largest place it shows (the village hero card), so it stays sharp on a 2x screen.
  const S = 384;
  const scene = new THREE.Scene();
  scene.environment = stage.scene.environment;
  scene.environmentIntensity = 0.35;
  // A cool white key and a strong cyan rim, so the visor and the helmet's edge catch light.
  const key = new THREE.DirectionalLight(0xf4f8ff, 1.5);
  key.position.set(2, 3, 3);
  const rim = new THREE.DirectionalLight(0x60e0ff, 1.6);
  rim.position.set(-3, 2, -2);
  scene.add(key, rim, new THREE.HemisphereLight(0xe8f4ff, 0x203a5a, 0.6));
  const toy = makeHero(kind);
  // Three-quarter on.
  toy.rotation.y = -0.35;
  scene.add(toy);
  const box = new THREE.Box3().setFromObject(toy);
  const size = box.getSize(new THREE.Vector3());
  // Frame the top 60 %: the head and the chest, the face a little above centre.
  const cy = box.max.y - size.y * 0.32;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  const d = (size.y * 0.72) / 2 / Math.tan((26 * Math.PI) / 360);
  camera.position.set(0, cy + size.y * 0.08, box.max.z + d);
  camera.lookAt(0, cy, 0);
  const target = new THREE.WebGLRenderTarget(S, S, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const r = stage.renderer;
  const before = r.getRenderTarget();
  const clear = r.getClearAlpha();
  r.setClearAlpha(0);
  r.setRenderTarget(target);
  r.clear();
  r.render(scene, camera);
  const px = new Uint8Array(S * S * 4);
  r.readRenderTargetPixels(target, 0, 0, S, S, px);
  r.setRenderTarget(before);
  r.setClearAlpha(clear);
  target.dispose();
  // The target reads bottom row first: flip it into a canvas, shifted sideways so the head is in the
  // middle of the round button (the opaque span of the top rows; a tail or a raised arm would pull a
  // box centre off it).
  let head = S, x0 = S, x1 = 0;
  for (let y = S - 1; y >= 0 && y > head - S * 0.3; y--) {
    for (let x = 0; x < S; x++) {
      if (px[(y * S + x) * 4 + 3] < 128) continue;
      if (head === S) head = y;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
    }
  }
  const shift = x1 >= x0 ? Math.round(S / 2 - (x0 + x1) / 2) : 0;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
  g.putImageData(img, shift, 0);
  const url = c.toDataURL('image/png');
  portraits.set(kind, url);
  return url;
}
