// Keeps the save in the platform's storage slot (cloud on a portal, localStorage locally). A save
// that can't be read or written leaves progress for this page load only.

import type { PlatformStorage } from '../platform';
import { normalize, type Save } from './progress';
import { busy } from '../platform/busy';

const KEY = 'save';

export async function loadSave(store: PlatformStorage): Promise<Save> {
  try {
    const raw = await store.get(KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return normalize(null);
  }
}

export function writeSave(store: PlatformStorage, save: Save): void {
  // Stringifying the save and handing it to the host's storage both run on the main thread.
  busy('save');
  store.set(KEY, JSON.stringify(save)).catch(() => {
    // Not persisted.
  });
}
