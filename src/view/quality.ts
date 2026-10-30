// Low-end devices (§15.6): watch the frame rate over the last ~2 s and, when it stays low,
// step the picture down one level at a time. Steps back up only once, and only after a long
// smooth stretch; a level that has to drop again right after locks the climb for the session.
// URL option: ?quality=high|mid|low (or 0–4) pins a level and turns the watch off.

import * as THREE from 'three';
import type { Stage } from './scene';
import type { Fx } from './fx';

export interface Level {
  name: string;
  /** Share of particles kept. */
  particles: number;
  shadows: boolean;
  /** Cap on the device pixel ratio. */
  pixels: number;
}

/**
 * Each step gives up the next saving, cheapest-looking first. Under CPU throttle the frame is
 * draw-call bound and the shadow pass is ~40% of the calls (§15.6), so shadows go first.
 */
export const LEVELS: Level[] = [
  { name: 'high', particles: 1, shadows: true, pixels: 2 },
  { name: 'shadow', particles: 1, shadows: false, pixels: 2 },
  { name: 'fx', particles: 0.5, shadows: false, pixels: 1.5 },
  { name: 'pixel', particles: 0.5, shadows: false, pixels: 1 },
  { name: 'min', particles: 0.25, shadows: false, pixels: 0.75 },
];
const NAMED: Record<string, number> = { high: 0, mid: 2, low: LEVELS.length - 1 };

/** Average fps under this for LOW_FOR seconds steps down. */
export const LOW_FPS = 40;
const LOW_FOR = 3;
/** Average fps over this for HIGH_FOR seconds steps back up (once). */
const HIGH_FPS = 57;
const HIGH_FOR = 30;
/** Seconds of frames the average covers. */
const WINDOW = 2;
/** After a change, ignore this long: shader recompiles and the new level settling. */
const SETTLE = 2;

export class Quality {
  level = 0;
  /** Pinned from the URL: no automatic changes. */
  readonly forced: boolean;
  fps = 60;
  private times: number[] = [];
  private sum = 0;
  private lowT = 0;
  private highT = 0;
  private settle = SETTLE;
  private climbed = false;
  private locked = false;

  constructor(private stage: Stage, private fx: Fx, param: string | null) {
    const pinned = param === null ? undefined : param in NAMED ? NAMED[param] : Number(param);
    this.forced = pinned !== undefined && Number.isInteger(pinned) && pinned >= 0 && pinned < LEVELS.length;
    this.set(this.forced ? pinned! : 0);
  }

  /** One rendered frame took `ms`. Frames over 250 ms (tab in background, a stall) are ignored. */
  sample(ms: number): void {
    if (ms <= 0 || ms > 250) return;
    const s = ms / 1000;
    this.times.push(s);
    this.sum += s;
    while (this.sum > WINDOW && this.times.length > 1) this.sum -= this.times.shift()!;
    this.fps = this.times.length / this.sum;
    if (this.forced) return;
    if (this.settle > 0) {
      this.settle -= s;
      return;
    }
    if (this.sum < WINDOW * 0.9) return;
    this.lowT = this.fps < LOW_FPS ? this.lowT + s : 0;
    this.highT = this.fps > HIGH_FPS ? this.highT + s : 0;
    if (this.lowT >= LOW_FOR && this.level < LEVELS.length - 1) {
      // Dropping right after the one climb: this device can't hold it, stay down from now on.
      if (this.climbed) this.locked = true;
      this.set(this.level + 1);
    } else if (this.highT >= HIGH_FOR && this.level > 0 && !this.climbed && !this.locked) {
      this.climbed = true;
      this.set(this.level - 1);
    }
  }

  set(level: number): void {
    const prev = LEVELS[this.level];
    const l = LEVELS[level];
    this.level = level;
    this.lowT = this.highT = 0;
    this.settle = SETTLE;
    this.times = [];
    this.sum = 0;
    this.fx.density = l.particles;
    const { renderer, scene } = this.stage;
    if (renderer.shadowMap.enabled !== l.shadows) {
      renderer.shadowMap.enabled = l.shadows;
      // The light's shadow toggles the lit materials' programs; the rest recompile on needsUpdate.
      scene.traverse((o) => {
        if (o instanceof THREE.DirectionalLight) o.castShadow = l.shadows;
        const m = (o as THREE.Mesh).material;
        if (m) for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
      });
    }
    const ratio = Math.min(window.devicePixelRatio, l.pixels);
    if (renderer.getPixelRatio() !== ratio) {
      renderer.setPixelRatio(ratio);
      this.stage.resize();
    }
    if (prev !== l && import.meta.env.DEV) console.info(`[quality] ${prev.name} -> ${l.name}`);
  }
}
