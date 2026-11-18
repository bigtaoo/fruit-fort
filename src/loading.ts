// The loading screen (#boot in index.html, drawn before any script runs) and its progress bar.
// boot.ts drives it: a slow creep while the platform SDK starts, then the real byte count of the game
// chunk and the model files as they download, then a last step while the scene is built; main.ts
// fades it out once the first frame is on screen, and only then tells the platform the game is ready.

/** Raw sizes of the files boot.ts downloads, filled in by the build (vite.config.ts bootSizes); empty in dev. */
interface BootSizes {
  /** File name of the game chunk, next to the entry chunk. */
  game?: string;
  /** Uncompressed bytes by file name. */
  bytes: Record<string, number>;
}

function readSizes(): BootSizes {
  try {
    return JSON.parse('__BOOT_SIZES__') as BootSizes;
  } catch {
    return { bytes: {} };
  }
}

export const BOOT_SIZES = readSizes();

/** Guess for a file the build didn't measure (dev): about one model. */
const GUESS = 60_000;
/** A download that gets no bytes for this long is dropped (as a failed one is), so the loading goes on. */
const STALL_MS = 15_000;

const root = document.getElementById('boot');
const fill = root?.querySelector<HTMLElement>('.boot-fill') ?? null;
const pct = root?.querySelector<HTMLElement>('.boot-pct') ?? null;
let shown = 0;

/** Move the bar to `f` (0..1); it never goes back. */
export function setProgress(f: number): void {
  const v = Math.max(shown, Math.min(1, f));
  if (v === shown) return;
  shown = v;
  if (fill) fill.style.transform = `scaleX(${v})`;
  if (pct) pct.textContent = `${Math.round(v * 100)}%`;
}

/** When each loading step ended (ms since the page started), for the `load` event's breakdown. */
const marks: Record<string, number> = {};

/**
 * Where the bar stands once a late step has ended, and how long the step after it usually takes. The
 * last tenth of the bar covers four steps with no bytes to count (build, save, warm, first frame);
 * until 2026-11-17 it was one creep towards 0.99, and every `boot_left` the sandbox saw stood at
 * 91-93%. Each step now lands on a number of its own and creeps on towards the next one.
 */
const STEPS: Record<string, { at: number; next: number; over: number }> = {
  // `at` 0.9 is boot.ts's FETCHED, where downloadAll leaves the bar.
  dl: { at: 0.9, next: 0.94, over: 8_000 },
  build: { at: 0.94, next: 0.97, over: 6_000 },
  save: { at: 0.97, next: 0.995, over: 6_000 },
  warm: { at: 0.995, next: 0.995, over: 0 },
};

/** Note that the loading step `name` just ended, and move the bar on if it is one of the late ones. */
export function mark(name: string): void {
  marks[name] = Math.round(performance.now());
  performance.mark?.(`boot:${name}`);
  const step = STEPS[name];
  if (!step || shownGame) return;
  setProgress(step.at);
  creepTo(step.next, step.over);
}

/**
 * When each loading step ended, in ms since the page started (steps overlap, so these are not lengths):
 * `sdk` the Bridge script and its initialize, `dl` the game chunk and models (downloaded alongside the SDK),
 * `build` the game chunk run up to the empty stage, `save` the save and the language read, `warm` the
 * opening's shaders compiled and drawn once (alongside the save), `warm_rest` the other shaders, compiled after the
 * game shows (so it is later than the `load` event). Steps that didn't run are left out.
 */
export function bootTimes(): Record<string, number> {
  return { ...marks };
}

/** The step the loading is in: the last one that ended ('start' before any). */
export function bootStage(): string {
  return stageAt(Infinity);
}

/** The last step that had ended at `t` (ms since the page started); 'start' before any. */
function stageAt(t: number): string {
  let last = 'start';
  let at = -1;
  for (const [k, v] of Object.entries(marks)) if (v <= t && v >= at) [last, at] = [k, v];
  return last;
}

/** Single readings of the loading other than step times, for the `load` event (noteBoot). */
const facts: Record<string, number> = {};

