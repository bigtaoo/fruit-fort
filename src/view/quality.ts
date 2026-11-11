// Low-end devices (§15.6): watch the frame rate over the last ~2 s and, when it stays low,
// step the picture down one level at a time. Steps back up only once, and only after a long
// smooth stretch; the level it climbs to must keep near full rate, else it drops back and the
// climb locks for the session.
// URL option: ?quality=high|mid|low (or 0–5) pins a level and turns the watch off.

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
  /** Share of grass clumps drawn: the lawn is most of the triangles in a frame (§16.18). */
  grass: number;
  /** The highlight glow (scene.ts): a few extra full-screen passes, so it goes with the shadows. */
  glow: boolean;
  /** Share of the ambience (ambience.ts: motes, ground mist, vent steam) drawn; 0 hides it. */
  ambience: number;
  /** No multisampling, soft focus or sharpening (Stage.setLite): for a software renderer, where every pixel costs. */
  lite?: boolean;
}

/**
 * Each step gives up the next saving, cheapest-looking first. Under CPU throttle the frame is
 * draw-call bound and the shadow pass is ~40% of the calls (§15.6), so shadows go first.
 */
export const LEVELS: Level[] = [
  { name: 'high', particles: 1, shadows: true, pixels: 2, grass: 1, glow: true, ambience: 1 },
  { name: 'shadow', particles: 1, shadows: false, pixels: 2, grass: 1, glow: false, ambience: 1 },
  { name: 'fx', particles: 0.5, shadows: false, pixels: 1.5, grass: 0.7, glow: false, ambience: 0.5 },
  { name: 'pixel', particles: 0.5, shadows: false, pixels: 1, grass: 0.55, glow: false, ambience: 0.5 },
  { name: 'min', particles: 0.25, shadows: false, pixels: 0.75, grass: 0.4, glow: false, ambience: 0 },
  // A software renderer (SwiftShader, WARP, llvmpipe) at 1280x720: 'min' ran at 3.9 fps, the cost was per pixel.
  { name: 'soft', particles: 0.25, shadows: false, pixels: 0.5, grass: 0.2, glow: false, ambience: 0, lite: true },
];
const NAMED: Record<string, number> = { high: 0, mid: 2, low: LEVELS.length - 1 };

/** Average fps under this for LOW_FOR seconds steps down. */
export const LOW_FPS = 40;
/** Average fps under this for LOW_FOR seconds goes straight to the bottom level: one step at a time took minutes. */
const FLOOR_FPS = 15;
/**
 * Average fps under this for LOW_FOR seconds steps down two levels at once: 2026-11-08..11, players who left
 * before their first tap ran at a median 26 fps (all players 48), and one level per ~5 s left them at 20-30 fps
 * for the 15-20 s they gave the game.
 */
const DEEP_FPS = 25;
/** A frame counts for at most this long, so one stall (a shader compile, a GC) moves the average only a little. */
const MAX_FRAME = 250;
const LOW_FOR = 3;
/** Average fps over this for HIGH_FOR seconds steps back up (once). */
const HIGH_FPS = 57;
const HIGH_FOR = 30;
/**
 * A level reached by the climb must keep this. Without it a Galaxy A16 climbed from 'pixel' to
 * 'fx' after 30 smooth seconds and stayed there at 49 fps, over LOW_FPS but under the 60 it had.
 */
const CLIMB_KEEP = 54;
/** Seconds of frames the average covers. */
const WINDOW = 2;
/** After a change, ignore this long: shader recompiles and the new level settling. */
const SETTLE = 2;

/** The GPU's name as WebGL gives it ('' where the browser hides it): sent with `load`, and how a software renderer is found. */
export function gpuName(renderer: Pick<THREE.WebGLRenderer, 'getContext'>): string {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  } catch {
    return '';
  }
}

/** WebGL drawn by the CPU: no GPU, a blocked driver, a VM. */
export const isSoftware = (gpu: string): boolean => /swiftshader|llvmpipe|softpipe|basic render|software/i.test(gpu);

/**
 * Where an unpinned run starts. A phone starts at 'pixel' (pixel ratio 1, no shadows): on a Galaxy A16
 * the levels above it ran at 23-40 fps, and walking down to it took ~15 s of stutter plus a shader
 * recompile at each shadow step. A fast phone climbs back to 'fx' after the usual smooth stretch.
 * A software renderer starts at the bottom: on 0.0.16 one such desktop played 3 h at ~3 fps.
 */
function startLevel(gpu: string): number {
  if (isSoftware(gpu)) return LEVELS.length - 1;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return touch ? 3 : 0;
}

/** The page is hidden or another window has focus, so the browser may be throttling it. */
function away(): boolean {
  return typeof document !== 'undefined' && (document.hidden || !document.hasFocus());
}

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
    this.set(this.forced ? pinned! : startLevel(gpuName(stage.renderer)));
  }

  /**
   * One rendered frame took `ms`, counted as at most MAX_FRAME. Frames over it were once skipped, which
   * left a device whose every frame took 300 ms at the initial 60 fps and never stepped down.
   * While the page is hidden or unfocused the browser may throttle it (~30 fps in a background
   * pane), which says nothing about the device: the watch pauses and starts timing afresh on return.
   */
  sample(ms: number): void {
    if (ms <= 0) return;
    if (away()) {
      this.restart();
      return;
    }
    const s = Math.min(ms, MAX_FRAME) / 1000;
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
    const floor = this.climbed && !this.locked ? CLIMB_KEEP : LOW_FPS;
    this.lowT = this.fps < floor ? this.lowT + s : 0;
    this.highT = this.fps > HIGH_FPS ? this.highT + s : 0;
    if (this.lowT >= LOW_FOR && this.level < LEVELS.length - 1) {
      // Dropping right after the one climb: this device can't hold it, stay down from now on.
      if (this.climbed) this.locked = true;
      this.set(this.fps < FLOOR_FPS ? LEVELS.length - 1 : Math.min(LEVELS.length - 1, this.level + (this.fps < DEEP_FPS ? 2 : 1)));
    } else if (this.highT >= HIGH_FOR && this.level > 0 && !this.climbed && !this.locked) {
      this.climbed = true;
      this.set(this.level - 1);
    }
  }

  /** Forget the recent frames and wait SETTLE before judging again. */
  private restart(): void {
    this.lowT = this.highT = 0;
    this.settle = SETTLE;
    this.times = [];
    this.sum = 0;
  }

  set(level: number): void {
    const prev = LEVELS[this.level];
    const l = LEVELS[level];
    this.level = level;
    this.restart();
    this.fx.density = l.particles;
    this.stage.glow.enabled = l.glow;
    this.stage.setLite(!!l.lite);
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
    scene.traverse((o) => {
      const n = o.userData.clumps;
      if (n && o instanceof THREE.InstancedMesh) o.count = Math.max(1, Math.round(n * l.grass));
    });
    const ratio = Math.min(window.devicePixelRatio, l.pixels);
    if (renderer.getPixelRatio() !== ratio) {
      renderer.setPixelRatio(ratio);
      this.stage.resize();
    }
    if (prev !== l && import.meta.env.DEV) console.info(`[quality] ${prev.name} -> ${l.name}`);
  }
}
