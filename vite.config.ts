import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/** package.json's version: the settings popup shows it and the release zip is named by it (scripts/package.ts). */
const VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

const BRIDGE_CONFIG = 'playgama-bridge-config.json';
/** Same as BRIDGE_URL in src/platform/playgama.ts. */
const BRIDGE_URL = 'https://bridge.playgama.com/v2/stable/playgama-bridge.js';
/** Same as CG_SDK_URL in src/platform/crazygames.ts. */
const CG_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/**
 * Which portal this build is for: `VITE_HOST=crazygames npm run package` (or `npm run package:cg`) makes the
 * CrazyGames build, anything else makes the Playgama one. It decides one thing only — which SDK script goes
 * into index.html — but that one thing has to be exclusive: the Bridge script defines `window.bridge`, and the
 * platform layer reads that as "this is a Playgama page" (src/platform/playgama.ts wantsPlaygama).
 */
const HOST = process.env.VITE_HOST === 'crazygames' ? 'crazygames' : 'playgama';

/** Playgama Bridge fetches ./playgama-bridge-config.json next to index.html; serve it in dev, emit it in builds. */
function bridgeConfig(): Plugin {
  const read = () => readFileSync(new URL(`./src/platform/${BRIDGE_CONFIG}`, import.meta.url), 'utf8');
  return {
    name: 'playgama-bridge-config',
    configureServer(server) {
      server.middlewares.use(`/${BRIDGE_CONFIG}`, (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(read());
      });
    },
    generateBundle() {
      if (HOST === 'playgama') this.emitFile({ type: 'asset', fileName: BRIDGE_CONFIG, source: read() });
    },
    // The SDK as a plain synchronous script, the page's first classic script, but after the loading screen's
    // markup: first in <head> (Bridge required step 2) it held the first paint until bridge.playgama.com answered,
    // seconds of a white page on a slow line (2026-11-07). Holy Kicker and Potion Siege place it the same way.
    // It still runs before the game's module (deferred) starts. Build only: the dev server stays on the local
    // stub unless ?platform=playgama loads it (src/platform/playgama.ts).
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.server) return html;
        if (!html.includes('</body>')) throw new Error('index.html has no </body> for the SDK script');
        // One SDK or the other, never both: each adapter reads the other's global as "this is that portal's page"
        // (wantsPlaygama / wantsCrazyGames). CrazyGames' docs put their tag in <head>; it goes here instead, for
        // the same first-paint reason as Bridge, and crazygames.ts loads the SDK itself if it is not there yet.
        const url = HOST === 'crazygames' ? CG_SDK_URL : BRIDGE_URL;
        return html.replace('</body>', `  <script src="${url}"></script>
  </body>`);
      },
    },
  };
}

/**
 * Tell the loading screen how big its downloads are (src/loading.ts BOOT_SIZES): the game chunk's file name and
 * the raw size of it and of every model, written into the entry chunk in place of its '__BOOT_SIZES__' string.
 */
function bootSizes(): Plugin {
  return {
    name: 'boot-sizes',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const base = (f: string) => f.split('/').pop()!;
      const sizes: { game?: string; bytes: Record<string, number> } = { bytes: {} };
      for (const out of Object.values(bundle)) {
        if (out.type === 'chunk' && out.facadeModuleId?.replace(/\\/g, '/').endsWith('/src/main.ts')) {
          sizes.game = base(out.fileName);
          sizes.bytes[base(out.fileName)] = Buffer.byteLength(out.code);
        } else if (out.type === 'asset' && out.fileName.endsWith('.glb')) {
          sizes.bytes[base(out.fileName)] = typeof out.source === 'string' ? Buffer.byteLength(out.source) : out.source.length;
        }
      }
      if (!sizes.game) this.error('boot-sizes: no game chunk (src/main.ts)');
      const entry = Object.values(bundle).find((o) => o.type === 'chunk' && o.isEntry);
      const marker = /(["'`])__BOOT_SIZES__\1/;
      if (entry?.type !== 'chunk' || !marker.test(entry.code)) this.error('boot-sizes: no __BOOT_SIZES__ in the entry chunk');
      entry.code = entry.code.replace(marker, JSON.stringify(JSON.stringify(sizes)));
    },
  };
}

// Reference videos, build output, docs, coverage, agent worktrees and probe scratch never feed the app: keep the dev
// watcher off them. On Windows chokidar spins (~1.5 cores) on a watched folder that gets deleted, e.g. coverage/.tmp.
// Vite's own restart on a config edit keeps the old watcher: stop and start the dev server after changing this list.
// Relative base: portals serve the zip from a sub-path, so assets must not be root-absolute.
// GLB is not one of Vite's built-in asset types; the hero and bug meshes ship as files that boot.ts downloads (glb.ts).
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  assetsInclude: ['**/*.glb'],
  plugins: [bridgeConfig(), bootSizes()],
  server: { port: 5173, watch: { ignored: ['**/ref/**', '**/dist/**', '**/docs/**', '**/release/**', '**/coverage/**', '**/.claude/**', '**/leftovers/**', '**/scripts/.probe/**'] } },
});
