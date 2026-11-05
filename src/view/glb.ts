// The one mesh of an untextured Tripo GLB (cleaned in Blender: POSITION, NORMAL and indices only).
// The files ship as plain assets; boot.ts downloads them behind the loading screen (keepGlb), so by the
// time the game chunk runs every model is in memory and is still built synchronously like the rest of the scene.

/** Every model file, by source path: the bugs (the heroes are built in code, troopers.ts). */
export const GLB_URLS = import.meta.glob(['../assets/bugs/*.glb'], { query: '?url', import: 'default', eager: true }) as Record<string, string>;

const loaded = new Map<string, ArrayBuffer>();

/** Keep a downloaded model file (`path` is its key in GLB_URLS). */
export function keepGlb(path: string, buf: ArrayBuffer): void {
  loaded.set(path, buf);
}

export interface Shell {
  pos: Float32Array;
  nrm: Float32Array;
  idx: Uint32Array;
}

/** The positions, normals and indices of the first mesh in a GLB file. */
export function readGlb(buf: ArrayBuffer): Shell {
  const view = new DataView(buf);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLength)));
  const bin = 20 + jsonLength + 8;
  const read = (i: number): Float32Array | Uint32Array => {
    const a = json.accessors[i];
    const at = bin + (json.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0);
    if (a.componentType === 5126) return new Float32Array(buf.slice(at, at + a.count * (a.type === 'VEC3' ? 12 : 4)));
    if (a.componentType === 5125) return new Uint32Array(buf.slice(at, at + a.count * 4));
    return Uint32Array.from(new Uint16Array(buf.slice(at, at + a.count * 2)));
  };
  const p = json.meshes[0].primitives[0];
  return { pos: read(p.attributes.POSITION) as Float32Array, nrm: read(p.attributes.NORMAL) as Float32Array, idx: read(p.indices) as Uint32Array };
}

/** The model file named `name`, or null if it is missing or didn't download. */
export function findGlb(name: string): Shell | null {
  const buf = [...loaded].find(([path]) => path.endsWith(`/${name}.glb`))?.[1];
  return buf ? readGlb(buf) : null;
}
