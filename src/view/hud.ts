// DOM overlay (§3.4, HUD layout 2026-10-31). Top left, the danger group: a wave badge with one pip
// per wave and the fence bar, which flashes red when bitten and reddens the screen edges below a
// quarter. Top right, the control group: speed and pause (the pause menu holds resume, sound and
// the way back to the toy box). The stat dock (under the board in portrait, beside it in
// landscape) carries the gold purse on top and the eight stat cards, coloured by category and
// lit by whether they can be bought. The hero skill sits in the board's lower left corner with a
// charge ring. The result card comes up when the fence falls or a level is won.

import { HERO, HEROES, STAT_KEYS } from '../sim/config';
import type { World } from '../sim/world';
import { t } from '../i18n';
import type { HeroKind, StatKey } from '../sim/types';
import type { Rect } from './scene';
import { HERO_ICON, LEVEL_ICON, SOUND_OFF, SOUND_ON, STAT_ICON, glyphs, paintGlyphs } from './icons';

interface StatButton {
  btn: HTMLButtonElement;
  shown: string;
  /** The level last drawn; a rise pops a "+1" on the card. -1 until first drawn. */
  lv: number;
  bar: HTMLElement | null;
  /** A long press showed the blurb: the click that ends it does not buy. */
  held: boolean;
}

export interface HudActions {
  buy(stat: StatKey): void;
  cast(): void;
  speed(): void;
  /** The pause menu opened (true) or closed (false): the sim waits while it is up. */
  pause(on: boolean): void;
  /** From the pause menu: leave the run unfinished for the toy box. */
  quit(): void;
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

/** Card colour family per stat: offence red, the train orange, economy yellow, defence green. */
const CATEGORY: Record<StatKey, string> = {
  dmg: 'off', spd: 'off', crit: 'off', multi: 'off', range: 'trn', move: 'trn', gold: 'eco', wall: 'def',
};
/** Short of the price by no more than this share, a card counts as almost affordable and shows its progress. */
const ALMOST = 0.5;

const INK = 'stroke="#2b1d14" stroke-width="3" stroke-linejoin="round"';
const FENCE_ICON = `<svg class="ic" viewBox="0 0 64 64" aria-hidden="true" ${INK}><path d="M4 22h56v8H4zM4 40h56v8H4z" fill="#c98a4b"/>`
  + `<path d="M10 58V16l6-8l6 8v42zM29 58V16l6-8l6 8v42zM48 58V16l6-8l6 8v42z" fill="#f2c27e"/></svg>`;
const PAUSE_ICON = `<svg class="gl" viewBox="0 0 64 64" aria-hidden="true" ${INK}><rect x="14" y="10" width="13" height="44" rx="4" fill="#fff"/><rect x="37" y="10" width="13" height="44" rx="4" fill="#fff"/></svg>`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
}

/** One line always: a label too long for its box (some languages) steps its font down until it fits. */
function fit(e: HTMLElement, min: number): void {
  e.style.fontSize = '';
  const cs = getComputedStyle(e);
  let px = parseFloat(cs.fontSize);
  // Measured in fractional pixels: scrollWidth rounds, and a 0.1px overflow still ellipsizes.
  const text = document.createRange();
  text.selectNodeContents(e);
  const room = () => e.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const over = () => text.getBoundingClientRect().width > room();
  while (over() && px > min) e.style.fontSize = `${--px}px`;
}

/** Restart a one-shot CSS animation class. */
function replay(e: HTMLElement, cls: string): void {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}

export class Hud {
  private wave: HTMLElement;
  private waveNum: HTMLElement;
  private pips: HTMLElement;
  private shownWave = '';
  private wallBox: HTMLElement;
  private wallFill: HTMLElement;
  private wallText: HTMLElement;
  private lastHp = -1;
  private hurtCd = 0;
  private vignette: HTMLElement;
  private gold: HTMLElement;
  private shownGold = -1;
  private stats = {} as Record<StatKey, StatButton>;
  private tip: HTMLElement;
  private tipTimer = 0;
  private heroBtn: HTMLButtonElement;
  private heroRing: SVGCircleElement;
  private heroName: HTMLElement;
  private heroIco: HTMLElement;
  private shownHero: HeroKind | null = null;
  private speedBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private pmenu: HTMLElement;
  private pTitle: HTMLElement;
  private resumeBtn: HTMLButtonElement;
  private soundBtn: HTMLButtonElement;
  private quitBtn: HTMLButtonElement;
  private muted = false;
  private result: HTMLElement;
  private resultText: HTMLElement;
  private earn: HTMLElement;
  private earnDoubled = false;
  /** The crystal count rolls up to `earnTo`; `earnAt` is where it has got to. */
  private earnTo = 0;
  private earnAt = 0;
  private earnShown = -1;
  private reviveBtn: HTMLButtonElement;
  private doubleBtn: HTMLButtonElement;
  private villageBtn: HTMLButtonElement;
  private againBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private trainBtn: HTMLButtonElement;
  private mainRow: HTMLElement;
  private adRow: HTMLElement;
  private minorRow: HTMLElement;
  private shownInfo = '';
  private toast: HTMLElement;
  private toastT = 0;
  private hint: HTMLElement;
  /** The buy hint is up: an arrow points at the target card instead of a line of text. */
  private buyHint = false;
  /** Labels whose emoji become inline SVG glyphs after each text change. */
  private glyphed: HTMLElement[];
  private root: HTMLElement;
  private top: HTMLElement;
  private dock: HTMLElement;

