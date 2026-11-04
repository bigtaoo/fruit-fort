import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const BRIDGE_CONFIG = 'playgama-bridge-config.json';
/** Same as BRIDGE_URL in src/platform/playgama.ts. */
const BRIDGE_URL = 'https://bridge.playgama.com/v2/stable/playgama-bridge.js';

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
      this.emitFile({ type: 'asset', fileName: BRIDGE_CONFIG, source: read() });
    },
    // Playgama wants the SDK as the first, synchronous script in <head> (Bridge required step 2). Build only:
    // the dev server stays on the local stub unless ?platform=playgama loads it (src/platform/playgama.ts).
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.server) return html;
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <script src="${BRIDGE_URL}"></script>`);
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
  assetsInclude: ['**/*.glb'],
  plugins: [bridgeConfig(), bootSizes()],
  server: { port: 5173, watch: { ignored: ['**/ref/**', '**/dist/**', '**/docs/**', '**/release/**', '**/coverage/**', '**/.claude/**', '**/leftovers/**', '**/scripts/.probe/**'] } },
});
