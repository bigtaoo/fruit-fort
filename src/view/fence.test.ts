import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeFence } from './fence';

// The shield atlas is drawn on a canvas; here a 2D context that draws nothing will do.
const ctx: object = new Proxy({}, { get: (_t, k) => (k === 'createImageData' || k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => ctx), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ getContext: () => ctx }) });

/** Every post's colour and its glow's, read off the two instanced meshes. */
function colours(fence: ReturnType<typeof makeFence>): number[] {
  const out: number[] = [];
  fence.group.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (m.isInstancedMesh && m.instanceColor) out.push(...m.instanceColor.array);
  });
  return out;
}

describe('fence', () => {
  it('a worn post throbs while eaten, then settles to a steady scorch', () => {
    const fence = makeFence(4, 24);
    fence.wobble(0);
    // Eat a third of the wall with one bug at angle 0, then step a second at a time.
    fence.paint(0.4, [{ x: 4, z: 0, rate: 1 }]);
    const eating = [1, 1.3].map((t) => (fence.wobble(t), colours(fence)));
    expect(eating[0]).not.toEqual(eating[1]);
    for (let t = 1.3; t < 6; t += 0.1) fence.wobble(t);
    const left = [6, 6.3, 7.7].map((t) => (fence.wobble(t), colours(fence)));
    expect(left[1]).toEqual(left[0]);
    expect(left[2]).toEqual(left[0]);
  });
});
