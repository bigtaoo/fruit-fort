// The one mesh of an untextured Tripo GLB (cleaned in Blender: POSITION, NORMAL and indices only),
// read straight from the inlined data URL so a model is built synchronously like the rest of the scene.

export interface Shell {
  pos: Float32Array;
  nrm: Float32Array;
  idx: Uint32Array;
}

/** The positions, normals and indices of the first mesh in a GLB given as a base64 data URL. */
export function readGlb(url: string): Shell {
  const bytes = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (ch) => ch.charCodeAt(0));
  const buf = bytes.buffer;
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

/** The GLB in `files` (an import.meta.glob of inlined URLs) named `name`, or null if there is none. */
export function findGlb(files: Record<string, string>, name: string): Shell | null {
  const url = Object.entries(files).find(([path]) => path.endsWith(`/${name}.glb`))?.[1];
  return url ? readGlb(url) : null;
}
