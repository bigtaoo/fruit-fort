// DOM overlay: wave, wall and gold on top; the eight stat buttons in a dock (under the board in
// portrait, beside it in landscape); the hero skill in the board's lower left corner; the result
// card when the wall falls or a level is won.

import { HERO, HEROES, STAT_KEYS } from '../sim/config';
import type { World } from '../sim/world';
import { t } from '../i18n';
import type { HeroKind, StatKey } from '../sim/types';
import type { Rect } from './scene';
import { HERO_ICON, SOUND_OFF, SOUND_ON, STAT_ICON, glyphs, paintGlyphs } from './icons';

interface StatButton {
  btn: HTMLButtonElement;
  shown: string;
}

export interface HudActions {
  buy(stat: StatKey): void;
  cast(): void;
  speed(): void;
  restart(): void;
  village(): void;
  /** After a won level: the next one. After a lost one: the training tab (§9.1). */
  next(): void;
  train(): void;
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
  /** A level run (not endless), whether it was won, and whether a level is left to go on to. */
  level: boolean;
  won: boolean;
  hasNext: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
}

export class Hud {
  private wave: HTMLElement;
  private wallFill: HTMLElement;
  private wallText: HTMLElement;
  private gold: HTMLElement;
  private stats = {} as Record<StatKey, StatButton>;
  private heroBtn: HTMLButtonElement;
  private heroFill: HTMLElement;
  private heroLbl: HTMLElement;
  private heroIco: HTMLElement;
  private shownHero: HeroKind | null = null;
  private speedBtn: HTMLButtonElement;
  private result: HTMLElement;
  private resultText: HTMLElement;
  private earn: HTMLElement;
  private reviveBtn: HTMLButtonElement;
  private doubleBtn: HTMLButtonElement;
  private villageBtn: HTMLButtonElement;
  private againBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private trainBtn: HTMLButtonElement;
  private shownInfo = '';
  private toast: HTMLElement;
  private toastT = 0;
  private hint: HTMLElement;
  private muteBtn: HTMLButtonElement;
  /** Labels whose emoji become inline SVG glyphs after each text change. */
  private glyphed: HTMLElement[];
  private root: HTMLElement;
  private top: HTMLElement;
  private dock: HTMLElement;

