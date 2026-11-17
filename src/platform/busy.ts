// What the page was doing when a long task landed. A `longtask` entry says how long the main thread
// was blocked, never what blocked it, and the long hitches this game has met all came from work that
// blocks it on purpose for a while: a shader compile, a quality step that rebuilds every program, the
// save written to the host's storage, a wagon picked (its shot's programs are made at the first one
// fired). Each marks itself before it runs, and `long_task_busy` / `long_task_busy_ms` carry the last
// mark and how long ago it was set, so a hitch that is one of them can be told from a hitch that only
// follows one - 2026-11-17, an endless freeze near wave 43 had nothing to tell it apart by.

let what = '';
let at = -1e9;

/** About to do something known to hold the main thread. */
export function busy(name: string): void {
  what = name;
  at = performance.now();
}

/** The last mark and its age in ms, for the window's longest task; nothing before the first mark. */
export function busyMark(): Record<string, string | number> {
  return what ? { busy: what, busy_ms: Math.round(performance.now() - at) } : {};
}
