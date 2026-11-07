import { browserLanguage } from './local-storage';
import type { Platform, PlatformStorage } from './types';

/**
 * Stands in on a Playgama page whose Bridge failed or was slow to initialize (playgama.ts INIT_TIMEOUT_MS), so the
 * player gets the game instead of a loading screen: no ads (the buttons hide), progress kept in memory only (Bridge
 * required step 4: never localStorage on the platform), the browser's language. Events go to `window.bridge`, which
 * queues them until its initialize. The stub (stub.ts) is for local play only: its test ads always pay and it saves
 * to localStorage.
 *
 * `late` is the initialize call that was given up on: when it settles after all, the platform still hears that
 * the game is ready (it hides its own loading screen on game_ready) and whether a run is on, and the game follows
 * the host's pause and mute from then on. Ads and the save stay off for the page (a save read now would land
 * on progress already made in memory).
 */
export function createOfflinePlatform(why: string, late?: Promise<unknown>): Platform {
  const memory = new Map<string, string>();
  const storage: PlatformStorage = {
    async preload() {},
    async get(key) {
      return memory.get(key) ?? null;
    },
    async set(key, value) {
      memory.set(key, value);
    },
  };

  let up = false;
  let ready = false;
  let playing = false;
  const send = (message: string) => {
    if (!up) return;
    try {
      void Promise.resolve(window.bridge?.platform.sendMessage(message)).catch(() => {});
    } catch {
      // The host must never break the game.
    }
  };
  // The host's pause and mute are its own and come once Bridge is up (a pause is how it mutes a game it hides).
  const pauseListeners = new Set<(paused: boolean) => void>();
  const audioListeners = new Set<(enabled: boolean) => void>();
  let audio = true;
  void late?.then(
    () => {
      up = true;
      if (ready) send('game_ready');
      if (playing) send('gameplay_started');
      try {
        const b = window.bridge;
        if (!b) return;
        b.platform.on(b.EVENT_NAME.PAUSE_STATE_CHANGED, (paused) => {
          for (const cb of pauseListeners) cb(paused === true);
        });
        b.platform.on(b.EVENT_NAME.AUDIO_STATE_CHANGED, (enabled) => {
          audio = enabled !== false;
          for (const cb of audioListeners) cb(audio);
        });
        if (b.platform.isAudioEnabled === false) {
          audio = false;
          for (const cb of audioListeners) cb(false);
        }
      } catch {
        // The host must never break the game.
      }
    },
    () => {},
  );

  const platform: Platform = {
    id: 'offline',
    async init() {},
    gameReady() {
      ready = true;
      send('game_ready');
    },
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
    showRewarded: () => Promise.resolve(false),
    rewardedSupported: () => false,
    showInterstitial: () => Promise.resolve(),
    track(event, data) {
      try {
        window.bridge?.analytics?.send?.(event, data);
      } catch {
        // Analytics must never break the game.
      }
      if (import.meta.env.DEV) console.info('[track]', event, data ?? '');
    },
    storage,
    language: browserLanguage,
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
  platform.track('platform_offline', { why: why.slice(0, 80) });
  return platform;
}
