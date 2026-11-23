import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTelemetryUrl } from '../beacon';
import { Collector, FLUSH_MS, MAX_BATCH, MAX_QUEUE } from './collect';

interface Sent {
  url: string;
  body: string;
  beacon: boolean;
}

const sent: Sent[] = [];
let beaconOk = true;
let fetchOk = true;
const listeners: Record<string, () => void> = {};

function parse(i: number): { sid: string; uid?: string; n: number; evs: { e: string; i: number; d?: Record<string, number | string | boolean> }[] } {
  return JSON.parse(sent[i].body);
}

beforeEach(() => {
  sent.length = 0;
  beaconOk = true;
  fetchOk = true;
  setTelemetryUrl('https://t.example/e');
  vi.useFakeTimers();
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: (k: string, f: () => void) => (listeners[k] = f),
    removeEventListener: () => {},
  });
  vi.stubGlobal('window', {
    addEventListener: (k: string, f: () => void) => (listeners[k] = f),
    removeEventListener: () => {},
  });
  vi.stubGlobal('navigator', {
    sendBeacon: (url: string, blob: { text?: unknown }) => {
      if (!beaconOk) return false;
      sent.push({ url, body: (blob as unknown as { parts: string }).parts, beacon: true });
      return true;
    },
  });
  // The Blob the beacon is handed: keep its text where the stub above can read it.
  vi.stubGlobal('Blob', class {
    parts: string;
    constructor(p: string[]) {
      this.parts = p.join('');
    }
  });
  vi.stubGlobal('fetch', (url: string, init: { body: string }) => {
    if (!fetchOk) throw new Error('offline');
    sent.push({ url, body: init.body, beacon: false });
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setTelemetryUrl(null);
});

describe('Collector', () => {
  it('sends nothing until the batch is full or the timer fires', () => {
    const c = new Collector();
    c.add('first_tap');
    expect(sent).toHaveLength(0);
    expect(c.waiting).toBe(1);
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sent).toHaveLength(1);
    expect(parse(0).evs[0].e).toBe('first_tap');
    expect(c.waiting).toBe(0);
  });

  it('sends as soon as a full batch is waiting', () => {
    const c = new Collector();
    for (let i = 0; i < MAX_BATCH; i++) c.add('wave_cleared', { wave: i });
    expect(sent).toHaveLength(1);
    expect(parse(0).evs).toHaveLength(MAX_BATCH);
  });

  it('numbers the events in order and keeps one session id', () => {
    const c = new Collector();
    c.add('a');
    c.add('b');
    vi.advanceTimersByTime(FLUSH_MS);
    c.add('c');
    vi.advanceTimersByTime(FLUSH_MS);
    const one = parse(0);
    const two = parse(1);
    expect(one.evs.map((e) => e.i)).toEqual([0, 1]);
    expect(two.evs[0].i).toBe(2);
    expect(two.sid).toBe(one.sid);
    expect(two.n).toBe(one.n + 1);
  });

  it('carries the player id once identified, and not before', () => {
    const c = new Collector();
    c.add('load');
    vi.advanceTimersByTime(FLUSH_MS);
    c.identify('abc123');
    c.add('run_start');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(parse(0).uid).toBeUndefined();
    expect(parse(1).uid).toBe('abc123');
  });

  it('uses the beacon when the page is going away', () => {
    const c = new Collector();
    c.add('quit_done');
    listeners.pagehide();
    expect(sent).toHaveLength(1);
    expect(sent[0].beacon).toBe(true);
    expect(parse(0).evs[0].e).toBe('quit_done');
  });

  it('flushes when the tab is hidden, but not when it is shown again', () => {
    const c = new Collector();
    c.add('pulse_done');
    (document as unknown as { visibilityState: string }).visibilityState = 'visible';
    listeners.visibilitychange();
    expect(sent).toHaveLength(0);
    (document as unknown as { visibilityState: string }).visibilityState = 'hidden';
    listeners.visibilitychange();
    expect(sent).toHaveLength(1);
    expect(c.waiting).toBe(0);
  });

  it('falls back to the fetch when the beacon refuses', () => {
    beaconOk = false;
    const c = new Collector();
    c.add('quit_done');
    listeners.pagehide();
    expect(sent).toHaveLength(1);
    expect(sent[0].beacon).toBe(false);
  });

  it('keeps the events when the send failed, and sends them next time', () => {
    fetchOk = false;
    beaconOk = false;
    const c = new Collector();
    c.add('load');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sent).toHaveLength(0);
    expect(c.waiting).toBe(1);
    fetchOk = true;
    c.add('run_start');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(parse(0).evs.map((e) => e.e)).toEqual(['load', 'run_start']);
  });

  it('caps the queue and says how many it dropped', () => {
    fetchOk = false;
    beaconOk = false;
    const c = new Collector();
    for (let i = 0; i < MAX_QUEUE + 10; i++) c.add('wave_cleared', { wave: i });
    expect(c.waiting).toBe(MAX_QUEUE);
    fetchOk = true;
    c.flush();
    const evs = parse(0).evs;
    expect(evs).toHaveLength(MAX_QUEUE + 1);
    // The opening is kept, the newest are the ones dropped, and the hole is reported rather than hidden.
    expect(evs[0].d).toEqual({ wave: 0 });
    expect(evs[evs.length - 1]).toMatchObject({ e: 'telemetry_dropped', d: { n: 10 } });
  });

  it('sends nothing at all when no collector is configured', () => {
    setTelemetryUrl('');
    const c = new Collector();
    c.add('load');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sent).toHaveLength(0);
  });
});
