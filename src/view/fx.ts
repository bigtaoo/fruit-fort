// Short-lived effects (§16.3): a pooled particle system for splashes, chips, sparkles and bees,
// flat expanding rings, and floating text for gold. All procedural, no textures beyond text.

import * as THREE from 'three';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
  size: number;
  gravity: number;
  /** Shrink to nothing over the life (true) or pop out at the end (false). */
  shrink: boolean;
}

interface Ring {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  r: number;
}

interface Floater {
  sprite: THREE.Sprite;
  age: number;
  life: number;
}

export interface BurstOpts {
  count?: number;
  /** Outward speed. */
  speed?: number;
  /** Upward kick added to each particle. */
  up?: number;
  size?: number;
  life?: number;
  gravity?: number;
  /** Second colour mixed in at random. */
  alt?: number;
  y?: number;
  spread?: number;
}

const MAX = 900;
const ringGeo = new THREE.RingGeometry(0.85, 1, 40);
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

export class Fx {
  private mesh: THREE.InstancedMesh;
  private parts: (Particle | null)[] = new Array(MAX).fill(null);
  private next = 0;
  private rings: Ring[] = [];
  private floaters: Floater[] = [];

  constructor(private scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, dummy.matrix);
      this.mesh.setColorAt(i, tmpColor.set(0xffffff));
    }
    scene.add(this.mesh);
  }

  reset(): void {
    this.parts.fill(null);
    for (const r of this.rings) this.dropRing(r);
    for (const f of this.floaters) this.dropFloater(f);
    this.rings = [];
    this.floaters = [];
  }

  /** One particle; returns nothing, the pool recycles the oldest slot when full. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number, gravity = 9, shrink = true): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.parts[i] = { x, y, z, vx, vy, vz, age: 0, life, size, gravity, shrink };
    this.mesh.setColorAt(i, tmpColor.set(color));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** A spray of particles from a point. */
  burst(x: number, z: number, color: number, o: BurstOpts = {}): void {
    const n = o.count ?? 10;
    const sp = o.speed ?? 2.5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = sp * (0.4 + Math.random() * 0.6);
      const c = o.alt !== undefined && Math.random() < 0.4 ? o.alt : color;
      const s = (o.spread ?? 0) * Math.random();
      this.emit(x + Math.cos(a) * s, (o.y ?? 0.4) + Math.random() * 0.1, z + Math.sin(a) * s, Math.cos(a) * v, (o.up ?? 3) * (0.5 + Math.random() * 0.7), Math.sin(a) * v, c, (o.size ?? 0.08) * (0.7 + Math.random() * 0.6), (o.life ?? 0.6) * (0.7 + Math.random() * 0.5), o.gravity ?? 9);
    }
  }

  /** Particles flying from one point to another in `time` seconds (bees, juice). */
  stream(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, color: number, n: number, time: number, size = 0.07): void {
    for (let i = 0; i < n; i++) {
      const j = () => (Math.random() - 0.5) * 0.4;
      this.emit(fx + j(), fy + j(), fz + j(), (tx - fx) / time + j() * 2, (ty - fy) / time + j() * 2, (tz - fz) / time + j() * 2, color, size, time * (0.9 + Math.random() * 0.2), 0, false);
    }
  }

  ring(x: number, z: number, r: number, color: number, life = 0.35, y = 0.06): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.rings.push({ mesh, age: 0, life, r });
  }

  /** Rising text such as "+6" over a kill. */
  text(x: number, y: number, z: number, text: string, color = '#ffd84a', size = 0.7): void {
    if (this.floaters.length > 40) this.dropFloater(this.floaters.shift()!);
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.font = 'bold 44px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#3a2410';
    g.strokeText(text, 64, 34);
    g.fillStyle = color;
    g.fillText(text, 64, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(size * 2, size, 1);
    sprite.position.set(x, y, z);
    sprite.renderOrder = 20;
    this.scene.add(sprite);
    this.floaters.push({ sprite, age: 0, life: 0.9 });
  }

  private dropRing(r: Ring): void {
    this.scene.remove(r.mesh);
    (r.mesh.material as THREE.Material).dispose();
  }

  private dropFloater(f: Floater): void {
    this.scene.remove(f.sprite);
    f.sprite.material.map?.dispose();
    f.sprite.material.dispose();
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      const p = this.parts[i];
      if (!p) continue;
      p.age += dt;
      if (p.age >= p.life) {
        this.parts[i] = null;
        dummy.scale.setScalar(0);
      } else {
        p.vy -= p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        // Bounce once off the ground so splashes settle instead of sinking.
        if (p.y < 0.05 && p.vy < 0) {
          p.y = 0.05;
          p.vy *= -0.3;
          p.vx *= 0.5;
          p.vz *= 0.5;
        }
        const k = p.age / p.life;
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(p.size * (p.shrink ? 1 - k * k : k > 0.85 ? (1 - k) / 0.15 : 1));
      }
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    this.rings = this.rings.filter((r) => {
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        this.dropRing(r);
        return false;
      }
      const s = r.r * (0.4 + 0.6 * Math.sqrt(k));
      r.mesh.scale.set(s, s, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      return true;
    });

    this.floaters = this.floaters.filter((f) => {
      f.age += dt;
      const k = f.age / f.life;
      if (k >= 1) {
        this.dropFloater(f);
        return false;
      }
      f.sprite.position.y += dt * 1.6;
      f.sprite.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      return true;
    });
  }
}
