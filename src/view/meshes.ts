// The Tripo models (§16.2, docs/art/tripo_r*): one untextured mesh per character, position and
// normal only. A GLB that plain needs no GLTFLoader: read the JSON chunk, slice the binary chunk.
// Loaded once before the stage is built; if a file fails, models.ts keeps its procedural builder.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const urls = import.meta.glob<string>('../assets/models/*.glb', { query: '?url', import: 'default', eager: true });

export type MeshName = 'ant' | 'beetle' | 'fly' | 'snail' | 'locustking' | 'train' | 'soldier' | 'robot' | 'dino' | 'cake';

const meshes = new Map<MeshName, THREE.BufferGeometry>();

// Rigged models (scripts/art/rig_bug.py): a skinned mesh with baked clips, which needs the full loader.
const rigUrls = import.meta.glob<string>('../assets/rigs/*.glb', { query: '?url', import: 'default', eager: true });
export type RigName = 'ant' | 'beetle' | 'fly' | 'snail' | 'locustking';
export interface Rig { scene: THREE.Group; clips: THREE.AnimationClip[] }
const rigs = new Map<RigName, Rig>();

interface Gltf {
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number }[];
  bufferViews: { byteOffset?: number }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number }[] }[];
}

function parseGlb(buf: ArrayBuffer): THREE.BufferGeometry {
  const view = new DataView(buf);
  const jsonLen = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as Gltf;
  const bin = 20 + jsonLen + 8;
  const read = (i: number, size: number) => {
    const a = json.accessors[i];
    const off = bin + (json.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0);
    const n = a.count * size;
    // Copy out: the slices are not always aligned for a typed-array view.
    if (a.componentType === 5126) return new Float32Array(buf.slice(off, off + n * 4));
    if (a.componentType === 5125) return new Uint32Array(buf.slice(off, off + n * 4));
    return new Uint16Array(buf.slice(off, off + n * 2));
  };
  const prim = json.meshes[0].primitives[0];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(read(prim.attributes.POSITION, 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(read(prim.attributes.NORMAL, 3), 3));
  if (prim.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(read(prim.indices, 1), 1));
  return geo;
}

/** Fetch and parse every model; a missing or broken file is skipped. */
export async function loadMeshes(): Promise<void> {
  const loader = new GLTFLoader();
  const rigged = Object.entries(rigUrls).map(async ([path, url]) => {
    const name = path.slice(path.lastIndexOf('/') + 1, -4) as RigName;
    try {
      const gltf = await loader.loadAsync(url);
      rigs.set(name, { scene: gltf.scene, clips: gltf.animations });
    } catch {
      // The one-piece model stands in.
    }
  });
  await Promise.all([...rigged, ...Object.entries(urls).map(async ([path, url]) => {
    const name = path.slice(path.lastIndexOf('/') + 1, -4) as MeshName;
    try {
      const res = await fetch(url);
      if (res.ok) meshes.set(name, parseGlb(await res.arrayBuffer()));
    } catch {
      // Procedural fallback.
    }
  })]);
}

/** The raw geometry as exported, or undefined before loading or after a failed load. */
export function meshGeometry(name: MeshName): THREE.BufferGeometry | undefined {
  return meshes.get(name);
}

/** A rigged model as loaded (clone it before use), or undefined before loading or after a failed load. */
export function rigModel(name: RigName): Rig | undefined {
  return rigs.get(name);
}
