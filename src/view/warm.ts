// Shader warming: compiling the programs the opening draws before the game shows, the rest one step
// at a time once it is on screen, and again after a quality step changes them, each step paced by
// warmPause so the play gets its frames. Split from units.ts, whose warm, warmRest and rewarm call it.

import * as THREE from 'three';
import { ENEMIES } from '../sim/config';
import type { EnemyKind } from '../sim/types';
import { busy } from '../platform/busy';
import { makeBolt } from './projectiles';
import type { Fx } from './fx';
import type { Horde } from './horde';
import { makeBug, makePod } from './pickups';
import type { WarmStage } from './scene';

/** The least a warmRest step waits before the next one (ms). */
const WARM_GAP = 250;
/**
 * Frames the play must actually get between two steps. The gap alone is wall clock, and on a machine
 * drawing 4 fps one frame is longer than it, so the compiles ran back to back and the opening stayed at
 * 3-4 fps through the ~15 s a player spends deciding (2026-11-15, an Intel HD 5500 session: first frame
 * at 10.4 s, 3.8 fps at 15.5 s, 60 fps by 30 s, which is when the steps ran out).
 */
const WARM_FRAMES = 10;
/** However slow the frames come, a step waits no longer than this: a hidden page draws none at all. */
const WARM_CAP = 4000;
/** How often the wait looks at the frame count. */
const WARM_POLL = 50;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Nobody is watching: another tab or app is up front, and rAF has stopped. */
const hidden = (): boolean => typeof document !== 'undefined' && document.hidden;

/**
 * Wait before the next warmRest step: WARM_GAP at the least, and past it until the play has had
 * WARM_FRAMES frames since the wait began (at 60 fps they are all in within the gap, so the wait is
 * the gap), at most WARM_CAP from the same moment. `drawn` counts the frames the render loop has put
 * on screen; without it, or while the page is hidden and draws none, only the gap: there is no play to
 * leave room for, and waiting out the cap would only hold the compiles back (a hidden tab, the dev bot).
 */
export async function warmPause(drawn?: () => number): Promise<void> {
  const from = drawn?.() ?? 0;
  const until = performance.now() + WARM_CAP;
  await sleep(WARM_GAP);
  while (drawn && !hidden() && drawn() - from < WARM_FRAMES && performance.now() < until) await sleep(WARM_POLL);
}

/** The effect ring's material and shape, for warm. */
function warmRing(): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

export class Warmer {
  /** Warming runs one at a time: a quality change can ask for a re-warm while warmRest is still going. */
  private warming: Promise<unknown> = Promise.resolve();

  constructor(private scene: THREE.Scene, private fx: Fx, private horde: Horde) {}

  /**
   * Build the shaders the opening draws before the game shows, not when the first of their kind turns up. Call it
   * as the stage is built: the scene (`stage.warm`, with the environment and the post passes), both bolts and an
   * effect ring start compiling at once. The returned function takes the bug kinds once the save says which (the
   * level the player is on), compiles them, and draws everything once off screen (stage.prime), as the shadow pass
   * builds its depth variants (the bugs' instanced rig) only when it draws. Every other kind waits for warmRest,
   * after the game shows: 2026-11-07, all 57 programs before the first frame kept weak Windows machines (ANGLE
   * translating to D3D) on the loading screen 7-13 s. The compile is waited for without blocking the page
   * (2026-11-06: done in one go it held the main thread 1-5 s).
   */
  warm(stage: WarmStage, onScene?: (ms: number) => void, onPrime?: (ms: number) => void): (kinds: readonly EnemyKind[]) => Promise<void> {
    const g = new THREE.Group();
    g.add(makeBolt(false), makeBolt(true), warmRing());
    this.scene.add(g);
    this.fx.ring(0, 0, 1, 0xffffff);
    const from = performance.now();
    // Timed where it resolves, not where it is awaited: the finisher also waits for the save, so a slow
    // network would otherwise read as a slow machine.
    const scene = stage.warm().then(() => performance.now() - from);
    // Awaited by the finisher; a failure there is that call's, not an unhandled one in between.
    scene.catch(() => {});
    // Through the same queue as the rest: the loading screen gives up waiting after WARM_WAIT, and from
    // then on a quality step can ask for a re-warm while this one is still compiling.
    return (kinds) => this.queue(async () => {
      try {
        this.horde.prepare(kinds);
        this.horde.showAll(true);
        // The stage's own programs first, and what they took picks the quality level (Quality.compiled)
        // before the bugs compile: a step down there turns the shadows off, so the bugs never build the
        // depth variants at all rather than building them and having them thrown away seconds later.
        onScene?.(await scene);
        busy('warm');
        await stage.compile();
        // A frame may have run while they compiled (the loading page times the warming out), and it
        // hides the empty batches again; prime needs them visible.
        this.horde.showAll(true);
        const primeFrom = performance.now();
        stage.prime();
        onPrime?.(performance.now() - primeFrom);
      } finally {
        this.scene.remove(g);
        this.fx.reset();
        this.horde.showAll(false);
      }
    });
  }

