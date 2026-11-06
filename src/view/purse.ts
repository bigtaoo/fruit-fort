// The gold purse's motion (split out of hud.ts): coins flying from kills into the purse, each popping
// its own "+share" as it lands, and the "+N" for gold that comes without coins.

import { el } from './dom';
import { glyphs } from './icons';

export class PurseFx {
  private flying = 0;
  /** The "+N" over the purse still rising, while more gold may join it, and when it was last fed. */
  private gainEl: HTMLElement | null = null;
  private gainN = 0;
  private gainAt = 0;
  /**
   * Gold this frame's flying coins carry: each coin pops its own share at the purse when it lands, so
   * show() leaves that much out of the "+N" it pops for the rest. Cleared every show().
   */
  private carried = 0;
  /** Gold on coins still in the air: the purse counts it only as each coin lands. */
  private inFlight = 0;
  private shownGold = -1;
  /** The number the purse shows. */
  private drawnGold = -1;

  constructor(private root: HTMLElement, private purse: HTMLElement, private gold: HTMLElement) {}

  /** The run's gold this frame: a "+N" for what came without coins, the number less what is in the air. */
  show(gold: number): void {
    if (gold !== this.shownGold) {
      // Kill pay is rounded for its coins while the purse holds fractions: a stray 1 is not a "+1".
      const rest = gold - this.shownGold - this.carried;
      if (this.shownGold >= 0 && rest > (this.carried > 0 ? 1 : 0)) this.gain(rest);
      this.shownGold = gold;
    }
    this.carried = 0;
    const drawn = Math.max(0, gold - this.inFlight);
    if (drawn !== this.drawnGold) {
      this.drawnGold = drawn;
      this.gold.innerHTML = glyphs(`🪙${drawn}`);
    }
  }

  /**
   * Coins fly from a point on the page (a kill) into the purse, a little apart. `gold` is split among
   * them and each pops its own "+share" as it lands, with a bounce of the purse: five +6s in a row
   * read as more than one +30. `big` (the golden bug) pops them larger. Capped so a wave of kills
   * doesn't fill the page; the shares of coins past the cap ride on the last one that flies.
   */
  fly(x: number, y: number, n = 1, gold = 0, big = false): void {
    const to = this.purse.getBoundingClientRect();
    if (!to.width) return;
    this.carried += gold;
    this.inFlight += gold;
    const base = Math.floor(gold / n);
    let left = gold;
    let last: { share: number } | null = null;
    for (let i = 0; i < n && this.flying < 18; i++) {
      this.flying++;
      const share = { share: i < n - 1 ? base + (i < gold % n ? 1 : 0) : left };
      left -= share.share;
      last = share;
      const f = el('span', 'flycoin', this.root);
      f.innerHTML = glyphs('🪙');
      f.style.left = `${x}px`;
      f.style.top = `${y}px`;
      const dx = to.left + 18 - x;
      const dy = to.top + to.height / 2 - y;
      const jx = (Math.random() - 0.5) * (big ? 120 : 50);
      const a = f.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.3)' },
          { transform: `translate(calc(-50% + ${jx}px), calc(-50% - ${big ? 80 : 46}px)) scale(${big ? 1.4 : 1.15})`, offset: 0.28, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.75)` },
        ],
        // The golden bug's coins land one by one, far enough apart to count them.
        { duration: 620 + i * (big ? 40 : 70), delay: i * (big ? 150 : 50), fill: 'backwards' },
      );
      a.onfinish = () => {
        f.remove();
        this.flying--;
        this.inFlight -= share.share;
        if (share.share > 0) this.pop(share.share, big);
        this.purse.animate([{ transform: 'scale(1)' }, { transform: `scale(${big ? 1.3 : 1.16})` }, { transform: 'scale(1)' }], { duration: big ? 260 : 200, easing: 'ease-out' });
      };
    }
    if (last) last.share += left;
    else if (gold > 0) {
      this.inFlight -= gold;
      this.pop(gold, big);
    }
  }

  /** One coin's "+N" off the purse, on its own: a stream of them rises when several coins land. */
  private pop(n: number, big: boolean): void {
    const to = this.purse.getBoundingClientRect();
    if (!to.width) return;
    const f = el('span', big ? 'gain big outl' : 'gain outl', this.root);
    f.textContent = `+${n}`;
    f.style.left = `${to.left + to.width / 2 + (Math.random() - 0.5) * (big ? 36 : 20)}px`;
    f.style.top = `${to.top}px`;
    f.animate(
      big
        ? [
            { transform: 'translate(-50%, -30%) scale(0.3) rotate(-8deg)', opacity: 0 },
            { transform: 'translate(-50%, -120%) scale(1.45) rotate(4deg)', opacity: 1, offset: 0.14, easing: 'ease-out' },
            { transform: 'translate(-50%, -125%) scale(1) rotate(0deg)', opacity: 1, offset: 0.3 },
            { transform: 'translate(-50%, -150%) scale(1)', opacity: 1, offset: 0.6 },
            { transform: 'translate(-50%, -230%) scale(0.9)', opacity: 0 },
          ]
        : [
            { transform: 'translate(-50%, -40%) scale(0.5)', opacity: 0 },
            { transform: 'translate(-50%, -110%) scale(1.25)', opacity: 1, offset: 0.15, easing: 'ease-out' },
            { transform: 'translate(-50%, -120%) scale(1)', opacity: 1, offset: 0.55 },
            { transform: 'translate(-50%, -190%) scale(0.95)', opacity: 0 },
          ],
      { duration: big ? 1300 : 1000, easing: 'ease-in' },
    ).onfinish = () => f.remove();
  }

  /**
   * "+N" rising off the purse for gold that comes in without coins (wave pay, refunds). Gold that
   * arrives within a moment of the last joins the same number, which pops again. Only transform and
   * opacity animate, so the HUD layer is not repainted.
   */
  private gain(n: number): void {
    const to = this.purse.getBoundingClientRect();
    if (!to.width) return;
    const now = performance.now();
    if (this.gainEl && now - this.gainAt < 350) {
      this.gainN += n;
    } else {
      this.gainEl = el('span', 'gain outl', this.root);
      this.gainN = n;
    }
    this.gainAt = now;
    const f = this.gainEl;
    f.textContent = `+${this.gainN}`;
    f.style.left = `${to.left + to.width / 2}px`;
    f.style.top = `${to.top}px`;
    f.getAnimations().forEach((a) => a.cancel());
    const a = f.animate(
      [
        { transform: 'translate(-50%, -40%) scale(0.5)', opacity: 0 },
        { transform: 'translate(-50%, -110%) scale(1.25)', opacity: 1, offset: 0.15, easing: 'ease-out' },
        { transform: 'translate(-50%, -120%) scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%, -190%) scale(0.95)', opacity: 0 },
      ],
      { duration: 1000, easing: 'ease-in' },
    );
    a.onfinish = () => {
      f.remove();
      if (this.gainEl === f) this.gainEl = null;
    };
  }
}
