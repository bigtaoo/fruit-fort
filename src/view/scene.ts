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
import { animateCake, driveLocomotive, makeCake, makeContactShade, makeFence, type Fence, type FenceBiter, makeHeroModel, makeLawn, makeLocomotive, makeLogSlice, makeMeadow, makeTrack, makeTurf, seeded, wind, makeBlanket, makeCakeStand, makePicnicProps } from './models';

/** A screen rectangle in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Half-extent of what the camera keeps in view: the fence plus a band of lawn round it, so the bugs
 * show a good while before they reach the fence rather than popping in at the edge of the board.
 * Across, the band is narrower: on a tall phone the width is what limits, and a wide band there
 * shrinks the fort while the height above and below already shows the lawn the bugs come over.
 */
const FIT = WALL + 1.9;
const FIT_ACROSS = WALL + 1.0;
/** Track: inner and outer edge round the train's ring, and how high it stands off the grass. */
const TRACK_IN = TRAIN.radius - 0.4;
const TRACK_OUT = TRAIN.radius + 0.32;
const TRACK_TOP = 0.12;
/** The fence posts stand just inside where the bugs stop, so they chew on them. */
const FENCE_R = WALL - 0.14;
/** The stump under the cake. */
const LOG_R = 1.35;
const LOG_TOP = 0.68;
const GRASS = 0x98b444;
/**
 * Prototype (§16.18): the board on a yellow gingham picnic blanket, the cake on a cake stand, and the
 * lawn only round the blanket. `?ground=lawn` brings back the all-lawn board to compare.
 */
