// The page losing focus or going hidden (split out of main.ts).

/**
 * `away` runs when the page loses focus (another tab, window or app, or a click outside the game's frame on
 * a portal) and when it goes hidden; `leaving` only when it goes hidden (another tab or app, or the portal
 * closing the game): the last moment an event reliably goes out, as Bridge sends its queue with sendBeacon on
 * this same event. Ours run first, in the capture phase on `window` (Bridge listens on the document); before
 * 0.0.15 `quit_*` waited for `pagehide`, after that beacon, and was lost (one arrived on all of 2026-11-06).
 * A player who comes back sends later events, so a session's last `quit_*` is where it ended. `closing` runs
 * after `leaving` when the page is unloaded.
 */
export function watchPage(away: () => void, leaving: () => void, closing: () => void): void {
  window.addEventListener('blur', away);
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      away();
      leaving();
    }
  }, true);
  window.addEventListener('pagehide', () => {
    leaving();
    closing();
  }, true);
}
