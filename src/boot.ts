// Entry point. The platform SDK starts (getPlatform) while the game chunk and the model files download here,
// counted byte by byte on the loading screen (loading.ts); the chunk then runs from the browser cache and builds
// the stage and compiles the opening's shaders while Bridge's `initialize()` may still be going. The game makes
// no SDK call before it: main.ts awaits getPlatform() for the save, the language and everything after (Bridge
// required step 2 asks for the SDK before the engine; the scene build overlapping the initialize is a deliberate
// trade, docs/platform.md). getPlatform never rejects: offline.ts stands in on a Playgama page whose SDK fails.

import { getPlatform, type Platform } from './platform';
import { bootErrorFields, bootErrorKind, hasWebgl2 } from './bootfail';
import { BOOT_SIZES, bootFailed, bootTimes, downloadAll, mark, setProgress, watchBootLeave, watchContextLoss, type BootSend, type Download } from './loading';
import { GLB_URLS, keepGlb } from './view/glb';
import { keepStudio, STUDIO_URL } from './view/studio';

/** Share of the bar for the SDK starting up, and where the downloads end (the rest is building the scene). */
const SDK = 0.08;
const FETCHED = 0.9;

/**
 * Events before the game runs: through the platform once it is up, else straight to Bridge, which queues
 * them until its initialize (2026-11-06: a third of the players who started the SDK never reached the
 * game, and nothing said where they stopped). `pf` is the platform's id once it is up ('' before): `offline`
 * means the SDK was given up on, not that it started.
 */
let platform: Platform | null = null;
const send: BootSend = (event, data) => {
  try {
    const d = { ...data, pf: platform?.id ?? '' };
    if (platform) platform.track(event, d);
    else window.bridge?.analytics?.send?.(event, d);
  } catch {
    // Analytics must never break the loading.
  }
};
watchBootLeave(send);

const canvas = document.getElementById('game');
if (canvas instanceof HTMLCanvasElement) watchContextLoss(canvas);
// The SDK gives no progress of its own: creep towards its share so the bar isn't standing still.
const creep = setInterval(() => setProgress(Math.min(SDK, (performance.now() / 1000) * 0.02 + 0.01)), 100);

// The files download while the SDK starts (2026-11-06: one after the other cost players a second or more);
// the game chunk runs once they are in, and only its save and what follows wait for initialize().
const files: Download[] = Object.entries(GLB_URLS).map(([path, url]) => ({ url, keep: (buf) => buf && keepGlb(path, buf) }));
if (BOOT_SIZES.game) files.push({ url: new URL(BOOT_SIZES.game, import.meta.url).href });
const fetched = downloadAll(files, SDK, FETCHED).then(() => mark('dl'));
// The baked environment (67 KB) comes last, off the bar: the game only needs it once the scene is built
// (stage.warm), ~0.7 s later on a slow phone, and sharing the line with the files above held them up.
void fetched
  .then(() => fetch(STUDIO_URL))
  .then((res) => (res.ok ? res.arrayBuffer() : null))
  .catch(() => null)
  .then(keepStudio);

void getPlatform().then((p) => {
  platform = p;
  mark('sdk');
});

/** Wait before fetching the game chunk again, so a dropped connection has a moment to come back. */
const RETRY_MS = 1500;

/**
 * Run the game chunk. A chunk that didn't arrive is fetched once more under another URL (a browser may keep a
 * failed module import and hand it back), and `retry` goes into the load event's step times. A chunk that
 * threw while it ran is not run again: it already set itself up halfway.
 */
async function runGame(): Promise<void> {
  try {
    await import('./main');
  } catch (e) {
    if (!BOOT_SIZES.game || bootErrorKind(e, true) !== 'fetch') throw e;
    console.warn('[boot] the game chunk did not arrive; fetching it again', e);
    mark('retry');
    await new Promise((done) => setTimeout(done, RETRY_MS));
    await import(/* @vite-ignore */ `${new URL(BOOT_SIZES.game, import.meta.url).href}?retry=1`);
  }
}

void fetched.then(async () => {
  clearInterval(creep);
  // The bar is at FETCHED now; `mark` carries it the rest of the way, a step per loading step (loading.ts STEPS).
  try {
    await runGame();
  } catch (e) {
    // The game chunk failed to load (twice), or threw while it ran (no WebGL2 for the stage).
    console.error('[boot] the game failed to start', e);
    send('boot_error', { stage: 'main', retried: 'retry' in bootTimes(), ...bootErrorFields(e, hasWebgl2()) });
    bootFailed();
  }
});
