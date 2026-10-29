// Renderer, camera and the static picnic: the tablecloth, the toy track with the hero's train on
// it, the cake in the middle, the wafer fence (bitten away as the wall loses health) and the
// picnic things around the fort.

import * as THREE from 'three';
import { HEROES, TRAIN, WALL } from '../sim/config';
import type { HeroKind } from '../sim/types';
import {
  animateCake, gingham, makeBasket, makeCake, makeCup, makeHeroModel, makeJar, makeLocomotive, makeMelonSlice, makePlate,
  makeStrawberry, makeSugar, toon,
} from './models';

/** A screen rectangle in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Half-extent of what the camera keeps in view: the fence plus a strip of approach ground. */
const FIT = WALL + 1.8;

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
  scene.background = new THREE.Color(0xbfe4f5);
  const fog = new THREE.Fog(0xbfe4f5, 30, 60);
  scene.fog = fog;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb08a70, 1.2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
  sun.position.set(6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  scene.add(sun);

  // The tablecloth, and a paper doily under the fort so the track reads against the checks.
  const cloth = gingham();
  cloth.repeat.set(30, 30);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), toon(0xffffff, { map: cloth }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const doily = new THREE.Mesh(new THREE.CircleGeometry(WALL + 1.2, 48), toon(0xfdf8ee));
  doily.rotation.x = -Math.PI / 2;
  doily.position.y = 0.01;
  doily.receiveShadow = true;
  scene.add(doily);
  const lace = new THREE.Mesh(new THREE.RingGeometry(WALL + 1.2, WALL + 1.45, 48), toon(0xf4ead8));
  lace.rotation.x = -Math.PI / 2;
  lace.position.y = 0.012;
  scene.add(lace);

  // The track: wooden toy track pieces with two grooves for the wheels.
  const R = TRAIN.radius;
  const wood = new THREE.Mesh(new THREE.RingGeometry(R - 0.38, R + 0.38, 64), toon(0xe2b878));
  wood.rotation.x = -Math.PI / 2;
  wood.position.y = 0.03;
  wood.receiveShadow = true;
  scene.add(wood);
  const groove = toon(0xa87a48);
  for (const r of [R - 0.2, R + 0.2]) {
    const g = new THREE.Mesh(new THREE.RingGeometry(r - 0.035, r + 0.035, 96), groove);
    g.rotation.x = -Math.PI / 2;
    g.position.y = 0.035;
    scene.add(g);
  }
  const jointGeo = new THREE.BoxGeometry(0.76, 0.01, 0.03);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const joint = new THREE.Mesh(jointGeo, groove);
    joint.position.set(Math.cos(a) * R, 0.036, Math.sin(a) * R);
    joint.rotation.y = -a;
    scene.add(joint);
  }
  // The middle of the ring: the birthday cake everyone is after.
  const cake = makeCake();
  scene.add(cake);

  const train = new THREE.Group();
  scene.add(train);
  const hero = new THREE.Group();
  const reach = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
  reach.rotation.x = -Math.PI / 2;
  reach.position.y = 0.04;
  scene.add(reach);

  // Fence: marshmallow posts every so often along each side, two wafer biscuits between neighbours.
  const rails: THREE.Mesh[] = [];
  const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.9, 12);
  const postMats = [toon(0xfffaf4), toon(0xffc0d4)];
  const waferMat = toon(0xe8b868);
  const creamMat = toon(0xfff4dc);
  const side = WALL * 2 - 0.3;
  const posts = 6;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const off = WALL - 0.2;
    for (let k = 0; k <= posts; k++) {
      const t = -side / 2 + (side * k) / posts;
      const post = new THREE.Mesh(postGeo, postMats[k % 2]);
      post.position.set(nx * off + nz * t, 0.45, nz * off - nx * t);
      post.castShadow = true;
      scene.add(post);
      if (k === posts) continue;
      for (const y of [0.32, 0.66]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(side / posts, 0.2, 0.1), waferMat);
        // A cream layer through the middle of the biscuit.
        const filling = new THREE.Mesh(new THREE.BoxGeometry(side / posts - 0.02, 0.05, 0.11), creamMat);
        rail.add(filling);
        const tm = t + side / posts / 2;
        rail.position.set(nx * off + nz * tm, y, nz * off - nx * tm);
        rail.rotation.y = a + Math.PI / 2;
        rail.castShadow = true;
        rail.userData.base = { y, rot: rail.rotation.clone() };
        scene.add(rail);
        rails.push(rail);
      }
    }
  }
  // Break order: shuffled once so the bites look scattered all round the fence.
  const rng = seeded(7);
  for (let i = rails.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rails[i], rails[j]] = [rails[j], rails[i]];
  }

  // Picnic things on the cloth around the fort, kept off the doily. The basket sits at the back.
  const basket = makeBasket();
  basket.position.set(-9, 0, -14);
  basket.rotation.y = 0.4;
  scene.add(basket);
  for (let i = 0; i < 34; i++) {
    const a = rng() * Math.PI * 2;
    const r = 8 + rng() * 16;
    const x = Math.cos(a) * r * 1.3;
    const z = Math.sin(a) * r;
    if (Math.hypot(x + 9, z + 14) < 4) continue;
    const roll = rng();
    const prop = roll < 0.25 ? makePlate(rng) : roll < 0.4 ? makeCup(rng) : roll < 0.5 ? makeJar() : roll < 0.65 ? makeMelonSlice() : roll < 0.85 ? makeStrawberry() : makeSugar(rng);
    prop.position.x += x;
    prop.position.z += z;
    prop.rotation.y = rng() * Math.PI * 2;
    prop.scale.multiplyScalar(0.9 + rng() * 0.3);
    scene.add(prop);
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
  stage.train.position.set(x, 0.05, z);
  // Nose (+z) along the tangent of travel: dir * (-sin a, cos a).
  stage.train.rotation.y = Math.atan2(-dir * Math.sin(angle), dir * Math.cos(angle));
  const loco = stage.train.children[0];
  for (const w of (loco?.userData.wheels ?? []) as THREE.Object3D[]) w.rotation.x = roll;
  stage.reach.position.set(x, 0.04, z);
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
