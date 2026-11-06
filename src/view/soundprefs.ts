// The player's music and effects switches, kept in the platform's storage (split out of main.ts).

import type { PlatformStorage } from '../platform';
import type { Sound } from './audio';
import type { AudioSwitches } from './settings';

/** The switches in storage: '0' while off. 'mute' is the one switch they replaced. */
const MUSIC_KEY = 'music';
const SFX_KEY = 'sfx';
const OLD_MUTE_KEY = 'mute';
/** Read at start with the rest of the game's keys, in one batch. */
export const SOUND_KEYS = [MUSIC_KEY, SFX_KEY, OLD_MUTE_KEY];

export function soundSwitches(sound: Sound): AudioSwitches {
  return { music: !sound.musicOff, sfx: !sound.sfxOff };
}

/** The music or the effects switched on or off (the map's settings or the pause menu), kept in storage. */
export function toggleSound(sound: Sound, storage: PlatformStorage, kind: 'music' | 'sfx'): void {
  if (kind === 'music') sound.setMusicOff(!sound.musicOff);
  else sound.setSfxOff(!sound.sfxOff);
  const off = kind === 'music' ? sound.musicOff : sound.sfxOff;
  void storage.set(kind === 'music' ? MUSIC_KEY : SFX_KEY, off ? '0' : '1');
}

/** The stored switches applied (after the preload). A player who muted everything before the split starts with both off. */
export async function loadSoundPrefs(sound: Sound, storage: PlatformStorage): Promise<void> {
  const wasMuted = (await storage.get(OLD_MUTE_KEY)) === '1';
  const stored = async (key: string) => {
    const v = await storage.get(key);
    return v == null ? !wasMuted : v !== '0';
  };
  sound.setMusicOff(!(await stored(MUSIC_KEY)));
  sound.setSfxOff(!(await stored(SFX_KEY)));
}
