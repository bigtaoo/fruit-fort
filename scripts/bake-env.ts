// Bakes the studio environment (the armour's sheen, scene.ts) offline so the game downloads it instead of
// building it at load, which cost ~1 s of shader compiles on a slow phone (2026-11-06).
// Starts Vite, has headless Chrome run scripts/bake-env.page.ts, and writes the CubeUV texture as RGBE
// (8-bit colour and a shared exponent per texel), gzipped, to src/assets/env/studio.rgbe.gz.
// Usage: npx tsx scripts/bake-env.ts [size=64] [outFile]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createServer } from 'vite';
import { encodeRgbe, halfToFloat } from '../src/view/rgbe';

const size = Number(process.argv[2] ?? 64);
const out = process.argv[3] ?? 'src/assets/env/studio.rgbe.gz';
const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 4211;
const DEBUG = 9341;

const server = await createServer({
  server: { port: PORT, strictPort: true, host: '127.0.0.1' },
  logLevel: 'silent',
  plugins: [
    {
      name: 'bake-page',
      configureServer(s) {
        s.middlewares.use('/__bake', (_req, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end('<!doctype html><script type="module" src="/scripts/bake-env.page.ts"></script>');
        });
      },
    },
  ],
});
await server.listen();
const profile = mkdtempSync(join(tmpdir(), 'bake-env-'));
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--no-first-run', `http://127.0.0.1:${PORT}/__bake`], { stdio: 'ignore' });
try {
  let ws = '';
  for (let i = 0; i < 100 && !ws; i++) {
    await new Promise((ok) => setTimeout(ok, 200));
    try {
      const list = (await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      ws = list.find((p) => p.type === 'page')?.webSocketDebuggerUrl ?? '';
    } catch {
      // Chrome is still starting.
    }
  }
  const sock = new WebSocket(ws);
  await new Promise((ok) => (sock.onopen = ok));
  const call = (expression: string) =>
    new Promise<{ result: { value: unknown }; exceptionDetails?: unknown }>((ok) => {
      sock.onmessage = (m) => ok(JSON.parse(String(m.data)).result);
      sock.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
  type Baked = { width: number; height: number; halves: number[] };
  let got = null as Baked | null;
  for (let i = 0; i < 50 && !got; i++) {
    const r = await call(`window.bakeEnv ? window.bakeEnv(${size}) : null`);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    got = r.result.value as Baked | null;
    if (!got) await new Promise((ok) => setTimeout(ok, 200));
  }
  sock.close();
  if (!got) throw new Error('the bake page never loaded');
  const floats = Float32Array.from(got.halves, halfToFloat);
  let max = 0;
  for (let i = 0; i < floats.length; i++) if (i % 4 !== 3) max = Math.max(max, floats[i]);
  const raw = encodeRgbe(floats);
  const gz = gzipSync(raw, { level: 9 });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, gz);
  console.log(`${got.width}x${got.height}, brightest ${max.toFixed(2)}, ${raw.length} bytes RGBE, ${gz.length} gzipped -> ${out}`);
} finally {
  proc.kill();
  await server.close();
  await new Promise((ok) => setTimeout(ok, 500));
  rmSync(profile, { recursive: true, force: true });
}
