// The boot once the stage is built: warm the opening's shaders while the platform starts and the save,
// the sound switches and the language are read, then (once main.ts has put up the first screen) hide the
// loading screen, send `load` and warm the rest after the game shows. Boot owns the boot's timing and its
// warming; main.ts runs the steps in order and keeps what they return. Split from main.ts.

import type { World } from './sim/world';
import { LEVELS, levelKinds } from './sim/levels';
import type { EnemyKind } from './sim/types';
import type { Stage } from './view/scene';
import type { Units } from './view/units';
import type { Hud } from './view/hud';
import type { Sound } from './view/audio';
import { loadSoundPrefs, SOUND_KEYS, soundSwitches } from './view/soundprefs';
import { gpuName, type Quality } from './view/quality';
import { Analytics, getPlatform, type Platform } from './platform';
import type { Funnel } from './platform/funnel';
import { bootErrorFields, hasWebgl2 } from './bootfail';
import type { Save } from './meta/progress';
import { cardLevel } from './meta/chapter';
import { loadSave } from './meta/store';
import { detectLocale, isLocale, type Locale } from './i18n';
import { afterShown, bootFacts, bootFailed, bootTimes, hideLoading, mark, noteBoot, timedOut } from './loading';

/** Longest wait for the shaders on the loading screen (ms); 12 s outlasted the slow leavers (p90 12.5 s, 11-11). */
const WARM_WAIT = 6_000;

export interface BootParts {
  stage: Stage;
  units: Units;
  quality: Quality;
  sound: Sound;
  hud: Hud;
  funnel: Funnel;
}

export class Boot {
  private readonly at = performance.now();
  /** Compiles the opening bugs' shaders once the save says which level (Units.warm). */
  private readonly warmOpening: (kinds: readonly EnemyKind[]) => Promise<void>;
  /** The opening's warming and first draw, from `show`; warmRest follows it. */
  private warmed: Promise<void> = Promise.resolve();
  /** The bug kinds the opening level can field: all a weak machine warms after the game shows. */
  private needed: readonly EnemyKind[] = [];
  private platform: Platform | undefined;

  /**
   * Start compiling now. The scene's shaders compile while the platform starts and the save and the language
   * are read, the opening bugs' once the save says which level; the fight starts when those are in, and every
   * other bug kind compiles after the game shows (warmRest).
   */
  constructor(private readonly parts: BootParts) {
    mark('build');
    // How long the stage's own shaders take is the one measurement of this machine we have before anything is
    // drawn, so it picks the starting quality level (Quality.compiled) in the gap between that compile and the
    // bugs'. On a fast machine it changes nothing.
    this.warmOpening = parts.units.warm(parts.stage, (ms) => {
      noteBoot('compile_ms', ms);
      parts.quality.compiled(ms);
    }, (ms) => noteBoot('prime_ms', ms));
  }

  /** Start the platform and its analytics; the funnel sends through them from now on. */
  async connect(): Promise<{ platform: Platform; analytics: Analytics }> {
    const platform = await getPlatform();
    this.platform = platform;
    const analytics = new Analytics(platform);
    this.parts.funnel.connect((e, d) => analytics.track(e, d));
    return { platform, analytics };
  }

  /**
   * Read everything the game keeps (one read, a Bridge storage required step), set the sound switches and
   * the language: `lang` (?lang=), then the player's own pick, then the platform's (on Playgama that is
   * Bridge's platform.language only; the stub gives the browser's).
   */
  async read(p: Platform, lang: string | null, useLocale: (locale: Locale, picked: boolean) => Promise<void>): Promise<Save> {
    const { sound, hud } = this.parts;
    await p.storage.preload(['save', 'lang', ...SOUND_KEYS]);
    const save = await loadSave(p.storage);
    await loadSoundPrefs(sound, p.storage);
    hud.setSound(soundSwitches(sound));
    sound.setHostAudio(p.audioEnabled());
    p.onAudio((on) => sound.setHostAudio(on));
    const asked = lang ?? (await p.storage.get('lang'));
    await useLocale(isLocale(asked) ? asked : detectLocale([p.language()]), false);
    mark('save');
    return save;
  }

  /**
   * The first screen is up on `world` (a first-timer's level 1-1, else the village): warm the bugs of the
   * level the player is on, draw, hide the loading screen and send `load`. Start the frame loop after it.
   */
  async show(p: Platform, analytics: Analytics, save: Save, world: World): Promise<void> {
    const { stage, quality, funnel } = this.parts;
    // A first-timer's 1-1, else the one the village puts up first (its boss and the boss's brood come in
    // warmRest, long before its last wave). Endless opens on caterpillars only (WAVES.beetleFrom 3), level
    // 1-1's pool.
    const card = save.runs > 0 ? cardLevel(save) : null;
    const opening = card === null ? world.level : LEVELS[card === 'endless' ? 0 : card];
    // A machine that started low warms only what this level can field; the rest compile as they first draw.
    this.needed = opening ? levelKinds(opening) : [];
    this.warmed = this.warmOpening(opening?.pool ?? []).then(() => {
      // The draw off screen (prime_ms) and this first one run in the task that sends `load`, so its long-task
      // count can't include them: they are timed on their own.
      const drawFrom = performance.now();
      stage.render();
      noteBoot('draw_ms', performance.now() - drawFrom);
      mark('warm');
      funnel.step('first_frame');
    });
    const warmTimedOut = await timedOut(this.warmed, WARM_WAIT);
    // Before hideLoading: the long tasks are counted while the loading screen is up.
    const facts = bootFacts();
    // Shown and ready now, not in the next animation frame: a browser gives none to a hidden or zero-size
    // cross-origin frame, and the host may wait for gameReady before it shows the frame (0.0.14 waited).
    hideLoading();
    p.gameReady();
    analytics.track('load', { ms: Math.round(performance.now() - this.at), page: Math.round(performance.now()), platform: p.id, runs: save.runs, best: save.best, gpu: gpuName(stage.renderer).slice(0, 100), q: quality.level, ...(warmTimedOut ? { warm_timeout: true } : {}), ...bootTimes(), ...facts });
  }

  /** Once the frame loop runs: the re-warm on a quality step, every other bug kind, the heartbeat. */
  rest(analytics: Analytics, drawn: () => number): void {
    const { stage, units, quality } = this.parts;
    // A quality step that toggles the shadows throws away every program warmed so far, so warm them again.
    // Set before the warming starts: on a slow machine the first step down comes long before it is done,
    // and Units queues the re-warm behind whatever is running.
    quality.onShaders = () => void units.rewarm(stage, drawn).catch((e) => console.warn('[main] re-warming after a quality step failed', e));
    void this.warmed
      .then(afterShown)
      .then(() => units.warmRest(stage, drawn, quality.weak ? this.needed : undefined))
      .then(() => mark('warm_rest'))
      .catch((e) => console.warn('[main] warming the shaders failed; they compile as they are first drawn', e));
    analytics.startHeartbeat(() => ({ q: quality.level, fps: Math.round(quality.fps) }));
  }

  /** The platform, the save or the language threw: say so rather than leave the bar standing. */
  failed(e: unknown): void {
    console.error('[main] start failed', e);
    try {
      this.platform?.track('boot_error', { stage: 'start', ...bootErrorFields(e, hasWebgl2()) });
    } catch {
      // Analytics must never break the error screen.
    }
    bootFailed();
  }
}
