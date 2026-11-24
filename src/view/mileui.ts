// The milestone card on the HUD (§9.6, docs/design/battle.md): on the wave after a boss wave the
// card strip carries two cards instead of three - go on, or leave the run here with the crystals it
// has earned. The fight goes on underneath, as it does for a wagon pick and a tide, and after
// MILES.auto seconds the clock takes "go on" (never the way out, which is the point of the clock
// wearing that card).
//
// 收手那张卡有两面（2026-11-23）：第一下只把卡翻过来问「真的收手？」，第二下才真的结束这一局。
// 一张一点就结束整局的卡，和马车、潮汐的奖励卡共用同一条卡条、同一张卡面、同一个点头动画，而玩家
// 的手在那条卡条上已经盲点过几十次 —— 一位玩家就这么点掉了一整局，还以为无尽打完 20 波从第 1 波
// 重来了。所以静面上挂一枚「结束本局」的牌子，翻面之后换红边、不再点头；两面之间隔着 ARM.lock，
// 习惯性的连点只翻得动第一面，ARM.hold 之后自己翻回去，免得那张卡一直停在一点就完的状态上。
//
// Its own class and its own panel rather than a mode of TideUi: a tide is three bargains with two
// halves each, and this is one question with two answers, one of which ends the run.
//
// Texts: the `mile` group of the i18n tables, all fifteen languages.

import { MILES } from '../sim/cards';
import { crystalsFor } from '../meta/progress';
import type { World } from '../sim/world';
import { busy } from '../platform/busy';
import { t } from '../i18n';
import { el } from './dom';
import { CLOCK_ICON, VILLAGE_ICON, WAVE_ICON, paintGlyphs } from './icons';

/** 翻面之后的两道闸，按卡条那只时钟的秒数算：lock 之内的第二下不算，hold 之后翻回静面。 */
export const ARM = { lock: 0.45, hold: 3 };

/** 收手那张卡被点一下是什么意思，`armedAt` 是翻面那一刻的时钟读数（-1 是还在静面）。 */
export function stopTap(armedAt: number, now: number): 'arm' | 'wait' | 'stop' {
  if (armedAt < 0) return 'arm';
  return armedAt - now < ARM.lock ? 'wait' : 'stop';
}

export class MileUi {
  private panel: HTMLElement;
  private row: HTMLElement;
  private clock: HTMLElement;
  private clockText: HTMLElement;
  private shownN = 0;
  private shownSec = -1;
  /** The window size the names were fitted for: a rotation with the cards up fits them again. */
  private shownSize = '';
  /** The wave and the pay the cards were dealt for; the other face says them again. */
  private shownWave = 0;
  private shownPay = 0;
  /** The way-out card, which is the one with two faces. */
  private stopCard: HTMLElement | null = null;
  /** The clock reading when it was turned over; -1 while it rests on its plain face. */
  private armedAt = -1;
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
    if (!o) {
      this.shownN = 0;
      this.armedAt = -1;
      return;
    }
    if (o.n !== this.shownN) this.deal(w, o.n);
    else if (`${innerWidth}x${innerHeight}` !== this.shownSize) this.fit();
    // Turned over and left alone: back to the plain face, so the way out is never a single tap for long.
    if (this.armedAt >= 0 && this.armedAt - o.t > ARM.hold) this.face(false);
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
    this.armedAt = -1;
    // The wave the run books at if it stops here - the same wave the result card will show.
    this.shownWave = w.wave;
    // The pay shown is the plain one for the wave reached: a player's very first run carries a bonus
    // on top (FIRST_RUN_BONUS), and a card that promised less than it paid is the right way round.
    this.shownPay = crystalsFor(w.wave);
    (this.panel.querySelector('.wgtitle') as HTMLElement).textContent = t('mile.title', { n: this.shownWave });
    this.row.innerHTML = '';
    const next = w.miles?.offer?.next ?? 'on';
    this.card(0, '#5ad8ff', WAVE_ICON, t('mile.go.name'), '', t(`mile.next.${next}`), () => {
      busy('wagon');
      this.world?.mileGo();
    });
    this.stopCard = this.card(1, '#ffc940', VILLAGE_ICON, t('mile.stop.name'), t('mile.stop.tag'), this.stopText(false), () => this.tap());
    this.face(false);
  }

  /** What the way-out card says it does, on the face it is showing. */
  private stopText(armed: boolean): string {
    return t(armed ? 'mile.sure.text' : 'mile.stop.text', { n: this.shownWave, c: `💎${this.shownPay}` });
  }

  /** Turn the way-out card over: its plain face asks, the other one takes the answer. */
  private face(armed: boolean): void {
    const card = this.stopCard;
    if (!card) return;
    this.armedAt = armed ? (this.world?.miles?.offer?.t ?? 0) : -1;
    card.classList.toggle('arm', armed);
    (card.querySelector('.wgname') as HTMLElement).textContent = t(armed ? 'mile.sure.name' : 'mile.stop.name');
    (card.querySelector('.wgtag') as HTMLElement).textContent = t(armed ? 'mile.sure.tag' : 'mile.stop.tag');
    const does = card.querySelector('.wgdoes') as HTMLElement;
    // Writing the text drops the glyph images the last paint left behind, so this one paints again.
    does.textContent = this.stopText(armed);
    paintGlyphs(does);
    this.fit();
  }

  /** A tap on the way-out card: `stopTap` says whether it turns the card, counts for nothing, or ends the run. */
  private tap(): void {
    const o = this.world?.miles?.offer;
    if (!o) return;
    const what = stopTap(this.armedAt, o.t);
    if (what === 'wait') return;
    if (what === 'arm') {
      this.face(true);
      return;
    }
    busy('wagon');
    this.world?.mileStop();
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
  private card(i: number, color: string, icon: string, name: string, tag: string, does: string, go: () => void): HTMLElement {
    const card = el('button', `wgcard${i === 0 ? ' def' : ''}`, this.row);
    card.style.setProperty('--wc', color);
    card.style.animationDelay = `${i * 0.06}s`;
    if (i === 0) el('i', 'wgdef', card).innerHTML = CLOCK_ICON;
    el('span', 'wgico', card).innerHTML = icon;
    el('b', 'wgname', card, name);
    el('span', 'wgtag', card, tag);
    paintGlyphs(el('span', 'wgdoes', card, does));
    card.onclick = (e) => {
      e.stopPropagation();
      go();
    };
    return card;
  }
}
