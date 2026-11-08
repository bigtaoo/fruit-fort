// What stopped the game from starting, in words Playgama passes on. It suppresses a free-text field (the
// first boot_error, 2026-11-08, came back with its msg suppressed), so the cause goes out as one of a few
// fixed words, `kind`, next to the error's type, `name`.

/** `fetch`: a script didn't arrive (a slow or dropped connection). `webgl`: the browser gives no WebGL2. */
export type BootErrorKind = 'fetch' | 'webgl' | 'other';

// Chrome "Failed to fetch dynamically imported module", Firefox "error loading dynamically imported module",
// Safari "Importing a module script failed", and a plain fetch's "Failed to fetch" / "Load failed" / "NetworkError".
const FETCH = /dynamically imported module|importing a module script failed|failed to fetch|load failed|networkerror/i;

/** `webgl2`: whether the browser can make a WebGL2 context (hasWebgl2); a failed start without one is that. */
export function bootErrorKind(e: unknown, webgl2: boolean): BootErrorKind {
  const msg = errorText(e);
  if (FETCH.test(msg)) return 'fetch';
  if (!webgl2 || /webgl/i.test(msg)) return 'webgl';
  return 'other';
}

/** The boot_error fields for `e`: its kind, its type (TypeError, …) and the message, which may be suppressed. */
export function bootErrorFields(e: unknown, webgl2 = true): { kind: BootErrorKind; name: string; msg: string } {
  const name = e instanceof Error ? e.name : typeof e;
  return { kind: bootErrorKind(e, webgl2), name: name.slice(0, 24), msg: errorText(e).slice(0, 120) };
}

function errorText(e: unknown): string {
  return String((e as Error | null)?.message ?? e);
}

export function hasWebgl2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}
