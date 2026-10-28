import { createPlaygamaPlatform, wantsPlaygama } from './playgama';
import { createStubPlatform } from './stub';
import type { Platform } from './types';

export type { Platform, PlatformStorage, RewardedPlacement, TrackData } from './types';
export { Analytics } from './analytics';
export { InterstitialPolicy, INTERSTITIAL_GAP_MS } from './interstitial';

let chosen: Promise<Platform> | null = null;

async function select(): Promise<Platform> {
  if (wantsPlaygama()) {
    try {
      return await createPlaygamaPlatform();
    } catch (e) {
      console.warn('[platform] Playgama Bridge unavailable, using the local stub', e);
    }
  }
  const stub = createStubPlatform();
  await stub.init();
  return stub;
}

/**
 * The host platform, initialized. Playgama Bridge when the page runs inside Playgama (or with
 * `?platform=playgama`), the local stub otherwise or when the SDK fails. Never rejects; memoized.
 */
export function getPlatform(): Promise<Platform> {
  chosen ??= select();
  return chosen;
}
