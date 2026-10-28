// Renderer, camera and the static farm: ground, field tiles, the treehouse, the fence (which
// breaks up as the wall loses health), the hero model and the props around the fort.

import * as THREE from 'three';
import { CELL, WALL } from '../sim/config';
import { HERO_CELL, cellX, cellZ } from '../sim/board';
import type { HeroKind } from '../sim/types';
import { makeBarn, makeBush, makeHay, makeHeroModel, makeRock, makeTree, toon } from './models';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  tiles: THREE.Mesh[];
  /** Fence rails, broken off in order as the wall loses health. */
  rails: THREE.Mesh[];
  hero: THREE.Group;
  /** Camera shake left, in world units; decays every frame. */
  shake: number;
  resize(): void;
}

const TILE_OPEN = 0xb07a48;
const TILE_LOCKED = 0x7d7d74;

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
  scene.background = new THREE.Color(0x9fd8f5);
  scene.fog = new THREE.Fog(0x9fd8f5, 30, 60);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8a4a, 1.2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
  sun.position.set(6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), toon(0x6faa4c));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // A worn dirt yard inside and just around the fence.
  const yard = new THREE.Mesh(new THREE.CircleGeometry(WALL + 1.6, 40), toon(0xc9a56a));
  yard.rotation.x = -Math.PI / 2;
  yard.position.y = 0.01;
  yard.receiveShadow = true;
  scene.add(yard);

  const tiles: THREE.Mesh[] = [];
  const tileGeo = new THREE.BoxGeometry(CELL * 0.92, 0.3, CELL * 0.92);
  const furrowGeo = new THREE.BoxGeometry(CELL * 0.8, 0.08, 0.16);
  const furrowMat = toon(0x8a5a32);
  for (let c = 0; c < 9; c++) {
    const tile = new THREE.Mesh(tileGeo, new THREE.MeshToonMaterial({ color: TILE_LOCKED, gradientMap: (ground.material as THREE.MeshToonMaterial).gradientMap }));
    tile.position.set(cellX(c), 0.15, cellZ(c));
    tile.receiveShadow = true;
    tile.userData.cell = c;
    if (c !== HERO_CELL) for (const z of [-0.5, 0, 0.5]) {
      const f = new THREE.Mesh(furrowGeo, furrowMat);
      f.position.set(0, 0.17, z);
      f.receiveShadow = true;
      tile.add(f);
    }
    scene.add(tile);
    tiles.push(tile);
  }

  // Treehouse: four posts, a deck the hero stands on, and a little rail.
  const wood = toon(0x8b5a2b);
  const dark = toon(0x6a4020);
  const hx = cellX(HERO_CELL);
  const hz = cellZ(HERO_CELL);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.0, 8), dark);
    post.position.set(hx + sx * 0.6, 0.5, hz + sz * 0.6);
    post.castShadow = true;
    scene.add(post);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.8, 0.12, CELL * 0.8), wood);
  deck.position.set(hx, 0.99, hz);
  deck.castShadow = deck.receiveShadow = true;
  scene.add(deck);
  for (const [sx, sz, rot] of [[0, -1, 0], [-1, 0, 1], [1, 0, 1]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.8, 0.06, 0.06), dark);
    rail.position.set(hx + sx * 0.77, 1.3, hz + sz * 0.77);
    rail.rotation.y = rot ? Math.PI / 2 : 0;
    scene.add(rail);
  }

  const hero = new THREE.Group();
  hero.position.set(hx, 1.05, hz);
  scene.add(hero);

  // Fence: posts every so often along each side, two rails between neighbouring posts.
  const rails: THREE.Mesh[] = [];
  const postGeo = new THREE.BoxGeometry(0.2, 0.9, 0.2);
  const railMat = toon(0xb07a48);
  const postMat = toon(0x8b5a2b);
  const side = WALL * 2 - 0.3;
  const posts = 6;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const off = WALL - 0.2;
    for (let k = 0; k <= posts; k++) {
      const t = -side / 2 + (side * k) / posts;
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(nx * off + nz * t, 0.45, nz * off - nx * t);
      post.castShadow = true;
      scene.add(post);
      if (k === posts) continue;
      for (const y of [0.35, 0.68]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(side / posts, 0.12, 0.08), railMat);
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
  // Break order: shuffled once so damage looks scattered all round the fence.
  const rng = seeded(7);
  for (let i = rails.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rails[i], rails[j]] = [rails[j], rails[i]];
  }

  // Props in a ring outside the fence, kept off the yard. A barn sits at the back.
  const barn = makeBarn();
  barn.position.set(-9, 0, -14);
  barn.rotation.y = 0.4;
  scene.add(barn);
  for (let i = 0; i < 46; i++) {
    const a = rng() * Math.PI * 2;
    const r = 8 + rng() * 16;
    const x = Math.cos(a) * r * 1.3;
    const z = Math.sin(a) * r;
    if (Math.hypot(x + 9, z + 14) < 4) continue;
    const roll = rng();
    const prop = roll < 0.35 ? makeTree(rng) : roll < 0.55 ? makeRock(rng) : roll < 0.8 ? makeBush(rng, rng() < 0.6) : makeHay();
    prop.position.x += x;
    prop.position.z += z;
    prop.rotation.y = rng() * Math.PI * 2;
    prop.scale.multiplyScalar(0.8 + rng() * 0.5);
    scene.add(prop);
  }

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the fort plus some approach ground in view in any aspect: portrait backs off.
    const dist = w >= h ? 20 * Math.max(1, 1.6 / camera.aspect) : 20 * Math.min(2.4, (1.6 * h) / w);
    const pitch = (54 * Math.PI) / 180;
    camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    camera.lookAt(0, 0, 0.6);
    camera.userData.base = camera.position.clone();
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
  return { renderer, scene, camera, tiles, rails, hero, shake: 0, resize };
}

/** Swap in the hero model for a run. */
export function setHero(stage: Stage, kind: HeroKind): void {
  stage.hero.clear();
  stage.hero.add(makeHeroModel(kind));
}

/** Knock rails off as the wall drops: none at full health, all of them at zero. */
export function paintFence(stage: Stage, frac: number): void {
  const broken = Math.round((1 - frac) * stage.rails.length);
  stage.rails.forEach((r, i) => {
    const base = r.userData.base as { y: number; rot: THREE.Euler };
    if (i < broken * 0.6) {
      r.visible = false;
    } else if (i < broken) {
      // Hanging by one nail.
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

export function paintTiles(stage: Stage, unlocked: boolean[], highlight: Set<number>, hover = -1): void {
  for (const tile of stage.tiles) {
    const c = tile.userData.cell as number;
    const mat = tile.material as THREE.MeshToonMaterial;
    if (c === HERO_CELL) {
      mat.color.setHex(0x9a7a50);
      continue;
    }
    const merge = highlight.has(c);
    mat.color.setHex(merge && c === hover ? 0xffffff : merge ? 0xfff27a : c === hover && unlocked[c] ? 0xd8a874 : unlocked[c] ? TILE_OPEN : TILE_LOCKED);
    for (const f of tile.children) f.visible = unlocked[c];
  }
}
