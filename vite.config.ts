import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const BRIDGE_CONFIG = 'playgama-bridge-config.json';

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
  };
}

// Reference videos, build output and docs never feed the app: keep the dev watcher off them.
// Relative base: portals serve the zip from a sub-path, so assets must not be root-absolute.
export default defineConfig({
  base: './',
  plugins: [bridgeConfig()],
  server: { port: 5173, watch: { ignored: ['**/ref/**', '**/dist/**', '**/docs/**', '**/release/**'] } },
});
