// The HUD's result card, up when the fence falls or a level is won: the head (outcome and wave), the
// crystals earned rolling up, the main button (next level, go train or play again), the rewarded ads
// under it and the rest small. Split from hud.ts.

import type { World } from '../sim/world';
import { t } from '../i18n';
import { el } from './dom';
import { glyphs } from './icons';
import { resultHead, type ResultInfo } from './hudtext';
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
  private againBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  readonly trainBtn: HTMLButtonElement;
  private mainRow: HTMLElement;
  private adRow: HTMLElement;
  private minorRow: HTMLElement;
  private shownInfo = '';

  constructor(root: HTMLElement, act: HudActions) {
    this.result = el('div', 'result hidden', root);
    const card = el('div', 'card rcard', this.result);
    this.resultText = el('div', 'rtxt', card);
    this.earn = el('div', 'earn', card);
    const btns = el('div', 'rbtns', card);
    // One main button (next level, go train or play again, §9.1); the ads under it; the rest small.
    this.mainRow = el('div', 'rrow', btns);
    this.nextBtn = el('button', 'again main', this.mainRow);
    this.nextBtn.onclick = act.next;
    this.trainBtn = el('button', 'again main', this.mainRow);
    this.trainBtn.onclick = act.train;
    const adRow = (this.adRow = el('div', 'rrow', btns));
    this.reviveBtn = el('button', 'ad', adRow);
    this.reviveBtn.onclick = act.revive;
    this.doubleBtn = el('button', 'ad', adRow);
    this.doubleBtn.onclick = act.double;
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
    this.nextBtn.textContent = t('hud.next');
    this.trainBtn.textContent = t('hud.train');
    this.villageBtn.textContent = t('hud.village');
    this.shownInfo = '';
    this.earnShown = -1;
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
    const next = r.won && r.hasNext;
    const train = r.level && !r.won;
    this.nextBtn.style.display = next ? '' : 'none';
    this.trainBtn.style.display = train ? '' : 'none';
    // Play again is the main button only when neither of the others is up.
    const againMain = !next && !train;
    this.againBtn.classList.toggle('main', againMain);
    this.againBtn.classList.toggle('minor', !againMain);
    if (againMain) this.mainRow.appendChild(this.againBtn);
    else this.minorRow.prepend(this.againBtn);
    this.againBtn.textContent = t(r.level ? 'hud.replay' : 'hud.again');
    this.villageBtn.textContent = r.claim ? `${t('hud.village')} 🔴` : t('hud.village');
  }

  /** Per frame: up while `over`, the head written and the crystals rolling up. */
  update(w: World, dt: number, over: boolean): void {
    // The card's head is written when it comes up, and again if the outcome changes under it (a
    // revive and a second fall can both land between two frames).
    const opening = over && this.result.classList.contains('hidden');
    const headKey = over ? `${w.won}|${w.wave}` : '';
    if (over && (opening || headKey !== this.shownHead)) {
      this.shownHead = headKey;
      this.resultText.innerHTML = resultHead(w);
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