/** Keep one reading of the loading (a step's own length in ms, a 0/1 flag) for the `load` event. */
export function noteBoot(key: string, value: number): void {
  facts[key] = Math.round(value);
}

/** Main-thread long tasks while the loading screen is up (watchBootLongTasks). */
const longs = { n: 0, total: 0, max: 0, at: '' };
let longWatch: PerformanceObserver | null = null;

function countLong(entries: PerformanceEntryList): void {
  if (shownGame) return;
  for (const e of entries) {
    longs.n++;
    longs.total += e.duration;
    if (e.duration > longs.max) {
      longs.max = e.duration;
      longs.at = stageAt(e.startTime);
    }
  }
}

/**
 * Count the main thread's long tasks (50 ms+) from the page's start until the game shows. 2026-11-18: on the
 * slowest live loads `page` - `save` ran 14-36 s, past WARM_WAIT, so the page was blocked somewhere although
 * the shaders compile without being waited on; this says how long, and in which step. Chrome only; elsewhere
 * the fields are left out.
 */
export function watchBootLongTasks(): void {
  try {
    longWatch = new PerformanceObserver((list) => countLong(list.getEntries()));
    longWatch.observe({ type: 'longtask', buffered: true });
  } catch {
    longWatch = null;
  }
}

/**
 * What the loading measured besides its step times: the noteBoot readings, and the long tasks so far -
 * `long_n` how many, `long_ms` their total, `long_max` the longest, `long_at` the last step that had ended
 * when it began ('dl' = the game chunk running and building the stage). Called from inside a task that is
 * still running, which is therefore not among them.
 */
export function bootFacts(): Record<string, number | string> {
  if (!longWatch) return { ...facts };
  countLong(longWatch.takeRecords());
  return { ...facts, long_n: longs.n, long_ms: Math.round(longs.total), long_max: Math.round(longs.max), ...(longs.at ? { long_at: longs.at } : {}) };
}

/** The game is on screen (hideLoading): the loading is no longer reported as left. */
let shownGame = false;
let creeper: ReturnType<typeof setInterval> | null = null;

const TICK = 150;

/**
 * Move the bar on towards `to` at a steady pace, over about `over` ms, while the scene is built (no bytes
 * to count there): 2026-11-06, players saw it stand at 90% for seconds on slow phones. It used to cover a
 * fixed share of what was left each tick, which crawls to a halt long before `to` - the bar read 91, 92,
 * 93 and looked frozen for the whole longest stretch of the loading. A fixed step keeps it visibly moving,
 * and it stops on `to` so the next step has room to pick it up from there.
 */
export function creepTo(to: number, over = 8_000): void {
  if (creeper) clearInterval(creeper);
  creeper = null;
  const step = ((to - shown) * TICK) / Math.max(TICK, over);
  if (step <= 0) return;
  creeper = setInterval(() => {
    setProgress(Math.min(to, shown + step));
    if (shown >= to && creeper) {
      clearInterval(creeper);
      creeper = null;
    }
  }, TICK);
}

export type BootSend = (event: string, data: Record<string, string | number | boolean>) => void;

/**
 * Report a page that goes away before the game shows: `boot_left {stage, s, pct, w, h}`, once. Listens in
 * the capture phase on `window`, so it runs before Bridge's own `visibilitychange` listener on the document
 * sends its queue with sendBeacon (an event queued after that is lost with the page).
 */
export function watchBootLeave(send: BootSend): void {
  let sent = false;
  const left = () => {
    if (sent || shownGame) return;
    sent = true;
    send('boot_left', { stage: bootStage(), sdk: 'sdk' in marks, dl: 'dl' in marks, s: Math.round(performance.now() / 100) / 10, pct: Math.round(shown * 100), w: window.innerWidth, h: window.innerHeight });
  };
  window.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && left(), true);
  window.addEventListener('pagehide', left, true);
}

/**
 * The game could not start (the game chunk failed to load or run, no WebGL2): say so on the loading
 * screen with a reload button, instead of a bar standing still.
 */
