// The queue in front of our own collector (docs/telemetry/self-hosted.md). Events keep going to the host's
// analytics unchanged — the sandbox readings have to stay comparable — and a copy goes here with the
// envelope Playgama's backend used to add for us: session, player, order, timestamp, version.
//
// Why a queue at all: one POST per event is ~200 requests a session, and the last of them is sent by a page
// that is already closing. 2026-11-20 about a fifth of the sessions that had played lost their final batch
// on Playgama, `quit_*` with it. So: batch, flush on a timer, and hand the rest to sendBeacon on pagehide.

import { post, type WireEvent } from '../beacon';
import type { TrackData } from './types';

/** Send when this many are waiting: a batch is cheap, a lost batch is not. */
export const MAX_BATCH = 24;
/** …or when the oldest has waited this long. */
export const FLUSH_MS = 5_000;
/**
 * Hard cap while the collector is unreachable. Dropping the newest keeps the opening — the loading steps,
 * the funnel, the first run — which is the part no later event can tell us about.
 */
export const MAX_QUEUE = 400;

/**
 * Batches the game's events for our own endpoint. One per session; `Analytics` feeds it, and it feeds
 * `post()`. Owns its queue, its timer and its page listeners, and never throws into the caller.
 */
export class Collector {
  private readonly queue: WireEvent[] = [];
  private seq = 0;
  private dropped = 0;
  private uid?: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onHide = () => {
    if (document.visibilityState === 'hidden') this.flush(true);
  };
  private readonly onLeave = () => this.flush(true);

  constructor() {
    // Both: `pagehide` is the one iOS fires on a real close, `visibilitychange` catches a tab switch, and
    // a switch that never comes back is how most sessions end.
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onLeave);
  }

  /** The player id and first-seen day, once the save has been read. Earlier batches join by session id. */
  identify(uid: string): void {
    this.uid = uid;
  }

  /** Queue one event. `s` is the page clock, the same one `s` means everywhere in docs/platform.md. */
  add(event: string, data?: TrackData): void {
    if (this.queue.length >= MAX_QUEUE) {
      this.dropped++;
      return;
    }
    this.queue.push({ e: event, i: this.seq++, s: Math.round(performance.now()) / 1000, t: Date.now(), ...(data ? { d: { ...data } } : {}) });
    if (this.queue.length >= MAX_BATCH) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  /**
   * Hand everything waiting to the browser. `leaving` is the page going away: sendBeacon then, which is all
   * that survives it. A send the browser refused leaves the events queued for the next try.
   */
  flush(leaving = false): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.queue.length) return;
    if (this.dropped) {
      // Say so rather than quietly serve a short trace: a gap the reader cannot see is worse than a hole.
      this.queue.push({ e: 'telemetry_dropped', i: this.seq++, s: Math.round(performance.now()) / 1000, t: Date.now(), d: { n: this.dropped } });
      this.dropped = 0;
    }
    const sending = this.queue.splice(0, this.queue.length);
    if (!post(sending, this.uid ? { uid: this.uid } : {}, leaving)) {
      // Keep them, oldest first, and let the cap drop the newest next time round.
      this.queue.unshift(...sending.slice(0, MAX_QUEUE));
    }
  }

  /** Drop the page listeners and the timer (tests, and a page that is rebuilding the game). */
  stop(): void {
    this.flush(true);
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onLeave);
  }

  /** How many are waiting (tests, and the dev console). */
  get waiting(): number {
    return this.queue.length;
  }
}
