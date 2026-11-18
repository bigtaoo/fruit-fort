// DOM overlay (§3.4, HUD layout 2026-10-31). Top left, the danger group: a wave badge ("Wave 1/8"
// in words, a segment per wave under it) and the shield bar, quiet while the shield is healthy and
// louder (cyan, amber, red and throbbing) as it drops; it flashes red when bitten and reddens the
// screen edges below a quarter. Top right, the control group: speed and pause (the pause menu holds resume, sound and
// the way back to the toy box). The stat dock, a solid panel (along the bottom, or in the bottom
// right corner of a wide window), carries the hero skill and the gold purse (on top, or in a
// column beside the cards when they all fit in one row) and the eight stat cards, lit by whether they can be bought. The skill shows its charge swept over
// the portrait and filling a bar. The result card comes up when the fence falls or a level is won.

import { HERO, HEROES } from '../sim/config';
import type { World } from '../sim/world';
import { t, type Locale } from '../i18n';
import type { HeroKind, StatKey } from '../sim/types';
import type { Board } from './frame';
import { el, fit, replay } from './dom';
import { HERO_ICON, PAUSE_ICON, SHIELD_ICON, paintGlyphs } from './icons';
import type { AudioSwitches } from './settings';
import { StatDock } from './statdock';
import { PurseFx } from './purse';
import { showWaveNum, type ResultInfo } from './hudtext';
import { WagonUi } from './wagonui';
import { PauseMenu } from './hudpause';
import { ResultCard } from './hudresult';

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
  /** The music or the effects switched on or off in the pause menu. */
  sound(kind: 'music' | 'sfx'): void;
  /** A language picked in the pause menu. */
  language(locale: Locale): void;
  /** The hero's 3D toy as a picture for the skill button (scene.heroPortrait). */
  portrait(kind: HeroKind): string;
}

/** How far below the top bar the hint's line reaches (px): a corner dock above this crowds it. */
const HINT_LINE = 50;

export class Hud {
  private wave: HTMLElement;
  private waveNum: HTMLElement;
  private pips: HTMLElement;
  private shownWave = '';
  private wallBox: HTMLElement;
  private wallFill: HTMLElement;
  private wallText: HTMLElement;
  /** The shield bar's loudness band last drawn (calm, ok, low, crit). */
  private shownLv = '';
  /** The fence fill's slide last written, in tenths of a percent. */
  private shownSlid = -1;
  private lastHp = -1;
  private hurtCd = 0;
  private vignette: HTMLElement;
  private purse: HTMLElement;
  private coins: PurseFx;
  private cards: StatDock;
  private heroBtn: HTMLButtonElement;
  private heroName: HTMLElement;
  private heroPct: HTMLElement;
  /** The charge last drawn, in half percent steps: the button's style is touched only when it moves. */
  private shownCharge = -1;
  private heroIco: HTMLElement;
  private shownHero: HeroKind | null = null;
  private speedBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private pmenu: PauseMenu;
  private res: ResultCard;
  /** Set by main.ts while a run's end plays on the board: the result card waits (tap to skip). */
  holdResult = false;
  private toast: HTMLElement;
  private toastT = 0;
  private hint: HTMLElement;
  private hintKey = '';
  /** Labels whose emoji become inline SVG glyphs after each text change. */
  private glyphed: HTMLElement[];
  private root: HTMLElement;
  private top: HTMLElement;
  private dock: HTMLElement;
  private wagons: WagonUi;