export function bootFailed(): void {
  if (creeper) clearInterval(creeper);
  if (document.querySelector('.boot-fail')) return;
  const btn = document.createElement('button');
  btn.className = 'boot-fail';
  // Inline: the game's style sheet comes with the chunk that failed.
  btn.style.cssText = 'position:fixed;inset:0;z-index:60;width:100%;border:0;background:rgba(4,10,23,0.85);color:#3fdcff;font-size:72px;cursor:pointer';
  btn.setAttribute('aria-label', 'Reload');
  btn.textContent = '↻';
  btn.addEventListener('click', () => location.reload());
  document.body.appendChild(btn);
}

/** The first frame is up: fill the bar, fade the screen out and drop it. */
export function hideLoading(): void {
  shownGame = true;
  if (creeper) clearInterval(creeper);
  setProgress(1);
  if (!root) return;
  root.classList.add('boot-out');
  setTimeout(() => root.remove(), 400);
}

export interface Download {
  url: string;
  /** Gets the file's bytes; a failed download is reported as null. */
  keep?: (buf: ArrayBuffer | null) => void;
}

function fileName(url: string): string {
  return new URL(url, location.href).pathname.split('/').pop() ?? url;
}

/**
 * Download every file at once, moving the bar from `from` to `to` by the bytes received. The bodies arrive
 * decompressed, so they are counted against the build's raw sizes. A file that fails is skipped: a missing
 * model falls back to the one built in code, and the browser fetches the game chunk again on import.
 */
export async function downloadAll(files: Download[], from: number, to: number): Promise<void> {
  const expect = files.map((f) => BOOT_SIZES.bytes[fileName(f.url)] ?? GUESS);
  const total = expect.reduce((a, b) => a + b, 0) || 1;
  const got = files.map(() => 0);
  const report = () => setProgress(from + ((to - from) * got.reduce((a, b) => a + b, 0)) / total);
  await Promise.all(files.map(async (f, i) => {
    const stop = new AbortController();
    let stall: ReturnType<typeof setTimeout> | undefined;
    const alive = () => {
      clearTimeout(stall);
      stall = setTimeout(() => stop.abort(), STALL_MS);
    };
    try {
      alive();
      const res = await fetch(f.url, { signal: stop.signal });
      if (!res.ok) throw new Error(`${res.status}`);
      const chunks: Uint8Array[] = [];
      const reader = res.body?.getReader();
      if (!reader) {
        const buf = await res.arrayBuffer();
        got[i] = expect[i];
        report();
        f.keep?.(buf);
        return;
      }
      let n = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        alive();
        chunks.push(value);
        n += value.length;
        got[i] = Math.min(n, expect[i]);
        report();
      }
      const out = new Uint8Array(n);
      let at = 0;
      for (const c of chunks) {
        out.set(c, at);
        at += c.length;
      }
      got[i] = expect[i];
      report();
      f.keep?.(out.buffer);
    } catch (err) {
      console.warn('[boot] could not download', f.url, err);
      got[i] = expect[i];
      report();
      f.keep?.(null);
    } finally {
      clearTimeout(stall);
    }
  }));
}

/**
 * The WebGL context was lost (the GPU reset, or the phone dropped the tab's context): three.js can't rebuild
 * this scene by itself, so cover the frozen canvas with a reload button instead.
 */
export function watchContextLoss(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (document.querySelector('.ctx-lost')) return;
    const btn = document.createElement('button');
    btn.className = 'ctx-lost';
    btn.setAttribute('aria-label', 'Reload');
    btn.textContent = '↻';
    btn.addEventListener('click', () => location.reload());
    document.body.appendChild(btn);
  });
}

/**
 * Whether `p` was still going after `ms`: a driver that never says the shaders are done must not keep the
 * loading screen up (they then compile at the first draw).
 */
export function timedOut(p: Promise<unknown>, ms: number): Promise<boolean> {
  return Promise.race([p.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), ms))]);
}

/**
 * Two frames on screen, or half a second where the browser gives none (a hidden frame). Work that runs in one
 * synchronous go (the rest of the shaders) waits for this so it does not hold up the first frame the player sees.
 */
export function afterShown(): Promise<void> {
  return new Promise<void>((done) => {
    const t = setTimeout(done, 500);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clearTimeout(t);
      done();
    }));
  });
}
