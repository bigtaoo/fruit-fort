import { browserLanguage } from './local-storage';
import type { Platform, PlatformStorage, RewardedPlacement } from './types';

/**
 * CrazyGames HTML5 SDK v3 (docs.crazygames.com/sdk/intro). Written against the v3 bundle of 2026-11-23.
 * Three things differ from Playgama in ways the game can feel:
 *
 * - **No custom analytics.** v3 has no `analytics.send`: `trackOrder` is for purchases and that is all.
 *   Everything we read is therefore read from our own collector (docs/telemetry/self-hosted.md), which is why
 *   that had to exist before this file. `track` here only logs in dev; the Collector sends the same event.
 * - **Ads take callbacks, not promises** (`requestAd(type, {adStarted, adFinished, adError})`), and an ad that
 *   is refused — adblock, no fill, the ~3 minute midgame cooldown — arrives as `adError`, not as a throw.
 * - **The save is synchronous** (`data.getItem`), because the SDK preloads it during `init()`.
 *
 * The SDK is a site-locked script: off a CrazyGames domain `environment` is `'disabled'` and every call throws,
 * so this adapter is only chosen on their pages (or with `?platform=crazygames` / `?useLocalSdk=true`).
 */
export const CG_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const LOAD_TIMEOUT_MS = 10_000;
/** Same reasoning as Playgama's INIT_TIMEOUT_MS: a player left on the loading screen leaves. */
export const INIT_TIMEOUT_MS = 10_000;
/** An ad that never calls back must not freeze the results screen. */
const AD_TIMEOUT_MS = 90_000;

type AdType = 'midgame' | 'rewarded';
interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

/** The slice of the v3 API this game uses. */
export interface CrazyGamesSdk {
  environment?: 'local' | 'crazygames' | 'disabled';
  init(): Promise<void>;
  game: {
    settings?: { muteAudio?: boolean; disableChat?: boolean };
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    addSettingsChangeListener?(cb: () => void): void;
  };
  ad: {
    requestAd(type: AdType, callbacks?: AdCallbacks): void;
    hasAdblock?(): Promise<boolean>;
  };
  user?: {
    systemInfo?: { locale?: string; countryCode?: string };
  };
  data?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazyGamesSdk };
  }
}

/**
 * True on a CrazyGames page, in a build made for them (`VITE_HOST=crazygames`, which is also what puts the SDK
 * script in index.html), when the SDK is already on the page, or when forced with `?platform=crazygames`.
 * `?useLocalSdk=true` is the SDK's own switch for running their local mode off their domain, so it counts too.
 */
export function wantsCrazyGames(
  loc: Pick<Location, 'search' | 'hostname'> = location,
  loaded = typeof window !== 'undefined' && !!window.CrazyGames,
  host: string | undefined = import.meta.env.VITE_HOST,
): boolean {
  const q = new URLSearchParams(loc.search);
  const forced = q.get('platform');
  if (forced) return forced === 'crazygames';
  if (loaded || q.get('useLocalSdk') === 'true') return true;
  return host === 'crazygames' || loc.hostname.includes('crazygames');
}

function loadScript(src: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const timer = setTimeout(() => reject(new Error(`timeout loading ${src}`)), timeoutMs);
    s.src = src;
    s.async = true;
    s.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`failed to load ${src}`));
    };
    document.head.appendChild(s);
  });
}

/**
 * The SDK's save (`data`), read through memory. It is synchronous — the SDK preloaded it during `init()` —
 * but the interface is async for Bridge's sake, and a throw must not take the game down: the data module can be
 * switched off for a game ('Progress Save' at submission) and then every call throws `dataModuleDisabled`.
 * A write that throws still stands for this page load, so a player keeps their progress until they leave.
 */
export function cgStorage(sdk: Pick<CrazyGamesSdk, 'data'>): PlatformStorage {
  const memory = new Map<string, string>();
  return {
    async preload() {},
    async get(key) {
      if (memory.has(key)) return memory.get(key) ?? null;
      try {
        return sdk.data?.getItem(key) ?? null;
      } catch (e) {
        console.warn('[platform] CrazyGames data.getItem failed', e);
        return null;
      }
    },
    async set(key, value) {
      memory.set(key, value);
      try {
        sdk.data?.setItem(key, value);
      } catch (e) {
        console.warn('[platform] CrazyGames data.setItem failed', e);
      }
    },
  };
}

/**
 * One ad, as a promise. Resolves true only when the player watched to the end (`adFinished`); adblock, no fill
 * and the midgame cooldown all come back through `adError`, which is a normal answer here, not a failure to log
 * loudly. `onOpen`/`onClose` carry the host pause: the docs ask the game to mute and pause for the ad's duration.
 */
