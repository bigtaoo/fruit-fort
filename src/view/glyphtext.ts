// Numbers drawn from one baked atlas (src/assets/fx/glyphs.png, made by scripts/art/glyphs.py): digits,
// + - x % K M ! and the dot, white with a navy outline. Every glyph of every live string is a quad in
// one instanced mesh, turned to the camera in the vertex shader like a sprite: one draw for all the
// floating numbers on screen, no canvas or texture made per number. The colour multiplies the white
// fill, so the same letters serve gold, damage and heals.

import * as THREE from 'three';
import atlasPng from '../assets/fx/glyphs.png';
import meta from '../assets/fx/glyphs.json';

/** Most glyphs drawn at once; past it the rest of the frame's text is dropped. */
const MAX_GLYPHS = 320;
const GLYPHS = meta.glyphs as unknown as Record<string, [number, number, number, number]>;
const [AW, AH] = meta.size;
/** A space, in atlas pixels: half a digit. */
const SPACE = GLYPHS['0'][3] / 2;
const tmpMat = new THREE.Matrix4();
const tmpColor = new THREE.Color();

export class GlyphText {
  readonly mesh: THREE.InstancedMesh;
  private uv: THREE.InstancedBufferAttribute;
  private quad: THREE.InstancedBufferAttribute;
  private alpha: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor() {
    const tex = new THREE.TextureLoader().load(atlasPng);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 1;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    // Past white before the colour grade (post.ts), which darkens the scene and rolls off its light: the
    // numbers come out about as bright as the colour asked for. Tone mapping is off for the same reason.
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec4 glyphUv;\nattribute vec4 glyphQuad;\nattribute float glyphAlpha;\nvarying float vGlyphAlpha;\n' + sh.vertexShader
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = glyphUv.xy + uv * glyphUv.zw;')
        .replace(
          '#include <project_vertex>',
          `vGlyphAlpha = glyphAlpha;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          mvPosition.xy += glyphQuad.xy + (position.xy + 0.5) * glyphQuad.zw;
          gl_Position = projectionMatrix * mvPosition;`,
        );
      sh.fragmentShader = 'varying float vGlyphAlpha;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vGlyphAlpha;\ndiffuseColor.rgb *= 1.35;');
    };
    mat.customProgramCacheKey = () => 'glyph';
    const geo = new THREE.PlaneGeometry(1, 1);
    const attr = (size: number) => new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLYPHS * size), size).setUsage(THREE.DynamicDrawUsage);
    this.uv = attr(4);
    this.quad = attr(4);
    this.alpha = attr(1);
    geo.setAttribute('glyphUv', this.uv);
    geo.setAttribute('glyphQuad', this.quad);
    geo.setAttribute('glyphAlpha', this.alpha);
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_GLYPHS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, tmpColor.set(0xffffff));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.count = 0;
  }

  /**
   * One string for this frame, centred on (x, y, z), `height` world units from the top of a cell to
   * its bottom (the digits fill about 70% of it). Characters without a glyph are skipped.
   */
  put(text: string, x: number, y: number, z: number, height: number, color: THREE.ColorRepresentation, alpha = 1): void {
    const k = height / meta.cell;
    let ink = -meta.gap;
    for (const ch of text) ink += (GLYPHS[ch]?.[3] ?? SPACE) + meta.gap;
    let pen = -ink / 2;
    tmpColor.set(color);
    for (const ch of text) {
      const g = GLYPHS[ch];
      if (!g) {
        pen += SPACE + meta.gap;
        continue;
      }
      if (this.n >= MAX_GLYPHS) return;
      const i = this.n++;
      const [gx, gy, gw, adv] = g;
      this.mesh.setMatrixAt(i, tmpMat.makeTranslation(x, y, z));
      this.mesh.setColorAt(i, tmpColor);
      this.uv.setXYZW(i, gx / AW, 1 - (gy + meta.cell) / AH, gw / AW, meta.cell / AH);
      this.quad.setXYZW(i, (pen - meta.pad) * k, -height / 2, gw * k, height);
      this.alpha.setX(i, alpha);
      pen += adv + meta.gap;
    }
  }

  /** Send this frame's strings to the GPU and start the next frame empty. */
  flush(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.uv.needsUpdate = true;
    this.quad.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.n = 0;
  }
}
