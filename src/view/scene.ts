// Renderer, camera and the static set, as in the concept (docs/art/scifi_r2): a desert outpost with
// the reactor in the middle, the mag rail round it with the hero's hover tank, and the ring of shield
// pylons (their panels knocked out as the wall loses health). The set pieces are in scifi.ts, the
// ground, rocks and crystals in terrain.ts; the picnic set it replaced is in leftovers/.

import * as THREE from 'three';
import { spinOff } from './spin';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { TRAIN, WALL } from '../sim/config';
import type { HeroKind } from '../sim/types';
import { bugEnvironment, makeContactShade, seeded } from './models';
import { makeFence, type Fence, type FenceBiter } from './fence';
import { flatten } from './flatten';
import { makeHoldRing } from './holdring';
import { frameCamera, type Board } from './frame';
import { CYAN_KEY, DrawScene, Grade, Sharpen, SoftFocus } from './post';
import { animateReactor, makeMagRail, makeReactor, LAND, RAIL_CHASE } from './scifi';
import { makeHoverTank } from './tank';
import { makeHero } from './troopers';
import { animateCurrent, makeTerrain } from './terrain';

export type { Board, Rect } from './frame';

/**
 * Half-extent of what the camera keeps in view: the fence plus a wide band of ground round it, the
 * same every way, about one and a half times the fence's radius, so the bugs are seen well before
 * they reach the fence from any side. Still inside SPAWN_NEAR (9), so none pop in on screen.
 * On a narrow board (a phone upright, about 0.6 wide to tall) the width is what limits and that band
 * would shrink the fort to a dot, so there the band is thin across and the height shows the ground
 * beyond; from about 0.75 up it eases back to the full band.
 */
