/** Where a rewarded ad is offered (§14): double crystals at results, one revive per run, free shop chest. */
export type RewardedPlacement = 'double' | 'revive' | 'chest';

export type TrackData = Record<string, number | string | boolean>;

/**
 * String key-value save slot: Bridge storage on Playgama (it picks cloud or local itself; the game never
 * touches localStorage there), namespaced localStorage in the stub.
 */
export interface PlatformStorage {
  /** One batched read of every key the game needs at start; later `get`s of these keys come from it. */
  preload(keys: string[]): Promise<void>;
  get(key: string): Promise<string | null>;
  /** Call on a meaningful change only (a run booked, a purchase, a setting), never per frame. */
  set(key: string, value: string): Promise<void>;
}

/**
 * Everything the game needs from the host page. One adapter per host; `getPlatform()` picks one.
 * Ad calls never reject: a failed or unsupported ad resolves as "no reward" / "nothing shown".
 */
export interface Platform {
  /** 'playgama' or 'stub'. */
  readonly id: string;
  /** Idempotent. `getPlatform()` already awaited it. */
  init(): Promise<void>;
  /** Loading finished, first frame is up (call once). */
  gameReady(): void;
  /** A run is in progress / not in progress. Repeated calls in the same state are ignored. */
  gameplayStart(): void;
  gameplayStop(): void;
  /** True only when the player watched to the reward. */
  showRewarded(placement: RewardedPlacement): Promise<boolean>;
  /** Whether a rewarded ad can be offered at all; hide the ad buttons when not. */
  rewardedSupported(): boolean;
  /**
   * Call at every natural pause (a result card left). The platform paces them itself (Bridge's
   * minimumDelayBetweenInterstitial; the stub's InterstitialPolicy), so the game keeps no timers.
   * Resolves when the ad closed, failed or was skipped.
   */
  showInterstitial(): Promise<void>;
  track(event: string, data?: TrackData): void;
  storage: PlatformStorage;
  /** Lower-case language code, e.g. 'zh', 'en': the platform's on Playgama, the browser's in the stub. */
  language(): string;
  /** The host allows sound now (Bridge `platform.isAudioEnabled`; always true in the stub). */
  audioEnabled(): boolean;
  /** Later changes of `audioEnabled`. Returns an unsubscribe function. */
  onAudio(cb: (enabled: boolean) => void): () => void;
  /**
   * Pause/mute requests from the host: true while an ad is open or the tab is hidden by the platform.
   * Returns an unsubscribe function.
   */
  onPause(cb: (paused: boolean) => void): () => void;
}
