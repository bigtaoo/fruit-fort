import type { Platform, PlatformStorage, RewardedPlacement } from './types';

/**
 * Playgama Bridge v2, plain-JS CDN build (wiki.playgama.com/playgama/bridge-sdk/setup).
 * Written against 2.3.1 (CDN build of 2026-10-07). Playgama serves only the `v2/stable` channel and
 * the bundle lazy-loads its per-platform chunks from that same folder, so the major version is the pin;
 * `init` warns when the loaded build is not 2.x. The release build puts the script tag first in
 * `<head>` (vite.config.ts) and src/boot.ts waits for `initialize()` before loading the game; the
 * dev server has no tag, so `?platform=playgama` there loads it here instead.
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
  /** Bridge 2.1+: reported as `game_version` with every analytics event; set before `initialize`. */
  gameVersion?: string;
  initialize(options?: { configFilePath?: string }): Promise<void>;
  EVENT_NAME: {
    REWARDED_STATE_CHANGED: string;
    INTERSTITIAL_STATE_CHANGED: string;
    PAUSE_STATE_CHANGED: string;
    AUDIO_STATE_CHANGED: string;
  };
  platform: {
    id: string;
    language: string;
    isAudioEnabled: boolean;
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
  /** Bridge 2.3+: the game's own events in Playgama analytics, with flat data. */
  analytics?: {
    send(name: string, data?: Record<string, string | number | boolean>): void;
  };
  storage: {
    get(keys: string | string[], tryParseJson?: boolean): Promise<unknown>;
    set(keys: string | string[], values: string | string[]): Promise<void>;
  };
}

declare global {
  interface Window {
    bridge?: Bridge;
  }
}

/**
 * True when the page is hosted by Playgama (they add `platform_id`), when the Bridge script is already
 * on the page (the release build), or when forced with `?platform=playgama`; `?platform=stub` forces the stub.
 */
export function wantsPlaygama(loc: Pick<Location, 'search' | 'hostname'> = location, referrer = document.referrer, loaded = typeof window !== 'undefined' && !!window.bridge): boolean {
  const q = new URLSearchParams(loc.search);
  const forced = q.get('platform');
  if (forced) return forced === 'playgama';
  if (loaded || q.has('platform_id')) return true;
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

const asString = (v: unknown): string | null =>
  v === null || v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v);

/**
 * Bridge storage only (it picks cloud or local per platform; the game never writes localStorage
 * here). `preload` reads every start-up key in one `get([...])`; a failed read or write only logs,
 * and the value stays in memory for this page load.
 */
export function bridgeStorage(b: Pick<Bridge, 'storage'>): PlatformStorage {
  const cache = new Map<string, string | null>();
  return {
    async preload(keys) {
      try {
        const got = await b.storage.get(keys, false);
        const values = Array.isArray(got) ? got : [got];
        keys.forEach((k, i) => cache.set(k, asString(values[i])));
      } catch (e) {
        console.warn('[platform] bridge storage get failed', e);
      }
    },
    async get(key) {
      if (cache.has(key)) return cache.get(key) ?? null;
      try {
        const v = asString(await b.storage.get(key, false));
        cache.set(key, v);
        return v;
      } catch (e) {
        console.warn('[platform] bridge storage get failed', e);
        return null;
      }
    },
    async set(key, value) {
      cache.set(key, value);
      try {
        await b.storage.set(key, value);
      } catch (e) {
        console.warn('[platform] bridge storage set failed', e);
      }
    },
  };
}

/** Loads the Bridge script and initializes it. Throws on any failure; `getPlatform` falls back to the stub. */
export async function createPlaygamaPlatform(): Promise<Platform> {
  if (!window.bridge) await loadScript(BRIDGE_URL, LOAD_TIMEOUT_MS);
  const b = window.bridge;
  if (!b) throw new Error('Bridge script loaded but window.bridge is missing');
  // Tags every analytics event (Bridge's own and ours) with this build's version.
  b.gameVersion = __APP_VERSION__;
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
  const audioListeners = new Set<(enabled: boolean) => void>();
  b.platform.on(b.EVENT_NAME.AUDIO_STATE_CHANGED, (enabled) => {
    for (const cb of audioListeners) cb(enabled !== false);
  });

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
    rewardedSupported: () => b.advertisement.isRewardedSupported,
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
          b.advertisement.showInterstitial('run_end');
        } catch (e) {
          console.warn('[platform] showInterstitial', e);
          finish();
        }
      });
    },
    track(event, data) {
      // Bridge 2.3+ records the game's own events with their data (wiki: api/analytics); custom platform
      // messages only show as one fieldless `platform_custom_message`, so they are the fallback.
      try {
        if (b.analytics?.send) b.analytics.send(event, data);
        else void Promise.resolve(b.platform.sendCustomMessage?.(event, data)).catch(() => {});
      } catch {
        // Analytics must never break the game.
      }
      if (import.meta.env.DEV) console.info('[track]', event, data ?? '');
    },
    storage: bridgeStorage(b),
    // Bridge already falls back to the browser's language when the platform gives none.
    language: () => (b.platform.language || 'en').slice(0, 2).toLowerCase(),
    audioEnabled: () => b.platform.isAudioEnabled !== false,
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
