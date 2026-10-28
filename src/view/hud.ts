// DOM overlay: wave, wall and gold on top; summon, 强化, hero skill, speed and the sell bin
// at the bottom; the three-card pick while a 强化 is open; the result card when the wall falls.

import { FRUITS, HERO, HEROES } from '../sim/config';
import type { CardDef } from '../sim/cards';
import type { World } from '../sim/world';
import { t } from '../i18n';

export interface HudActions {
  summon(): void;
  upgrade(): void;
  choose(index: number): void;
  cast(): void;
  speed(): void;
  restart(): void;
  village(): void;
  /** Rewarded ads on the result card: one revive per run, double the crystals. */
  revive(): void;
  double(): void;
  mute(): void;
}

/** What the result card offers, filled in by main.ts from the save. */
export interface ResultInfo {
  crystals: number;
  doubled: boolean;
  canRevive: boolean;
  canDouble: boolean;
  /** Something waits to be claimed in the village. */
  claim: boolean;
  /** An ad is open: the ad buttons wait. */
  busy: boolean;
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
  private earn: HTMLElement;
  private reviveBtn: HTMLButtonElement;
  private doubleBtn: HTMLButtonElement;
  private villageBtn: HTMLButtonElement;
  private againBtn: HTMLButtonElement;
  private draftTitle: HTMLElement;
  private shownInfo = '';
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

    this.sellBin = el('div', 'sell', bottom);

    this.draft = el('div', 'draft hidden', root);
    this.draftTitle = el('div', 'dtitle', this.draft);
    const cards = el('div', 'dcards', this.draft);
    for (let i = 0; i < 3; i++) {
      const b = el('button', 'dcard', cards);
      b.onclick = () => act.choose(i);
      this.draftCards.push(b);
    }

    this.result = el('div', 'result hidden', root);
    const card = el('div', 'card', this.result);
    this.resultText = el('div', 'rtxt', card);
    this.earn = el('div', 'earn', card);
    const btns = el('div', 'rbtns', card);
    this.reviveBtn = el('button', 'ad', btns);
    this.reviveBtn.onclick = act.revive;
    this.doubleBtn = el('button', 'ad', btns);
    this.doubleBtn.onclick = act.double;
    this.againBtn = el('button', 'again', btns);
    this.againBtn.onclick = act.restart;
    this.villageBtn = el('button', 'again', btns);
    this.villageBtn.onclick = act.village;
    this.relabel();
  }

  /** Fixed labels in the current language; again after the player picks another one. */
  relabel(): void {
    this.sellBin.textContent = t('hud.sell');
    this.draftTitle.textContent = t('hud.draft');
    this.reviveBtn.textContent = `📺 ${t('hud.revive')}`;
    this.doubleBtn.textContent = `📺 ${t('hud.double')}`;
    this.againBtn.textContent = t('hud.again');
    this.villageBtn.textContent = t('hud.village');
    this.shownInfo = '';
    this.shownHand = null;
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

  /** Result card extras; touches the DOM only when something changed. */
  setResult(r: ResultInfo): void {
    const key = JSON.stringify(r);
    if (key === this.shownInfo) return;
    this.shownInfo = key;
    this.earn.textContent = t(r.doubled ? 'hud.earnedDouble' : 'hud.earned', { n: r.crystals });
    this.reviveBtn.style.display = r.canRevive ? '' : 'none';
    this.doubleBtn.style.display = r.canDouble ? '' : 'none';
    this.reviveBtn.disabled = this.doubleBtn.disabled = r.busy;
    this.villageBtn.textContent = r.claim ? `${t('hud.village')} 🔴` : t('hud.village');
  }

  setSellHot(hot: boolean, value: number): void {
    this.sellBin.classList.toggle('hot', hot);
    this.sellBin.textContent = hot ? t('hud.sellFor', { n: value }) : t('hud.sell');
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
      b.innerHTML = `<b>${c.title()}</b><span>${c.text(w)}</span>`;
    });
    for (let i = w.draft.length; i < this.draftCards.length; i++) this.draftCards[i].style.display = 'none';
  }

  update(w: World, dt: number): void {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.toast.classList.remove('show');
    // Before wave 1 arrives (world.wave 0) the top bar and the result card already say wave 1.
    const wave = Math.max(1, w.wave);
    this.wave.textContent = t('hud.wave', { n: wave });
    const frac = w.wallHp / w.wallMax;
    this.wallFill.style.width = `${(frac * 100).toFixed(1)}%`;
    this.wallFill.style.background = frac > 0.5 ? '#5fbf4a' : frac > 0.25 ? '#e0b030' : '#e04040';
    this.wallText.textContent = t('hud.wall', { hp: Math.ceil(w.wallHp), max: w.wallMax });
    this.gold.textContent = `🪙 ${Math.floor(w.gold)}`;

    const full = w.emptyCells().length === 0;
    this.summonBtn.textContent = full ? t('hud.full') : `${t('hud.summon')} 🪙${w.summonCost()}`;
    this.summonBtn.disabled = !w.canSummon();
    this.summonBtn.classList.toggle('pulse', w.summons < 2 && w.canSummon());

    const uc = w.upgradeCost();
    this.upgradeBtn.textContent = `${t('hud.upgrade')} 🪙${uc}`;
    this.upgradeBtn.disabled = !w.canUpgrade();
    this.showDraft(w);

    const hero = HEROES[w.heroKind];
    this.heroLbl.textContent = t(`hero.${w.heroKind}.skill`);
    const charge = w.hero.charge / HERO.chargeMax;
    this.heroFill.style.height = `${(w.hero.buffT > 0 ? w.hero.buffT / hero.time : charge) * 100}%`;
    this.heroBtn.classList.toggle('ready', w.heroReady());
    this.heroBtn.classList.toggle('active', w.hero.buffT > 0);

    if (w.over && this.result.classList.contains('hidden')) {
      this.resultText.innerHTML = `${t('hud.fallen')}<br><b>${t('hud.reached', { n: wave })}</b><br>${t('hud.stats', { min: (w.time / 60).toFixed(1), kills: w.kills })}`;
      this.result.classList.remove('hidden');
    } else if (!w.over) {
      this.result.classList.add('hidden');
    }
  }
}