  constructor(root: HTMLElement, private act: HudActions) {
    root.innerHTML = '';
    this.root = root;
    this.vignette = el('div', 'vignette', root);
    const top = (this.top = el('div', 'top', root));
    const danger = el('div', 'danger', top);
    this.wave = el('div', 'wave', danger);
    el('span', 'wico', this.wave).innerHTML = LEVEL_ICON;
    this.waveNum = el('b', '', this.wave);
    this.pips = el('span', 'pips', this.wave);
    const wallBox = (this.wallBox = el('div', 'wallbar', danger));
    el('span', 'fico', wallBox).innerHTML = FENCE_ICON;
    const track = el('div', 'track', wallBox);
    this.wallFill = el('div', 'fill', track);
    this.wallText = el('div', 'txt', track);
    const ctrl = el('div', 'ctrl', top);
    this.speedBtn = el('button', 'speed', ctrl, 'x1');
    this.speedBtn.onclick = act.speed;
    this.pauseBtn = el('button', 'pause', ctrl);
    this.pauseBtn.innerHTML = PAUSE_ICON;
    this.pauseBtn.onclick = () => this.setPaused(true);

    this.toast = el('div', 'toast', root);
    this.hint = el('div', 'hint', root);

    this.dock = el('div', 'dock', root);
    const purse = el('div', 'purse', this.dock);
    this.gold = el('span', '', purse);
    const heroBox = el('div', 'herobox', root);
    this.heroBtn = el('button', 'hero', heroBox);
    this.heroBtn.innerHTML = '<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="45"/><circle class="prog" cx="50" cy="50" r="45" pathLength="100"/></svg>';
    this.heroRing = this.heroBtn.querySelector('.prog')!;
    this.heroIco = el('span', 'hico', this.heroBtn);
    this.heroName = el('span', 'hname', heroBox);
    this.heroBtn.onclick = act.cast;

    const panel = el('div', 'stats', this.dock);
    this.tip = el('div', 'tip', root);
    for (const k of STAT_KEYS) {
      const btn = el('button', `stat ${CATEGORY[k]}`, panel);
      const b: StatButton = { btn, shown: '', lv: -1, bar: null, held: false };
      this.stats[k] = b;
      btn.onclick = () => {
        if (b.held) b.held = false;
        else act.buy(k);
      };
      // The blurb: on hover with a mouse, after a long press on touch (that press then buys nothing).
      btn.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') this.showTip(k);
      });
      btn.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        b.held = false;
        clearTimeout(this.tipTimer);
        this.tipTimer = window.setTimeout(() => {
          b.held = true;
          this.showTip(k);
        }, 450);
      });
      for (const ev of ['pointerleave', 'pointerup', 'pointercancel'] as const) {
        btn.addEventListener(ev, () => {
          clearTimeout(this.tipTimer);
          this.tip.classList.remove('show');
        });
      }
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    this.pmenu = el('div', 'pmenu hidden', root);
    const pcard = el('div', 'card', this.pmenu);
    this.pTitle = el('div', 'ptitle', pcard);
    this.resumeBtn = el('button', 'again main', pcard);
    this.resumeBtn.onclick = () => this.setPaused(false);
    this.soundBtn = el('button', 'sound', pcard);
    this.soundBtn.onclick = act.mute;
    this.quitBtn = el('button', 'minor', pcard);
    this.quitBtn.onclick = () => {
      this.setPaused(false);
      act.quit();
    };
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.result.classList.contains('hidden')) return;
      this.setPaused(this.pmenu.classList.contains('hidden'));
    });

    this.result = el('div', 'result hidden', root);
    const card = el('div', 'card', this.result);
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
    this.glyphed = [this.earn, this.reviveBtn, this.doubleBtn, this.villageBtn];
    // A new width can make a stat name fit (or not): measure them again. The cards move, so the tip goes.
    window.addEventListener('resize', () => {
      for (const k of STAT_KEYS) this.stats[k].shown = '';
      this.tip.classList.remove('show');
    });
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
    this.pauseBtn.title = this.pauseBtn.ariaLabel = t('hud.pause');
    this.pTitle.textContent = t('hud.paused');
    this.resumeBtn.textContent = t('hud.resume');
    this.quitBtn.textContent = t('hud.village');
    this.setMuted(this.muted);
    this.shownInfo = '';
    this.shownWave = '';
    this.earnShown = -1;
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
    this.muted = muted;
    this.soundBtn.innerHTML = `${muted ? SOUND_OFF : SOUND_ON}<span></span>`;
    this.soundBtn.lastElementChild!.textContent = t('hud.sound');
    this.soundBtn.classList.toggle('off', muted);
    this.soundBtn.ariaPressed = String(!muted);
  }

  /** Open or close the pause menu; the sim waits while it is up. */
  private setPaused(on: boolean): void {
    if (on === !this.pmenu.classList.contains('hidden')) return;
    this.pmenu.classList.toggle('hidden', !on);
    this.act.pause(on);
    if (on) this.resumeBtn.focus();
  }

  /**
   * The first-minute guide; null hides it. Never blocks input. The buy hint is no line of text:
   * an arrow points at the card to buy.
   */
  setHint(text: string | null): void {
    this.buyHint = text === t('guide.buy');
    if (this.buyHint) text = null;
    if (text && text !== this.hint.textContent) {
      this.hint.textContent = text;
      fit(this.hint, 11);
    }
    this.hint.classList.toggle('show', !!text);
  }

  /** Result card extras; touches the DOM only when something changed. */
  setResult(r: ResultInfo): void {
    const key = JSON.stringify(r);
    if (key === this.shownInfo) return;
    this.shownInfo = key;
    this.earnTo = r.crystals;
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

  update(w: World, dt: number): void {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.toast.classList.remove('show');
    this.showDanger(w, dt);
    const gold = Math.floor(w.gold);
    if (gold !== this.shownGold) {
      this.shownGold = gold;
      this.gold.innerHTML = glyphs(`🪙${gold}`);
    }

    this.showStats(w);

    const hero = HEROES[w.heroKind];
    if (this.heroName.textContent !== t(`hero.${w.heroKind}.skill`)) this.heroName.textContent = t(`hero.${w.heroKind}.skill`);
    const charge = w.hero.buffT > 0 ? w.hero.buffT / hero.time : w.hero.charge / HERO.chargeMax;
    this.heroRing.style.strokeDasharray = `${(charge * 100).toFixed(1)} 100`;
    this.heroBtn.classList.toggle('ready', w.heroReady());
    this.heroBtn.classList.toggle('active', w.hero.buffT > 0);

    if (w.over && this.result.classList.contains('hidden')) {
      this.setPaused(false);
      const of = w.level?.waves;
      const wave = Math.max(1, w.wave);
      const stars = w.stars();
      // The stars pop in one by one: earned ones gold, the rest as empty slots.
      const row = [0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.3}s">★</i>`).join('');
      const head = w.won
        ? `${t('hud.cleared')}<br><b class="stars">${row}</b>`
        : `${t('hud.fallen')}<br><b>${of ? t('hud.reachedOf', { n: wave, of }) : t('hud.reached', { n: wave })}</b>`;
      this.resultText.innerHTML = `${head}<br>${t('hud.stats', { min: (w.time / 60).toFixed(1), kills: w.kills })}`;
      this.result.classList.remove('hidden');
      this.earnAt = 0;
      this.earnShown = -1;
    } else if (!w.over) {
      this.result.classList.add('hidden');
    }
    if (w.over) {
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

    if (this.shownHero !== w.heroKind) {
      this.shownHero = w.heroKind;
      this.heroIco.innerHTML = HERO_ICON[w.heroKind];
    }
    for (const e of this.glyphed) paintGlyphs(e);
  }

  /** Wave badge, fence bar (a red flash when bitten) and the red screen edge below a quarter. */
  private showDanger(w: World, dt: number): void {
    // Before wave 1 arrives (world.wave 0) the badge and the result card already say wave 1.
    const wave = Math.max(1, w.wave);
    const of = w.level?.waves;
    const key = `${wave}/${of}`;
    if (key !== this.shownWave) {
      this.shownWave = key;
      this.waveNum.textContent = of ? `${wave}/${of}` : String(wave);
      this.wave.title = of ? t('hud.waveOf', { n: wave, of }) : t('hud.wave', { n: wave });
      this.pips.innerHTML = of ? Array.from({ length: of }, (_, i) => `<i class="${i < wave - 1 ? 'done' : i === wave - 1 ? 'now' : ''}"></i>`).join('') : '';
      this.pips.style.display = of ? '' : 'none';
    }
    const frac = w.wallHp / w.wallMax;
    this.wallFill.style.width = `${(frac * 100).toFixed(1)}%`;
    this.wallFill.style.background = frac > 0.5 ? '#5fbf4a' : frac > 0.25 ? '#e0b030' : '#e04040';
    const txt = `${Math.ceil(w.wallHp)} / ${w.wallMax}`;
    if (this.wallText.textContent !== txt) {
      this.wallText.textContent = txt;
      this.wallBox.title = t('hud.wall', { hp: Math.ceil(w.wallHp), max: w.wallMax });
    }
    this.hurtCd -= dt;
    if (this.lastHp >= 0 && w.wallHp < this.lastHp - 0.01 && this.hurtCd <= 0) {
      replay(this.wallBox, 'hurt');
      this.hurtCd = 0.7;
    }
    this.lastHp = w.wallHp;
    this.vignette.classList.toggle('on', frac < 0.25 && !w.over);
  }

  private showTip(k: StatKey): void {
    const r = this.stats[k].btn.getBoundingClientRect();
    this.tip.innerHTML = `<b></b><span></span>`;
    this.tip.firstElementChild!.textContent = t(`stat.${k}.name`);
    this.tip.lastElementChild!.textContent = t(`stat.${k}.text`);
    this.tip.classList.add('show');
    // Above the card, kept inside the window.
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    const x = Math.max(6, Math.min(window.innerWidth - tw - 6, r.left + r.width / 2 - tw / 2));
    const y = r.top - th - 10 >= 4 ? r.top - th - 10 : r.bottom + 10;
    this.tip.style.left = `${x}px`;
    this.tip.style.top = `${y}px`;
  }

  /**
   * Each stat card: icon, name, level badge and price (or Max); the blurb is in the tip. Lit when
   * it can be bought, a progress bar along the bottom when almost, dim when far off, gold edged
   * when maxed. Touches the card's text only on change.
   */
  private showStats(w: World): void {
    for (const k of STAT_KEYS) {
      const b = this.stats[k];
      const maxed = w.maxed(k);
      const cost = w.statCost(k);
      const lv = w.lv[k];
      const key = `${lv}:${maxed ? -1 : cost}`;
      if (key !== b.shown) {
        b.shown = key;
        const price = maxed ? t('hud.max') : glyphs(`🪙${cost}`);
        b.btn.innerHTML = `<i>${STAT_ICON[k]}</i><b></b><span class="price">${price}</span>${lv > 0 ? `<em>${lv}</em>` : ''}<u></u>`;
        const name = b.btn.querySelector('b')!;
        name.textContent = t(`stat.${k}.name`);
        fit(name, 8);
        b.bar = b.btn.querySelector('u');
        b.btn.ariaLabel = `${t(`stat.${k}.name`)} ${lv}: ${t(`stat.${k}.text`)}`;
        if (b.lv >= 0 && lv > b.lv) {
          const pop = el('span', 'pop', b.btn, '+1');
          pop.addEventListener('animationend', () => pop.remove());
        }
        b.lv = lv;
      }
      const can = w.canBuy(k);
      const frac = maxed ? 1 : Math.min(1, w.gold / cost);
      const almost = !can && !maxed && !w.over && frac >= 1 - ALMOST;
      b.btn.classList.toggle('can', can);
      b.btn.classList.toggle('almost', almost);
      b.btn.classList.toggle('poor', !can && !almost && !maxed);
      b.btn.classList.toggle('maxed', maxed);
      b.btn.ariaDisabled = String(!can);
      if (b.bar) b.bar.style.width = almost ? `${(frac * 100).toFixed(1)}%` : '0';
      // Before the first buy, the guide's arrow points at the damage card.
      b.btn.classList.toggle('target', this.buyHint && w.buys === 0 && k === 'dmg');
    }
  }
}
