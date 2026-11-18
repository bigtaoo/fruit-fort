// The eight stat cards in the HUD's dock (§3.4): one cyan frame for all of them, so the frame
// colour says only the card's state (lit when it can be bought, gold edged when maxed) and the
// drawn icon says which stat it is. No stat is ever locked in a run: a grey card is only short of
// gold, and its price says so in red. The blurb shows in a tip on hover or long press.

import { CRIT, ECON, STATS, STAT_KEYS } from '../sim/config';
import type { World } from '../sim/world';
import { teaching } from '../sim/levels';
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
  /** The buyable flag and the bar's width last written, so an unchanged frame touches no attribute. */
  shownCan: boolean | null;
  shownBar: number;
}


/**
 * A card's level with the run's cap, "Lv1/3", so a stat whose training is maxed still reads as one
 * that gold raises further in the run; a crystal in front when training gave the starting levels.
 */
export function lvText(k: StatKey, lv: number, trained: number): string {
  const max = STATS[k].max;
  return `${trained ? glyphs('💎') : ''}Lv${lv}${max === undefined ? '' : `/${max}`}`;
}

/**
 * What a stat's card promises. Crit past its chance cap raises crit damage instead, and in endless
 * the fence is not the repair it is in a level: a wall level arrives as damaged as the rest of the
 * fence (§9.2), so the card buys max health with ECON.endlessRepair of it back, not a flat 150.
 */
