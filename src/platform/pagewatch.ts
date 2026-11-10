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
/**
 * A blur within this many milliseconds of a tap on the page is that tap's doing, not the player leaving: in
 * some hosts (the Claude app's browser pane, device emulation) a tap on a card takes the focus off the page,
 * and the pause menu came up on every buy (2026-11-10, the user's test). The blur is checked again after
 * the wait, in case it came before the tap's pointerdown. One tap excuses one blur only, and the page takes
 * the focus back after it: left unfocused, a later real leave (alt-tab) would send no blur at all.
 */
export const TAP_BLUR = 500;

export function watchPage(away: () => void, leaving: () => void, closing: () => void): void {
  let tapAt = -Infinity;
  window.addEventListener('pointerdown', () => (tapAt = performance.now()), true);
  const tapped = () => performance.now() - tapAt < TAP_BLUR;
  window.addEventListener('blur', () => {
    const excuse = () => {
      tapAt = -Infinity;
      window.focus();
    };
    if (tapped()) return void setTimeout(excuse, 0);
    setTimeout(() => (tapped() ? excuse() : !document.hasFocus() && away()), 200);
  });
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
