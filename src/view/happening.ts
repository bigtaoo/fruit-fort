// The happening on the track as drawn: the golden bug crawling along it or the supply pod sitting on
// it, each with a pulsing ring. The two models come from pickups.ts. Split from units.ts.

import * as THREE from 'three';
import type { World } from '../sim/world';
import type { HappeningKind } from '../sim/types';
import { makeBug, makePod } from './pickups';

interface HappeningView {
  id: number;
  kind: HappeningKind;
  group: THREE.Group;
  model: THREE.Group;
  ring: THREE.Mesh;
}

export class HappeningSprite {
  private happening: HappeningView | null = null;

  constructor(private scene: THREE.Scene) {}

  /** Drop the view (a new run reuses ids). */
  reset(): void {
    if (this.happening) this.scene.remove(this.happening.group);
    this.happening = null;
  }

  /** The bug crawls along the track (wings flapping); the basket sits and sways. Both pulse a ring to say "come here". */
  sync(w: World, t: number): void {
    const h = w.happenings.now;
    if (this.happening && (!h || h.id !== this.happening.id)) {
      this.scene.remove(this.happening.group);
      this.happening = null;
    }
    if (!h) return;
    let v = this.happening;
    if (!v) {
      const group = new THREE.Group();
      const model = h.kind === 'bug' ? makeBug() : makePod();
      model.scale.setScalar(h.kind === 'bug' ? 1.3 : 1.4);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28), new THREE.MeshBasicMaterial({ color: h.kind === 'bug' ? 0xffe066 : 0x7dff9a, transparent: true, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      group.add(model, ring);
      this.scene.add(group);
      this.happening = v = { id: h.id, kind: h.kind, group, model, ring };
    }
    v.group.position.set(h.x, 0, h.z);
    if (h.kind === 'bug') {
      v.model.position.y = 0.35 + Math.abs(Math.sin(t * 6)) * 0.1;
      // Face along the track the way it crawls.
      v.model.rotation.y = Math.atan2(-h.turn * Math.sin(h.angle), h.turn * Math.cos(h.angle));
      for (const c of v.model.children) if (c.userData.wing) c.rotation.z = c.userData.wing * Math.sin(t * 30) * 0.6;
    } else {
      // The pod hovers, turns slowly and its thruster flickers.
      v.model.position.y = 0.12 + Math.sin(t * 3) * 0.06;
      v.model.rotation.y = t * 0.8;
      for (const c of v.model.children) if (c.userData.thrust) c.scale.y = 0.85 + Math.sin(t * 37) * 0.15;
    }
    const pulse = (t * 1.5) % 1;
    v.ring.scale.setScalar(0.8 + pulse * 0.6);
    (v.ring.material as THREE.MeshBasicMaterial).opacity = (1 - pulse) * 0.8;
    // Blink in the last two seconds before it goes.
    v.model.visible = h.t > 2 || Math.sin(t * 20) > -0.3;
  }
}