  /**
   * The rest, once the game is on screen: every bug kind and the parts only made mid-run (the pickups and the
   * special bug), one at a time with a pause between, so no single frame makes all their programs and shadow
   * variants: 2026-11-11, done in one go it was the 1-9 s freeze players met in wave 1 (performance_sample
   * long_task_wave p50 1, frame_time_max p90 1.9 s). Kinds come in the order levels bring them. A kind drawn
   * before its turn compiles at that draw, as all of them did before warm split. `drawn` counts rendered
   * frames, so the pause between steps is real play and not just wall clock (warmPause). `only` narrows
   * the kinds: on a machine slow enough to have started low (Quality.weak) eight compiles are a cost the
   * run cannot carry, so it warms the ones the level can field and meets the others as they first draw.
   */
  warmRest(stage: WarmStage, drawn?: () => number, only?: readonly EnemyKind[]): Promise<void> {
    return this.queue(async () => {
      const g = new THREE.Group();
      g.add(makeBug(), makePod());
      const steps: (() => void)[] = [() => this.scene.add(g)];
      for (const k of Object.keys(ENEMIES) as EnemyKind[]) {
        if (only && !only.includes(k)) continue;
        steps.push(() => this.horde.prepare([k]));
      }
      for (const step of steps) {
        await warmPause(drawn);
        step();
        this.horde.showAll(true);
        try {
          // Programs already made are skipped; only this step's are new.
          busy('warm');
          await stage.compile();
          // Again: a frame drawn while the compile ran ends in Horde.end -> flush, which hides every
          // batch holding no bugs, and prime would then draw nothing at all.
          this.horde.showAll(true);
          // Empty batches (no instances) draw nothing but build the shadow pass's variants.
          stage.prime();
        } finally {
          this.horde.showAll(false);
          this.scene.remove(g);
        }
      }
    });
  }

  /**
   * Everything warmed so far, once more, because a quality step changed the programs themselves: turning
   * the shadows off (or back on) gives every lit material another variant, and quality.set marks them all
   * for a rebuild. What is on screen rebuilds in the next frame anyway, which is the one hitch the step
   * costs on purpose; what is not on screen - the bug kinds whose batches stand empty - would otherwise
   * rebuild one at a time, each at the first bug of its kind, which is exactly the mid-wave stall warmRest
   * was written to remove (2026-11-16: on a desktop the first step down lands ~5 s in, after warmRest has
   * finished, so all nine steps were being thrown away). One kind per step, paced like warmRest.
   */
  rewarm(stage: WarmStage, drawn?: () => number): Promise<void> {
    return this.queue(async () => {
      const steps: (EnemyKind | null)[] = [null, ...this.horde.prepared()];
      for (const k of steps) {
        await warmPause(drawn);
        this.horde.show(k, true);
        try {
          busy('warm');
          await stage.compile();
          this.horde.show(k, true);
          stage.prime();
        } finally {
          this.horde.show(k, false);
        }
      }
    });
  }

  /** Run after whatever warming is already going, and never let a failure break the next one. */
  private queue(run: () => Promise<void>): Promise<void> {
    const next = this.warming.then(run, run);
    this.warming = next.catch(() => {});
    return next;
  }
}
