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
import { isLocale, t, type Locale } from '../i18n';
import type { HeroKind, StatKey } from '../sim/types';
import type { Board } from './frame';
import { el, fit, replay } from './dom';
import { HERO_ICON, SHIELD_ICON, glyphs, paintGlyphs } from './icons';
import { settingRows, type AudioSwitches } from './settings';
import { StatDock } from './statdock';


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

/** How far below the top bar the hint's line reaches (px): a corner dock above this crowds it. */
const HINT_LINE = 50;
const INK = 'stroke="#0a1424" stroke-width="3" stroke-linejoin="round"';
const PAUSE_ICON = `<svg class="gl" viewBox="0 0 64 64" aria-hidden="true" ${INK}><rect x="14" y="10" width="13" height="44" rx="4" fill="#fff"/><rect x="37" y="10" width="13" height="44" rx="4" fill="#fff"/></svg>`;

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
  private lastHp = -1;
  private hurtCd = 0;
  private vignette: HTMLElement;
  private gold: HTMLElement;
  private purse: HTMLElement;
  private flying = 0;
  private shownGold = -1;
  /** The "+N" over the purse still rising, while more gold may join it, and when it was last fed. */
  private gainEl: HTMLElement | null = null;
  private gainN = 0;
  private gainAt = 0;
  /**
   * Gold this frame's flying coins carry: each coin pops its own share at the purse when it lands, so
   * update() leaves that much out of the "+N" it pops for the rest. Cleared every update.
   */
  private carried = 0;
  /** Gold on coins still in the air: the purse counts it only as each coin lands. */
  private inFlight = 0;
  /** The number the purse shows. */
  private drawnGold = -1;
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
  private pmenu: HTMLElement;
  private pTitle: HTMLElement;
  private resumeBtn: HTMLButtonElement;
  private pRows: HTMLElement;
  private quitBtn: HTMLButtonElement;
  private switches: AudioSwitches = { music: true, sfx: true };
  private result: HTMLElement;
  private resultText: HTMLElement;
  /** What the result card's head was written for (outcome and wave); '' while it is down. */
  private shownHead = '';
  /** Set by main.ts while a run's end plays on the board: the result card waits (tap to skip). */
  holdResult = false;
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
  private hintKey = '';
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
    // No bug icon: next to a count it read as "bugs left". The word says what is counted.
    const wcol = el('span', 'wcol', this.wave);
    this.waveNum = el('span', 'wnum', wcol);
    this.pips = el('span', 'pips', wcol);
    const wallBox = (this.wallBox = el('div', 'wallbar', danger));
    el('span', 'fico', wallBox).innerHTML = SHIELD_ICON;
    const track = el('div', 'track', wallBox);
    this.wallFill = el('div', 'fill', track);
    this.wallText = el('div', 'txt outl', track);
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
    this.gold = el('span', '', this.purse);
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

    // Paused: the title on a plate over the top edge, Resume big, the settings rows (sound, language)
    // as on the map's settings panel, and the way back to the map small at the bottom.
    this.pmenu = el('div', 'pmenu hidden', root);
    const pcard = el('div', 'card spanel', this.pmenu);
    this.pTitle = el('b', 'splate', pcard);
    this.resumeBtn = el('button', 'again main', pcard);
    this.resumeBtn.onclick = () => this.setPaused(false);
    this.pRows = el('div', 'prows', pcard);
    this.pRows.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (a === 'music' || a === 'sfx') act.sound(a);
    });
    this.pRows.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      if (isLocale(v)) act.language(v);
    });
    this.quitBtn = el('button', 'minor', pcard);
    this.quitBtn.onclick = () => {
      this.setPaused(false);
      act.quit();
    };
    window.addEventListener('keydown', (e) => {
      if ((e.key !== 'p' && e.key !== 'P') || e.repeat || !this.result.classList.contains('hidden')) return;
      this.setPaused(this.pmenu.classList.contains('hidden'));
    });

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
    this.glyphed = [this.earn, this.villageBtn];
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

  /** The ad buttons: what the ad is for, and under it what it gives, the crystals as a number. */
  private adLabels(): void {
    const two = (title: string, gain: string) => glyphs(`<span class="adt">📺 ${title}</span><span class="adg">${gain}</span>`);
    this.reviveBtn.innerHTML = two(t('hud.revive'), t('hud.reviveGain'));
    this.doubleBtn.innerHTML = two(t('hud.double'), `+💎${this.earnTo}`);
  }

  /** Fixed labels in the current language; again after the player picks another one. */
  relabel(): void {
    this.adLabels();
    this.againBtn.textContent = t('hud.again');
    this.nextBtn.textContent = t('hud.next');
    this.trainBtn.textContent = t('hud.train');
    this.villageBtn.textContent = t('hud.village');
    this.pauseBtn.title = this.pauseBtn.ariaLabel = t('hud.pause');
    this.pTitle.textContent = t('hud.paused');
    this.resumeBtn.textContent = t('hud.resume');
    this.quitBtn.textContent = t('hud.village');
    this.setSound(this.switches);
    this.shownInfo = '';
    this.shownWave = '';
    this.earnShown = -1;
    this.cards.reset();
  }

  /**
   * Coins fly from a point on the page (a kill) into the purse, a little apart. `gold` is split among
   * them and each pops its own "+share" as it lands, with a bounce of the purse: five +6s in a row
   * read as more than one +30. `big` (the golden bug) pops them larger. Capped so a wave of kills
   * doesn't fill the page; the shares of coins past the cap ride on the last one that flies.
   */
  coinFly(x: number, y: number, n = 1, gold = 0, big = false): void {
    const to = this.purse.getBoundingClientRect();
    if (!to.width) return;
    this.carried += gold;
    this.inFlight += gold;
    const base = Math.floor(gold / n);
    let left = gold;
    let last: { share: number } | null = null;
    for (let i = 0; i < n && this.flying < 18; i++) {
      this.flying++;
      const share = { share: i < n - 1 ? base + (i < gold % n ? 1 : 0) : left };
      left -= share.share;
      last = share;
      const f = el('span', 'flycoin', this.root);
      f.innerHTML = glyphs('🪙');
      f.style.left = `${x}px`;
      f.style.top = `${y}px`;
      const dx = to.left + 18 - x;
      const dy = to.top + to.height / 2 - y;
      const jx = (Math.random() - 0.5) * (big ? 120 : 50);
      const a = f.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.3)' },
          { transform: `translate(calc(-50% + ${jx}px), calc(-50% - ${big ? 80 : 46}px)) scale(${big ? 1.4 : 1.15})`, offset: 0.28, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.75)` },
        ],
        // The golden bug's coins land one by one, far enough apart to count them.
        { duration: 620 + i * (big ? 40 : 70), delay: i * (big ? 150 : 50), fill: 'backwards' },
      );
      a.onfinish = () => {
        f.remove();
        this.flying--;
        this.inFlight -= share.share;
        if (share.share > 0) this.pop(share.share, big);
        this.purse.animate([{ transform: 'scale(1)' }, { transform: `scale(${big ? 1.3 : 1.16})` }, { transform: 'scale(1)' }], { duration: big ? 260 : 200, easing: 'ease-out' });
      };
    }
    if (last) last.share += left;
    else if (gold > 0) {
      this.inFlight -= gold;
      this.pop(gold, big);
    }
  }

  /** One coin's "+N" off the purse, on its own: a stream of them rises when several coins land. */
  private pop(n: number, big: boolean): void {
    const to = this.purse.getBoundingClientRect();
    if (!to.width) return;
    const f = el('span', big ? 'gain big outl' : 'gain outl', this.root);
    f.textContent = `+${n}`;
    f.style.left = `${to.left + to.width / 2 + (Math.random() - 0.5) * (big ? 36 : 20)}px`;
    f.style.top = `${to.top}px`;
    f.animate(
      big
        ? [
            { transform: 'translate(-50%, -30%) scale(0.3) rotate(-8deg)', opacity: 0 },
            { transform: 'translate(-50%, -120%) scale(1.45) rotate(4deg)', opacity: 1, offset: 0.14, easing: 'ease-out' },
            { transform: 'translate(-50%, -125%) scale(1) rotate(0deg)', opacity: 1, offset: 0.3 },
            { transform: 'translate(-50%, -150%) scale(1)', opacity: 1, offset: 0.6 },
            { transform: 'translate(-50%, -230%) scale(0.9)', opacity: 0 },
          ]
        : [
            { transform: 'translate(-50%, -40%) scale(0.5)', opacity: 0 },
            { transform: 'translate(-50%, -110%) scale(1.25)', opacity: 1, offset: 0.15, easing: 'ease-out' },
            { transform: 'translate(-50%, -120%) scale(1)', opacity: 1, offset: 0.55 },
            { transform: 'translate(-50%, -190%) scale(0.95)', opacity: 0 },
          ],
      { duration: big ? 1300 : 1000, easing: 'ease-in' },
    ).onfinish = () => f.remove();
  }

  /**
   * "+N" rising off the purse for gold that comes in without coins (wave pay, refunds). Gold that
   * arrives within a moment of the last joins the same number, which pops again. Only transform and
   * opacity animate, so the HUD layer is not repainted.
   */
  private gain(n: number): void {
    const to = this.purse.getBoundingClientRect();
    if (!to.width) return;
    const now = performance.now();
    if (this.gainEl && now - this.gainAt < 350) {
      this.gainN += n;
    } else {
      this.gainEl = el('span', 'gain outl', this.root);
      this.gainN = n;
    }
    this.gainAt = now;
    const f = this.gainEl;
    f.textContent = `+${this.gainN}`;
    f.style.left = `${to.left + to.width / 2}px`;
    f.style.top = `${to.top}px`;
    f.getAnimations().forEach((a) => a.cancel());
    const a = f.animate(
      [
        { transform: 'translate(-50%, -40%) scale(0.5)', opacity: 0 },
        { transform: 'translate(-50%, -110%) scale(1.25)', opacity: 1, offset: 0.15, easing: 'ease-out' },
        { transform: 'translate(-50%, -120%) scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%, -190%) scale(0.95)', opacity: 0 },
      ],
      { duration: 1000, easing: 'ease-in' },
    );
    a.onfinish = () => {
      f.remove();
      if (this.gainEl === f) this.gainEl = null;
    };
  }

  /** Whether the result card is up. */
  get resultUp(): boolean {
    return !this.result.classList.contains('hidden');
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
    this.switches = on;
    this.pRows.innerHTML = settingRows(on);
  }

  /** Bring up the pause menu (the page lost focus mid-fight); nothing if it is already up. */
  openPause(): void {
    this.setPaused(true);
  }

  /** Open or close the pause menu; the sim waits while it is up. */
  private setPaused(on: boolean): void {
    if (on === !this.pmenu.classList.contains('hidden')) return;
    this.pmenu.classList.toggle('hidden', !on);
    this.act.pause(on);
    if (on) this.resumeBtn.focus();
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
    const b = { skill: this.heroBtn, speed: this.speedBtn, village: this.villageBtn, train: this.trainBtn }[name];
    return b && b.offsetParent ? b : null;
  }

  /** Result card extras; touches the DOM only when something changed. */
  setResult(r: ResultInfo): void {
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

  update(w: World, dt: number): void {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.toast.classList.remove('show');
    this.showDanger(w, dt);
    const gold = Math.floor(w.gold);
    if (gold !== this.shownGold) {
      // Kill pay is rounded for its coins while the purse holds fractions: a stray 1 is not a "+1".
      const rest = gold - this.shownGold - this.carried;
      if (this.shownGold >= 0 && rest > (this.carried > 0 ? 1 : 0)) this.gain(rest);
      this.shownGold = gold;
    }
    this.carried = 0;
    const drawn = Math.max(0, gold - this.inFlight);
    if (drawn !== this.drawnGold) {
      this.drawnGold = drawn;
      this.gold.innerHTML = glyphs(`🪙${drawn}`);
    }

    this.cards.update(w);

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

    // The card's head is written when it comes up, and again if the outcome changes under it (a
    // revive and a second fall can both land between two frames).
    const over = w.over && !this.holdResult;
    const opening = over && this.result.classList.contains('hidden');
    const headKey = over ? `${w.won}|${w.wave}` : '';
    if (opening) this.setPaused(false);
    if (over && (opening || headKey !== this.shownHead)) {
      this.shownHead = headKey;
      const of = w.level?.waves;
      const wave = Math.max(1, w.wave);
      const stars = w.stars();
      // The stars pop in one by one: earned ones gold, the rest as empty slots.
      const row = [0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}" style="animation-delay:${0.45 + i * 0.3}s">★</i>`).join('');
      // The outcome on a plate over the card's top edge (gold won, red lost, as the settings panels'),
      // then the stars or how far the run got, big, and the run's numbers small.
      const head = w.won
        ? `<b class="splate">${t('hud.cleared')}</b><b class="stars">${row}</b>`
        : `<b class="splate lost">${t('hud.fallen')}</b><b class="reach">${of ? t('hud.reachedOf', { n: wave, of }) : t('hud.reached', { n: wave })}</b>`;
      this.resultText.innerHTML = `${head}<small class="rstat">${t('hud.stats', { min: (w.time / 60).toFixed(1), kills: w.kills })}</small>`;
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

    if (this.shownHero !== w.heroKind) {
      this.shownHero = w.heroKind;
      // The rendered toy; the drawn icon only if the renderer can't give one.
      let src = '';
      try { src = this.act.portrait(w.heroKind); } catch { /* lost context */ }
      this.heroIco.innerHTML = src ? `<img src="${src}" alt="">` : HERO_ICON[w.heroKind];
    }
    for (const e of this.glyphed) paintGlyphs(e);
  }

  /**
   * "Wave 1/8" from the language's own wording: the words small, the count big. The count is
   * dropped into the sentence as a marker and the text split round it, so word order (第 1/8 波)
   * comes from the table. Endless runs have no total: "Wave 12".
   */
  private showWaveNum(wave: number, of: number | undefined): void {
    const mark = '\u0001';
    const text = of ? t('hud.waveOf', { n: mark, of: '\u0002' }).replace(/\u0001\s*\/\s*\u0002/, mark) : t('hud.wave', { n: mark });
    const [pre, post = ''] = text.split(mark);
    const e = this.waveNum;
    e.textContent = '';
    if (pre.trim()) el('small', '', e, pre.trim());
    el('b', '', e, of ? `${wave}/${of}` : String(wave));
    if (post.trim()) el('small', '', e, post.trim());
  }

  /** Wave badge, fence bar (a red flash when bitten) and the red screen edge below a quarter. */
  private showDanger(w: World, dt: number): void {
    // Before wave 1 arrives (world.wave 0) the badge and the result card already say wave 1.
    const wave = Math.max(1, w.wave);
    const of = w.level?.waves;
    const key = `${wave}/${of}`;
    if (key !== this.shownWave) {
      this.shownWave = key;
      this.showWaveNum(wave, of);
      this.wave.title = of ? t('hud.waveOf', { n: wave, of }) : t('hud.wave', { n: wave });
      this.pips.innerHTML = of ? Array.from({ length: of }, (_, i) => `<i class="${i < wave - 1 ? 'done' : i === wave - 1 ? 'now' : ''}"></i>`).join('') : '';
      this.pips.style.display = of ? '' : 'none';
    }
    const frac = w.wallHp / w.wallMax;
    // Slid, not narrowed: a transform on the fill's own layer repaints nothing (style.css).
    this.wallFill.style.transform = `translateX(${(frac * 100 - 100).toFixed(1)}%)`;
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
