// The milestone card on the HUD (§9.6, docs/design/battle.md): on the wave after a boss wave the
// card strip carries two cards instead of three - go on, or leave the run here with the crystals it
// has earned. The fight goes on underneath, as it does for a wagon pick and a tide, and after
// MILES.auto seconds the clock takes "go on" (never the way out, which is the point of the clock
// wearing that card).
//
// Its own class and its own panel rather than a mode of TideUi: a tide is three bargains with two
// halves each, and this is one question with two answers, one of which ends the run.
//
// Texts: the `mile` group of the i18n tables, all fifteen languages.

import { MILES } from '../sim/config';
import { crystalsFor } from '../meta/progress';
import type { World } from '../sim/world';
import { busy } from '../platform/busy';
import { t } from '../i18n';
import { el } from './dom';
import { CLOCK_ICON, VILLAGE_ICON, WAVE_ICON, paintGlyphs } from './icons';

export class MileUi {
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
    this.panel = el('div', 'wgpick mile', root);
    const box = el('div', 'wgbox', this.panel);
    el('div', 'wgtitle outl', box);
    this.row = el('div', 'wgrow', box);
    this.clock = el('div', 'wgclock', box);
    this.clockText = el('div', 'wgauto', box);
  }

  update(w: World): void {
    this.world = w;
    const o = w.miles?.offer;
    this.panel.classList.toggle('show', !!o);
    if (!o) return void (this.shownN = 0);
    if (o.n !== this.shownN) this.deal(w, o.n);
    else if (`${innerWidth}x${innerHeight}` !== this.shownSize) this.fit();
    this.clock.style.transform = `scaleX(${Math.min(1, Math.max(0, o.t / MILES.auto))})`;
    const sec = Math.ceil(o.t);
    if (sec !== this.shownSec) {
      this.shownSec = sec;
      this.clockText.textContent = t('wagon.auto', { n: sec });
      // Nothing tapped after 4 s: the cards bounce to say they are waiting for a tap.
      this.row.classList.toggle('nudge', MILES.auto - o.t > 4);
    }
  }

  private deal(w: World, n: number): void {
    this.shownN = n;
    this.shownSec = -1;
    // The wave the run books at if it stops here - the same wave the result card will show.
    const wave = w.wave;
    (this.panel.querySelector('.wgtitle') as HTMLElement).textContent = t('mile.title', { n: wave });
    this.row.innerHTML = '';
    // The pay shown is the plain one for the wave reached: a player's very first run carries a bonus
    // on top (FIRST_RUN_BONUS), and a card that promised less than it paid is the right way round.
    const pay = crystalsFor(w.wave);
    const next = w.miles?.offer?.next ?? 'on';
    this.card(0, '#5ad8ff', WAVE_ICON, t('mile.go.name'), t(`mile.next.${next}`), () => this.world?.mileGo());
    this.card(1, '#ffc940', VILLAGE_ICON, t('mile.stop.name'), t('mile.stop.text', { n: wave, c: `💎${pay}` }), () => this.world?.mileStop());
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

  /** One card. The first wears the clock, because the clock takes the first card. */
  private card(i: number, color: string, icon: string, name: string, does: string, go: () => void): void {
    const card = el('button', `wgcard${i === 0 ? ' def' : ''}`, this.row);
    card.style.setProperty('--wc', color);
    card.style.animationDelay = `${i * 0.06}s`;
    if (i === 0) el('i', 'wgdef', card).innerHTML = CLOCK_ICON;
    el('span', 'wgico', card).innerHTML = icon;
    el('b', 'wgname', card, name);
    paintGlyphs(el('span', 'wgdoes', card, does));
    card.onclick = (e) => {
      e.stopPropagation();
      busy('wagon');
      go();
    };
  }
}
