import { browserLanguage, localStore } from './local-storage';
import type { Platform, TrackData } from './types';

export interface TrackRecord {
  event: string;
  data?: TrackData;
  /** ms since page load. */
  at: number;
}

declare global {
  interface Window {
    /** Every `track` call this session (stub platform only), for tests and the console. */
    __track?: TrackRecord[];
  }
}

const FAKE_AD_MS = 1200;

/** Full-screen "广告（测试）" card shown for the fake ad's duration. */
function fakeAd(label: string, ms: number): Promise<void> {
  const el = document.createElement('div');
  el.textContent = `广告（测试）· ${label}`;
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999', 'display:flex', 'align-items:center', 'justify-content:center',
    'background:rgba(20,20,30,.85)', 'color:#fff', 'font:600 22px/1.4 system-ui,sans-serif', 'letter-spacing:.05em',
  ].join(';');
  document.body.appendChild(el);
  return new Promise((resolve) => setTimeout(() => {
    el.remove();
    resolve();
  }, ms));
}

/**
 * Local dev host: ads are a short fake overlay (rewarded always pays out), analytics go to the console
 * and `window.__track`. `?ad=fail` makes every rewarded ad fail, to test the no-reward path.
 */
export function createStubPlatform(): Platform {
  const log: TrackRecord[] = [];
  const pauseListeners = new Set<(paused: boolean) => void>();
  const failAds = new URLSearchParams(location.search).get('ad') === 'fail';
  window.__track = log;
  let playing = false;

  const withAd = async (label: string) => {
    for (const cb of pauseListeners) cb(true);
    await fakeAd(label, FAKE_AD_MS);
    for (const cb of pauseListeners) cb(false);
  };

  return {
    id: 'stub',
    async init() {},
    gameReady() {
      console.info('[platform] game_ready');
    },
    gameplayStart() {
      if (playing) return;
      playing = true;
      console.info('[platform] gameplay_started');
    },
    gameplayStop() {
      if (!playing) return;
      playing = false;
      console.info('[platform] gameplay_stopped');
    },
    async showRewarded(placement) {
      await withAd(`奖励 ${placement}`);
      return !failAds;
    },
    async showInterstitial() {
      await withAd('插屏');
    },
    track(event, data) {
      log.push({ event, data, at: Math.round(performance.now()) });
      console.info('[track]', event, data ?? '');
    },
    storage: localStore(),
    language: browserLanguage,
    onPause(cb) {
      pauseListeners.add(cb);
      return () => pauseListeners.delete(cb);
    },
  };
}