const FIT = WALL + 5;
const FIT_TALL = WALL + 2.4;
const FIT_TALL_ACROSS = WALL + 0.9;
/** How high the rail stands off the ground. */
const TRACK_TOP = 0.12;
/** The fence posts stand just inside where the bugs stop, so they chew on them. */
const FENCE_R = WALL - 0.14;
/** The game camera looks down this far from level (the baked turf is drawn along the same line). */
const PITCH = (56 * Math.PI) / 180;
export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The reactor in the middle; its core pulses. */
  cake: THREE.Group;
  /** The fence: a bitten post rocks and flushes red, and the fence breaks where it was bitten (Fence). */
  fence: Fence;
  /** The engine on the track; rebuilt per hero by setHero. */
  train: THREE.Group;
  /** The hero riding in the cab. */
  hero: THREE.Group;
  /** A faint ring on the ground round the train: how far it shoots. Shown only for a moment after the range changes. */
  reach: THREE.Mesh;
  /** The guide's dashed ring outside the fence, where the bugs wait for the player (§12.2); see holdRing. */
  hold: THREE.Mesh;
  /** Camera shake left, in world units; decays every frame. */
  shake: number;
  /** A run's opening dolly left (1 at the start, 0 when done): the camera pulls in from further back. */
  intro: number;
  /** The part of the screen the HUD leaves for the playfield (frame.ts); null means the whole window. */
  board: Board | null;
  /** The soft glow round the cyan lights; the quality ladder turns it off on slow devices. */
  glow: { enabled: boolean };
  /** Fit the camera to the window and the board; call after either changes. */
  resize(): void;
  /** Draw a frame: the scene, then the soft focus round the edges. */
  render(): void;
  /** Compile the shaders of everything visible now, as the scene draw will use them, so none stalls a later frame. */
  warm(): void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  // PCF, not PCFSoft: three r186 dropped PCFSoft and swaps it for PCF on the first shadow render, so every program
  // warmed with the old type was compiled again when the first bugs came in.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  // The sand runs off to the horizon; fog and sky share a colour so there is no edge.
  scene.background = new THREE.Color(LAND.fog);
  const fog = new THREE.Fog(LAND.fog, 30, 60);
  scene.fog = fog;
  // A cold, clear light: a white sun from low on the left, a blue sky filling the shade, and the
  // soft studio environment for the sheen on the armour.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  bugEnvironment(scene.environment);
  // More sky and less sun than a real noon: the toys read soft and rounded, not hard-lit plastic.
  // A clear blue sky, a whiter sun, the ground's own colour bounced back up.
  const sky = new THREE.HemisphereLight(0xcfe2ff, LAND.bounce, 0.85);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.7);
  // High enough that the fence casts short shadows rather than long stripes across the track.
  sun.position.set(-7, 14, 7);
  sun.castShadow = true;
  // Shade, not black: the sand shows through.
  sun.shadow.intensity = 0.85;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  scene.add(sun);

  const rng = seeded(7);
  const cake = makeReactor();
  flatten(cake);
  scene.add(makeTerrain(120, rng));
  scene.add(makeMagRail(TRAIN.radius, TRACK_TOP));
  // A darker ring round the reactor's foot and along the pylons.
  scene.add(
    makeContactShade(
      WALL + 1.2,
      [
        { r: 1.4, w: 0.35, k: 0.5 },
        { r: FENCE_R, w: 0.3, k: 0.45 },
      ],
      LAND.shade,
    ),
  );
  scene.add(cake);

  const train = new THREE.Group();
  scene.add(train);
  const hero = new THREE.Group();
  const reach = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  reach.visible = false;
  reach.rotation.x = -Math.PI / 2;
  reach.position.y = TRACK_TOP + 0.01;
  scene.add(reach);

  const fence = makeFence(FENCE_R, 24);
  scene.add(fence.group);
  const hold = makeHoldRing(TRACK_TOP + 0.01);
  scene.add(hold);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 300);
  // The scene draws into its own buffer, which needs its own multisampling: without it the thin
  // grass blades shimmer with jagged edges whatever `antialias` says. The stencil is for the bugs'
  // x-ray (`BUG_XRAY`). Only this first draw gets them: the composer clones its buffer for every
  // full-screen pass after, and on a multisampled, stencilled one each pass cost a resolve
  // (~12 ms apiece on an integrated GPU at 1536×1152, 90 ms a frame in all).
  const sceneBuffer = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true });
  // Only the colour is read after: resolving the multisampled depth and stencil too cost ~6 ms a frame.
  sceneBuffer.resolveDepthBuffer = false;
  sceneBuffer.resolveStencilBuffer = false;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
  composer.addPass(new DrawScene(scene, camera, sceneBuffer));
  composer.addPass(new TexturePass(sceneBuffer.texture));
  const across = new ShaderPass(SoftFocus);
  const down = new ShaderPass(SoftFocus);
  composer.addPass(across);
  composer.addPass(down);
  const sharpen = new ShaderPass(Sharpen);
  composer.addPass(sharpen);
  // A soft glow round our side's cyan lights, before the grade: the energy of the rail, the shields
  // and the reactor. Keyed on the cyan (CYAN_KEY), not on brightness, so the sunlit white armour and
  // the ice stay crisp. A dozen small full-screen passes at half size and below, so only the top
  // quality level draws it (quality.ts).
  const glow = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.4, 1.2);
  glow.materialHighPassFilter.fragmentShader = CYAN_KEY;
  (glow.highPassUniforms as Record<string, THREE.IUniform>).smoothWidth.value = 0.6;
  composer.addPass(glow);
  const grade = new ShaderPass(Grade);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  let ratio = 0;
  /** Where the fight area landed on screen, for the soft focus round it. */
  let spot = { x: 0, y: 0, r: 1 };
  // The quality ladder changes the pixel ratio on the renderer; the composer's buffers follow it here.
  const focus = () => {
    ratio = renderer.getPixelRatio();
    composer.setPixelRatio(ratio);
    composer.setSize(window.innerWidth, window.innerHeight);
    sceneBuffer.setSize(window.innerWidth * ratio, window.innerHeight * ratio);
    for (const [pass, dir] of [[across, [1, 0]], [down, [0, 1]]] as const) {
      const u = pass.uniforms;
      (u.stride.value as THREE.Vector2).set(dir[0] / (window.innerWidth * ratio), dir[1] / (window.innerHeight * ratio));
      (u.centre.value as THREE.Vector2).set(spot.x * ratio, (window.innerHeight - spot.y) * ratio);
      (u.extent.value as THREE.Vector2).setScalar(spot.r * ratio);
    }
    const s = sharpen.uniforms;
    (s.texel.value as THREE.Vector2).set(1 / (window.innerWidth * ratio), 1 / (window.innerHeight * ratio));
    (s.centre.value as THREE.Vector2).copy(across.uniforms.centre.value as THREE.Vector2);
    (s.extent.value as THREE.Vector2).copy(across.uniforms.extent.value as THREE.Vector2);
    (grade.uniforms.centre.value as THREE.Vector2).copy(across.uniforms.centre.value as THREE.Vector2);
    (grade.uniforms.extent.value as THREE.Vector2).copy(across.uniforms.extent.value as THREE.Vector2);
  };
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Same framing in either orientation: the fence and the band of ground the bugs cross, as big
    // as it goes in the window below the top bar, clear of the dock, and centred (frame.ts).
    const board = stage.board ?? { area: { x: 0, y: 0, w, h }, avoid: [] };
    const wide = THREE.MathUtils.smoothstep(board.area.w / board.area.h, 0.6, 0.75);
    const fit = THREE.MathUtils.lerp(FIT_TALL, FIT, wide);
    const fitAcross = THREE.MathUtils.lerp(FIT_TALL_ACROSS, FIT, wide);
    const { dist, ...at } = frameCamera(camera, PITCH, fitAcross, fit, w, h, board);
    spot = at;
    camera.userData.base = camera.position.clone();
    fog.near = dist + 10;
    fog.far = dist + 40;
    focus();
  };
  const render = () => {
    if (renderer.getPixelRatio() !== ratio) focus();
    composer.render();
  };
  const warm = () => {
    // Drawn into the scene buffer (linear, no tone map), which is its own variant of each program.
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(sceneBuffer);
    renderer.compile(scene, camera);
    renderer.setRenderTarget(was);
  };
  const stage: Stage = { renderer, scene, camera, cake, fence, train, hero, reach, hold, shake: 0, intro: 0, board: null, glow, resize, render, warm };
  resize();
  return stage;
}