function showAd(sdk: CrazyGamesSdk, type: AdType, onOpen: () => void, onClose: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    let open = false;
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (open) onClose();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), AD_TIMEOUT_MS);
    try {
      sdk.ad.requestAd(type, {
        adStarted: () => {
          open = true;
          onOpen();
        },
        adFinished: () => finish(true),
        adError: (error) => {
          if (import.meta.env.DEV) console.info('[platform] ad not shown', error);
          finish(false);
        },
      });
    } catch (e) {
      console.warn('[platform] requestAd', e);
      finish(false);
    }
  });
}

/** Loads the SDK and initializes it. Throws on any failure; `getPlatform` then falls back to offline.ts. */
export async function createCrazyGamesPlatform(): Promise<Platform> {
  if (!window.CrazyGames?.SDK) await loadScript(CG_SDK_URL, LOAD_TIMEOUT_MS);
  const sdk = window.CrazyGames?.SDK;
  if (!sdk) throw new Error('CrazyGames SDK loaded but window.CrazyGames.SDK is missing');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sdk.init(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`CrazyGames init took over ${INIT_TIMEOUT_MS} ms`)), INIT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  // Off their domain every call throws (site lock). Better to find out here, where offline.ts can stand in,
  // than one call at a time inside the game.
  if (sdk.environment === 'disabled') throw new Error('CrazyGames SDK is disabled on this domain');

  // The loading screen is ours; this only tells them it is up, so their own overlay waits for `loadingStop`.
  try {
    sdk.game.loadingStart();
  } catch (e) {
    console.warn('[platform] loadingStart', e);
  }

  // An ad button that can only fail is worse than no button: with an adblocker every request answers `adblock`.
  // The game must still play — their rule and ours — so this only hides the offer.
  let ads = true;
  try {
    ads = !(await sdk.ad.hasAdblock?.());
  } catch {
    // Not answering is not an adblocker; leave the offer up.
  }

  const pauseListeners = new Set<(paused: boolean) => void>();
  const emitPause = (paused: boolean) => {
    for (const cb of pauseListeners) cb(paused);
  };
  const audioListeners = new Set<(enabled: boolean) => void>();
  // Their mute is the player's choice on the site and takes priority over ours (docs: Full Implementation).
  const muted = () => sdk.game.settings?.muteAudio === true;
  let audio = !muted();
  try {
    sdk.game.addSettingsChangeListener?.(() => {
      const now = !muted();
      if (now === audio) return;
      audio = now;
      for (const cb of audioListeners) cb(now);
    });
  } catch (e) {
    console.warn('[platform] addSettingsChangeListener', e);
  }

  let playing = false;
  let busy = false;
  const call = (what: 'loadingStop' | 'gameplayStart' | 'gameplayStop') => {
    try {
      sdk.game[what]();
    } catch (e) {
      console.warn(`[platform] ${what}`, e);
    }
  };

  return {
    id: 'crazygames',
    async init() {},
    gameReady: () => call('loadingStop'),
    gameplayStart() {
      if (playing) return;
      playing = true;
      call('gameplayStart');
    },
    gameplayStop() {
      if (!playing) return;
      playing = false;
      call('gameplayStop');
    },
    async showRewarded(_placement: RewardedPlacement) {
      // The SDK takes no placement name, and one ad at a time: a second request while one is open is refused.
      if (!ads || busy) return false;
      busy = true;
      const ok = await showAd(sdk, 'rewarded', () => emitPause(true), () => emitPause(false));
      busy = false;
      return ok;
    },
    rewardedSupported: () => ads,
    async showInterstitial() {
      if (!ads || busy) return;
      busy = true;
      // The SDK paces these itself (~3 minutes between midgame ads, counting rewarded ones), and answers
      // `adCooldown` when it is too soon, so the game keeps no timer of its own here either.
      await showAd(sdk, 'midgame', () => emitPause(true), () => emitPause(false));
      busy = false;
    },
    track(event, data) {
      // v3 has no custom analytics: the only copy of this event is the one Collector sends to our own endpoint
      // (src/platform/collect.ts). Nothing to do here but say so in dev.
      if (import.meta.env.DEV) console.info('[track]', event, data ?? '');
    },
    storage: cgStorage(sdk),
    // Their `locale` ('en-US') is the player's setting on the site; the browser's is the fallback.
    language: () => (sdk.user?.systemInfo?.locale ?? '').slice(0, 2).toLowerCase() || browserLanguage(),
    audioEnabled: () => audio,
    onAudio(cb) {
      audioListeners.add(cb);
      return () => audioListeners.delete(cb);
    },
    onPause(cb) {
      pauseListeners.add(cb);
      return () => pauseListeners.delete(cb);
    },
  };
}
