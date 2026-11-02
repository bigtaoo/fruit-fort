// DOM overlay (§3.4, HUD layout 2026-10-31). Top left, the danger group: a wave badge with one pip
// per wave and the fence bar, which flashes red when bitten and reddens the screen edges below a
// quarter. Top right, the control group: speed and pause (the pause menu holds resume, sound and
// the way back to the toy box). The stat dock (under the board in portrait, beside it in
// landscape) carries the gold purse on top and the eight stat cards, coloured by category and
// lit by whether they can be bought. The hero skill sits in the board's lower left corner with a
// charge ring. The result card comes up when the fence falls or a level is won.

import { HERO, HEROES } from '../sim/config';
import type { World } from '../sim/world';
import { t } from '../i18n';
import type { HeroKind, StatKey } from '../sim/types';
import type { Rect } from './scene';
import { el, fit, replay } from './dom';
import { HERO_ICON, LEVEL_ICON, SHIELD_ICON, SOUND_OFF, SOUND_ON, glyphs, paintGlyphs } from './icons';
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
  mute(): void;
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

const INK = 'stroke="#2b1d14" stroke-width="3" stroke-linejoin="round"';
const PAUSE_ICON = `<svg class="gl" viewBox="0 0 64 64" aria-hidden="true" ${INK}><rect x="14" y="10" width="13" height="44" rx="4" fill="#fff"/><rect x="37" y="10" width="13" height="44" rx="4" fill="#fff"/></svg>`;

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
  private purse: HTMLElement;
  private flying = 0;
  private shownGold = -1;
  private cards: StatDock;
  private heroBtn: HTMLButtonElement;
  private heroCharge: HTMLElement;
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
    this.purse = el('div', 'purse outl', this.dock);
    this.gold = el('span', '', this.purse);
    const heroBox = el('div', 'herobox', root);
    this.heroBtn = el('button', 'hero', heroBox);
    this.heroIco = el('span', 'hico', this.heroBtn);
    this.heroCharge = el('span', 'charge', this.heroBtn);
    this.heroName = el('span', 'hname', heroBox);
    this.heroBtn.onclick = act.cast;

    this.cards = new StatDock(this.dock, root, act.buy);

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
    window.addEventListener('resize', () => this.cards.reset());
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
    this.cards.reset();
  }

  /**
   * Coins fly from a point on the page (a kill) into the purse, a little apart, and the purse bounces
   * as each lands. Capped so a wave of kills doesn't fill the page with coins.
   */
  coinFly(x: number, y: number, n = 1): void {
    const to = this.purse.getBoundingClientRect();
    if (!to.width) return;
    for (let i = 0; i < n && this.flying < 14; i++) {
      this.flying++;
      const f = el('span', 'flycoin', this.root);
      f.innerHTML = glyphs('🪙');
      f.style.left = `${x}px`;
      f.style.top = `${y}px`;
      const dx = to.left + 18 - x;
      const dy = to.top + to.height / 2 - y;
      const jx = (Math.random() - 0.5) * 50;
      const a = f.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.3)' },
          { transform: `translate(calc(-50% + ${jx}px), calc(-50% - 46px)) scale(1.15)`, offset: 0.28, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.75)` },
        ],
        { duration: 620 + i * 70, delay: i * 50, fill: 'backwards' },
      );
      a.onfinish = () => {
        f.remove();
        this.flying--;
        this.purse.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(1)' }], { duration: 200, easing: 'ease-out' });
      };
    }
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

    this.cards.update(w, this.buyHint);

    const hero = HEROES[w.heroKind];
    if (this.heroName.textContent !== t(`hero.${w.heroKind}.skill`)) this.heroName.textContent = t(`hero.${w.heroKind}.skill`);
    const charge = w.hero.buffT > 0 ? w.hero.buffT / hero.time : w.hero.charge / HERO.chargeMax;
    this.heroCharge.style.setProperty('--p', `${(charge * 100).toFixed(1)}%`);
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
      // The rendered toy; the drawn icon only if the renderer can't give one.
      let src = '';
      try { src = this.act.portrait(w.heroKind); } catch { /* lost context */ }
      this.heroIco.innerHTML = src ? `<img src="${src}" alt="">` : HERO_ICON[w.heroKind];
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
    this.wallFill.style.background = frac > 0.5 ? 'linear-gradient(#8ff4ff, #22c4f0)' : frac > 0.25 ? '#ffa64d' : '#ff4d4d';
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