const BLANKET = new URLSearchParams(location.search).get('ground') !== 'lawn';
/** From the middle to each edge of the blanket, how far it's turned, and the checks' width. */
const CLOTH = WALL + 2.6;
const CLOTH_YAW = 0.18;
/** How far real grass reaches out from the blanket's hem before the baked turf takes over. */
const GRASS_BAND = 2.4;
/** Outer half-size of the frame that catches shadows on the baked ground round the cloth. */
const OUT = CLOTH + GRASS_BAND;
/** The game camera looks down this far from level (the baked turf is drawn along the same line). */
const PITCH = (56 * Math.PI) / 180;
const CHECK = 0.36;
/** The cake stand: plate radius and the height of its top. */
const STAND_R = 1.1;
const STAND_TOP = 0.34;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The cake in the middle; its candles flicker. */
  cake: THREE.Group;
  /** The fence: a bitten post rocks and flushes red, and the fence breaks where it was bitten (Fence). */
  fence: Fence;
  /** The engine on the track; rebuilt per hero by setHero. */
  train: THREE.Group;
  /** The hero riding in the cab. */
  hero: THREE.Group;
  /** A faint ring on the ground round the train: how far it shoots. Shown only for a moment after the range changes. */
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
 * the sharp area is round and holds the fort in either orientation. The fort itself stays sharp:
 * only the lawn well past the fence softens.
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
const Sharpen = {
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
      float amount = 0.35 * (1.0 - smoothstep(1.7, 2.1, d));
      vec4 c = texture2D(tDiffuse, vUv);
      vec4 n = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)) + texture2D(tDiffuse, vUv - vec2(texel.x, 0.0))
             + texture2D(tDiffuse, vUv + vec2(0.0, texel.y)) + texture2D(tDiffuse, vUv - vec2(0.0, texel.y));
      gl_FragColor = vec4(max(c.rgb + (c.rgb - n.rgb * 0.25) * amount, 0.0), c.a);
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
  // Sunny afternoon under a light haze: the sun is gentle and the sky and the soft studio
  // environment carry more of the light, so shadows are soft and the grass doesn't glare.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  const sky = new THREE.HemisphereLight(0xf6f8ff, 0x4a5a20, 0.75);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xfff4e4, 4.2);
  sun.position.set(-9, 12, 5);
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
  const cake = makeCake(BLANKET ? 0xf4a6ba : undefined);
  if (BLANKET) {
    // Real grass and flowers grow only in a band round the blanket, thinning out raggedly so there is
    // no line where they stop; the tufts along the hem lap a little over the cloth. Under and beyond
    // them the ground is the same grass baked into a texture.
    const cos = Math.cos(CLOTH_YAW);
    const sin = Math.sin(CLOTH_YAW);
    const skip = (x: number, z: number) => {
      const m = Math.max(Math.abs(x * cos - z * sin), Math.abs(x * sin + z * cos));
      const n = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      return m < CLOTH - 0.06 || m > CLOTH + GRASS_BAND * (0.4 + 0.6 * n);
    };
    const meadow = makeMeadow(rng, 0, 16, CLOTH + 0.6, () => false, [], skip);
    const light = (set: THREE.Scene) => {
      set.environment = scene.environment;
      set.environmentIntensity = scene.environmentIntensity;
      const lamp = sun.clone();
      lamp.castShadow = false;
      set.add(sky.clone(), lamp);
    };
    scene.add(makeTurf(renderer, rng, 120, PITCH, light, meadow.userData.tint), meadow);
    // The baked ground is unlit, so it takes no shadow; this frame round the cloth catches the
    // shadows of the flowers and leaves in the band.
    const frame = new THREE.Shape().moveTo(-OUT, -OUT).lineTo(OUT, -OUT).lineTo(OUT, OUT).lineTo(-OUT, OUT);
    frame.holes.push(new THREE.Path().moveTo(-CLOTH, -CLOTH).lineTo(-CLOTH, CLOTH).lineTo(CLOTH, CLOTH).lineTo(CLOTH, -CLOTH));
    const shade = new THREE.Mesh(new THREE.ShapeGeometry(frame).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.45, depthWrite: false }));
    shade.position.y = 0.003;
    shade.rotation.y = CLOTH_YAW;
    shade.receiveShadow = true;
    scene.add(shade);
    scene.add(makeBlanket(rng, CLOTH, CLOTH_YAW, CHECK));
    // Honey wood with dark grooves: the pale toy-box wood went warm-on-warm into the cloth.
    scene.add(makeTrack(TRACK_IN, TRACK_OUT, TRACK_TOP, 0xc98a4a, 0x8a5226));
    scene.add(makeCakeStand(STAND_R, STAND_TOP));
    // A napkin on the near side, clear of the fence, with a spoon and two strawberries on it: lying
    // loose on the far side the berries read as a pickup.
    const { napkin, berries } = makePicnicProps(rng);
    napkin.position.set(-2.5, 0.02, 5.0);
    napkin.rotation.y = 0.5;
    berries.position.set(0.1, 0.03, -0.32);
    napkin.add(berries);
    scene.add(napkin);
    // A warm shade on the cloth round the stand's foot, along both track edges and at the fence.
    scene.add(
      makeContactShade(
        WALL + 1.2,
        [
          { r: 0.5, w: 0.3, k: 0.4 },
          { r: TRACK_IN, w: 0.2, k: 0.55 },
          { r: TRACK_OUT, w: 0.2, k: 0.55 },
          { r: FENCE_R, w: 0.3, k: 0.4 },
        ],
        0x6a4818,
      ),
    );
    cake.position.y = STAND_TOP;
  } else {
    scene.add(makeLawn(rng, 120));
    // Tufts everywhere but on the log and the track; daisies and leaves outside the fence.
    scene.add(
      makeMeadow(rng, LOG_R + 0.05, 16, WALL + 0.7, (r) => r > TRACK_IN - 0.08 && r < TRACK_OUT + 0.08, [
        [LOG_R, LOG_R + 0.14],
        [TRACK_IN - 0.14, TRACK_IN - 0.02],
        [TRACK_OUT + 0.02, TRACK_OUT + 0.14],
        [FENCE_R - 0.12, FENCE_R + 0.12],
      ]),
    );

    scene.add(makeTrack(TRACK_IN, TRACK_OUT, TRACK_TOP));
    // The middle of the ring: the birthday cake everyone is after, on its log slice.
    scene.add(makeLogSlice(LOG_R, LOG_TOP, rng));
    // Darker grass where things stand: round the foot of the stump, along both track edges, at the fence.
    scene.add(
      makeContactShade(WALL + 1.2, [
        { r: LOG_R + 0.1, w: 0.4, k: 0.6 },
        { r: TRACK_IN, w: 0.16, k: 0.45 },
        { r: TRACK_OUT, w: 0.16, k: 0.45 },
        { r: FENCE_R, w: 0.35, k: 0.55 },
      ]),
    );
    cake.position.y = LOG_TOP;
  }
  scene.add(cake);

  const train = new THREE.Group();
  scene.add(train);
  const hero = new THREE.Group();
  const reach = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  reach.visible = false;
  reach.rotation.x = -Math.PI / 2;
  reach.position.y = TRACK_TOP + 0.01;
  scene.add(reach);

  const fence = makeFence(FENCE_R, 40);
  scene.add(fence.group);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 300);
  // The composer draws into its own buffer, which needs its own multisampling: without it the thin
  // grass blades shimmer with jagged edges whatever `antialias` says.
  // The stencil is for the bugs' x-ray (`BUG_XRAY`).
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true }));
  composer.addPass(new RenderPass(scene, camera));
  const across = new ShaderPass(SoftFocus);
  const down = new ShaderPass(SoftFocus);
  composer.addPass(across);
  composer.addPass(down);
  const sharpen = new ShaderPass(Sharpen);
  composer.addPass(sharpen);
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
    const s = sharpen.uniforms;
    (s.texel.value as THREE.Vector2).set(1 / (window.innerWidth * ratio), 1 / (window.innerHeight * ratio));
    (s.centre.value as THREE.Vector2).copy(across.uniforms.centre.value as THREE.Vector2);
    (s.extent.value as THREE.Vector2).copy(across.uniforms.extent.value as THREE.Vector2);
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
    // The near side looms larger in perspective, so the height gets more slack than the width.
    const dist = Math.max((1.06 * FIT_ACROSS * h) / (b.w * tan), (1.12 * FIT * Math.sin(PITCH) * h) / (b.h * tan));
    camera.position.set(0, Math.sin(PITCH) * dist, Math.cos(PITCH) * dist);
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
  const stage: Stage = { renderer, scene, camera, cake, fence, train, hero, reach, shake: 0, board: null, resize, render };
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