  constructor(root: HTMLElement, act: HudActions) {
    root.innerHTML = '';
    this.root = root;
    const top = (this.top = el('div', 'top', root));
    this.wave = el('div', 'wave', top);
    const wallBox = el('div', 'wallbar', top);
    this.wallFill = el('div', 'fill', wallBox);
    this.wallText = el('div', 'txt', wallBox);
    this.gold = el('div', 'gold', top);
    this.speedBtn = el('button', 'speed', top, 'x1');
    this.speedBtn.onclick = act.speed;
    this.muteBtn = el('button', 'mute', top);
    this.muteBtn.onclick = act.mute;
    this.setMuted(false);

    this.toast = el('div', 'toast', root);

    this.hint = el('div', 'hint', root);

    this.dock = el('div', 'dock', root);
    const heroBox = el('div', 'herobox', root);
    this.heroBtn = el('button', 'hero', heroBox);
    this.heroFill = el('div', 'fill', this.heroBtn);
    this.heroIco = el('span', 'hico', this.heroBtn);
    this.heroLbl = el('span', 'lbl', this.heroBtn, '');
    this.heroBtn.onclick = act.cast;

    const panel = el('div', 'stats', this.dock);
    for (const k of STAT_KEYS) {
      const btn = el('button', 'stat', panel);
      btn.onclick = () => act.buy(k);
      this.stats[k] = { btn, shown: '' };
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
    // The first shown of next / train / again is the card's main button (§9.1).
    this.nextBtn = el('button', 'again', btns);
    this.nextBtn.onclick = act.next;
    this.trainBtn = el('button', 'again', btns);
    this.trainBtn.onclick = act.train;
    this.againBtn = el('button', 'again', btns);
    this.againBtn.onclick = act.restart;
    this.villageBtn = el('button', 'again', btns);
    this.villageBtn.onclick = act.village;
    this.glyphed = [this.gold, this.earn, this.reviveBtn, this.doubleBtn, this.villageBtn];
    this.relabel();
  }

  /**
   * The playfield's rectangle: below the top bar and clear of the stat dock, which sits under it
   * in portrait and beside it in landscape (the stylesheet decides). Also handed to the stylesheet
   * as --bx/--by/--bw/--bh so the skill button, hint and toast follow the board.
   */
  board(): Rect {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const y = this.top.getBoundingClientRect().bottom + 6;
    const d = this.dock.getBoundingClientRect();
    // The dock sits down the right side in landscape (in its bottom corner) and along the bottom in portrait.
    const side = d.width > 0 && d.left > w / 3;
    const r = { x: 0, y, w: side ? d.left - 6 : w, h: (side ? h : d.top - 6) - y };
    for (const [k, v] of [['--bx', r.x], ['--by', r.y], ['--bw', r.w], ['--bh', r.h]] as const) this.root.style.setProperty(k, `${v}px`);
    return r;
  }

  /** Call back whenever the top bar or the dock changes size (fonts landing, cards filling in, the orientation turning). */
  onLayout(cb: () => void): void {
    const ro = new ResizeObserver(cb);
    ro.observe(this.top);
    ro.observe(this.dock);
  }

  /** Fixed labels in the current language; again after the player picks another one. */
  relabel(): void {
    this.reviveBtn.textContent = `📺 ${t('hud.revive')}`;
    this.doubleBtn.textContent = `📺 ${t('hud.double')}`;
    this.againBtn.textContent = t('hud.again');
    this.nextBtn.textContent = t('hud.next');
    this.trainBtn.textContent = t('hud.train');
    this.villageBtn.textContent = t('hud.village');
    this.shownInfo = '';
    for (const k of STAT_KEYS) this.stats[k].shown = '';
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
    this.muteBtn.innerHTML = muted ? SOUND_OFF : SOUND_ON;
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
    this.nextBtn.style.display = r.won && r.hasNext ? '' : 'none';
    this.trainBtn.style.display = r.level && !r.won ? '' : 'none';
    this.againBtn.textContent = t(r.level ? 'hud.replay' : 'hud.again');
    this.villageBtn.textContent = r.claim ? `${t('hud.village')} 🔴` : t('hud.village');
  }

  update(w: World, dt: number): void {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.toast.classList.remove('show');
    // Before wave 1 arrives (world.wave 0) the top bar and the result card already say wave 1.
    const wave = Math.max(1, w.wave);
    const of = w.level?.waves;
    this.wave.textContent = of ? t('hud.waveOf', { n: wave, of }) : t('hud.wave', { n: wave });
    const frac = w.wallHp / w.wallMax;
    this.wallFill.style.width = `${(frac * 100).toFixed(1)}%`;
    this.wallFill.style.background = frac > 0.5 ? '#5fbf4a' : frac > 0.25 ? '#e0b030' : '#e04040';
    this.wallText.textContent = t('hud.wall', { hp: Math.ceil(w.wallHp), max: w.wallMax });
    this.gold.textContent = `🪙 ${Math.floor(w.gold)}`;

    this.showStats(w);

    const hero = HEROES[w.heroKind];
    this.heroLbl.textContent = t(`hero.${w.heroKind}.skill`);
    const charge = w.hero.charge / HERO.chargeMax;
    this.heroFill.style.height = `${(w.hero.buffT > 0 ? w.hero.buffT / hero.time : charge) * 100}%`;
    this.heroBtn.classList.toggle('ready', w.heroReady());
    this.heroBtn.classList.toggle('active', w.hero.buffT > 0);

    if (w.over && this.result.classList.contains('hidden')) {
      const stars = w.stars();
      const head = w.won
        ? `${t('hud.cleared')}<br><b class="stars">${'★'.repeat(stars)}<s>${'★'.repeat(3 - stars)}</s></b>`
        : `${t('hud.fallen')}<br><b>${of ? t('hud.reachedOf', { n: wave, of }) : t('hud.reached', { n: wave })}</b>`;
      this.resultText.innerHTML = `${head}<br>${t('hud.stats', { min: (w.time / 60).toFixed(1), kills: w.kills })}`;
      this.result.classList.remove('hidden');
    } else if (!w.over) {
      this.result.classList.add('hidden');
    }

    if (this.shownHero !== w.heroKind) {
      this.shownHero = w.heroKind;
      this.heroIco.innerHTML = HERO_ICON[w.heroKind];
    }
    for (const e of this.glyphed) paintGlyphs(e);
  }

  /** Each stat button: icon, name and level, what a level gives, and the price (or 满级). Touches the DOM only on change. */
  private showStats(w: World): void {
    for (const k of STAT_KEYS) {
      const b = this.stats[k];
      const maxed = w.maxed(k);
      const cost = w.statCost(k);
      const key = `${w.lv[k]}:${maxed ? -1 : cost}`;
      if (key !== b.shown) {
        b.shown = key;
        const price = maxed ? t('hud.max') : glyphs(`🪙${cost}`);
        b.btn.innerHTML = `<i>${STAT_ICON[k]}</i><b>${t(`stat.${k}.name`)} <em>${w.lv[k]}</em></b><small>${t(`stat.${k}.text`)}</small><span>${price}</span>`;
      }
      b.btn.disabled = !w.canBuy(k);
      // Before the first buy, the cheapest stat in reach pulses to show where the gold goes.
      b.btn.classList.toggle('pulse', w.buys === 0 && w.canBuy(k) && k === 'dmg');
    }
  }
}
