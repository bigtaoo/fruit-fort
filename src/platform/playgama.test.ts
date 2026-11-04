import { describe, expect, it, vi } from 'vitest';
import { bridgeStorage, wantsPlaygama } from './playgama';

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