  constructor(root: HTMLElement, private act: HudActions) {
    root.innerHTML = '';
    this.root = root;
    this.vignette = el('div', 'vignette', root);
    const top = (this.top = el('div', 'top', root));
    const danger = el('div', 'danger', top);
    this.wave = el('div', 'wave', danger);
    // No bug icon: next to a count it read as "bugs left". The word says what is counted.
    const wcol = el('span', 'wcol', this.wave);
    this.waveNum = el('span', 'wnum', wcol);
    this.pips = el('span', 'pips', wcol);
    const wallBox = (this.wallBox = el('div', 'wallbar', danger));
    el('span', 'fico', wallBox).innerHTML = SHIELD_ICON;
    const track = el('div', 'track', wallBox);
    this.wallFill = el('div', 'fill', track);
    this.wallText = el('div', 'txt outl', track);
    this.wagons = new WagonUi(root, wallBox);
    const ctrl = el('div', 'ctrl', top);
    this.speedBtn = el('button', 'speed', ctrl, 'x1');
    this.speedBtn.onclick = act.speed;
    this.pauseBtn = el('button', 'pause', ctrl);
    this.pauseBtn.innerHTML = PAUSE_ICON;
    this.pauseBtn.onclick = () => this.setPaused(true);

    this.toast = el('div', 'toast', root);
    this.hint = el('div', 'hint', root);

    this.dock = el('div', 'dock', root);
    // The purse and the skill keep to the right of the dock's head: the guide's arrow comes down
    // onto the first card on its left.
    const head = el('div', 'dhead', this.dock);
    this.purse = el('div', 'purse outl', head);
    this.coins = new PurseFx(this.root, this.purse, el('span', '', this.purse));
    // The skill: the portrait with the uncharged part shaded over it (a clock hand sweeping round)
    // and the percentage on it, the name beside it, and a bar under the name that fills.
    const heroBox = el('div', 'herobox', head);
    this.heroBtn = el('button', 'hero', heroBox);
    const port = el('span', 'hport', this.heroBtn);
    this.heroIco = el('span', 'hico', port);
    el('span', 'charge', port);
    this.heroPct = el('span', 'hpct', port);
    this.heroName = el('span', 'hname', this.heroBtn);
    el('u', 'hbar', this.heroBtn);
    this.heroBtn.onclick = act.cast;

    this.cards = new StatDock(this.dock, root, act.buy);

    this.pmenu = new PauseMenu(root, act, () => this.res.up);
    this.res = new ResultCard(root, act);
    this.glyphed = [this.res.earn, this.res.villageBtn];
    // A new width can make a stat name fit (or not): measure them again. The cards move, so the tip goes.
    window.addEventListener('resize', () => this.cards.reset());
    this.relabel();
  }

  /**
   * The playfield: the window below the top bar, less the dock. A dock along the bottom cuts the
   * area short; one in a corner (a wide window) is a block the camera keeps the fight clear of, so
   * the ground above it is still used. The area goes to the stylesheet as --bx/--by/--bw/--bh for
   * the hint and the wave banner; --hw is the width the hint may use: left of a corner dock that
   * reaches up to the hint's line (a landscape phone), else the whole width.
   */
  board(): Board {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const y = this.top.getBoundingClientRect().bottom + 6;
    const d = this.dock.getBoundingClientRect();
    const strip = d.width > w * 0.8;
    const r = { x: 0, y, w, h: (strip ? d.top - 6 : h) - y };
    const hw = !strip && d.width && d.top < y + HINT_LINE ? d.left - 6 : w;
    for (const [k, v] of [['--bx', r.x], ['--by', r.y], ['--bw', r.w], ['--bh', r.h], ['--hw', hw]] as const) this.root.style.setProperty(k, `${v}px`);
    return { area: r, avoid: strip || !d.width ? [] : [{ x: d.left - 6, y: d.top - 6, w: d.width + 12, h: d.height + 12 }] };
  }

  /** Call back whenever the top bar or the dock changes size (fonts landing, cards filling in, the orientation turning). */
  onLayout(cb: () => void): void {
    const ro = new ResizeObserver(cb);
    ro.observe(this.top);
    ro.observe(this.dock);
  }

  /** Fixed labels in the current language; again after the player picks another one. */
  relabel(): void {
    this.res.relabel();
    this.pauseBtn.title = this.pauseBtn.ariaLabel = t('hud.pause');
    this.pmenu.relabel();
    this.shownWave = '';
    this.cards.reset();
  }

  /** Coins from a kill into the purse (PurseFx.fly). */
  coinFly(x: number, y: number, n = 1, gold = 0, big = false): void {
    this.coins.fly(x, y, n, gold, big);
  }

  /** Whether the result card is up. */
  get resultUp(): boolean {
    return this.res.up;
  }

  /** A run starts: the top bar drops in and the dock rises (style.css, .enter). */
  enter(): void {
    this.root.classList.remove('enter');
    void this.root.offsetWidth;
    this.root.classList.add('enter');
  }

  /** The banner over the board for `secs`; `sub` is a smaller line under it. */
  flash(text: string, sub: string | null = null, secs = 1.6): void {
    this.toast.textContent = text;
    if (sub) el('small', '', this.toast).textContent = sub;
    this.toast.classList.add('show');
    this.toastT = secs;
  }

  setSpeed(mul: number): void {
    this.speedBtn.textContent = 'x' + mul;
  }

  /** The pause menu's music and effects switches, as they now stand. */
  setSound(on: AudioSwitches): void {
    this.pmenu.setSound(on);
  }

  /**
   * Bring up the pause menu because the page lost focus mid-fight; nothing if it is already up. Resume
   * pulses, as the player did not ask for the menu.
   */
  openPause(): void {
    this.pmenu.open();
  }

  /**
   * Whether the pause menu offers the way back to the village. Not in the first run (2026-11-06: new
   * players paused by a click outside the frame took it, dropped their run and landed on a map nothing
   * had explained; one closed the page there).
   */
  setQuit(on: boolean): void {
    this.pmenu.setQuit(on);
  }

