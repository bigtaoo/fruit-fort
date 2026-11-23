import type { Collector } from './collect';
import type { Platform, TrackData } from './types';

export const HEARTBEAT_MS = 30_000;

/**
 * Session analytics on top of `platform.track` (event list: docs/platform.md):
 * `once` for per-session firsts, and a `session_time` heartbeat every 30 s of visible time.
 */
export class Analytics {
  private readonly sent = new Set<string>();
  private seconds = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /**
   * `collector` is our own endpoint (docs/telemetry/self-hosted.md), when one is configured: every event
   * goes to both, the host's copy unchanged so the sandbox readings stay comparable with the old ones.
   */
  constructor(
    private readonly platform: Platform,
    readonly collector?: Collector,
  ) {}

  track(event: string, data?: TrackData): void {
    this.platform.track(event, data);
    this.collector?.add(event, data);
  }

  /** Straight to our own collector: facts Playgama's backend already had, which would only be noise there. */
  own(event: string, data?: TrackData): void {
    this.collector?.add(event, data);
  }

  /** Tracks `event` only the first time this session (first_buy, first_reverse). */
  once(event: string, data?: TrackData): void {
    if (this.sent.has(event)) return;
    this.sent.add(event);
    this.track(event, data);
  }

  /**
   * Starts the heartbeat: `session_time {s}` every 30 s while the tab is visible, plus whatever `extra`
   * gives at that moment (main.ts: the picture level `q` and average `fps`, so the real devices show). Idempotent.
   */
  startHeartbeat(extra?: () => TrackData): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      this.seconds += HEARTBEAT_MS / 1000;
      this.platform.track('session_time', { s: this.seconds, ...extra?.() });
    }, HEARTBEAT_MS);
  }

  stopHeartbeat(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
