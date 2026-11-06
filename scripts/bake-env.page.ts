// Browser half of scripts/bake-env.ts: builds the studio environment exactly as scene.ts did at load
// (PMREMGenerator.fromScene of RoomEnvironment) and reads the CubeUV texture back as half floats.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

declare global {
  interface Window {
    bakeEnv(size: number): { width: number; height: number; halves: number[] };
  }
}

window.bakeEnv = (size) => {
  const renderer = new THREE.WebGLRenderer();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(new RoomEnvironment(), 0.04, 0.1, 100, { size });
  const { width, height } = target;
  const halves = new Uint16Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, halves);
  pmrem.dispose();
  target.dispose();
  renderer.dispose();
  return { width, height, halves: Array.from(halves) };
};
