// DOM overlay: wave, wall and gold on top; summon, 强化, hero skill, speed and the sell bin
// at the bottom; the three-card pick while a 强化 is open; the result card when the wall falls.

import { FRUITS, HERO, HEROES } from '../sim/config';
import type { CardDef } from '../sim/cards';
import type { World } from '../sim/world';

export interface HudActions {
  summon(): void;
  upgrade(): void;
  choose(index: number): void;
  cast(): void;
  speed(): void;
  restart(): void;
  mute(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
}

export class Hud {
  readonly sellBin: HTMLElement;
  private wave: HTMLElement;
  private wallFill: HTMLElement;
  private wallText: HTMLElement;
  private gold: HTMLElement;
  private summonBtn: HTMLButtonElement;
  private upgradeBtn: HTMLButtonElement;
  private draft: HTMLElement;
  private draftCards: HTMLButtonElement[] = [];
  private shownHand: CardDef[] | null = null;
  private heroBtn: HTMLButtonElement;
  private heroFill: HTMLElement;
  private heroLbl: HTMLElement;
  private speedBtn: HTMLButtonElement;
  private result: HTMLElement;
  private resultText: HTMLElement;
  private toast: HTMLElement;
  private toastT = 0;
  private hint: HTMLElement;
  private muteBtn: HTMLButtonElement;

  constructor(root: HTMLElement, act: HudActions) {
    root.innerHTML = '';
    const top = el('div', 'top', root);
    this.wave = el('div', 'wave', top);
    const wallBox = el('div', 'wallbar', top);
    this.wallFill = el('div', 'fill', wallBox);
    this.wallText = el('div', 'txt', wallBox);
    this.gold = el('div', 'gold', top);
    this.speedBtn = el('button', 'speed', top, 'x1');
    this.speedBtn.onclick = act.speed;
    this.muteBtn = el('button', 'mute', top, '🔊');
    this.muteBtn.onclick = act.mute;

    this.toast = el('div', 'toast', root);

    this.hint = el('div', 'hint', root);

    const bottom = el('div', 'bottom', root);
    const heroBox = el('div', 'herobox', bottom);
    this.heroBtn = el('button', 'hero', heroBox);
    this.heroFill = el('div', 'fill', this.heroBtn);
    this.heroLbl = el('span', 'lbl', this.heroBtn, '');
    this.heroBtn.onclick = act.cast;

    const mid = el('div', 'mid', bottom);
    const row = el('div', 'actions', mid);
    this.summonBtn = el('button', 'summon', row);
    this.summonBtn.onclick = act.summon;
    this.upgradeBtn = el('button', 'upgrade', row);
    this.upgradeBtn.onclick = act.upgrade;

    this.sellBin = el('div', 'sell', bottom, '拖到这里卖出');

    this.draft = el('div', 'draft hidden', root);
    el('div', 'dtitle', this.draft, '强化：选一张');
    const cards = el('div', 'dcards', this.draft);
    for (let i = 0; i < 3; i++) {
      const b = el('button', 'dcard', cards);
      b.onclick = () => act.choose(i);
      this.draftCards.push(b);
    }

    this.result = el('div', 'result hidden', root);
    const card = el('div', 'card', this.result);
    this.resultText = el('div', 'rtxt', card);
    const again = el('button', 'again', card, '再来一局');
    again.onclick = act.restart;
  }

  flash(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this.toastT = 1.6;
  }

  setSpeed(mul: number): void {
    this.speedBtn.textContent = 'x' + mul;
  }

  setMuted(muted: boolean): void {
    this.muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  /** The first-minute guide line above the buttons; null hides it. Never blocks input. */
  setHint(text: string | null): void {
    if (text) this.hint.textContent = text;
    this.hint.classList.toggle('show', !!text);
  }

  setSellHot(hot: boolean, value: number): void {
    this.sellBin.classList.toggle('hot', hot);
    this.sellBin.textContent = hot ? `卖出 +${value}` : '拖到这里卖出';
  }

  /** Fill the card overlay when a new hand is dealt; hide it once a card is chosen. */
  private showDraft(w: World): void {
    if (w.draft === this.shownHand) return;
    this.shownHand = w.draft;
    this.draft.classList.toggle('hidden', !w.draft);
    if (!w.draft) return;
    w.draft.forEach((c, i) => {
      const b = this.draftCards[i];
      b.style.display = '';
      b.style.borderColor = c.kind ? '#' + FRUITS[c.kind].color.toString(16).padStart(6, '0') : '#ffe066';
      b.innerHTML = `<b>${c.title}</b><span>${c.text(w)}</span>`;
    });
    for (let i = w.draft.length; i < this.draftCards.length; i++) this.draftCards[i].style.display = 'none';
  }

  update(w: World, dt: number): void {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.toast.classList.remove('show');
    this.wave.textContent = `第 ${w.wave} 波`;
    const frac = w.wallHp / w.wallMax;
    this.wallFill.style.width = `${(frac * 100).toFixed(1)}%`;
    this.wallFill.style.background = frac > 0.5 ? '#5fbf4a' : frac > 0.25 ? '#e0b030' : '#e04040';
    this.wallText.textContent = `城墙 ${Math.ceil(w.wallHp)} / ${w.wallMax}`;
    this.gold.textContent = `🪙 ${Math.floor(w.gold)}`;

    const full = w.emptyCells().length === 0;
    this.summonBtn.textContent = full ? '格子满了' : `召唤 🪙${w.summonCost()}`;
    this.summonBtn.disabled = !w.canSummon();
    this.summonBtn.classList.toggle('pulse', w.summons < 2 && w.canSummon());

    const uc = w.upgradeCost();
    this.upgradeBtn.innerHTML = `强化 🪙${uc}`;
    this.upgradeBtn.disabled = !w.canUpgrade();
    this.showDraft(w);

    const hero = HEROES[w.heroKind];
    this.heroLbl.textContent = hero.skill;
    const charge = w.hero.charge / HERO.chargeMax;
    this.heroFill.style.height = `${(w.hero.buffT > 0 ? w.hero.buffT / hero.time : charge) * 100}%`;
    this.heroBtn.classList.toggle('ready', w.heroReady());
    this.heroBtn.classList.toggle('active', w.hero.buffT > 0);

    if (w.over && this.result.classList.contains('hidden')) {
      this.resultText.innerHTML = `城墙被攻破了<br><b>坚持到第 ${w.wave} 波</b><br>用时 ${(w.time / 60).toFixed(1)} 分钟，消灭 ${w.kills} 只害虫`;
      this.result.classList.remove('hidden');
    } else if (!w.over) {
      this.result.classList.add('hidden');
    }
  }
}
