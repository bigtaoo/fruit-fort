// The eight stat cards in the HUD's dock (§3.4): one cyan frame for all of them, so the frame
// colour says only the card's state (lit when it can be bought, gold edged when maxed) and the
// drawn icon says which stat it is. The blurb shows in a tip on hover or long press.

import { STAT_KEYS } from '../sim/config';
import type { World } from '../sim/world';
import { t } from '../i18n';
import type { StatKey } from '../sim/types';
import { el, fit } from './dom';
import { STAT_ICON, glyphs } from './icons';

interface StatButton {
  btn: HTMLButtonElement;
  shown: string;
  /** The level last drawn; a rise pops a "+1" on the card. -1 until first drawn. */
  lv: number;
  bar: HTMLElement | null;
  /** A long press showed the blurb: the click that ends it does not buy. */
  held: boolean;
}

/** Short of the price by no more than this share, a card counts as almost affordable and shows its progress. */
const ALMOST = 0.5;

export class StatDock {
  private stats = {} as Record<StatKey, StatButton>;
  private tip: HTMLElement;
  private tipTimer = 0;

  /** The cards go in `parent`; the tip floats in `root`. */
  constructor(parent: HTMLElement, root: HTMLElement, buy: (k: StatKey) => void) {
    const panel = el('div', 'stats', parent);
    this.tip = el('div', 'tip', root);
  for (const k of STAT_KEYS) {
    const btn = el('button', 'stat', panel);
    const b: StatButton = { btn, shown: '', lv: -1, bar: null, held: false };
    this.stats[k] = b;
    btn.onclick = () => {
      if (b.held) b.held = false;
      else buy(k);
    };
    // The blurb: on hover with a mouse, after a long press on touch (that press then buys nothing).
    btn.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') this.showTip(k);
    });
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      b.held = false;
      clearTimeout(this.tipTimer);
      this.tipTimer = window.setTimeout(() => {
        b.held = true;
        this.showTip(k);
      }, 450);
    });
    for (const ev of ['pointerleave', 'pointerup', 'pointercancel'] as const) {
      btn.addEventListener(ev, () => {
        clearTimeout(this.tipTimer);
        this.tip.classList.remove('show');
      });
    }
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  }

  /** Draw every card afresh next update (a new language or width), and drop the tip. */
  reset(): void {
    for (const k of STAT_KEYS) this.stats[k].shown = '';
    this.tip.classList.remove('show');
  }

  private showTip(k: StatKey): void {
    const r = this.stats[k].btn.getBoundingClientRect();
    this.tip.innerHTML = `<b></b><span></span>`;
    this.tip.firstElementChild!.textContent = t(`stat.${k}.name`);
    this.tip.lastElementChild!.textContent = t(`stat.${k}.text`);
    this.tip.classList.add('show');
    // Above the card, kept inside the window.
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    const x = Math.max(6, Math.min(window.innerWidth - tw - 6, r.left + r.width / 2 - tw / 2));
    const y = r.top - th - 10 >= 4 ? r.top - th - 10 : r.bottom + 10;
    this.tip.style.left = `${x}px`;
    this.tip.style.top = `${y}px`;
  }

  /**
   * Each stat card: icon, name, level badge (on every card, level 0 too) and price (or Max); the
   * blurb is in the tip. Lit when
   * it can be bought, a progress bar along the bottom when almost, dim when far off, gold edged
   * when maxed. Touches the card's text only on change.
   */
  update(w: World, target: boolean): void {
    for (const k of STAT_KEYS) {
      const b = this.stats[k];
      const maxed = w.maxed(k);
      const cost = w.statCost(k);
      const lv = w.lv[k];
      const key = `${lv}:${maxed ? -1 : cost}`;
      if (key !== b.shown) {
        b.shown = key;
        const price = maxed ? t('hud.max') : glyphs(`🪙${cost}`);
        b.btn.innerHTML = `<i>${STAT_ICON[k]}</i><b></b><span class="price">${price}</span><em class="${lv > 0 ? '' : 'zero'}">Lv${lv}</em><u></u>`;
        const name = b.btn.querySelector('b')!;
        name.textContent = t(`stat.${k}.name`);
        fit(name, 8);
        b.bar = b.btn.querySelector('u');
        b.btn.ariaLabel = `${t(`stat.${k}.name`)} ${lv}: ${t(`stat.${k}.text`)}`;
        if (b.lv >= 0 && lv > b.lv) {
          const pop = el('span', 'pop', b.btn, '+1');
          pop.addEventListener('animationend', () => pop.remove());
        }
        b.lv = lv;
      }
      const can = w.canBuy(k);
      const frac = maxed ? 1 : Math.min(1, w.gold / cost);
      const almost = !can && !maxed && !w.over && frac >= 1 - ALMOST;
      b.btn.classList.toggle('can', can);
      b.btn.classList.toggle('almost', almost);
      b.btn.classList.toggle('poor', !can && !almost && !maxed);
      b.btn.classList.toggle('maxed', maxed);
      b.btn.ariaDisabled = String(!can);
      if (b.bar) b.bar.style.width = almost ? `${(frac * 100).toFixed(1)}%` : '0';
      // Before the first buy, the guide's arrow points at the damage card.
      b.btn.classList.toggle('target', target && w.buys === 0 && k === 'dmg');
    }
  }
}
