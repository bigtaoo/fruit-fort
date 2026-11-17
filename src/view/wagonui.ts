// Wagon picks on the HUD (§10.1, docs/design/wagons.md): a thin charge line under the shield bar
// that fills with kills, and, when it is full, the pick: 3 (or 4) cards in a strip along the top of
// the board while the fight goes on underneath (2026-11-17; it stood still before). Only the cards
// take taps: the board around them still turns the train and the dock still sells. A card names the
// wagon (or the supply), says new or Lv1 -> Lv2, and what it does in one line. Nobody waits forever:
// after WAGONS.autoPick seconds the card wearing the clock (`fallback()`) is taken.
// Texts: the `wagon` group of the i18n tables, all fifteen languages.

import { ECON, WAGONS } from '../sim/config';
import type { WagonOpt } from '../sim/types';
import type { World } from '../sim/world';
import { busy } from '../platform/busy';
import { t } from '../i18n';
import { el } from './dom';
import { CLOCK_ICON, WAGON_ICON } from './icons';
import { WAGON_COLOR } from './wagons';

type Kind = WagonOpt['kind'];
type WagonKind = Exclude<Kind, 'gold' | 'repair' | 'skill'>;

const SUPPLY_COLOR: Record<string, number> = { gold: 0xffc940, repair: 0x7dff9a, skill: 0xffe070 };

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * What a card promises. The repair card fills a level's fence and only part of an endless one
 * (§9.2), and in endless it is picked dozens of times a run, so it has to say which it is doing.
 */
export function cardText(opt: WagonOpt, gold: number, endless: boolean): string {
  if (opt.kind === 'repair' && endless) return t('wagon.repair.part', { p: Math.round(ECON.endlessCardRepair * 100) });
  if (opt.kind === 'gold' || opt.kind === 'repair' || opt.kind === 'skill') return t(`wagon.${opt.kind}.text`, { n: gold });
  return t(`wagon.${opt.kind as WagonKind}.l${opt.lv as 1 | 2 | 3}`);
}

export class WagonUi {
  private line: HTMLElement;
  private fill: HTMLElement;
  private panel: HTMLElement;
  private row: HTMLElement;
  private clock: HTMLElement;
  private clockText: HTMLElement;
  private shownFill = -1;
  /** Whether the charge line is shown; a run without wagons never touches its style again. */
  private shownLine: boolean | null = null;
  private shownN = 0;
  private shownSec = -1;
  /** The window size the names were fitted for: a rotation with the cards up fits them again. */
  private shownSize = '';
  private world: World | null = null;

  constructor(root: HTMLElement, wallBox: HTMLElement) {
    this.line = el('div', 'wgchg', wallBox);
    this.fill = el('i', '', this.line);
    this.panel = el('div', 'wgpick', root);
    const box = el('div', 'wgbox', this.panel);
    el('div', 'wgtitle outl', box);
    this.row = el('div', 'wgrow', box);
    this.clock = el('div', 'wgclock', box);
    this.clockText = el('div', 'wgauto', box);
  }

  update(w: World): void {
    this.world = w;
    const wg = w.wg;
    if (!!wg !== this.shownLine) {
      this.shownLine = !!wg;
      this.line.style.display = wg ? '' : 'none';
    }
    if (!wg) return void this.panel.classList.remove('show');
    // Full but locked (the first minute, or just after a pick): the line stays plain until a pick may open.
    const f = Math.round(wg.fill() * 100) + (wg.ready(w) ? 1000 : 0);
    if (f !== this.shownFill) {
      this.shownFill = f;
      this.fill.style.transform = `scaleX(${(f % 1000) / 100})`;
      this.line.classList.toggle('full', f >= 1100);
    }
    const o = wg.offer;
    this.panel.classList.toggle('show', !!o);
    if (!o) return void (this.shownN = 0);
    if (o.n !== this.shownN) this.deal(w, o.opts, o.n, o.def);
    else if (`${innerWidth}x${innerHeight}` !== this.shownSize) this.fit();
    // Clamped at both ends: a pick dealt with more than autoPick on its clock (a basket's, queued
    // behind another) would otherwise draw a bar wider than its track.
    this.clock.style.transform = `scaleX(${Math.min(1, Math.max(0, o.t / WAGONS.autoPick))})`;
    const sec = Math.ceil(o.t);
    if (sec !== this.shownSec) {
      this.shownSec = sec;
      this.clockText.textContent = t('wagon.auto', { n: sec });
      // Nothing tapped after 4 s: the cards bounce to say they are waiting for a tap.
      this.row.classList.toggle('nudge', WAGONS.autoPick - o.t > 4);
    }
  }

  private deal(w: World, opts: WagonOpt[], n: number, def: number): void {
    this.shownN = n;
    this.shownSec = -1;
    (this.panel.querySelector('.wgtitle') as HTMLElement).textContent = t('wagon.title');
    this.row.innerHTML = '';
    opts.forEach((opt, i) => {
      const supply = opt.kind === 'gold' || opt.kind === 'repair' || opt.kind === 'skill';
      const color = supply ? SUPPLY_COLOR[opt.kind] : WAGON_COLOR[opt.kind as keyof typeof WAGON_COLOR];
      // The card the clock will take wears a small clock.
      const card = el('button', `wgcard${supply ? ' supply' : ''}${i === def ? ' def' : ''}`, this.row);
      card.style.setProperty('--wc', hex(color));
      card.style.animationDelay = `${i * 0.06}s`;
      if (i === def) el('i', 'wgdef', card).innerHTML = CLOCK_ICON;
      el('span', 'wgico', card).innerHTML = WAGON_ICON[opt.kind];
      el('b', 'wgname', card, t(`wagon.${opt.kind}.name`));
      const tag = supply ? '' : opt.lv === 1 ? t('wagon.fresh') : `Lv${opt.lv - 1} → ${opt.lv === WAGONS.maxLv ? t('hud.max') : `Lv${opt.lv}`}`;
      // New is gold; a level up wears the wagon's colour, and the last level says so.
      el('span', supply ? 'wgtag' : opt.lv === 1 ? 'wgtag fresh' : opt.lv === WAGONS.maxLv ? 'wgtag up max' : 'wgtag up', card, tag);
      const gold = Math.round(WAGONS.supplyGold * w.statCost('dmg'));
      const does = cardText(opt, gold, !w.level);
      el('span', 'wgdoes', card, does);
      card.onclick = (e) => {
        e.stopPropagation();
        // A wagon's shot makes its programs at the first one fired, seconds after this.
        busy('wagon');
        this.world?.pickWagon(i);
      };
    });
    this.fit();
  }

  /**
   * A name's longest word on one line: German, Russian or Polish names are wider than a card in the
   * four-card landscape row, so the name's font steps down until it fits instead of breaking mid-word.
   */
  private fit(): void {
    this.shownSize = `${innerWidth}x${innerHeight}`;
    for (const n of this.row.querySelectorAll<HTMLElement>('.wgname')) {
      n.style.fontSize = '';
      let px = parseFloat(getComputedStyle(n).fontSize);
      while (n.scrollWidth > n.clientWidth && px > 10) n.style.fontSize = `${--px}px`;
    }
  }
}
