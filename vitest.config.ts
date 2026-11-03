import { configDefaults, defineConfig } from 'vitest/config';

// Coverage covers all of src/, untested files included, so the total is honest. The floors sit just
// under today's numbers: CI fails when coverage drops. The sim and the meta rules carry the game's
// logic and stay near full; the view (three.js, DOM) is checked in the browser, not here.
export default defineConfig({
  test: {
    // Agent worktrees under .claude/ hold whole copies of src/: leave their tests out.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: {
        statements: 27,
        branches: 32,
        functions: 38,
        lines: 27,
        'src/sim/**': { statements: 95, branches: 92, functions: 95, lines: 97 },
        'src/meta/**': { statements: 82, branches: 87, functions: 70, lines: 90 },
        'src/i18n/**': { statements: 78, branches: 65, functions: 90, lines: 75 },
      },
    },
  },
});
