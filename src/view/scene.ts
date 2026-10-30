// Renderer, camera and the static set, as in the style frame (docs/art/style_r4/b_marsh.png): a
// lawn with daisies, the cake on a log slice, the wooden toy track round it with the hero's train,
// and the round marshmallow fence (its wafer sticks bitten away as the wall loses health).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { TRAIN, WALL } from '../sim/config';
import type { HeroKind } from '../sim/types';
import { animateCake, makeCake, makeContactShade, makeFence, makeHeroModel, makeLawn, makeLocomotive, makeLogSlice, makeMeadow, makeTrack, seeded } from './models';

/** A screen rectangle in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Half-extent of what the camera keeps in view: the fence plus a strip of lawn the bugs come over. */
const FIT = WALL + 0.6;
/** Track: inner and outer edge round the train's ring, and how high it stands off the grass. */
const TRACK_IN = TRAIN.radius - 0.24;
const TRACK_OUT = TRAIN.radius + 0.24;
const TRACK_TOP = 0.1;
/** The fence posts stand just inside where the bugs stop, so they chew on them. */
const FENCE_R = WALL - 0.14;
/** The stump under the cake. */
const LOG_R = 1.35;
const LOG_TOP = 0.68;
const GRASS = 0x98b444;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The cake in the middle; its candles flicker. */
  cake: THREE.Group;
  /** Fence wafers, bitten off in order as the wall loses health. */
  rails: THREE.Mesh[];
  /** The engine on the track; rebuilt per hero by setHero. */
  train: THREE.Group;
  /** The hero riding in the cab. */
  hero: THREE.Group;
  /** A faint ring on the ground round the train: how far it shoots. */
  reach: THREE.Mesh;
  /** Camera shake left, in world units; decays every frame. */
  shake: number;
  /** The part of the screen the HUD leaves for the playfield; null means the whole window. */
  board: Rect | null;
  /** Fit the camera to the window and the board; call after either changes. */
  resize(): void;
  /** Draw a frame: the scene, then the soft focus round the edges. */
  render(): void;
}

/**
 * Depth of field as in the style frame: the fort in the middle is sharp and the lawn blurs towards
 * the edges of the board, more at the far (top) side. One direction per pass; run it across, then
 * down. `centre` is the board's centre and `extent` half its shorter side, in drawing-buffer pixels, so
 * the sharp area is round and holds the fort in either orientation.
 */
