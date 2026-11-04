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

/** The first frame is up: fill the bar, fade the screen out and drop it. */
export function hideLoading(): void {
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
    try {
      const res = await fetch(f.url);
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
