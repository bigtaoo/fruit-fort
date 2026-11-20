// Low-end devices (§15.6): watch the frame rate over the last ~2 s and, when it stays low,
// step the picture down one level at a time. Steps back up only once, and only after a long
// smooth stretch; the level it climbs to must keep near full rate, else it drops back and the
// climb locks for the session.
// URL option: ?quality=high|mid|low (or 0–5) pins a level and turns the watch off.

import * as THREE from 'three';
import type { Stage } from './scene';
import type { Fx } from './fx';
import { busy } from '../platform/busy';

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
  /**
   * Most pixels drawn per frame, whatever the window's size: a software renderer's cost is per pixel, so a
   * fixed ratio left a 1920x1080 window at half the frame rate of a 1280x720 one (2026-11-11).
   */
  budget?: number;
}

/**
 * Each step gives up the next saving, cheapest-looking first. Under CPU throttle the frame is
 * draw-call bound and the shadow pass is ~40% of the calls (§15.6), so shadows go first.
 */
export const LEVELS: Level[] = [
  { name: 'high', particles: 1, shadows: true, pixels: 2, grass: 1, glow: true, ambience: 1 },
  { name: 'shadow', particles: 1, shadows: false, pixels: 2, grass: 1, glow: false, ambience: 1 },
  { name: 'fx', particles: 0.5, shadows: false, pixels: 1.5, grass: 0.7, glow: false, ambience: 0.5 },
  // The two levels below 'fx' carry a pixel budget as well, for the same reason the bottom one does: a
  // ratio alone follows the window, so a 1920x1080 desktop at 'min' still drew ~1.17M pixels a frame -
  // the machines that get this far are the ones that cannot afford them. A phone is untouched: 390x844
  // CSS pixels is 0.33M, under both budgets, so the ratio stays at 1 where 'pixel' is the touch start.
  { name: 'pixel', particles: 0.5, shadows: false, pixels: 1, grass: 0.55, glow: false, ambience: 0.5, budget: 700_000 },
  { name: 'min', particles: 0.25, shadows: false, pixels: 0.75, grass: 0.4, glow: false, ambience: 0, budget: 400_000 },
  // A software renderer (SwiftShader, WARP, llvmpipe) at 1280x720: 'min' ran at 3.9 fps, the cost was per pixel.
  // 2026-11-11, SwiftShader, a fight with six Lv3 wagons and ~45 bugs at 1280x720: ratio 0.5 (640x360) 17.5 fps,
  // 0.4 23.6, 0.35 25.5, 0.3 25.7 (CPU-bound from there); a 1920x1080 window at 0.35 only 13.9. So a budget of
  // ~448x256 drawn pixels, the ratio following the window.
  { name: 'soft', particles: 0.25, shadows: false, pixels: 0.5, grass: 0.2, glow: false, ambience: 0, lite: true, budget: 115_000 },
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
/**
 * An opening compile this slow (ms) starts the run at 'min', and SOFT_COMPILE at 'soft'. 2026-11-15/16,
 * 17 loads: the median page had `warm` about 0.5 s after `save`, the slowest 40 s later. The numbers are
 * a first cut on a small sample; `load` carries both marks, so the live spread can move them.
 */
const SLOW_COMPILE = 1500;
const SOFT_COMPILE = 4000;
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
export function startLevel(gpu: string, touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches): number {
  if (isSoftware(gpu)) return LEVELS.length - 1;
  if (touch) return 3;
  return isIntegrated(gpu) ? 2 : 0;
}

/**
 * A desktop GPU that shares the CPU's memory: Intel's HD/UHD/Iris, AMD's APU "Radeon(TM) Graphics".
 * They start at 'fx' (no shadows or glow, pixel ratio 1.5) and climb to 'shadow' after a smooth stretch
 * (2026-11-20, 0.0.39): over 0.0.31-0.0.38 the 68 new players who left without a tap ran at a median 28 fps
 * against 49 for the 108 who tapped, 10/39 under 15 fps against 2/66, and most of the slow ones were
 * Intel iGPUs still on 'high' when they left 5-20 s in - before the watch's first step down (~7 s) could help.
 * Apple's GPUs are left out: they held full rate.
 */
export const isIntegrated = (gpu: string): boolean => /\bintel\b|radeon\(tm\) graphics|radeon graphics|radeon vega/i.test(gpu) && !/\barc\b/i.test(gpu);

/** The page is hidden or another window has focus, so the browser may be throttling it. */
function away(): boolean {
  return typeof document !== 'undefined' && (document.hidden || !document.hasFocus());
}

export class Quality {
  level = 0;
  /**
   * Called when a step changed the shaders themselves (the shadow toggle), so whoever warmed the
   * programs can warm them again: the mark below throws away everything compiled so far.
   */
  onShaders: (() => void) | null = null;
  /** Pinned from the URL: no automatic changes. */
  readonly forced: boolean;
  /**
   * The opening compile was slow enough to start low (`compiled`). Warming every bug kind up front is
   * not worth its cost on such a machine, so main.ts warms only the ones the level can actually field.
   */
  weak = false;
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

  /**
   * The opening shaders took `ms` to compile. It is the one real measurement of the machine we have
   * before anything is drawn, and it spreads over two orders of magnitude (SLOW_COMPILE). Walking down
   * from the top instead costs the weakest machines 5-15 s at 3-4 fps - about the whole time a new
   * player gives the game - and every shadow step on the way throws away the programs compiled so far.
   * So a slow compile picks the level here, before the first frame, and the climb stays locked: a
   * machine that compiles this slowly has nothing to climb back to, and the climb would only invalidate
   * every program a second time.
   */
  compiled(ms: number): void {
    if (this.forced || this.weak) return;
    const level = ms >= SOFT_COMPILE ? LEVELS.length - 1 : ms >= SLOW_COMPILE ? LEVELS.length - 2 : -1;
    if (level <= this.level) return;
    this.weak = true;
    this.locked = true;
    this.set(level);
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
    const shaders = renderer.shadowMap.enabled !== l.shadows;
    if (shaders) {
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
    this.fit(false);
    if (prev !== l && import.meta.env.DEV) console.info(`[quality] ${prev.name} -> ${l.name}`);
    // The step itself rebuilds every program on screen in the next frame - the one hitch it costs on
    // purpose - so a long task right here is this, not the play.
    if (shaders) busy('q');
    if (shaders) this.onShaders?.();
  }

  /**
   * Set the level's pixel ratio for the window as it is now; on a resize too, as a level with a pixel
   * budget gives a bigger window a lower ratio. `resized`: the caller sizes the stage itself.
   */
  fit(resized = true): void {
    const l = LEVELS[this.level];
    let ratio = Math.min(window.devicePixelRatio, l.pixels);
    if (l.budget) ratio = Math.min(ratio, Math.sqrt(l.budget / (Math.max(1, window.innerWidth || 1280) * Math.max(1, window.innerHeight || 720))));
    ratio = Math.round(ratio * 100) / 100;
    if (this.stage.renderer.getPixelRatio() === ratio) return;
    this.stage.renderer.setPixelRatio(ratio);
    if (!resized) this.stage.resize();
  }
}
