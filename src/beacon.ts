// Our own telemetry wire (docs/telemetry/self-hosted.md). Playgama's backend fills in the envelope for us —
// session, player, timestamp, device, version — and CrazyGames collects no custom events at all (its SDK's
// analytics module is `trackOrder` only), so a self-hosted collector has to carry all of that itself.
//
// This file is the part the boot entry can use: a session id and one POST. It must stay tiny and must never
// throw — `boot_left` is sent by a page that is already going away, before the game chunk has run, and it is
// the only word we get from the players who leave during loading. The batching queue is Collector
// (platform/collect.ts), which shares this session id.

/** The wire batch. The envelope is per batch, not per event: ~200 events a session, so it adds up. */
export interface Batch {
  /** This page view. Everything from one session carries it; it is what per-player traces are joined on. */
  sid: string;
  /** Build version (`__APP_VERSION__`): on Playgama the Bridge tagged every event with it, here we do. */
  v: string;
  /** The player, once the save has been read (beacon.ts sends before that; join by `sid`). */
  uid?: string;
  /** Batch number within the session, so the server can see a dropped one. */
  n: number;
  /** `Date.now()` at send. Each event carries its own too: a batch may sit in the queue. */
  t: number;
  evs: WireEvent[];
}

export interface WireEvent {
  /** Event name, as in docs/platform.md. */
  e: string;
  /** Order within the session: a batch can arrive late or out of order. */
  i: number;
  /** Seconds since the page started (`performance.now()`), one decimal, as `s` everywhere else. */
  s: number;
  t: number;
  d?: Record<string, number | string | boolean>;
}

/** 11 random chars: enough that two sessions never collide, short enough to repeat in every batch. */
function randomId(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 7);
}

/** This page view's id, made before anything else so even a boot failure is attributable. */
export const SID = randomId();

/** A fresh id for a player who has none yet (saved as `uid`, so it survives as long as the save does). */
export const newPlayerId = randomId;

function configured(): string {
  const url = (import.meta.env.VITE_TELEMETRY as string | undefined) ?? '';
  if (!import.meta.env.DEV) return url;
  // Dev only: point a local build at a collector under test. Never honoured in a build, where the URL
  // would be whatever the host page put in our address bar.
  try {
    const asked = new URLSearchParams(location.search).get('telemetry');
    if (asked === 'off') return '';
    if (asked) return asked;
  } catch {
    // No location (tests): fall through to the configured URL.
  }
  return url;
}

let url: string | null = null;

/** The collector endpoint, or '' when none is configured — then nothing is sent and the game is unchanged. */
export function telemetryUrl(): string {
  if (url === null) url = configured();
  return url;
}

/** Test seam: forget the cached URL (and set one). */
export function setTelemetryUrl(next: string | null): void {
  url = next;
}

let batches = 0;

/**
 * Send one batch, as beacon when the page is going away (it is the only thing that survives `pagehide`) and
 * as a keepalive fetch otherwise. Returns false when nothing was handed to the browser, so the caller can
 * keep the events and try again. Never throws.
 */
export function post(evs: WireEvent[], extra: { uid?: string } = {}, leaving = false): boolean {
  const to = telemetryUrl();
  if (!to || !evs.length) return false;
  const batch: Batch = { sid: SID, v: __APP_VERSION__, n: batches++, t: Date.now(), evs, ...extra };
  const body = JSON.stringify(batch);
  try {
    // sendBeacon is capped (64 KB in Chrome) and refuses when the queue is full; fetch then still has a
    // chance while the page lives.
    if (leaving && navigator.sendBeacon?.(to, new Blob([body], { type: 'application/json' }))) return true;
    void fetch(to, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' }, mode: 'cors', credentials: 'omit' }).catch(() => {});
    return true;
  } catch {
    batches--;
    return false;
  }
}

/** One event, straight out: for the boot entry, which has no queue and sends three events at most. */
export function postOne(e: string, d?: Record<string, number | string | boolean>, leaving = false): void {
  post([{ e, i: -1, s: Math.round(performance.now()) / 1000, t: Date.now(), d }], {}, leaving);
}
