/** Minimum gap between two full-screen ads (§14). */
export const INTERSTITIAL_GAP_MS = 3 * 60_000;

/**
 * When an interstitial may show (§14): only between runs, never after the session's first run,
 * and at most once per `gapMs`. A rewarded ad also restarts the gap, so the player never sees two
 * ads back to back. Pure bookkeeping; the caller owns the clock.
 */
export class InterstitialPolicy {
  private runsEnded = 0;
  private inRun = false;
  private lastAd = -Infinity;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly gapMs = INTERSTITIAL_GAP_MS,
  ) {}

  runStarted(): void {
    this.inRun = true;
  }

  runEnded(): void {
    if (!this.inRun) return;
    this.inRun = false;
    this.runsEnded++;
  }

  /** Any ad was shown (interstitial or rewarded). */
  adShown(): void {
    this.lastAd = this.now();
  }

  canShow(): boolean {
    return !this.inRun && this.runsEnded >= 2 && this.now() - this.lastAd >= this.gapMs;
  }
}
