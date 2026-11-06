import { describe, expect, it } from 'vitest';
import type { PlatformStorage } from '../platform';
import type { Sound } from './audio';
import { loadSoundPrefs, SOUND_KEYS, soundSwitches, toggleSound } from './soundprefs';

/** A storage over a plain map, and a sound with just the two switches. */
const store = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  const s: PlatformStorage = {
    preload: async () => {},
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
  };
  return { m, s };
};
const sound = () => {
  const o = { musicOff: false, sfxOff: false, setMusicOff: (v: boolean) => void (o.musicOff = v), setSfxOff: (v: boolean) => void (o.sfxOff = v) };
  return o as unknown as Sound;
};

describe('sound switches', () => {
  it('start on for a new player and preload every key', async () => {
    const snd = sound();
    await loadSoundPrefs(snd, store().s);
    expect(soundSwitches(snd)).toEqual({ music: true, sfx: true });
    expect(SOUND_KEYS).toEqual(['music', 'sfx', 'mute']);
  });

  it('read each stored switch, and an old mute turns off both that were never set', async () => {
    const a = sound();
    await loadSoundPrefs(a, store({ music: '0', sfx: '1' }).s);
    expect(soundSwitches(a)).toEqual({ music: false, sfx: true });
    const b = sound();
    await loadSoundPrefs(b, store({ mute: '1' }).s);
    expect(soundSwitches(b)).toEqual({ music: false, sfx: false });
    const c = sound();
    await loadSoundPrefs(c, store({ mute: '1', sfx: '1' }).s);
    expect(soundSwitches(c)).toEqual({ music: false, sfx: true });
  });

  it('flip one switch and keep it, "0" while off', () => {
    const snd = sound();
    const { m, s } = store();
    toggleSound(snd, s, 'music');
    expect(soundSwitches(snd)).toEqual({ music: false, sfx: true });
    expect(m.get('music')).toBe('0');
    toggleSound(snd, s, 'sfx');
    toggleSound(snd, s, 'music');
    expect(soundSwitches(snd)).toEqual({ music: true, sfx: false });
    expect([m.get('music'), m.get('sfx')]).toEqual(['1', '0']);
  });
});
