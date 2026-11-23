import { afterEach, describe, expect, it, vi } from 'vitest';
import { cgStorage, createCrazyGamesPlatform, INIT_TIMEOUT_MS, wantsCrazyGames, type CrazyGamesSdk } from './crazygames';

describe('wantsCrazyGames', () => {
  const loc = (search: string, hostname = 'localhost') => ({ search, hostname });
  it('follows the URL, the host, a loaded SDK and the build flag', () => {
    expect(wantsCrazyGames(loc(''), false, undefined)).toBe(false);
    expect(wantsCrazyGames(loc(''), true, undefined)).toBe(true);
    expect(wantsCrazyGames(loc(''), false, 'crazygames')).toBe(true);
    expect(wantsCrazyGames(loc(''), false, 'playgama')).toBe(false);
    expect(wantsCrazyGames(loc('', 'www.crazygames.com'), false, undefined)).toBe(true);
    expect(wantsCrazyGames(loc('?useLocalSdk=true'), false, undefined)).toBe(true);
  });

  it('lets ?platform= override everything, in both directions', () => {
    expect(wantsCrazyGames(loc('?platform=crazygames'), false, undefined)).toBe(true);
    // A forced stub or Playgama must win even on their own page, or the local stub is unreachable there.
    expect(wantsCrazyGames(loc('?platform=stub', 'www.crazygames.com'), true, 'crazygames')).toBe(false);
    expect(wantsCrazyGames(loc('?platform=playgama'), true, 'crazygames')).toBe(false);
  });
});

describe('cgStorage', () => {
  it('reads the SDK save and serves a write back from memory', async () => {
    const items = new Map<string, string>([['save', '{"runs":2}']]);
    const data = { getItem: vi.fn((k: string) => items.get(k) ?? null), setItem: vi.fn() };
    const store = cgStorage({ data });
    await store.preload(['save']);
    expect(await store.get('save')).toBe('{"runs":2}');
    expect(await store.get('lang')).toBeNull();
    await store.set('save', '{"runs":3}');
    expect(data.setItem).toHaveBeenCalledWith('save', '{"runs":3}');
    expect(await store.get('save')).toBe('{"runs":3}');
  });

  it('keeps the session going when the data module is off', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throws = () => {
      throw { code: 'dataModuleDisabled', message: 'off' };
    };
    const store = cgStorage({ data: { getItem: throws, setItem: throws } });
    expect(await store.get('save')).toBeNull();
    await store.set('save', '{}');
    // The write did not land on their servers, but the player keeps their progress for this page load.
    expect(await store.get('save')).toBe('{}');
    warn.mockRestore();
  });
});

type Ads = { type: string; cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void } };

function fake(over: Partial<CrazyGamesSdk> & { adblock?: boolean } = {}) {
  const ads: Ads[] = [];
  const calls: string[] = [];
  let settingsChanged: (() => void) | undefined;
  const settings = { muteAudio: false };
  const sdk = {
    environment: 'crazygames' as const,
    init: vi.fn(async () => void calls.push('init')),
    game: {
      settings,
      loadingStart: vi.fn(() => void calls.push('loadingStart')),
      loadingStop: vi.fn(() => void calls.push('loadingStop')),
      gameplayStart: vi.fn(() => void calls.push('gameplayStart')),
      gameplayStop: vi.fn(() => void calls.push('gameplayStop')),
      addSettingsChangeListener: vi.fn((cb: () => void) => void (settingsChanged = cb)),
    },
    ad: {
      requestAd: vi.fn((type: string, cb: Ads['cb'] = {}) => void ads.push({ type, cb })),
      hasAdblock: vi.fn(async () => over.adblock === true),
    },
    user: { systemInfo: { locale: 'de-DE' } },
    data: { getItem: vi.fn(() => null), setItem: vi.fn() },
    ...over,
  } as unknown as CrazyGamesSdk;
  vi.stubGlobal('window', { CrazyGames: { SDK: sdk } });
  return { sdk, ads, calls, settings, change: () => settingsChanged?.() };
}

