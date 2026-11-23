import { createOfflinePlatform } from './offline';
import { createPlaygamaPlatform, InitTimeout, wantsPlaygama } from './playgama';
import { createStubPlatform } from './stub';
import type { Platform } from './types';

export type { Platform, PlatformStorage, RewardedPlacement, TrackData } from './types';
export { Analytics } from './analytics';
export { Collector } from './collect';
export { clientFacts } from './clientinfo';
export { InterstitialPolicy, INTERSTITIAL_GAP_MS } from './interstitial';

let chosen: Promise<Platform> | null = null;

async function select(): Promise<Platform> {
  if (wantsPlaygama()) {
    try {
      return await createPlaygamaPlatform();
    } catch (e) {
      // Not the stub: on a real host its test ads would pay out for nothing and it would save to localStorage.
      console.warn('[platform] Playgama Bridge unavailable, playing offline', e);
      return createOfflinePlatform(String((e as Error)?.message ?? e), e instanceof InitTimeout ? e.late : undefined);
    }
  }
  const stub = createStubPlatform();
  await stub.init();
  return stub;
}

/**
 * The host platform, initialized. Playgama Bridge when the page runs inside Playgama (or with
 * `?platform=playgama`), offline.ts there when the SDK fails or is slow, the local stub otherwise.
 * Never rejects; memoized.
 */
export function getPlatform(): Promise<Platform> {
  chosen ??= select();
  return chosen;
}
