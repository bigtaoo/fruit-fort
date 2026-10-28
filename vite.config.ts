import { defineConfig } from 'vite';

// Reference videos, build output and docs never feed the app: keep the dev watcher off them.
export default defineConfig({
  server: { watch: { ignored: ['**/ref/**', '**/dist/**', '**/docs/**'] } },
});
