// loadLocale must not let a stalled language chunk hold the boot: a hanging import() never rejects,
// and start.ts awaits the language before it marks `save` (2026-11-23, a session stuck at 94% for 66.7 s).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let resolveFr: ((table: unknown) => void) | undefined;
let rejectDe: ((e: unknown) => void) | undefined;
let frCalls = 0;

vi.mock('./more', async () => {
  const { en } = await import('./en');
  return {
    MORE_NAMES: { fr: 'Français', de: 'Deutsch' },
    MORE: {
      fr: () => {
        frCalls++;
        return new Promise((res) => {
          resolveFr = res;
        });
      },
      de: () =>
        new Promise((_res, rej) => {
          rejectDe = rej;
        }),
      // Unused by these tests, but the table has to type-check against en.
      es: () => Promise.resolve(en),
    },
  };
});

describe('loadLocale waits only so long', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frCalls = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('gives up on a chunk that never arrives, then takes it when it lands', async () => {
    const { loadLocale } = await import('./index');
    const first = loadLocale('fr');
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await first).toBe(false);

    // The abandoned fetch is still running: when it lands the table is in hand, with no second fetch.
    const { en } = await import('./en');
    resolveFr?.(en);
    await Promise.resolve();
    expect(await loadLocale('fr')).toBe(true);
    expect(frCalls).toBe(1);
  });

  it('shares one fetch between two callers', async () => {
    const { loadLocale } = await import('./index');
    const a = loadLocale('fr');
    const b = loadLocale('fr');
    const { en } = await import('./en');
    resolveFr?.(en);
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(frCalls).toBe(1);
  });

  it('lets a failed fetch be tried again', async () => {
    const { loadLocale } = await import('./index');
    const first = loadLocale('de');
    rejectDe?.(new Error('offline'));
    expect(await first).toBe(false);
    // A second call starts a new fetch rather than returning the remembered failure.
    const second = loadLocale('de');
    rejectDe?.(new Error('offline again'));
    expect(await second).toBe(false);
  });

  it('never fetches a language that is already in the main chunk', async () => {
    const { loadLocale } = await import('./index');
    expect(await loadLocale('en')).toBe(true);
    expect(await loadLocale('zh')).toBe(true);
  });
});
