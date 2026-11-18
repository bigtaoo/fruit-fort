// The HUD's result card, up when the fence falls or a level is won: the head (outcome and wave), the
// crystals earned rolling up, the main button (next level or play again), the rewarded ads
// under it and the rest small. Split from hud.ts.

import type { World } from '../sim/world';
import { t } from '../i18n';
import { el } from './dom';
import { glyphs } from './icons';
import { resultHead, type ResultInfo } from './hudtext';
import { ResultTiles } from './resulttiles';
import type { HudActions } from './hud';

export class ResultCard {
  private result: HTMLElement;
  private resultText: HTMLElement;
  /** What the result card's head was written for (outcome and wave); '' while it is down. */
  private shownHead = '';
  readonly earn: HTMLElement;
  private earnDoubled = false;
  /** The crystal count rolls up to `earnTo`; `earnAt` is where it has got to. */
  private earnTo = 0;
  private earnAt = 0;
  private earnShown = -1;
  private reviveBtn: HTMLButtonElement;
  private doubleBtn: HTMLButtonElement;
  readonly villageBtn: HTMLButtonElement;
  readonly againBtn: HTMLButtonElement;
  readonly nextBtn: HTMLButtonElement;
  private mainRow: HTMLElement;
  private adRow: HTMLElement;
  private minorRow: HTMLElement;
  private shownInfo = '';
  readonly tiles: ResultTiles;
  /** The run's training bought on the card, for the main button's label; null for none. */
  private bought: ResultInfo['up'] = null;
  private upText = '';
  /** The head's "New best!" (ResultInfo.record). */
  private record = false;

  constructor(root: HTMLElement, act: HudActions) {
    this.result = el('div', 'result hidden', root);
    const card = el('div', 'card rcard', this.result);
    this.resultText = el('div', 'rtxt', card);
    this.earn = el('div', 'earn', card);
    const btns = el('div', 'rbtns', card);
    // One main button (next level or play again, §9.1); the ads under it; the rest small.
    this.mainRow = el('div', 'rrow', btns);
    this.nextBtn = el('button', 'again main', this.mainRow);
    this.nextBtn.onclick = act.next;
    const adRow = (this.adRow = el('div', 'rrow', btns));
    this.reviveBtn = el('button', 'ad', adRow);
    this.reviveBtn.onclick = act.revive;
    this.doubleBtn = el('button', 'ad', adRow);
    this.doubleBtn.onclick = act.double;
    this.tiles = new ResultTiles(card, btns, act.trainOn);
    this.minorRow = el('div', 'rrow', btns);
    this.againBtn = el('button', 'again', this.minorRow);
    this.againBtn.onclick = act.restart;
    this.villageBtn = el('button', 'minor', this.minorRow);
    this.villageBtn.onclick = act.village;
  }

  /** Whether the card is up. */
  get up(): boolean {
    return !this.result.classList.contains('hidden');
  }

  /** The ad buttons: what the ad is for, and under it what it gives, the crystals as a number. */
  private adLabels(): void {
    const two = (title: string, gain: string) => glyphs(`<span class="adt">📺 ${title}</span><span class="adg">${gain}</span>`);
    this.reviveBtn.innerHTML = two(t('hud.revive'), t('hud.reviveGain'));
    this.doubleBtn.innerHTML = two(t('hud.double'), `+💎${this.earnTo}`);
  }

  /** Fixed labels in the current language (Hud.relabel). */
  relabel(): void {
    this.adLabels();
    this.againBtn.textContent = t('hud.again');
    this.mainLabels();
    this.tiles.relabel();
    this.villageBtn.textContent = t('hud.village');
    this.shownInfo = '';
    this.earnShown = -1;
  }

  /** "Next level", or "Next level · Damage Lv2 ↑" once training was bought on the card (§2.2). */
  private mainLabels(): void {
    this.upText = this.bought ? ` · ${t('hud.trainUp', { stat: t(`stat.${this.bought.k}.name`), lv: this.bought.lv })}` : '';
    this.nextBtn.textContent = t('hud.next') + this.upText;
  }

  /** Result card extras; touches the DOM only when something changed. */
  set(r: ResultInfo): void {
    const key = JSON.stringify(r);
    if (key === this.shownInfo) return;
    this.shownInfo = key;
    this.earnTo = r.crystals;
    this.adLabels();
    this.earnDoubled = r.doubled;
    this.reviveBtn.style.display = r.canRevive ? '' : 'none';
    this.doubleBtn.style.display = r.canDouble ? '' : 'none';
    this.reviveBtn.disabled = this.doubleBtn.disabled = r.busy;
    this.adRow.style.display = r.canRevive || r.canDouble ? '' : 'none';
    this.tiles.set(r.tiles);
    this.bought = r.up;
    this.record = r.record;
    this.mainLabels();
    const next = r.won && r.hasNext;
    // A lost level used to have a main "Train" button to the village. Since runloop.md §2.4 the card
    // trains (its tiles) and the main button is "Play again · Damage Lv2 ↑": lose, train, play again,
    // in two taps.
    this.nextBtn.style.display = next ? '' : 'none';
    // Play again is the main button whenever next level is not: a loss, endless, the last level.
    const againMain = !next;
    this.againBtn.classList.toggle('main', againMain);
    this.againBtn.classList.toggle('minor', !againMain);
    if (againMain) this.mainRow.appendChild(this.againBtn);
    else this.minorRow.prepend(this.againBtn);
    this.againBtn.textContent = t(r.level && r.won ? 'hud.replay' : 'hud.again') + (againMain ? this.upText : '');
    this.villageBtn.textContent = r.claim ? `${t('hud.village')} 🔴` : t('hud.village');
  }

  /** Per frame: up while `over`, the head written and the crystals rolling up. */
  update(w: World, dt: number, over: boolean): void {
    // The card's head is written when it comes up, and again if the outcome changes under it (a
    // revive and a second fall can both land between two frames).
    const opening = over && this.result.classList.contains('hidden');
    const headKey = over ? `${w.won}|${w.wave}|${this.record}` : '';
    if (over && (opening || headKey !== this.shownHead)) {
      this.shownHead = headKey;
      this.resultText.innerHTML = resultHead(w, this.record);
    }
    if (opening) {
      this.result.classList.remove('hidden');
      this.earnAt = 0;
      this.earnShown = -1;
    } else if (!over) {
      this.shownHead = '';
      this.result.classList.add('hidden');
    }
    if (over) {
      // The crystals roll up in about a second (a doubling rolls on from where it was).
      if (this.earnAt < this.earnTo) this.earnAt = Math.min(this.earnTo, this.earnAt + Math.max(1, this.earnTo) * dt * 1.1);
      else this.earnAt = this.earnTo;
      const n = Math.floor(this.earnAt);
      if (n !== this.earnShown) {
        this.earnShown = n;
        this.earn.textContent = t(this.earnDoubled ? 'hud.earnedDouble' : 'hud.earned', { n });
        this.earn.classList.toggle('done', n === this.earnTo);
      }
    }
  }
}