export function statText(k: StatKey, critLv: number, endless: boolean): string {
  if (k === 'crit' && critLv >= CRIT.rateLevels) return t('stat.crit.more');
  if (k === 'wall' && endless) return t('stat.wall.endless', { n: STATS.wall.per, p: Math.round(ECON.endlessRepair * 100) });
  return t(`stat.${k}.text`);
}

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
    const b: StatButton = { btn, shown: '', lv: -1, bar: null, held: false, shownCan: null, shownBar: -1 };
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

  /** A stat's card, for the guide's hand. */
  card(k: StatKey): HTMLButtonElement {
    return this.stats[k].btn;
  }

  /** Draw every card afresh next update (a new language or width), and drop the tip. */
  reset(): void {
    for (const k of STAT_KEYS) {
      this.stats[k].shown = '';
      this.stats[k].shownCan = null;
      this.stats[k].shownBar = -1;
    }
    this.tip.classList.remove('show');
  }

  /** Crit levels bought this run; past the chance's cap the crit card says it raises crit damage. */
  private critLv = 0;
  /** Endless, where the fence card is not the repair it is in a level (§9.2), so it says so instead. */
  private endless = false;

  private blurb(k: StatKey): string {
    return statText(k, this.critLv, this.endless);
  }

  private showTip(k: StatKey): void {
    const r = this.stats[k].btn.getBoundingClientRect();
    this.tip.innerHTML = `<b></b><span></span>`;
    this.tip.firstElementChild!.textContent = t(`stat.${k}.name`);
    this.tip.lastElementChild!.textContent = this.blurb(k);
    this.tip.classList.add('show');
    // Above the card, kept inside the window; with the dock along the right edge (landscape), beside
    // it on the board instead, since above it covered the card above.
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    const dock = this.stats[k].btn.closest('.dock')?.getBoundingClientRect();
    const right = !!dock && dock.left > window.innerWidth / 2 && dock.height > dock.width;
    const x = right ? Math.max(6, dock!.left - tw - 10) : Math.max(6, Math.min(window.innerWidth - tw - 6, r.left + r.width / 2 - tw / 2));
    const y = right ? Math.max(4, Math.min(window.innerHeight - th - 4, r.top + r.height / 2 - th / 2)) : r.top - th - 10 >= 4 ? r.top - th - 10 : r.bottom + 10;
    this.tip.style.left = `${x}px`;
    this.tip.style.top = `${y}px`;
  }

  /**
   * Each stat card: icon, name, level badge (on every card, level 0 too) and price (or Max); the
   * blurb is in the tip. Lit when
   * it can be bought, dim with a progress bar along the bottom when short of the price, gold edged
   * when maxed. Touches the card's text only on change.
   */
  update(w: World): void {
    // Once the run is over the cards stay as they were: none can be bought any more, and turning all
    // eight dim at once re-rasters the whole dock, about 100 ms on the GPU of a low-end phone (Galaxy
    // A16), right in the win's show.
    if (w.over) return;
    this.critLv = w.lv.crit;
    this.endless = !w.level;
    // The one card that beckons: damage while it can be bought (the card level 1's hand points at), else the cheapest.
    let lure: StatKey | null = w.canBuy('dmg') ? 'dmg' : null;
    if (!lure) for (const k of STAT_KEYS) if (w.canBuy(k) && (!lure || w.statCost(k) < w.statCost(lure))) lure = k;
    for (const k of STAT_KEYS) {
      const b = this.stats[k];
      const maxed = w.maxed(k);
      const cost = w.statCost(k);
      const lv = w.lv[k];
      const trained = w.trained[k];
      const key = `${lv}:${trained}:${maxed ? -1 : cost}`;
      if (key !== b.shown) {
        b.shown = key;
        const price = maxed ? t('hud.max') : glyphs(`🪙${cost}`);
        b.btn.innerHTML = `<i>${STAT_ICON[k]}</i><b></b><span class="price">${price}</span><em class="${lv > 0 ? '' : 'zero'} ${trained ? 'tr' : ''}">${lvText(k, lv, trained)}</em><u></u>`;
        const name = b.btn.querySelector('b')!;
        name.textContent = t(`stat.${k}.name`);
        // Not below 11px: smaller is unreadable on a phone, an ellipsis reads better.
        fit(name, 11);
        b.bar = b.btn.querySelector('u');
        // A fresh <u> carries no transform: write the bar's width again whatever it was.
        b.shownBar = -1;
        b.btn.ariaLabel = `${t(`stat.${k}.name`)} ${lv}${trained ? ` (${t('hud.trained', { lv: trained })})` : ''}: ${this.blurb(k)}`;
        if (b.lv >= 0 && lv > b.lv) {
          const pop = el('span', 'pop', b.btn, '+1');
          pop.addEventListener('animationend', () => pop.remove());
        }
        b.lv = lv;
      }
      const can = w.canBuy(k);
      const frac = maxed ? 1 : Math.min(1, w.gold / cost);
      // Every card short of its price shows how far along it is, however far off.
      const almost = !can && !maxed;
      b.btn.classList.toggle('can', can);
      // Until the run's first buy the lure pulses: 2026-11-08..11, players who left without a tap had a median
      // 80 gold and a card in reach; most were gone 2 s into the fight, before any hand. In the first five
      // levels it pulses again while the gold would buy it twice (the eager buy hand, idle_rich before 11-14, was left unspent 64 of 101 times).
      b.btn.classList.toggle('beckon', k === lure && (w.buys === 0 || (teaching(w.level) && w.gold >= 2 * cost)));
      b.btn.classList.toggle('almost', almost);
      b.btn.classList.toggle('poor', !can && !almost && !maxed);
      b.btn.classList.toggle('maxed', maxed);
      // Written only on a change: the eight cards are steady most frames, and an attribute set and a
      // style string parsed per card per frame is work for nothing on the phones the dock already costs the most.
      if (can !== b.shownCan) {
        b.shownCan = can;
        b.btn.ariaDisabled = String(!can);
      }
      // Scaled, not resized: the bar has its own layer, so this repaints nothing (style.css).
      const width = almost ? Math.round(frac * 1000) / 1000 : 0;
      if (b.bar && width !== b.shownBar) {
        b.shownBar = width;
        b.bar.style.transform = `scaleX(${width})`;
      }
    }
  }
}
