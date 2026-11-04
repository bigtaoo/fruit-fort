import { browserLanguage, localStore } from './local-storage';
import { InterstitialPolicy } from './interstitial';
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

/** Full-screen "Ad (test)" card shown for the fake ad's duration. */
function fakeAd(label: string, ms: number): Promise<void> {
  const el = document.createElement('div');
  el.textContent = `Ad (test) · ${label}`;
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
 * and `window.__track`. `?ad=fail` makes every rewarded ad fail, to test the no-reward path;
 * `?ad=none` reports rewarded ads as unsupported, so the ad buttons hide. Interstitials are paced
 * here by `InterstitialPolicy`, standing in for Bridge's own pacing on Playgama.
 */
export function createStubPlatform(): Platform {
  const log: TrackRecord[] = [];
  const pauseListeners = new Set<(paused: boolean) => void>();
  const adParam = new URLSearchParams(location.search).get('ad');
  const failAds = adParam === 'fail';
  const pacing = new InterstitialPolicy();
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
      if (adParam === 'none') return false;
      await withAd(`rewarded ${placement}`);
      pacing.adShown();
      return !failAds;
    },
    rewardedSupported: () => adParam !== 'none',
    async showInterstitial() {
      // Every call is a natural pause after a run: count it as one, then pace like a portal would.
      pacing.runStarted();
      pacing.runEnded();
      if (!pacing.canShow()) return;
      await withAd('interstitial');
      pacing.adShown();
    },
    track(event, data) {
      log.push({ event, data, at: Math.round(performance.now()) });
      console.info('[track]', event, data ?? '');
    },
    storage: localStore(),
    language: browserLanguage,
    audioEnabled: () => true,
    onAudio: () => () => {},
    onPause(cb) {
      pauseListeners.add(cb);
      return () => pauseListeners.delete(cb);
    },
  };
}
