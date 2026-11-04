// Entry point: the platform first, then the game. On Playgama the Bridge must finish `initialize()`
// before the game loads (Bridge required step 2), so the stage, three.js and the HUD come in a
// separate chunk once `getPlatform()` has settled (it never rejects; the stub stands in on failure).

import { getPlatform } from './platform';

void getPlatform().then(() => import('./main'));
