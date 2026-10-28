import { browserLanguage, localStore } from './local-storage';
import type { Platform, PlatformStorage, RewardedPlacement } from './types';

/**
 * Playgama Bridge v2, plain-JS CDN build (wiki.playgama.com/playgama/bridge-sdk/setup).
 * Written against 2.3.1 (CDN build of 2026-10-07). Playgama serves only the `v2/stable` channel and
 * the bundle lazy-loads its per-platform chunks from that same folder, so the major version is the pin;
 * `init` warns when the loaded build is not 2.x.
 */
export const BRIDGE_URL = 'https://bridge.playgama.com/v2/stable/playgama-bridge.js';
export const BRIDGE_MAJOR = 2;
const LOAD_TIMEOUT_MS = 10_000;
/** An ad that never reports back must not freeze the results screen. */
const AD_TIMEOUT_MS = 90_000;

type AdState = 'loading' | 'opened' | 'closed' | 'failed' | 'rewarded';

/** The slice of the Bridge v2 API this game uses. */
interface Bridge {
  version: string;
  initialize(options?: { configFilePath?: string }): Promise<void>;
  EVENT_NAME: {
    REWARDED_STATE_CHANGED: string;
    INTERSTITIAL_STATE_CHANGED: string;
    PAUSE_STATE_CHANGED: string;
  };
  platform: {
    id: string;
    language: string;
    sendMessage(message: string): Promise<void> | void;
    sendCustomMessage?(id: string, options?: unknown): Promise<void> | void;
    on(event: string, cb: (value: boolean) => void): void;
  };
  advertisement: {
    isRewardedSupported: boolean;
    isInterstitialSupported: boolean;
    showRewarded(placement?: string): void;
    showInterstitial(placement?: string): void;
    on(event: string, cb: (state: AdState) => void): void;
  };
  storage: {
    get(key: string, tryParseJson?: boolean): Promise<unknown>;
    set(key: string, value: string): Promise<void>;
  };
}

declare global {
  interface Window {
    bridge?: Bridge;
  }
}

/** True when the page is hosted by Playgama (they add `platform_id`), or forced with `?platform=playgama`. */
export function wantsPlaygama(loc: Pick<Location, 'search' | 'hostname'> = location, referrer = document.referrer): boolean {
  const q = new URLSearchParams(loc.search);
  const forced = q.get('platform');
  if (forced) return forced === 'playgama';
  if (q.has('platform_id')) return true;
  return loc.hostname.includes('playgama') || referrer.includes('playgama');
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

/** Bridge storage, falling back to localStorage when the platform refuses. Values stay raw strings. */
function bridgeStorage(b: Bridge): PlatformStorage {
  const local = localStore();
  return {
    async get(key) {
      try {
        const v = await b.storage.get(key, false);
        if (v !== null && v !== undefined) return String(v);
      } catch (e) {
        console.warn('[platform] bridge storage get failed, using localStorage', e);
      }
      return local.get(key);
    },
    async set(key, value) {
      await local.set(key, value);
      try {
        await b.storage.set(key, value);
      } catch (e) {
        console.warn('[platform] bridge storage set failed, kept in localStorage', e);
      }
    },
  };
}

/** Loads the Bridge script and initializes it. Throws on any failure; `getPlatform` falls back to the stub. */
export async function createPlaygamaPlatform(): Promise<Platform> {
  if (!window.bridge) await loadScript(BRIDGE_URL, LOAD_TIMEOUT_MS);
  const b = window.bridge;
  if (!b) throw new Error('Bridge script loaded but window.bridge is missing');
  // The config sits next to index.html (emitted by vite.config.ts); a missing file only logs.
  await b.initialize();
  if (!String(b.version).startsWith(`${BRIDGE_MAJOR}.`)) {
    console.warn(`[platform] Playgama Bridge ${b.version} loaded, written for ${BRIDGE_MAJOR}.x`);
  }

  const pauseListeners = new Set<(paused: boolean) => void>();
  const emitPause = (paused: boolean) => {
    for (const cb of pauseListeners) cb(paused);
  };
  b.platform.on(b.EVENT_NAME.PAUSE_STATE_CHANGED, (paused) => emitPause(paused === true));

  // One permanent listener per ad kind; the open request (if any) settles on closed/failed.
  let rewardedDone: ((ok: boolean) => void) | null = null;
  let rewarded = false;
  b.advertisement.on(b.EVENT_NAME.REWARDED_STATE_CHANGED, (state) => {
    if (state === 'opened') emitPause(true);
    else if (state === 'rewarded') rewarded = true;
    else if (state === 'closed' || state === 'failed') {
      emitPause(false);
      rewardedDone?.(rewarded);
    }
  });
  let interstitialDone: (() => void) | null = null;
  b.advertisement.on(b.EVENT_NAME.INTERSTITIAL_STATE_CHANGED, (state) => {
    if (state === 'opened') emitPause(true);
    else if (state === 'closed' || state === 'failed') {
      emitPause(false);
      interstitialDone?.();
    }
  });

  let playing = false;
  const send = (message: string) => {
    try {
      void Promise.resolve(b.platform.sendMessage(message)).catch((e) => console.warn(`[platform] ${message}`, e));
    } catch (e) {
      console.warn(`[platform] ${message}`, e);
    }
  };

  return {
    id: 'playgama',
    async init() {},
    gameReady: () => send('game_ready'),
    gameplayStart() {
      if (playing) return;
      playing = true;
      send('gameplay_started');
    },
    gameplayStop() {
      if (!playing) return;
      playing = false;
      send('gameplay_stopped');
    },
    showRewarded(placement: RewardedPlacement) {
      if (!b.advertisement.isRewardedSupported || rewardedDone) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        rewarded = false;
        const timer = setTimeout(() => finish(false), AD_TIMEOUT_MS);
        const finish = (ok: boolean) => {
          clearTimeout(timer);
          rewardedDone = null;
          resolve(ok);
        };
        rewardedDone = finish;
        try {
          b.advertisement.showRewarded(placement);
        } catch (e) {
          console.warn('[platform] showRewarded', e);
          finish(false);
        }
      });
    },
    showInterstitial() {
      if (!b.advertisement.isInterstitialSupported || interstitialDone) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => finish(), AD_TIMEOUT_MS);
        const finish = () => {
          clearTimeout(timer);
          interstitialDone = null;
          resolve();
        };
        interstitialDone = finish;
        try {
          b.advertisement.showInterstitial();
        } catch (e) {
          console.warn('[platform] showInterstitial', e);
          finish();
        }
      });
    },
    track(event, data) {
      // Bridge analytics records custom messages under their id (wiki: platform → custom messages).
      try {
        void Promise.resolve(b.platform.sendCustomMessage?.(event, data)).catch(() => {});
      } catch {
        // Analytics must never break the game.
      }
      if (import.meta.env.DEV) console.info('[track]', event, data ?? '');
    },
    storage: bridgeStorage(b),
    language: () => (b.platform.language || browserLanguage()).slice(0, 2).toLowerCase(),
    onPause(cb) {
      pauseListeners.add(cb);
      return () => pauseListeners.delete(cb);
    },
  };
}
