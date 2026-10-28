import type { PlatformStorage } from './types';

const PREFIX = 'fruit-fort:';

/** localStorage with a namespace; private windows and blocked storage fall back to memory. */
export function localStore(): PlatformStorage {
  const memory = new Map<string, string>();
  return {
    async get(key) {
      try {
        const v = localStorage.getItem(PREFIX + key);
        if (v !== null) return v;
      } catch {
        // Storage blocked: memory only.
      }
      return memory.get(key) ?? null;
    },
    async set(key, value) {
      memory.set(key, value);
      try {
        localStorage.setItem(PREFIX + key, value);
      } catch {
        // Quota or blocked: the memory copy lasts the session.
      }
    },
  };
}

/** Browser language, lower-case two-letter code. */
export function browserLanguage(): string {
  const lang = typeof navigator !== 'undefined' ? navigator.language : '';
  return (lang || 'en').slice(0, 2).toLowerCase();
}
