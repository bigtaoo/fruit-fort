// The two pickups that ride the track (units.ts shows them): the golden bug, drive through it for
// gold, and the supply pod, drive through it for a free level.

import * as THREE from 'three';

/** The golden bug, drive through it for gold: a polished gold carapace split down the back, glowing cyan eyes, cyan energy wings. */
export function makeBug(): THREE.Group {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc53a, emissive: 0x5a3a00, metalness: 0.75, roughness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.5, roughness: 0.4 });
  for (const side of [-1, 1]) {
    // Two wing cases with a dark seam between them.
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10, 0, Math.PI), gold);
    shell.rotation.z = side > 0 ? 0 : Math.PI;
    shell.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    shell.scale.set(1.25, 0.8, 1);
    shell.position.x = side * 0.015;
    g.add(shell);
  }
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 8), dark);
  belly.scale.set(1, 0.45, 1.2);
  belly.position.y = -0.04;
  g.add(belly);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), dark);
  head.position.set(0, 0, 0.4);
  g.add(head);
  const eye = new THREE.MeshBasicMaterial({ color: 0x7ff6ff });
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eye);
    e.position.set(side * 0.08, 0.06, 0.52);
    g.add(e);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 6), gold);
    horn.position.set(side * 0.07, 0.16, 0.5);
    horn.rotation.x = 0.7;
    g.add(horn);
    const wing = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 12, 6),
      new THREE.MeshBasicMaterial({ color: 0x70e8ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    wing.scale.set(1, 0.08, 0.5);
    wing.position.set(side * 0.32, 0.24, -0.05);
    wing.userData.wing = side;
    g.add(wing);
  }
  return g;
}

/** The supply pod, drive through it for a free level: a white capsule like the tank's hull with cyan seams and a green up arrow, hovering on a thruster glow. */
export function makePod(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xeef3f8, metalness: 0.2, roughness: 0.35 });
  const band = new THREE.MeshStandardMaterial({ color: 0x3a4656, metalness: 0.5, roughness: 0.4 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x60e8ff, emissive: 0x40e0ff, emissiveIntensity: 1.2 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 6, 16), hull);
  body.position.y = 0.6;
  body.castShadow = true;
  g.add(body);
  for (const y of [0.32, 0.86]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 20), band);
    ring.position.y = y;
    g.add(ring);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.365, 0.015, 6, 28), glow);
    seam.rotation.x = Math.PI / 2;
    seam.position.y = y + 0.05;
    g.add(seam);
  }
  // The level-up arrow on each side of the pod, lit green.
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0.13);
  arrowShape.lineTo(0.11, 0.01);
  arrowShape.lineTo(0.04, 0.01);
  arrowShape.lineTo(0.04, -0.11);
  arrowShape.lineTo(-0.04, -0.11);
  arrowShape.lineTo(-0.04, 0.01);
  arrowShape.lineTo(-0.11, 0.01);
  arrowShape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x7dff9a, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.set(Math.sin(a) * 0.35, 0.6, Math.cos(a) * 0.35);
    arrow.scale.setScalar(1.5);
    arrow.rotation.y = a;
    g.add(arrow);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7dff9a }));
  beacon.position.y = 1.2;
  g.add(beacon);
  const thrust = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.4, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x60d8ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  thrust.rotation.x = Math.PI;
  thrust.position.y = 0.05;
  thrust.userData.thrust = true;
  g.add(thrust);
  return g;
}
