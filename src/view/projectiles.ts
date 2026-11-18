// What a projectile looks like: the hero's laser bolt, the wagons' shots (wagonshots.ts) and the
// picnic leftovers' fruit. Split from units.ts, which places and moves them.

import * as THREE from 'three';
import { FRUITS } from '../sim/config';
import type { Projectile, Shooter } from '../sim/types';
import { wagonShot } from './wagonshots';
import { plastic } from './models';

/**
 * The hero's shots: a long white-hot core in an additive glow, pointed along its flight, so a shot
 * reads as a laser bolt from the far side of the ring. Cyan, or gold for a crit. The geometry and
 * materials are shared by every bolt; the trail is the colour in `userData.trail`.
 */
const boltCoreGeo = new THREE.CapsuleGeometry(0.07, 0.8, 2, 6).rotateX(Math.PI / 2);
const boltGlowGeo = new THREE.CapsuleGeometry(0.17, 0.95, 3, 8).rotateX(Math.PI / 2);
const boltCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const glowMat = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
const BOLT_GLOW = [glowMat(0x40d8ff), glowMat(0x6ff0ff)];
const CRIT_GLOW = glowMat(0xffc040);

export function makeBolt(crit: boolean): THREE.Object3D {
  const g = new THREE.Group();
  const glow = crit ? CRIT_GLOW : BOLT_GLOW[Math.floor(Math.random() * BOLT_GLOW.length)];
  g.add(new THREE.Mesh(boltCoreGeo, boltCoreMat), new THREE.Mesh(boltGlowGeo, glow));
  g.userData.trail = glow.color.getHex();
  g.userData.bolt = true;
  g.userData.crit = crit;
  if (crit) g.scale.setScalar(1.35);
  return g;
}

/** Projectile look per shooter: the hero's bolt, or (picnic leftovers) seed, nut, melon chunk, grape, lemon drop. */
export function projMesh(p: Projectile): THREE.Object3D {
  const kind: Shooter = p.kind;
  switch (kind) {
    case 'hero': return makeBolt(p.crit);
    // Wagons (§10.1): a missile, a mine lobbed at a pile (wagonshots.ts).
    case 'missile':
    case 'mine': return wagonShot(p)!;
    case 'strawberry': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), plastic(0xffe27a));
      m.scale.set(0.8, 0.8, 1.5);
      return m;
    }
    case 'coconut': return new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), plastic(FRUITS.coconut.color));
    case 'watermelon': return new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 3), plastic(0xf05060));
    case 'grape': return new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), plastic(FRUITS.grape.color));
    case 'lemon': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), plastic(FRUITS.lemon.color));
      m.scale.set(0.8, 1.3, 0.8);
      return m;
    }
  }
}
