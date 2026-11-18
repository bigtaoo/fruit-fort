// Camera shake and a run's opening dolly. Owns how much shake is left and how much of the dolly;
// the stage holds one and steps it every frame. Split from scene.ts.

import * as THREE from 'three';

/** How long a run's opening dolly takes, seconds, and how far back it starts (a share of the camera's distance). */
const INTRO_TIME = 0.9;
const INTRO_BACK = 0.45;
const back = new THREE.Vector3();

export class CameraShake {
  /** Shake left, in world units; decays every frame. */
  private amount = 0;
  /** The opening dolly left (1 at the start, 0 when done): the camera pulls in from further back. */
  private intro = 0;

  /** Shake at least this much: a lesser thump doesn't cut a bigger one short. */
  kick(s: number): void {
    this.amount = Math.max(this.amount, s);
  }

  /** Shake exactly this much from now: the big moments (the skill, the end of a run). */
  jolt(s: number): void {
    this.amount = s;
  }

  /** Start a run's opening dolly. */
  startIntro(): void {
    this.intro = 1;
  }

  /** Apply and decay the shake, and the opening dolly (along the view, so the framing holds). */
  step(camera: THREE.PerspectiveCamera, dt: number): void {
    const base = camera.userData.base as THREE.Vector3;
    const s = this.amount;
    camera.position.set(base.x + (Math.random() - 0.5) * s, base.y + (Math.random() - 0.5) * s, base.z);
    this.amount = Math.max(0, s - dt * 2.5);
    if (this.intro > 0) {
      // Fast at first and settling: the offset falls with the square of the time left.
      camera.getWorldDirection(back);
      camera.position.addScaledVector(back, -base.length() * INTRO_BACK * this.intro * this.intro);
      this.intro = Math.max(0, this.intro - dt / INTRO_TIME);
    }
  }
}