/** What the engine reacts to: a shot, a reversal, a stat bought, the hero's skill, the end of the run. */
export type TrainKick = 'fire' | 'reverse' | 'buy' | 'cast' | 'over' | 'revive';
/** How long each one-off reaction runs, in seconds of the view clock. */
const KICK_TIME: Record<Exclude<TrainKick, 'over' | 'revive'>, number> = { fire: 0.16, reverse: 0.8, buy: 0.55, cast: 0.9 };
/** Lean into the ring, as a toy pushed round a bend tips that way; radians. */
const LEAN = 0.035;
/** Height of the engine's frame above the rail: the body squashes and stretches about it. */
const SPRING_Y = 0.38;

/**
 * Start a reaction of the engine, at `t` on the view clock. One already running is left to finish
 * rather than restarted: fast fire or a burst of buys would otherwise snap it back to its start every
 * few frames and shake. 'over' slumps it until 'revive' (or the next run's new engine).
 */
export function kickTrain(stage: Stage, kind: TrainKick, t: number): void {
  const loco = stage.train.children[0];
  if (!loco) return;
  const k = (loco.userData.kick ??= {}) as Partial<Record<TrainKick, number>>;
  if (kind === 'revive') delete k.over;
  else if (kind === 'over') k.over ??= t;
  else if (k[kind] === undefined || t - k[kind]! >= KICK_TIME[kind]) k[kind] = t;
}

/** Twice per wheel turn, the beat the engine chuffs to: how many beats lie between two `roll`s. */
export function chuffs(from: number, to: number): number {
  return Math.max(0, Math.floor(to / Math.PI) - Math.floor(from / Math.PI));
}

/** 0..1 through a reaction started at `at`, or -1 when none is running. */
function kickAt(at: number | undefined, dur: number, t: number): number {
  if (at === undefined) return -1;
  const u = (t - at) / dur;
  return u >= 0 && u < 1 ? u : -1;
}

/** A hop over the first `air` of a reaction, then the landing squash: [height 0..1, squash 0..1]. */
function hop(u: number, air: number): [number, number] {
  if (u < 0) return [0, 0];
  if (u < air) return [Math.sin((Math.PI * u) / air), 0];
  return [0, Math.sin((Math.PI * (u - air)) / (1 - air))];
}

/**
 * The engine's body on its springs. Driving, it chuffs twice per wheel turn (a quick lift and a
 * chimney stretch that eases off), rocks a little once per turn and leans into the ring; the
 * reactions from kickTrain go on top. Kept small: from the camera the engine is ~150 px long.
 */