/** Build the engine in the hero's colour and seat the hero in its cab, for a run. */
export function setHero(stage: Stage, kind: HeroKind): void {
  stage.train.clear();
  const loco = makeHoverTank();
  flatten(loco);
  stage.train.add(loco);
  stage.hero.clear();
  const trooper = makeHero(kind);
  flatten(trooper);
  stage.hero.add(trooper);
  stage.hero.scale.setScalar(0.9);
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

/** A shot's jolt over 0..1: all of it at once in the first 12%, then easing back out. */
export function shotCurve(u: number): number {
  if (u < 0 || u >= 1) return 0;
  return u < 0.12 ? u / 0.12 : (1 - (u - 0.12) / 0.88) ** 2;
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
  // Shot: a sharp kick back and nose-up, then easing level, over in a sixth of a second.
  const fire = kickAt(k.fire, KICK_TIME.fire, t);
  if (fire >= 0) {
    const b = shotCurve(fire);
    z -= 0.06 * b;
    pitch -= 0.045 * b;
    y -= 0.012 * b;
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
  // Nose (+z) along the tangent of travel: dir * (-sin a, cos a). A reversal drives the new way at
  // once, but the hull swings round over SPIN, always the same way, from wherever it is.
  const sp = stage.train.userData as { dir?: number; at?: number; off?: number };
  if (sp.dir !== undefined && sp.dir !== dir) {
    // Reversed again mid-swing: the short way back, not a full turn on top.
    const off = spinOff(sp.off ?? 0, t - (sp.at ?? -1)) + Math.PI;
    sp.off = off > Math.PI ? off - 2 * Math.PI : off;
    sp.at = t;
  }
  sp.dir = dir;
  stage.train.rotation.y = Math.atan2(-dir * Math.sin(angle), dir * Math.cos(angle)) + spinOff(sp.off ?? 0, t - (sp.at ?? -1));
  const loco = stage.train.children[0];
  if (loco) poseLocomotive(loco, dir, roll, t);
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

const scratch = new THREE.Vector3();
/** Where a point in the world lands on the page, in CSS pixels. */
export function toScreen(stage: Stage, x: number, y: number, z: number): { x: number; y: number } {
  const v = scratch.set(x, y, z).project(stage.camera);
  const r = stage.renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}

/** The reactor's pulse and other idle motion of the set. */
export function animateStage(stage: Stage, t: number): void {
  animateReactor(stage.cake, t);
  RAIL_CHASE.value = t * 0.1;
  animateCurrent(t);
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

/** How long a run's opening dolly takes, seconds, and how far back it starts (a share of the camera's distance). */
const INTRO_TIME = 0.9;
const INTRO_BACK = 0.45;
const back = new THREE.Vector3();

/** Apply and decay camera shake, and a run's opening dolly (along the view, so the framing holds). */
export function shakeCamera(stage: Stage, dt: number): void {
  const base = stage.camera.userData.base as THREE.Vector3;
  const s = stage.shake;
  stage.camera.position.set(base.x + (Math.random() - 0.5) * s, base.y + (Math.random() - 0.5) * s, base.z);
  stage.shake = Math.max(0, s - dt * 2.5);
  if (stage.intro > 0) {
    // Fast at first and settling: the offset falls with the square of the time left.
    stage.camera.getWorldDirection(back);
    stage.camera.position.addScaledVector(back, -base.length() * INTRO_BACK * stage.intro * stage.intro);
    stage.intro = Math.max(0, stage.intro - dt / INTRO_TIME);
  }
}

const portraits = new Map<HeroKind, string>();
/**
 * The hero's 3D trooper rendered head and shoulders, three-quarter on, as a PNG data URL for the skill
 * button, so the HUD shows the same trooper that rides the tank rather than a flat drawing.
 * Drawn once per hero with the stage's renderer into an off-screen target (its colour space set to
 * sRGB so the output is encoded as on screen) and cached.
 */
export function heroPortrait(stage: Stage, kind: HeroKind): string {
  const hit = portraits.get(kind);
  if (hit) return hit;
  // Twice the largest place it shows (the village hero card), so it stays sharp on a 2x screen.
  const S = 384;
  const scene = new THREE.Scene();
  scene.environment = stage.scene.environment;
  scene.environmentIntensity = 0.35;
  // A cool white key and a strong cyan rim, so the visor and the helmet's edge catch light.
  const key = new THREE.DirectionalLight(0xf4f8ff, 1.5);
  key.position.set(2, 3, 3);
  const rim = new THREE.DirectionalLight(0x60e0ff, 1.6);
  rim.position.set(-3, 2, -2);
  scene.add(key, rim, new THREE.HemisphereLight(0xe8f4ff, 0x203a5a, 0.6));
  const toy = makeHero(kind);
  // Three-quarter on.
  toy.rotation.y = -0.35;
  scene.add(toy);
  const box = new THREE.Box3().setFromObject(toy);
  const size = box.getSize(new THREE.Vector3());
  // Frame the top 60 %: the head and the chest, the face a little above centre.
  const cy = box.max.y - size.y * 0.32;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  const d = (size.y * 0.72) / 2 / Math.tan((26 * Math.PI) / 360);
  camera.position.set(0, cy + size.y * 0.08, box.max.z + d);
  camera.lookAt(0, cy, 0);
  const target = new THREE.WebGLRenderTarget(S, S, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const r = stage.renderer;
  const before = r.getRenderTarget();
  const clear = r.getClearAlpha();
  r.setClearAlpha(0);
  r.setRenderTarget(target);
  r.clear();
  r.render(scene, camera);
  const px = new Uint8Array(S * S * 4);
  r.readRenderTargetPixels(target, 0, 0, S, S, px);
  r.setRenderTarget(before);
  r.setClearAlpha(clear);
  target.dispose();
  // The target reads bottom row first: flip it into a canvas, shifted sideways so the head is in the
  // middle of the round button (the opaque span of the top rows; a tail or a raised arm would pull a
  // box centre off it).
  let head = S, x0 = S, x1 = 0;
  for (let y = S - 1; y >= 0 && y > head - S * 0.3; y--) {
    for (let x = 0; x < S; x++) {
      if (px[(y * S + x) * 4 + 3] < 128) continue;
      if (head === S) head = y;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
    }
  }
  const shift = x1 >= x0 ? Math.round(S / 2 - (x0 + x1) / 2) : 0;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
  g.putImageData(img, shift, 0);
  const url = c.toDataURL('image/png');
  portraits.set(kind, url);
  return url;
}
