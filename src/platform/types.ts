/** Where a rewarded ad is offered (§14): double crystals at results, one revive per run, free shop chest. */
export type RewardedPlacement = 'double' | 'revive' | 'chest';

export type TrackData = Record<string, number | string | boolean>;

/** String key-value save slot. Platform cloud storage where there is one, localStorage otherwise. */
export interface PlatformStorage {
  get(key: string): Promise<string | null>;
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
  /** Resolves when the ad closed, failed or was skipped. Gate it with `InterstitialPolicy` first. */
  showInterstitial(): Promise<void>;
  track(event: string, data?: TrackData): void;
  storage: PlatformStorage;
  /** Lower-case language code, e.g. 'zh', 'en'. */
  language(): string;
  /**
   * Pause/mute requests from the host: true while an ad is open or the tab is hidden by the platform.
   * Returns an unsubscribe function.
   */
  onPause(cb: (paused: boolean) => void): () => void;
}
