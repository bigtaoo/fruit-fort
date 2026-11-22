// Tide cards on the HUD (§9.4, docs/design/battle.md): every TIDES.every endless waves the strip
// along the top of the board carries three bargains instead of a wagon pick. A card pays the player
// now (the bold line) and gives the bugs something for the rest of the run (the line under the
// rule). The fight goes on underneath, as with the wagon pick, and after TIDES.autoPick seconds the
// first card - the one wearing the clock - is taken.
//
// It is its own class and its own panel rather than a mode of WagonUi: the two never show together
// (Tides waits while a wagon pick is open), and a card here is a bargain with two halves, not a
// wagon at a level.
//
// Texts: the `tide` group of the i18n tables, all fifteen languages.

import { TIDES } from '../sim/config';
import type { TideGift, TideOpt, TidePress } from '../sim/types';
import type { World } from '../sim/world';
import { busy } from '../platform/busy';
import { t } from '../i18n';
import { el } from './dom';
import { CLOCK_ICON, SHIELD_ICON, STAT_ICON, TRAIN_ICON, WAGON_ICON } from './icons';

/** A card wears the colour of what the bugs get: the price is the part worth reading twice. */
const PRESS_COLOR: Record<TidePress, string> = {
  swift: '#5ad8ff',
  hardy: '#b98cff',
  gnaw: '#ff7a5a',
  swarm: '#ffc940',
};

const GIFT_ICON: Record<TideGift, string> = {
  wagon: TRAIN_ICON,
  gold: WAGON_ICON.gold,
  levels: STAT_ICON.dmg,
  mend: SHIELD_ICON,
};

/** What the card hands over now. The numbers come from TIDES, so a tuning change rewrites the text. */
export function giftText(gift: TideGift, w: World): string {
  if (gift === 'gold') return t('tide.gift.gold.text', { n: Math.round(TIDES.gift.gold * w.statCost('dmg')) });
  if (gift === 'levels') return t('tide.gift.levels.text', { n: TIDES.gift.levels });
  if (gift === 'mend') return t('tide.gift.mend.text', { p: Math.round(TIDES.gift.mend * 100) });
  return t('tide.gift.wagon.text');
}

/** What the bugs keep, for the rest of the run. */
export function pressText(press: TidePress): string {
  return t(`tide.press.${press}`, { n: Math.round((TIDES.press[press] - 1) * 100) });
}

export class TideUi {
  private panel: HTMLElement;
  private row: HTMLElement;
  private clock: HTMLElement;
  private clockText: HTMLElement;
  private shownN = 0;
  private shownSec = -1;
  /** The window size the names were fitted for: a rotation with the cards up fits them again. */
  private shownSize = '';
  private world: World | null = null;

  constructor(root: HTMLElement) {
    this.panel = el('div', 'wgpick tide', root);
    const box = el('div', 'wgbox', this.panel);
    el('div', 'wgtitle outl', box);
    this.row = el('div', 'wgrow', box);
    this.clock = el('div', 'wgclock', box);
    this.clockText = el('div', 'wgauto', box);
  }

  update(w: World): void {
    this.world = w;
    const o = w.tides?.offer;
    this.panel.classList.toggle('show', !!o);
    if (!o) return void (this.shownN = 0);
    if (o.n !== this.shownN) this.deal(w, o.opts, o.n);
    else if (`${innerWidth}x${innerHeight}` !== this.shownSize) this.fit();
    this.clock.style.transform = `scaleX(${Math.min(1, Math.max(0, o.t / TIDES.autoPick))})`;
    const sec = Math.ceil(o.t);
    if (sec !== this.shownSec) {
      this.shownSec = sec;
      this.clockText.textContent = t('wagon.auto', { n: sec });
      // Nothing tapped after 4 s: the cards bounce to say they are waiting for a tap.
      this.row.classList.toggle('nudge', TIDES.autoPick - o.t > 4);
    }
  }

  private deal(w: World, opts: TideOpt[], n: number): void {
    this.shownN = n;
    // `n` is the tide's number in the run; the title does not count them out loud.
    this.shownSec = -1;
    (this.panel.querySelector('.wgtitle') as HTMLElement).textContent = t('tide.title');
    this.row.innerHTML = '';
    opts.forEach((opt, i) => {
      // The clock takes the first card, so that one wears the clock.
      const card = el('button', `wgcard${i === 0 ? ' def' : ''}`, this.row);
      card.style.setProperty('--wc', PRESS_COLOR[opt.press]);
      card.style.animationDelay = `${i * 0.06}s`;
      if (i === 0) el('i', 'wgdef', card).innerHTML = CLOCK_ICON;
      el('span', 'wgico', card).innerHTML = GIFT_ICON[opt.gift];
      el('b', 'wgname', card, t(`tide.gift.${opt.gift}.name`));
      el('span', 'wgdoes', card, giftText(opt.gift, w));
      el('span', 'tdcost', card, pressText(opt.press));
      card.onclick = (e) => {
        e.stopPropagation();
        busy('wagon');
        this.world?.pickTide(i);
      };
    });
    this.fit();
  }

  /** A name's longest word on one line, as on a wagon card: German and Russian names run wide. */
  private fit(): void {
    this.shownSize = `${innerWidth}x${innerHeight}`;
    for (const n of this.row.querySelectorAll<HTMLElement>('.wgname')) {
      n.style.fontSize = '';
      let px = parseFloat(getComputedStyle(n).fontSize);
      while (n.scrollWidth > n.clientWidth && px > 10) n.style.fontSize = `${--px}px`;
    }
  }
}