describe('createCrazyGamesPlatform', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('initializes, says loading started, and reports ready and gameplay once each', async () => {
    const { calls } = fake();
    const p = await createCrazyGamesPlatform();
    expect(p.id).toBe('crazygames');
    expect(calls).toEqual(['init', 'loadingStart']);
    p.gameReady();
    p.gameplayStart();
    p.gameplayStart();
    p.gameplayStop();
    p.gameplayStop();
    expect(calls).toEqual(['init', 'loadingStart', 'loadingStop', 'gameplayStart', 'gameplayStop']);
  });

  it('refuses the page when the SDK is site-locked off their domain', async () => {
    fake({ environment: 'disabled' });
    await expect(createCrazyGamesPlatform()).rejects.toThrow(/disabled/);
  });

  it('gives up on an init that takes over INIT_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    fake({ init: () => new Promise<void>(() => {}) });
    const settled = createCrazyGamesPlatform().then(() => null, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(INIT_TIMEOUT_MS);
    expect(await settled).toBeInstanceOf(Error);
  });

  it('pays out a rewarded ad only when it finished, and carries the host pause', async () => {
    const { ads } = fake();
    const p = await createCrazyGamesPlatform();
    const paused: boolean[] = [];
    p.onPause((v) => paused.push(v));
    expect(p.rewardedSupported()).toBe(true);

    const watched = p.showRewarded('double');
    expect(ads[0].type).toBe('rewarded');
    ads[0].cb.adStarted?.();
    expect(paused).toEqual([true]);
    ads[0].cb.adFinished?.();
    expect(await watched).toBe(true);
    expect(paused).toEqual([true, false]);

    const refused = p.showRewarded('revive');
    // No fill, a cooldown or an adblocker: a normal answer, and the game must not be left paused by one.
    ads[1].cb.adError?.({ code: 'unfilled', message: 'No ad available' });
    expect(await refused).toBe(false);
    expect(paused).toEqual([true, false]);
  });

  it('asks for a midgame ad and comes back from a cooldown', async () => {
    const { ads } = fake();
    const p = await createCrazyGamesPlatform();
    const shown = p.showInterstitial();
    expect(ads[0].type).toBe('midgame');
    ads[0].cb.adError?.({ code: 'adCooldown', message: 'too soon' });
    await expect(shown).resolves.toBeUndefined();
  });

  it('takes one ad at a time', async () => {
    const { ads } = fake();
    const p = await createCrazyGamesPlatform();
    const first = p.showRewarded('chest');
    expect(await p.showRewarded('chest')).toBe(false);
    expect(ads).toHaveLength(1);
    ads[0].cb.adFinished?.();
    expect(await first).toBe(true);
  });

  it('lets go of an ad that never calls back', async () => {
    vi.useFakeTimers();
    const { ads } = fake();
    const p = await createCrazyGamesPlatform();
    const paused: boolean[] = [];
    p.onPause((v) => paused.push(v));
    const watched = p.showRewarded('double');
    ads[0].cb.adStarted?.();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(await watched).toBe(false);
    // The results screen is usable again, and the game is not left muted behind an ad that never closed.
    expect(paused).toEqual([true, false]);
  });

  it('hides the ad offer behind an adblocker, and still plays', async () => {
    const { ads } = fake({ adblock: true });
    const p = await createCrazyGamesPlatform();
    expect(p.rewardedSupported()).toBe(false);
    expect(await p.showRewarded('double')).toBe(false);
    await p.showInterstitial();
    expect(ads).toHaveLength(0);
  });

  it('follows their mute, which is the player’s own setting on the site', async () => {
    const { settings, change } = fake();
    const p = await createCrazyGamesPlatform();
    const audio: boolean[] = [];
    p.onAudio((v) => audio.push(v));
    expect(p.audioEnabled()).toBe(true);
    settings.muteAudio = true;
    change();
    expect(audio).toEqual([false]);
    expect(p.audioEnabled()).toBe(false);
    // A settings change that is not about the audio says nothing new.
    change();
    expect(audio).toEqual([false]);
  });

  it('takes the language from their locale, and the browser when there is none', async () => {
    fake();
    expect((await createCrazyGamesPlatform()).language()).toBe('de');
    vi.unstubAllGlobals();
    fake({ user: { systemInfo: {} } });
    vi.stubGlobal('navigator', { language: 'pt-BR' });
    expect((await createCrazyGamesPlatform()).language()).toBe('pt');
  });

  it('sends analytics nowhere but our own collector', async () => {
    const { sdk } = fake();
    const p = await createCrazyGamesPlatform();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    // v3 has no custom analytics at all: the point of this test is that nothing is invented for it here,
    // and that a track call cannot throw. Collector (collect.ts) sends the event, Analytics calls both.
    p.track('run_start', { mode: 'level' });
    expect(JSON.stringify(sdk)).not.toContain('run_start');
    info.mockRestore();
  });
});
