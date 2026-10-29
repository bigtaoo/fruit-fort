// Renderer, camera and the static set, as in the style frame (docs/art/style_r4/b_marsh.png): a
// lawn with daisies, the cake on a log slice, the wooden toy track round it with the hero's train,
// and the round marshmallow fence (its wafer sticks bitten away as the wall loses health).

import * as THREE from 'three';
import { HEROES, TRAIN, WALL } from '../sim/config';
import type { HeroKind } from '../sim/types';
import { animateCake, lawnTexture, makeCake, makeFence, makeHeroModel, makeLocomotive, makeLogSlice, makeMeadow, makeTrack, toon } from './models';

/** A screen rectangle in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Half-extent of what the camera keeps in view: the fence plus a strip of lawn the bugs come over. */
const FIT = WALL + 0.8;
/** Track: inner and outer edge round the train's ring, and how high it stands off the grass. */
const TRACK_IN = TRAIN.radius - 0.5;
const TRACK_OUT = TRAIN.radius + 0.5;
const TRACK_TOP = 0.1;
/** The fence posts stand just inside where the bugs stop, so they chew on them. */
const FENCE_R = WALL - 0.14;
/** The log slice under the cake. */
const LOG_R = 1.6;
const LOG_TOP = 0.36;
const GRASS = 0x70b448;

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
}

/** Same sequence every load, so the props never jump between runs. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  // The lawn runs off to the horizon; fog and sky share its colour so there is no edge.
  scene.background = new THREE.Color(GRASS);
  const fog = new THREE.Fog(GRASS, 30, 60);
  scene.fog = fog;
  // Warm sunny afternoon: a cream sky light, green bounce from the grass, the sun low on the left.
  scene.add(new THREE.HemisphereLight(0xfff4dc, 0x4a8a30, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.8);
  sun.position.set(-8, 13, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  scene.add(sun);

  const rng = seeded(7);
  const lawn = lawnTexture(rng);
  lawn.repeat.set(40, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), toon(0xffffff, { map: lawn }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // Tufts everywhere but on the log and the track; daisies and leaves outside the fence.
  scene.add(makeMeadow(rng, LOG_R + 0.05, 16, WALL + 0.7, (r) => r > TRACK_IN - 0.08 && r < TRACK_OUT + 0.08));

  scene.add(makeTrack(TRACK_IN, TRACK_OUT, TRACK_TOP));
  // The middle of the ring: the birthday cake everyone is after, on its log slice.
  scene.add(makeLogSlice(LOG_R, rng));
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

  const fence = makeFence(FENCE_R, 34);
  scene.add(fence.group);
  const rails = fence.rails;
  // Break order: shuffled once so the bites look scattered all round the fence.
  for (let i = rails.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rails[i], rails[j]] = [rails[j], rails[i]];
  }

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Same framing in either orientation: the fort fills the board, wide or tall, and the
    // projection centre moves to the board's centre so the fort sits in the middle of it.
    const b = stage.board ?? { x: 0, y: 0, w, h };
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const pitch = (54 * Math.PI) / 180;
    // The near side looms larger in perspective, so the height gets more slack than the width.
    const dist = Math.max((1.12 * FIT * h) / (b.w * tan), (1.18 * FIT * Math.sin(pitch) * h) / (b.h * tan));
    camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    camera.lookAt(0, 0, 0.6);
    camera.userData.base = camera.position.clone();
    camera.setViewOffset(w, h, w / 2 - (b.x + b.w / 2), h / 2 - (b.y + b.h / 2), w, h);
    camera.updateProjectionMatrix();
    fog.near = dist + 10;
    fog.far = dist + 40;
  };
  const stage: Stage = { renderer, scene, camera, cake, rails, train, hero, reach, shake: 0, board: null, resize };
  resize();
  return stage;
}

/** Build the engine in the hero's colour and seat the hero in its cab, for a run. */
export function setHero(stage: Stage, kind: HeroKind): void {
  stage.train.clear();
  const loco = makeLocomotive(HEROES[kind].color);
  stage.train.add(loco);
  stage.hero.clear();
  stage.hero.add(makeHeroModel(kind));
  stage.hero.scale.setScalar(0.62);
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