function poseLocomotive(loco: THREE.Object3D, dir: number, roll: number, t: number): void {
  const body = loco.userData.body as THREE.Object3D | undefined;
  const stack = loco.userData.stack as THREE.Object3D | undefined;
  if (!body || !stack) return;
  const k = (loco.userData.kick ?? {}) as Partial<Record<TrainKick, number>>;
  // Chuff: a fast rise over the first 15% of the beat, then a slow ease back.
  const f = roll / Math.PI - Math.floor(roll / Math.PI);
  const chuff = f < 0.15 ? f / 0.15 : Math.exp(-(f - 0.15) * 6);
  let y = 0.025 * chuff;
  let z = 0;
  let pitch = 0;
  let tilt = dir * LEAN + 0.012 * Math.sin(roll);
  let stretch = 0;
  let puff = 0.14 * chuff;
  // Shot: a small kick back and nose-up, over in a sixth of a second.
  const fire = kickAt(k.fire, KICK_TIME.fire, t);
  if (fire >= 0) {
    const b = Math.sin(Math.PI * fire);
    z -= 0.025 * b;
    pitch -= 0.02 * b;
  }
  // Reverse: the brakes bite, the nose dips and lurches on, then bobs back past level and settles.
  const rev = kickAt(k.reverse, KICK_TIME.reverse, t);
  if (rev >= 0) {
    const s = rev * KICK_TIME.reverse;
    const d = Math.exp(-5 * s) * Math.sin((2 * Math.PI * s) / 0.5);
    pitch += 0.1 * d;
    z += 0.04 * d;
  }
  // Buy: a happy hop of the whole engine, stretched in the air and squashed on landing.
  const [buyUp, buyLand] = hop(kickAt(k.buy, KICK_TIME.buy, t), 0.7);
  // Skill: a bigger hop rearing up, the chimney shooting up like a whistle and wobbling back.
  const castU = kickAt(k.cast, KICK_TIME.cast, t);
  const [castUp, castLand] = hop(castU, 0.6);
  if (castU >= 0) puff += 0.45 * Math.sin(Math.PI * castU) * (1 + 0.25 * Math.sin(castU * 40));
  stretch += 0.07 * buyUp - 0.1 * buyLand + 0.08 * castUp - 0.14 * castLand;
  pitch -= 0.05 * castUp;
  // Game over: sinks on its springs, slumps sideways and the chimney droops.
  const sag = k.over === undefined ? 0 : THREE.MathUtils.smoothstep(t - k.over, 0, 0.6);
  y -= 0.03 * sag;
  tilt += 0.07 * sag;
  puff -= 0.18 * sag;
  loco.position.y = 0.1 * buyUp + 0.2 * castUp;
  // Squash and stretch about the top of the frame, not the rail, so a squash doesn't push the cab
  // down over the wheels.
  body.position.set(0, y - SPRING_Y * stretch, z);
  body.rotation.set(pitch, 0, tilt);
  body.scale.set(1 - stretch / 2, 1 + stretch, 1 - stretch / 2);
  // The chimney keeps its volume: taller is thinner.
  stack.scale.set(1 / Math.sqrt(1 + puff), 1 + puff, 1 / Math.sqrt(1 + puff));
}

/** Seconds the reach ring stays up after the range changes, then how long it takes to fade. */
const REACH_HOLD = 1.2;
const REACH_FADE = 0.8;

/**
 * Put the train at `angle` on the track facing the way it drives, wheels turning; the reach ring
 * follows. Left on, the ring crossed the whole lawn as a pale stripe, so it only shows for a moment
 * when `range` changes (a Range upgrade, a new run); `t` is the view clock in seconds.
 */
export function placeTrain(stage: Stage, angle: number, dir: number, range: number, roll: number, t: number): void {
  const x = Math.cos(angle) * TRAIN.radius;
  const z = Math.sin(angle) * TRAIN.radius;
  stage.train.position.set(x, TRACK_TOP, z);
  // Nose (+z) along the tangent of travel: dir * (-sin a, cos a).
  stage.train.rotation.y = Math.atan2(-dir * Math.sin(angle), dir * Math.cos(angle));
  const loco = stage.train.children[0];
  if (loco) {
    driveLocomotive(loco, roll);
    poseLocomotive(loco, dir, roll, t);
  }
  stage.reach.position.set(x, TRACK_TOP + 0.01, z);
  stage.reach.scale.setScalar(range);
  const ring = stage.reach.userData as { range?: number; at?: number };
  if (ring.range !== range) {
    ring.range = range;
    ring.at = t;
  }
  const fade = 1 - Math.min(1, Math.max(0, (t - ring.at! - REACH_HOLD) / REACH_FADE));
  (stage.reach.material as THREE.MeshBasicMaterial).opacity = 0.35 * fade;
  stage.reach.visible = fade > 0;
}

/** Candle flicker and other idle motion of the set. */
export function animateStage(stage: Stage, t: number): void {
  wind.value = t;
  animateCake(stage.cake, t);
  stage.fence.wobble(t);
}

/**
 * Break or mend the fence to match the wall's health; returns where posts were mended this frame.
 * A post chewed down to a stump gives the camera one short thump (about every 2.5% of the wall);
 * the bites themselves only rock their post, so a long siege doesn't keep the screen jittering.
 */
export function paintFence(stage: Stage, frac: number, biters: FenceBiter[]): { x: number; z: number }[] {
  const { mended, felled } = stage.fence.paint(frac, biters);
  if (felled) stage.shake = Math.max(stage.shake, 0.14);
  return mended;
}

/** Apply and decay camera shake. */
export function shakeCamera(stage: Stage, dt: number): void {
  const base = stage.camera.userData.base as THREE.Vector3;
  const s = stage.shake;
  stage.camera.position.set(base.x + (Math.random() - 0.5) * s, base.y + (Math.random() - 0.5) * s, base.z);
  stage.shake = Math.max(0, s - dt * 2.5);
}
