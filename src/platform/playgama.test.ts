import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOfflinePlatform } from './offline';
import { bridgeStorage, createPlaygamaPlatform, INIT_TIMEOUT_MS, InitTimeout, wantsPlaygama } from './playgama';

describe('bridgeStorage', () => {
  it('reads the start-up keys in one batched get and serves them from it', async () => {
    const get = vi.fn(async (keys: string | string[]) => (Array.isArray(keys) ? ['{"runs":2}', null, '1'] : 'x'));
    const set = vi.fn(async () => {});
    const store = bridgeStorage({ storage: { get, set } });
    await store.preload(['save', 'lang', 'mute']);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(['save', 'lang', 'mute'], false);
    expect(await store.get('save')).toBe('{"runs":2}');
    expect(await store.get('lang')).toBeNull();
    expect(await store.get('mute')).toBe('1');
    expect(get).toHaveBeenCalledTimes(1);
    await store.set('mute', '0');
    expect(set).toHaveBeenCalledWith('mute', '0');
    expect(await store.get('mute')).toBe('0');
  });

  it('keeps going in memory when Bridge storage fails', async () => {
    const store = bridgeStorage({ storage: { get: async () => Promise.reject(new Error('no')), set: async () => Promise.reject(new Error('no')) } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await store.preload(['save']);
    expect(await store.get('save')).toBeNull();
    await store.set('save', 'a');
    expect(await store.get('save')).toBe('a');
    warn.mockRestore();
  });
});

describe('wantsPlaygama', () => {
  const loc = (search: string, hostname = 'localhost') => ({ search, hostname });
  it('follows the URL, the host and a loaded Bridge script', () => {
    expect(wantsPlaygama(loc(''), '', false)).toBe(false);
    expect(wantsPlaygama(loc(''), '', true)).toBe(true);
    expect(wantsPlaygama(loc('?platform=stub'), '', true)).toBe(false);
    expect(wantsPlaygama(loc('?platform_id=playgama'), '', false)).toBe(true);
    expect(wantsPlaygama(loc('', 'games.playgama.com'), '', false)).toBe(true);
  });
});

describe('createPlaygamaPlatform analytics', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const fake = (analytics: boolean) => {
    const order: string[] = [];
    const b = {
      version: '2.3.1',
      gameVersion: undefined as string | undefined,
      initialize: vi.fn(async () => {
        order.push(`init ${b.gameVersion}`);
      }),
      EVENT_NAME: { REWARDED_STATE_CHANGED: 'r', INTERSTITIAL_STATE_CHANGED: 'i', PAUSE_STATE_CHANGED: 'p', AUDIO_STATE_CHANGED: 'a' },
      platform: { id: 'playgama', language: 'en', isAudioEnabled: true, sendMessage: vi.fn(), sendCustomMessage: vi.fn(), on: vi.fn() },
      advertisement: { isRewardedSupported: false, isInterstitialSupported: false, showRewarded: vi.fn(), showInterstitial: vi.fn(), on: vi.fn() },
      storage: { get: vi.fn(), set: vi.fn() },
      ...(analytics ? { analytics: { send: vi.fn() } } : {}),
    };
    return { b, order };
  };

  it('tags the build version before initializing and sends events through bridge.analytics', async () => {
    const { b, order } = fake(true);
    vi.stubGlobal('window', { bridge: b });
    const p = await createPlaygamaPlatform();
    expect(order).toEqual([`init ${__APP_VERSION__}`]);
    p.track('load', { ms: 812, platform: 'playgama' });
    expect(b.analytics?.send).toHaveBeenCalledWith('load', { ms: 812, platform: 'playgama' });
    expect(b.platform.sendCustomMessage).not.toHaveBeenCalled();
  });

  it('falls back to a custom platform message on a Bridge without analytics', async () => {
    const { b } = fake(false);
    vi.stubGlobal('window', { bridge: b });
    const p = await createPlaygamaPlatform();
    p.track('run_start', { mode: 'level' });
    expect(b.platform.sendCustomMessage).toHaveBeenCalledWith('run_start', { mode: 'level' });
  });
  it('gives up on an initialize that takes over INIT_TIMEOUT_MS and hands over the pending call', async () => {
    vi.useFakeTimers();
    const { b } = fake(true);
    const pending = new Promise<void>(() => {});
    b.initialize = vi.fn(() => pending);
    vi.stubGlobal('window', { bridge: b });
    const p = createPlaygamaPlatform().then(() => null, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(INIT_TIMEOUT_MS);
    const e = await p;
    expect(e).toBeInstanceOf(InitTimeout);
    expect((e as InitTimeout).late).toBe(pending);
  });

  it('plays offline without ads or saved progress, and tells a Bridge that comes up late that the game is ready', async () => {
    const { b } = fake(true);
    vi.stubGlobal('window', { bridge: b });
    let up!: () => void;
    const p = createOfflinePlatform('slow', new Promise<void>((r) => (up = r)));
    expect(b.analytics?.send).toHaveBeenCalledWith('platform_offline', { why: 'slow' });
    expect(p.rewardedSupported()).toBe(false);
    expect(await p.showRewarded('double')).toBe(false);
    await p.storage.set('save', '{}');
    expect(await p.storage.get('save')).toBe('{}');
    p.gameReady();
    p.gameplayStart();
    expect(b.platform.sendMessage).not.toHaveBeenCalled();
    up();
    await Promise.resolve();
    await Promise.resolve();
    expect(b.platform.sendMessage.mock.calls).toEqual([['game_ready'], ['gameplay_started']]);
    p.gameplayStop();
    expect(b.platform.sendMessage).toHaveBeenLastCalledWith('gameplay_stopped');
  });

  it('follows the host pause and mute once a late Bridge is up', async () => {
    const { b } = fake(true);
    const on = new Map<string, (v: boolean) => void>();
    b.platform.on = vi.fn((e: string, cb: (v: boolean) => void) => void on.set(e, cb));
    vi.stubGlobal('window', { bridge: b });
    let up!: () => void;
    const p = createOfflinePlatform('slow', new Promise<void>((r) => (up = r)));
    const paused: boolean[] = [];
    const audio: boolean[] = [];
    p.onPause((v) => paused.push(v));
    p.onAudio((v) => audio.push(v));
    expect(b.platform.on).not.toHaveBeenCalled();
    up();
    await Promise.resolve();
    await Promise.resolve();
    on.get('p')?.(true);
    on.get('a')?.(false);
    expect(paused).toEqual([true]);
    expect(audio).toEqual([false]);
    expect(p.audioEnabled()).toBe(false);
  });
});
