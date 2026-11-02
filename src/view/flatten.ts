// Fewer draw calls for a built model: the meshes that never move on their own are merged, one mesh
// per material, under the part they ride on. A phone GPU pays per draw far more than per triangle,
// and the reactor and the tank were ~85 small draws a frame between them (§16.19).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Every Object3D named in the userData of `root` or anything under it: the parts its animation moves. */
function animated(root: THREE.Object3D): Set<THREE.Object3D> {
  const out = new Set<THREE.Object3D>();
  root.traverse((o) => {
    for (const v of Object.values(o.userData)) {
      for (const x of Array.isArray(v) ? v : [v]) if (x instanceof THREE.Object3D) out.add(x);
    }
  });
  return out;
}

/**
 * Merge the still meshes of `root` by material. A part named in any userData (a turning ring, the
 * body that squashes, a pulsing core, a seat something is added to later) is left where it is and
 * its own still meshes are merged under it; a mesh named that way is kept as it is.
 */
export function flatten(root: THREE.Object3D): void {
  const keep = animated(root);
  root.updateMatrixWorld(true);
  const anchors = [root, ...[...keep].filter((o) => !(o as THREE.Mesh).isMesh)];
  for (const anchor of anchors) {
    const into = new THREE.Matrix4().copy(anchor.matrixWorld).invert();
    const sets = new Map<string, THREE.Mesh[]>();
    const walk = (o: THREE.Object3D) => {
      for (const c of o.children) {
        if (keep.has(c) || !c.visible) continue;
        const m = c as THREE.Mesh;
        if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material) && c.children.length === 0) {
          const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`;
          if (!sets.has(key)) sets.set(key, []);
          sets.get(key)!.push(m);
        } else walk(c);
      }
    };
    walk(anchor);
    for (const meshes of sets.values()) {
      if (meshes.length < 2) continue;
      const geos = meshes.map((m) => m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(into, m.matrixWorld)));
      const flat = geos.some((g) => !g.index) ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
      const merged = mergeGeometries(flat);
      // Parts with unlike attributes (a uv set or not) stay apart.
      if (!merged) continue;
      const one = new THREE.Mesh(merged, meshes[0].material);
      one.castShadow = meshes[0].castShadow;
      one.receiveShadow = meshes[0].receiveShadow;
      one.renderOrder = meshes[0].renderOrder;
      for (const m of meshes) m.removeFromParent();
      anchor.add(one);
    }
  }
}