  /** Open or close the pause menu; the sim waits while it is up. */
  private setPaused(on: boolean): void {
    this.pmenu.set(on);
  }

  /**
   * The guide's line above the buttons (§12.7); null hides it. Never blocks input. A `title` goes
   * on a line of its own above, bigger and pulsing: while the bugs wait, it says they wait.
   */
  setHint(text: string | null, title: string | null = null): void {
    const key = `${title ?? ''}|${text}`;
    if (text && key !== this.hintKey) {
      this.hintKey = key;
      this.hint.textContent = '';
      if (title) el('b', '', this.hint).textContent = title;
      this.hint.append(text);
      fit(this.hint, 11);
    }
    this.hint.classList.toggle('show', !!text);
    this.hint.classList.toggle('held', !!text && !!title);
  }

  /** A button the guide's hand can point at: `stat:<key>`, `skill`, `speed`, `village`, `train`. */
  button(name: string): HTMLElement | null {
    if (name.startsWith('stat:')) return this.cards.card(name.slice(5) as StatKey);
    const b = { skill: this.heroBtn, speed: this.speedBtn, village: this.res.villageBtn, train: this.res.trainBtn }[name];
    return b && b.offsetParent ? b : null;
  }

  /** Result card extras; touches the DOM only when something changed. */
  setResult(r: ResultInfo): void {
    this.res.set(r);
  }

  update(w: World, dt: number): void {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.toast.classList.remove('show');
    this.showDanger(w, dt);
    this.coins.show(Math.floor(w.gold));

    this.cards.update(w);
    this.wagons.update(w);

    const hero = HEROES[w.heroKind];
    const skill = t(`hero.${w.heroKind}.skill`);
    if (this.heroName.textContent !== skill) {
      this.heroName.textContent = skill;
      this.heroBtn.ariaLabel = skill;
      fit(this.heroName, 10);
    }
    // While the skill runs the sweep counts its time down; otherwise it counts the charge up.
    const charge = Math.min(1, w.hero.buffT > 0 ? w.hero.buffT / hero.time : w.hero.charge / HERO.chargeMax);
    // Whole percents: each step repaints the skill card (the sweep is a gradient), and the label
    // only shows whole percents anyway.
    const step = Math.floor(charge * 100);
    if (step !== this.shownCharge) {
      this.shownCharge = step;
      this.heroBtn.style.setProperty('--p', `${step}%`);
      this.heroPct.textContent = w.hero.buffT > 0 || charge >= 1 ? '' : `${step}%`;
    }
    this.heroBtn.classList.toggle('ready', w.heroReady());
    this.heroBtn.classList.toggle('active', w.hero.buffT > 0);

    const over = w.over && !this.holdResult;
    if (over && !this.res.up) this.setPaused(false);
    this.res.update(w, dt, over);

    if (this.shownHero !== w.heroKind) {
      const kind = (this.shownHero = w.heroKind);
      // The drawn icon at once, the rendered toy once the game runs: drawing it cost ~260 ms of a phone's
      // loading (2026-11-06), so it waits for a quiet moment after the first frames.
      this.heroIco.innerHTML = HERO_ICON[kind];
      const later = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1200));
      later(() => {
        if (this.shownHero !== kind) return;
        let src = '';
        try { src = this.act.portrait(kind); } catch { /* lost context */ }
        if (src) this.heroIco.innerHTML = `<img src="${src}" alt="">`;
      }, { timeout: 2500 });
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
      showWaveNum(this.waveNum, wave, of);
      this.wave.title = of ? t('hud.waveOf', { n: wave, of }) : t('hud.wave', { n: wave });
      this.pips.innerHTML = of ? Array.from({ length: of }, (_, i) => `<i class="${i < wave - 1 ? 'done' : i === wave - 1 ? 'now' : ''}${i === of - 1 ? ' boss' : ''}"></i>`).join('') : '';
      this.pips.style.display = of ? '' : 'none';
    }
    const frac = w.wallHp / w.wallMax;
    // Slid, not narrowed: a transform on the fill's own layer repaints nothing (style.css). Written
    // only when the tenth of a percent it is drawn at moves: the fence stands still most frames.
    const slid = Math.round(frac * 1000) / 10;
    if (slid !== this.shownSlid) {
      this.shownSlid = slid;
      this.wallFill.style.transform = `translateX(${slid - 100}%)`;
    }
    // Healthy, the bar keeps quiet so it does not pull the eye from the fight; the colours are in style.css.
    const lv = frac > 0.75 ? 'calm' : frac > 0.5 ? 'ok' : frac > 0.25 ? 'low' : 'crit';
    if (lv !== this.shownLv) this.wallBox.dataset.lv = this.shownLv = lv;
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
}
