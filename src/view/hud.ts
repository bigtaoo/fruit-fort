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
import { t } from '../i18n';
import type { HeroKind, StatKey } from '../sim/types';
import type { Board } from './frame';
import { el, fit, replay } from './dom';
import { HERO_ICON, SHIELD_ICON, SOUND_OFF, SOUND_ON, glyphs, paintGlyphs } from './icons';
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

/** How far below the top bar the hint's line reaches (px): a corner dock above this crowds it. */
const HINT_LINE = 50;
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
  /** The shield bar's loudness band last drawn (calm, ok, low, crit). */
  private shownLv = '';
  private lastHp = -1;
  private hurtCd = 0;
  private vignette: HTMLElement;
  private gold: HTMLElement;
  private purse: HTMLElement;
  private flying = 0;
  private shownGold = -1;
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
    const step = Math.floor(charge * 200);
    if (step !== this.shownCharge) {
      this.shownCharge = step;
      this.heroBtn.style.setProperty('--p', `${step / 2}%`);
      this.heroPct.textContent = w.hero.buffT > 0 || charge >= 1 ? '' : `${Math.floor(step / 2)}%`;
    }
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
    this.wallFill.style.width = `${(frac * 100).toFixed(1)}%`;
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