const SoftFocus = {
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
      float k = smoothstep(1.0, 1.6, d) * 2.5;
      vec4 sum = texture2D(tDiffuse, vUv) * 0.1633;
      float w[4] = float[](0.1531, 0.12245, 0.0918, 0.051);
      for (int i = 0; i < 4; i++) {
        vec2 o = stride * k * float(i + 1);
        sum += (texture2D(tDiffuse, vUv + o) + texture2D(tDiffuse, vUv - o)) * w[i];
      }
      gl_FragColor = sum;
    }`,
};

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  // The lawn runs off to the horizon; fog and sky share its colour so there is no edge.
  scene.background = new THREE.Color(GRASS);
  const fog = new THREE.Fog(GRASS, 30, 60);
  scene.fog = fog;
  // Sunny afternoon: a soft studio environment so the shadow sides stay light and things get a
  // gentle sheen, a pale sky light with green bounce from the grass, and a warm sun from the left.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight(0xf6f8ff, 0x5a6a28, 1.05));
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
  sun.position.set(-8, 13, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  scene.add(sun);

  const rng = seeded(7);
  scene.add(makeLawn(rng, 120));
  // Tufts everywhere but on the log and the track; daisies and leaves outside the fence.
  scene.add(makeMeadow(rng, LOG_R + 0.05, 16, WALL + 0.7, (r) => r > TRACK_IN - 0.08 && r < TRACK_OUT + 0.08));

  scene.add(makeTrack(TRACK_IN, TRACK_OUT, TRACK_TOP));
  // The middle of the ring: the birthday cake everyone is after, on its log slice.
  scene.add(makeLogSlice(LOG_R, LOG_TOP, rng));
  // Darker grass where things stand: round the foot of the stump, along both track edges, at the fence.
  scene.add(
    makeContactShade(WALL + 1.2, [
      { r: LOG_R + 0.1, w: 0.35, k: 0.45 },
      { r: TRACK_IN, w: 0.14, k: 0.3 },
      { r: TRACK_OUT, w: 0.14, k: 0.3 },
      { r: FENCE_R, w: 0.3, k: 0.4 },
    ]),
  );
  const cake = makeCake();
  cake.position.y = LOG_TOP;
  scene.add(cake);

  const train = new THREE.Group();
  scene.add(train);
  const hero = new THREE.Group();
  const reach = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
  reach.rotation.x = -Math.PI / 2;
  reach.position.y = TRACK_TOP + 0.01;
  scene.add(reach);

  const fence = makeFence(FENCE_R, 40);
  scene.add(fence.group);
  const rails = fence.rails;
  // Break order: shuffled once so the bites look scattered all round the fence.
  for (let i = rails.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rails[i], rails[j]] = [rails[j], rails[i]];
  }

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const across = new ShaderPass(SoftFocus);
  const down = new ShaderPass(SoftFocus);
  composer.addPass(across);
  composer.addPass(down);
  composer.addPass(new OutputPass());
  let ratio = 0;
  // The quality ladder changes the pixel ratio on the renderer; the composer's buffers follow it here.
  const focus = () => {
    ratio = renderer.getPixelRatio();
    composer.setPixelRatio(ratio);
    composer.setSize(window.innerWidth, window.innerHeight);
    const b = stage.board ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    for (const [pass, dir] of [[across, [1, 0]], [down, [0, 1]]] as const) {
      const u = pass.uniforms;
      (u.stride.value as THREE.Vector2).set(dir[0] / (window.innerWidth * ratio), dir[1] / (window.innerHeight * ratio));
      (u.centre.value as THREE.Vector2).set((b.x + b.w / 2) * ratio, (window.innerHeight - b.y - b.h / 2) * ratio);
      (u.extent.value as THREE.Vector2).setScalar((Math.min(b.w, b.h) / 2) * ratio);
    }
  };
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Same framing in either orientation: the fort fills the board, wide or tall, and the
    // projection centre moves to the board's centre so the fort sits in the middle of it.
    const b = stage.board ?? { x: 0, y: 0, w, h };
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const pitch = (40 * Math.PI) / 180;
    // The near side looms larger in perspective, so the height gets more slack than the width.
    const dist = Math.max((1.12 * FIT * h) / (b.w * tan), (1.18 * FIT * Math.sin(pitch) * h) / (b.h * tan));
    camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    camera.lookAt(0, 0, 0.6);
    camera.userData.base = camera.position.clone();
    camera.setViewOffset(w, h, w / 2 - (b.x + b.w / 2), h / 2 - (b.y + b.h / 2), w, h);
    camera.updateProjectionMatrix();
    fog.near = dist + 10;
    fog.far = dist + 40;
    focus();
  };
  const render = () => {
    if (renderer.getPixelRatio() !== ratio) focus();
    composer.render();
  };
  const stage: Stage = { renderer, scene, camera, cake, rails, train, hero, reach, shake: 0, board: null, resize, render };
  resize();
  return stage;
}

/** Build the engine in the hero's colour and seat the hero in its cab, for a run. */
export function setHero(stage: Stage, kind: HeroKind): void {
  stage.train.clear();
  const loco = makeLocomotive();
  stage.train.add(loco);
  stage.hero.clear();
  stage.hero.add(makeHeroModel(kind));
  stage.hero.scale.setScalar(0.46);
  (loco.userData.seat as THREE.Object3D).add(stage.hero);
}

/** Put the train at `angle` on the track facing the way it drives, wheels turning; the reach ring follows. */
export function placeTrain(stage: Stage, angle: number, dir: number, range: number, roll: number): void {
  const x = Math.cos(angle) * TRAIN.radius;
  const z = Math.sin(angle) * TRAIN.radius;
  stage.train.position.set(x, TRACK_TOP, z);
  // Nose (+z) along the tangent of travel: dir * (-sin a, cos a).
  stage.train.rotation.y = Math.atan2(-dir * Math.sin(angle), dir * Math.cos(angle));
  const loco = stage.train.children[0];
  for (const w of (loco?.userData.wheels ?? []) as THREE.Object3D[]) w.rotation.x = roll;
  stage.reach.position.set(x, TRACK_TOP + 0.01, z);
  stage.reach.scale.setScalar(range);
}

/** Candle flicker and other idle motion of the set. */
export function animateStage(stage: Stage, t: number): void {
  animateCake(stage.cake, t);
}

/** Knock wafers off as the wall drops: none at full health, all of them at zero. */
export function paintFence(stage: Stage, frac: number): void {
  const broken = Math.round((1 - frac) * stage.rails.length);
  stage.rails.forEach((r, i) => {
    const base = r.userData.base as { y: number; rot: THREE.Euler };
    if (i < broken * 0.6) {
      r.visible = false;
    } else if (i < broken) {
      // Bitten loose and sagging.
      r.visible = true;
      r.position.y = base.y - 0.12;
      r.rotation.set(base.rot.x, base.rot.y, base.rot.z + (i % 2 ? 0.35 : -0.35));
    } else {
      r.visible = true;
      r.position.y = base.y;
      r.rotation.copy(base.rot);
    }
  });
}

/** Apply and decay camera shake. */
export function shakeCamera(stage: Stage, dt: number): void {
  const base = stage.camera.userData.base as THREE.Vector3;
  const s = stage.shake;
  stage.camera.position.set(base.x + (Math.random() - 0.5) * s, base.y + (Math.random() - 0.5) * s, base.z);
  stage.shake = Math.max(0, s - dt * 2.5);
}
