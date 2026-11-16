import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { warmPause } from './units';

// warmPause times the pause between two warmRest shader steps (units.ts).
describe('warmPause', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Resolve the promise's state into a flag the test can read. */
  function track(p: Promise<void>): () => boolean {
    let done = false;
    void p.then(() => (done = true));
    return () => done;
  }

  it('waits the plain gap when no frame count is given', async () => {
    const done = track(warmPause());
    await vi.advanceTimersByTimeAsync(200);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(done()).toBe(true);
  });

  it('a machine at full rate waits no longer than the gap', async () => {
    // 60 fps: the ten frames are in well before 250 ms, so the pause is the old one.
    let drawn = 0;
    const tick = setInterval(() => (drawn += 1), 1000 / 60);
    const done = track(warmPause(() => drawn));
    await vi.advanceTimersByTimeAsync(249);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done()).toBe(true);
    clearInterval(tick);
  });

  it('waits for the play to get its frames, not just the clock', async () => {
    let drawn = 0;
    const done = track(warmPause(() => drawn));
    // The clock has run out four times over, but the play has had no frame at all.
    await vi.advanceTimersByTimeAsync(1000);
    expect(done()).toBe(false);
    drawn = 10;
    await vi.advanceTimersByTimeAsync(100);
    expect(done()).toBe(true);
  });

  it('a slow machine gets a real pause instead of a back-to-back compile', async () => {
    // 4 fps: 0.0.31 ran the next step 250 ms later, inside the same frame.
    let drawn = 0;
    const tick = setInterval(() => (drawn += 1), 250);
    const done = track(warmPause(() => drawn));
    await vi.advanceTimersByTimeAsync(300);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(2200);
    expect(done()).toBe(true);
    expect(drawn).toBeGreaterThanOrEqual(10);
    clearInterval(tick);
  });

  it('does not wait for frames while the page is hidden: nobody is playing and rAF has stopped', async () => {
    // The dev bot and a background tab draw nothing; waiting out the cap at every step only held the
    // compiles back (~4 s a step, and more under a background tab's timer clamp).
    vi.stubGlobal('document', { hidden: true });
    const done = track(warmPause(() => 0));
    await vi.advanceTimersByTimeAsync(260);
    expect(done()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('gives up after the cap, so a visible page that has frozen does not stall the warming', async () => {
    vi.stubGlobal('document', { hidden: false });
    const done = track(warmPause(() => 0));
    await vi.advanceTimersByTimeAsync(3900);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(done()).toBe(true);
    vi.unstubAllGlobals();
  });
});
