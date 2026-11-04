// Entry point: the platform first, then the game. On Playgama the Bridge must finish `initialize()`
// before the game loads (Bridge required step 2), so the stage, three.js and the HUD come in a
// separate chunk once `getPlatform()` has settled (it never rejects; the stub stands in on failure).
// Meanwhile the loading screen (loading.ts) shows real progress: the game chunk and the model files
// are downloaded here, counted byte by byte, and the import then takes the chunk from the browser cache.

import { getPlatform } from './platform';
import { BOOT_SIZES, downloadAll, setProgress, watchContextLoss, type Download } from './loading';
import { GLB_URLS, keepGlb } from './view/glb';

/** Share of the bar for the SDK starting up, and where the downloads end (the rest is building the scene). */
const SDK = 0.08;
const FETCHED = 0.9;

const canvas = document.getElementById('game');
if (canvas instanceof HTMLCanvasElement) watchContextLoss(canvas);
// The SDK gives no progress of its own: creep towards its share so the bar isn't standing still.
const creep = setInterval(() => setProgress(Math.min(SDK, (performance.now() / 1000) * 0.02 + 0.01)), 100);

void getPlatform().then(async () => {
  clearInterval(creep);
  setProgress(SDK);
  const files: Download[] = Object.entries(GLB_URLS).map(([path, url]) => ({ url, keep: (buf) => buf && keepGlb(path, buf) }));
  if (BOOT_SIZES.game) files.push({ url: new URL(BOOT_SIZES.game, import.meta.url).href });
  await downloadAll(files, SDK, FETCHED);
  await import('./main');
});
