// DOM overlay: wave, wall and gold on top; summon, upgrades, hero skill, speed and the sell bin
// at the bottom; the result card when the wall falls.

import { FRUITS, HERO } from '../sim/config';
import type { World } from '../sim/world';
import type { FruitKind } from '../sim/types';

export interface HudActions {
  summon(): void;
  summonLevel(): void;
  power(kind: FruitKind): void;
  wall(): void;
  cast(): void;
  speed(): void;
  restart(): void;
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
  private levelBtn: HTMLButtonElement;
  private wallBtn: HTMLButtonElement;
  private powerBtns: { kind: FruitKind; btn: HTMLButtonElement }[] = [];
  private heroBtn: HTMLButtonElement;
  private heroFill: HTMLElement;
  private speedBtn: HTMLButtonElement;
  private result: HTMLElement;
  private resultText: HTMLElement;
  private toast: HTMLElement;
  private toastT = 0;

  constructor(root: HTMLElement, deck: FruitKind[], act: HudActions) {
    root.innerHTML = '';
    const top = el('div', 'top', root);
    this.wave = el('div', 'wave', top);
    const wallBox = el('div', 'wallbar', top);
    this.wallFill = el('div', 'fill', wallBox);
    this.wallText = el('div', 'txt', wallBox);
    this.gold = el('div', 'gold', top);
    this.speedBtn = el('button', 'speed', top, 'x1');
    this.speedBtn.onclick = act.speed;

    this.toast = el('div', 'toast', root);

    const bottom = el('div', 'bottom', root);
    const heroBox = el('div', 'herobox', bottom);
    this.heroBtn = el('button', 'hero', heroBox);
    this.heroFill = el('div', 'fill', this.heroBtn);
    el('span', 'lbl', this.heroBtn, '浇水');
    this.heroBtn.onclick = act.cast;

    const mid = el('div', 'mid', bottom);
    const ups = el('div', 'ups', mid);
    this.levelBtn = el('button', 'up', ups);
    this.levelBtn.onclick = act.summonLevel;
    for (const kind of deck) {
      const btn = el('button', 'up', ups);
      btn.style.borderColor = '#' + FRUITS[kind].color.toString(16).padStart(6, '0');
      btn.onclick = () => act.power(kind);
      this.powerBtns.push({ kind, btn });
    }
    this.wallBtn = el('button', 'up', ups);
    this.wallBtn.onclick = act.wall;
    this.summonBtn = el('button', 'summon', mid);
    this.summonBtn.onclick = act.summon;

    this.sellBin = el('div', 'sell', bottom, '拖到这里卖出');

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

  setSellHot(hot: boolean, value: number): void {
    this.sellBin.classList.toggle('hot', hot);
    this.sellBin.textContent = hot ? `卖出 +${value}` : '拖到这里卖出';
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

    const lv = w.summonLevelCost();
    this.levelBtn.innerHTML = lv === null ? `召唤等级<br>Lv${w.summonLevel} 满` : `召唤等级 Lv${w.summonLevel}<br>🪙${lv}`;
    this.levelBtn.disabled = lv === null || w.gold < lv;
    for (const { kind, btn } of this.powerBtns) {
      const cost = w.powerCost(kind);
      btn.innerHTML = `${FRUITS[kind].name} +${w.power[kind]}<br>🪙${cost}`;
      btn.disabled = w.gold < cost;
    }
    const wc = w.wallCost();
    this.wallBtn.innerHTML = `修墙 +100<br>🪙${wc}`;
    this.wallBtn.disabled = w.gold < wc;

    const charge = w.hero.charge / HERO.chargeMax;
    this.heroFill.style.height = `${(w.hero.buffT > 0 ? w.hero.buffT / HERO.buffTime : charge) * 100}%`;
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
