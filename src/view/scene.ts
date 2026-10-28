// Renderer, camera and the static fort: ground, cell tiles, hero platform and the wall ring.

import * as THREE from 'three';
import { CELL, WALL } from '../sim/config';
import { HERO_CELL, cellX, cellZ } from '../sim/board';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  tiles: THREE.Mesh[];
  wall: THREE.Mesh[];
  hero: THREE.Group;
  resize(): void;
}

const TILE_OPEN = 0xd9b77a;
const TILE_LOCKED = 0x6b6b6b;

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3f0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x557744, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 14, 8);
  sun.castShadow = true;
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x7fbf5a }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const tiles: THREE.Mesh[] = [];
  const tileGeo = new THREE.BoxGeometry(CELL * 0.92, 0.3, CELL * 0.92);
  for (let c = 0; c < 9; c++) {
    const tile = new THREE.Mesh(tileGeo, new THREE.MeshLambertMaterial({ color: TILE_LOCKED }));
    tile.position.set(cellX(c), 0.15, cellZ(c));
    tile.receiveShadow = true;
    tile.userData.cell = c;
    scene.add(tile);
    tiles.push(tile);
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.8, 0.9, CELL * 0.8), new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
  platform.position.set(cellX(HERO_CELL), 0.6, cellZ(HERO_CELL));
  platform.castShadow = true;
  scene.add(platform);

  const hero = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.9, 12), new THREE.MeshLambertMaterial({ color: 0x3d7fd6 }));
  body.position.y = 0.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshLambertMaterial({ color: 0xf5c99b }));
  head.position.y = 1.1;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.35, 16), new THREE.MeshLambertMaterial({ color: 0xe8c547 }));
  hat.position.y = 1.4;
  for (const m of [body, head, hat]) {
    m.castShadow = true;
    hero.add(m);
  }
  hero.position.set(cellX(HERO_CELL), 1.05, cellZ(HERO_CELL));
  scene.add(hero);

  const wall: THREE.Mesh[] = [];
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x9c6b3f });
  const len = WALL * 2 - 0.2;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.7, 0.25), wallMat);
    const a = (i * Math.PI) / 2;
    seg.position.set(Math.sin(a) * (WALL - 0.25), 0.35, Math.cos(a) * (WALL - 0.25));
    seg.rotation.y = a;
    seg.castShadow = true;
    scene.add(seg);
    wall.push(seg);
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
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
  return { renderer, scene, camera, tiles, wall, hero, resize };
}

export function paintTiles(stage: Stage, unlocked: boolean[], highlight: Set<number>, hover = -1): void {
  for (const tile of stage.tiles) {
    const c = tile.userData.cell as number;
    if (c === HERO_CELL) continue;
    const mat = tile.material as THREE.MeshLambertMaterial;
    const merge = highlight.has(c);
    mat.color.setHex(merge && c === hover ? 0xffffff : merge ? 0xfff27a : c === hover && unlocked[c] ? 0xf0dcae : unlocked[c] ? TILE_OPEN : TILE_LOCKED);
  }
}
