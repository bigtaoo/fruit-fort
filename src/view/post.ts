// The render passes: the scene into its own buffer, then depth of field, sharpening and the colour grade.
// createStage (scene.ts) chains them in that order.

import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Depth of field as in the style frame: the fort in the middle is sharp and the ground blurs towards
 * the edges of the board, more at the far (top) side. One direction per pass; run it across, then
 * down. `centre` is the board's centre and `extent` half its shorter side, in drawing-buffer pixels, so
 * the sharp area is round and holds the fort in either orientation. The fort itself stays sharp:
 * only the ground well past the fence softens.
 */
export const SoftFocus = {
  uniforms: {
    tDiffuse: { value: null },
    stride: { value: new THREE.Vector2() },
    centre: { value: new THREE.Vector2() },
    extent: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 stride; uniform vec2 centre; uniform vec2 extent; varying vec2 vUv;
    void main() {
      vec2 p = (gl_FragCoord.xy - centre) / extent;
      float d = length(p) + max(p.y, 0.0) * 0.35;
      float k = smoothstep(1.9, 2.9, d) * 0.4;
      vec4 sum = texture2D(tDiffuse, vUv) * 0.1633;
      float w[4] = float[](0.1531, 0.12245, 0.0918, 0.051);
      for (int i = 0; i < 4; i++) {
        vec2 o = stride * k * float(i + 1);
        sum += (texture2D(tDiffuse, vUv + o) + texture2D(tDiffuse, vUv - o)) * w[i];
      }
      gl_FragColor = sum;
    }`,
};

/**
 * A light unsharp mask after the blur: the multisampled grass and the soft toy shapes read a little
 * mushy at phone size, and this brings the edges back. Only where SoftFocus left the picture sharp,
 * so the blurred lawn at the edges stays soft. Runs in linear light, before tone mapping.
 */
export const Sharpen = {
  uniforms: {
    tDiffuse: { value: null },
    texel: { value: new THREE.Vector2() },
    centre: { value: new THREE.Vector2() },
    extent: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: SoftFocus.vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 texel; uniform vec2 centre; uniform vec2 extent; varying vec2 vUv;
    void main() {
      vec2 p = (gl_FragCoord.xy - centre) / extent;
      float d = length(p) + max(p.y, 0.0) * 0.35;
      float amount = 0.18 * (1.0 - smoothstep(1.7, 2.1, d));
      vec4 c = texture2D(tDiffuse, vUv);
      vec4 n = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)) + texture2D(tDiffuse, vUv - vec2(texel.x, 0.0))
             + texture2D(tDiffuse, vUv + vec2(0.0, texel.y)) + texture2D(tDiffuse, vUv - vec2(0.0, texel.y));
      gl_FragColor = vec4(max(c.rgb + (c.rgb - n.rgb * 0.25) * amount, 0.0), c.a);
    }`,
};

/** Draws the scene into a buffer of its own and leaves the composer's alone (TexturePass copies it in). */
export class DrawScene extends Pass {
  constructor(private scene: THREE.Scene, private camera: THREE.Camera, private target: THREE.WebGLRenderTarget) {
    super();
    this.needsSwap = false;
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }
}

/**
 * Colour grade, in the warm storybook look of games like Infinity Nikki: the bright cloth and white
 * posts roll off before they glare, the light is a touch darker and richer, highlights lean peach
 * and shadows lean lilac (so a shadow reads as cool shade, not grey), and the corners of the board
 * fall off into a warm brown vignette that holds the eye on the fort. Linear light, before tone mapping.
 */
export const Grade = {
  uniforms: {
    tDiffuse: { value: null },
    centre: { value: new THREE.Vector2() },
    extent: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: SoftFocus.vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 centre; uniform vec2 extent; varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb * 0.9;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Soft shoulder from 0.45 up, so a white post or the lit cloth tops out well short of white.
      float k = l < 0.45 ? l : 0.45 + (l - 0.45) / (1.0 + (l - 0.45) * 1.8);
      c *= k / max(l, 1e-4);
      c = mix(vec3(k), c, 0.96);
      // A touch of gamma in the mids: shade and crevices read deeper without crushing the brights.
      c = pow(c, vec3(1.08));
      c *= mix(vec3(0.95, 0.96, 1.07), vec3(1.02, 1.0, 0.96), smoothstep(0.02, 0.4, k));
      vec2 p = (gl_FragCoord.xy - centre) / extent;
      float v = smoothstep(0.8, 2.2, length(p) + max(p.y, 0.0) * 0.25);
      c *= mix(vec3(1.0), vec3(0.74, 0.66, 0.64), v);
      gl_FragColor = vec4(max(c, 0.0), src.a);
    }`,
};
