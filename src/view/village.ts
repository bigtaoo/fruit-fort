// The village (§11), on screen the base: the main screen between runs. Three pages on the navigation
// bar (§11.4): Battle in the middle is home, the chapter route (§9.1) with the level to play and the
// start button; Upgrade spends crystals on training (stat start levels) and the workshop; Heroes buys
// and picks the hero. Rewards (daily gift, tasks, challenge, achievements) opens from a button beside
// the route, as does endless. It fills the window over the paused battlefield with the battle HUD
// hidden; every change goes through `onChange` so main.ts can save it.

import { CHAPTER_SIZE, levelName } from '../sim/levels';
import type { HeroKind, WagonKind } from '../sim/types';
import { isLocale, t, type Locale } from '../i18n';
import type { RunMode, Save } from '../meta/progress';
import { buyHero, buyTrain, buyVillage, pickHero, type TrainKey, type VillageKey } from '../meta/shop';
import { claimChallenge, claimDaily, claimTask, hasClaim } from '../meta/daily';
import { cardLevel, endlessOpen, nextLevel } from '../meta/chapter';
import { DAILY_ICON, HERO_ICON, GEAR_ICON, LEVEL_ICON, LOCK_ICON, TRAIN_ICON, glyphs } from './icons';
import { settingRows, type AudioSwitches } from './settings';
import { claimAchievement, hasAchievement } from '../meta/achievements';
import { buyWagon } from '../meta/wagonmeta';
import { wagonBook } from './wagonbook';
import { heroPage, levelsPage, price, rewardsPage, trainPage } from './villagepages';

export type VillageTab = 'levels' | 'train' | 'hero' | 'rewards' | 'wagons';
type Tab = VillageTab;

export interface VillageActions {
  /** Something was bought or picked; save it. */
  onChange(): void;
  onPlay(mode: RunMode): void;
  /** Feedback sound: true for a purchase or claim, false when it can't be done. */
  onClick(ok: boolean): void;
  /** The player picked another language. */
  onLanguage(locale: Locale): void;
  /** The music or the effects switched on or off in the settings popup. */
  onSound(kind: 'music' | 'sfx'): void;
  sound(): AudioSwitches;
  /** The hero's 3D trooper as a picture (scene.heroPortrait); the drawn icon without it. */
  portrait?(kind: HeroKind): string;
  /** The fort on screen, client px (its fence's bounding box): the landscape route orbits it. */
  fort?(): { l: number; t: number; r: number; b: number };
}

export class Village {
  private root: HTMLElement;
  private tab: Tab = 'levels';
  /** The level to play next, lit gold on the route (cardLevel), set on each render. */
  private sel: number | 'endless' = 0;
  /** The chapter the route shows, paged with ‹ ›; null: the one holding the level to play next. */
  private chap: number | null = null;
  /** A node was tapped and its run starts after the press shows (Village.go). */
  private starting = false;
  /** The tile picked on the upgrade page, `t:dmg` or `v:wall`; none: the one lit. */
  private up = '';
  /** The rewards page lists every goal, not only the nearest. */
  private allGoals = false;
  /** The settings popup (language, sound) is up. */
  private settings = false;
  /** The hero tapped on the hero page, shown in the big card without being picked; null: the one in use. */
  private look: HeroKind | null = null;
  /** The wagon tapped in the wagon book (§10.1.12); null: the first still locked. */
  private wlook: WagonKind | null = null;
  /** A drag on the level route: where it started and whether it moved far enough to not be a tap. */
  private drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null;
  open = false;

  /** The tab on screen. */
  get current(): Tab {
    return this.tab;
  }

  constructor(private save: () => Save, private act: VillageActions) {
    this.root = document.createElement('div');
    this.root.id = 'village';
    this.root.className = 'hidden';
    document.body.appendChild(this.root);
    // One listener for every button; each carries what it does in data-*.
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      // A drag along the route ends in a click on whatever node is under the finger: not a pick.
      if (this.drag?.moved) {
        this.drag = null;
        return;
      }
      const b = target.closest<HTMLElement>('button, .tile, [data-a]');
      // A tap outside the settings popup closes it (and still does what was tapped).
      if (this.settings && !target.closest('.vset') && b?.dataset.a !== 'gear') {
        this.settings = false;
        if (!b) return this.render();
      }
      if (b) this.press(b);
    });
    // The route hides its scrollbar: drag it (mouse or finger; the page blocks native touch scrolling).
    this.root.addEventListener('pointerdown', (e) => {
      const r = this.route();
      this.drag = r?.contains(e.target as Node) ? { x: e.clientX, y: e.clientY, left: r.scrollLeft, top: r.scrollTop, moved: false } : null;
    });
    this.root.addEventListener('pointermove', (e) => {
      const r = this.route();
      if (!this.drag || !r || !e.buttons) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 8) this.drag.moved = true;
      if (!this.drag.moved) return;
      r.scrollLeft = this.drag.left - dx;
      r.scrollTop = this.drag.top - dy;
    });
    window.addEventListener('resize', () => {
      if (!this.open) return;
      this.line();
      // The stage reframes the fort on the same resize: place the orbit again once it has.
      requestAnimationFrame(() => this.line());
      this.fitTabs();
    });
    this.root.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      if (isLocale(v)) this.act.onLanguage(v);
    });
  }

  show(tab?: Tab): void {
    this.tab = tab ?? 'levels';
    this.starting = false;
    this.open = true;
    this.settings = false;
    this.look = null;
    delete this.root.dataset.tab;
    this.root.classList.remove('hidden');
    // The battle HUD (wave, fence, stat dock, result card) stays out of sight behind the main screen.
    document.body.classList.add('village-open');
    this.render();
  }

  hide(): void {
    this.open = false;
    this.root.classList.add('hidden');
    document.body.classList.remove('village-open');
  }

  /** In landscape, the room between the title bar and the navigation row, where the camera frames the
   *  fort while the village is up (the battle's own framing would leave it low, half behind the row on a
   *  short screen); null in portrait or when closed, where the battle framing stands. */
  area(): { x: number; y: number; w: number; h: number } | null {
    if (!this.open || !matchMedia('(min-aspect-ratio: 1001/1000)').matches) return null;
    const top = this.root.querySelector('.vhead')?.getBoundingClientRect().bottom ?? 0;
    const bottom = this.root.querySelector('.vtabs')?.getBoundingClientRect().top ?? window.innerHeight;
    return { x: 0, y: top, w: window.innerWidth, h: Math.max(1, bottom - top) };
  }

  /** Place the route again: the camera has moved, and the orbit rings the fort where it now is. */
  place(): void {
    if (this.open) this.line();
  }

  private route(): HTMLElement | null {
    return this.root.querySelector('.route');
  }

  /** The track through the node centres: dashed ahead, solid up to the first level not cleared. */
  private line(): void {
    const r = this.root.querySelector<HTMLElement>('.rtrack');
    const svg = r?.querySelector('svg');
    if (!r || !svg) return;
    const nodes = [...r.querySelectorAll<HTMLElement>('.node')];
    this.orbit(r, nodes);
    const pts = nodes.map((n) => `${n.offsetLeft + n.offsetWidth / 2},${n.offsetTop + n.offsetHeight / 2}`);
    const cur = nodes.findIndex((n) => !n.classList.contains('done'));
    svg.setAttribute('width', String(r.offsetWidth));
    svg.setAttribute('height', String(r.offsetHeight));
    svg.innerHTML = `<polyline class="ahead" points="${pts.join(' ')}"/><polyline class="past" points="${pts.slice(0, cur < 0 ? pts.length : cur + 1).join(' ')}"/>`;
  }

  /** In landscape the chapter's levels ring the fort, first at the bottom left round to the boss at the
   *  bottom right, evenly spaced along the ellipse, so the route never crosses the base and fills a wide
   *  screen. Without the fort's place (or in portrait) the stylesheet's zigzag stands. */
  private orbit(r: HTMLElement, nodes: HTMLElement[]): void {
    const fort = matchMedia('(min-aspect-ratio: 1001/1000)').matches ? this.act.fort?.() : undefined;
    r.classList.toggle('orbit', !!fort);
    for (const n of nodes) n.style.left = n.style.top = '';
    if (!fort) return;
    const box = r.getBoundingClientRect();
    // CSS zoom (large screens): client px over layout px.
    const k = box.width / r.offsetWidth || 1;
    const W = r.offsetWidth;
    const H = r.offsetHeight;
    const cx = ((fort.l + fort.r) / 2 - box.left) / k;
    const cy = ((fort.t + fort.b) / 2 - box.top) / k;
    // Room for half a node (and the pay tag under the next one) inside the route on every side.
    const ry = Math.max(40, Math.min(cy - 44, H - cy - 54));
    // Each side as wide as its room allows (the fort need not sit mid-screen), and not flatter than 3:1:
    // on a short landscape phone a rounder ring left the levels at its ends touching.
    const rxL = Math.max(60, Math.min(cx - 56, ry * 3));
    const rxR = Math.max(60, Math.min(W - cx - 56, ry * 3));
    // A node as laid out (smaller on a short screen), with a little room round it and the pay tag under it.
    const nw = (nodes[0]?.offsetWidth || 76) + 8;
    const nh = (nodes[0]?.offsetHeight || 64) + 12;
    // A gap at the bottom between the first level and the boss; points by arc length, not angle,
    // counted in node sizes, so the ends of the ring, where the levels stack up and down, get as much
    // clearance as the sides.
    const gap = 0.42;
    const a0 = Math.PI / 2 + gap / 2;
    const span = Math.PI * 2 - gap;
    const N = 240;
    const pts: [number, number][] = [];
    const len = [0];
    for (let i = 0; i <= N; i++) {
      const a = a0 + (span * i) / N;
      pts.push([cx + Math.cos(a) * (Math.cos(a) < 0 ? rxL : rxR), cy + Math.sin(a) * ry]);
      if (i) len.push(len[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) / nw, (pts[i][1] - pts[i - 1][1]) / nh));
    }
    let j = 0;
    nodes.forEach((n, i) => {
      const want = (len[N] * i) / Math.max(1, nodes.length - 1);
      while (j < N && len[j + 1] < want) j++;
      const [x, y] = pts[j];
      n.style.left = `${x - n.offsetWidth / 2}px`;
      n.style.top = `${y - n.offsetHeight / 2}px`;
    });
  }

  /** A tapped route node or Endless starts at once: it sinks in first so the tap reads as the cause. */
  private go(b: HTMLElement, mode: number | 'endless'): void {
    if (this.starting) return;
    this.starting = true;
    b.classList.add('go');
    window.setTimeout(() => {
      this.starting = false;
      if (this.open) this.act.onPlay(mode);
    }, 120);
  }

  /** A locked node or Endless shakes and says what opens it, for a moment over the route. */
  private refuse(b: HTMLElement, text: string): void {
    this.act.onClick(false);
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
    this.root.querySelector('.vtoast')?.remove();
    const tip = document.createElement('div');
    tip.className = 'vtoast';
    tip.setAttribute('role', 'status');
    tip.textContent = text;
    this.root.appendChild(tip);
    window.setTimeout(() => tip.remove(), 1600);
  }

  private press(b: HTMLElement): void {
    const d = b.dataset;
    const s = this.save();
    let ok = true;
    switch (d.a) {
      case 'tab': this.tab = d.v as Tab; this.allGoals = false; this.chap = null; this.look = null; break;
      // A hero card tapped (not its button): that hero in the big card, picked or not, owned or not.
      case 'look': this.look = d.v as HeroKind; break;
      case 'wlook': this.wlook = d.v as WagonKind; break;
      case 'buyWagon': this.wlook = d.v as WagonKind; ok = buyWagon(s, d.v as WagonKind); break;
      case 'chap': this.chap = Number(d.v); break;
      // A chapter not open yet: it opens with the boss of the one before it.
      case 'chapLocked': return this.refuse(b, t('village.clearFirst', { name: levelName(Number(d.v) * CHAPTER_SIZE - 1) }));
      case 'goals': this.allGoals = !this.allGoals; break;
      case 'gear': this.settings = !this.settings; this.render(); return;
      case 'music': case 'sfx': this.act.onSound(d.a); break;
      case 'play': this.act.onPlay('challenge'); return;
      // One tap on an open level or Endless plays it: nothing on the route is only picked (§11.4).
      case 'sel': return this.go(b, d.v === 'endless' ? 'endless' : Number(d.v));
      case 'locked': return this.refuse(b, d.v === 'endless' ? t('village.endlessLocked') : t('village.clearFirst', { name: levelName(nextLevel(s)) }));
      case 'up': this.up = d.v!; break;
      case 'buyTrain': this.up = `t:${d.v}`; ok = buyTrain(s, d.v as TrainKey); break;
      case 'buyHero': ok = buyHero(s, d.v as never); break;
      case 'hero': ok = pickHero(s, d.v as never); break;
      case 'buyVillage': this.up = `v:${d.v}`; ok = buyVillage(s, d.v as VillageKey); break;
      case 'daily': ok = claimDaily(s); break;
      case 'task': ok = claimTask(s, Number(d.v)); break;
      case 'challenge': ok = claimChallenge(s); break;
      case 'ach': ok = claimAchievement(s, d.v!); break;
      default: return;
    }
    this.act.onClick(ok);
    if (ok) this.act.onChange();
    this.render();
  }

  render(): void {
    const s = this.save();
    // Battle is home, in the middle of the bar; Rewards is reached from home, so no tab is lit there.
    const tabs: [Tab, string, string][] = [['train', TRAIN_ICON, t('village.tabUp')], ['levels', LEVEL_ICON, t('village.tabFight')], ['hero', HERO_ICON[s.hero], t('village.tabHero')]];
    const endless = endlessOpen(s);
    // Something to claim on the rewards page: a dot on its button, and on Battle from the other pages.
    const claimable = hasClaim(s) || hasAchievement(s);
    if (this.tab === 'levels') this.sel = cardLevel(s);
    // Rewards (a dot when something waits to be claimed) and endless: beside the route in portrait; in
    // landscape they join the bottom navigation row at its two ends, Rewards left and endless right, so
    // Battle stays third of five, in the middle (the stylesheet shows one of the two places).
    const rewards = `<button class="sbtn ${this.tab === 'rewards' ? 'on' : ''}" data-a="tab" data-v="rewards">${DAILY_ICON}<span>${t('village.tabRewards')}</span>${claimable ? '<i class="dot"></i>' : ''}</button>`;
    const endlessBtn = `<button class="sbtn endless ${endless ? '' : 'locked'} ${this.sel === 'endless' ? 'cur' : ''}" data-a="${endless ? 'sel' : 'locked'}" data-v="endless" ${endless ? '' : `aria-label="${t('village.endlessLocked')}"`}><b>∞</b><span>${endless ? '' : LOCK_ICON}${t('village.endless')}</span></button>`;
    const side = `<div class="vside">${rewards}${endlessBtn}</div>`;
    let title = '';
    let body = '';
    let card = '';
    if (this.tab === 'levels') {
      ({ title, body } = levelsPage(s, this.sel, this.chap, side));
    } else if (this.tab === 'train') {
      ({ title, body, card } = trainPage(s, this.up));
    } else if (this.tab === 'hero') {
      ({ title, body } = heroPage(s, this.look, this.act));
    } else if (this.tab === 'wagons') {
      ({ title, body } = wagonBook(s, this.wlook, (p, a, v, label) => price(p, a, v, label, s.crystals)));
    } else {
      ({ title, body } = rewardsPage(s, this.allGoals, endless));
    }
    // Keep where the lists were scrolled: a purchase re-renders the whole screen. A new tab starts at the top.
    const same = this.root.dataset.tab === this.tab;
    this.root.dataset.tab = this.tab;
    const keep = same ? [...this.root.querySelectorAll<HTMLElement>('.vbody, .route')].map((el) => [el.scrollLeft, el.scrollTop]) : [];
    // Title bar on top (the chapter on home, else the page), the pages as a navigation bar along the
    // bottom (in landscape with Rewards and endless at its two ends); on Upgrade the picked tile's card over the bar.
    this.root.innerHTML = glyphs(`
      <header class="vhead"><div class="vtitle">${title}</div>
        <span class="crystals">💎 ${s.crystals}</span>
        <button class="gear ${this.settings ? 'on' : ''}" data-a="gear" aria-label="${t('village.settings')}" aria-expanded="${this.settings}">${GEAR_ICON}</button></header>
      ${this.settings ? `<div class="vsetwrap"><div class="vset spanel" role="dialog" aria-label="${t('village.settings')}"><b class="splate">${t('village.settings')}</b>
        <button class="sx" data-a="gear" aria-label="✕">✕</button>${settingRows(this.act.sound())}<small class="ver">v${__APP_VERSION__}</small></div></div>` : ''}
      <nav class="vtabs"><div class="vside l">${rewards}</div>${tabs.map(([k, icon, n]) => `<button data-a="tab" data-v="${k}" class="${k === 'levels' ? 'home' : ''} ${this.tab === k || (k === 'levels' && this.tab === 'rewards') || (k === 'hero' && this.tab === 'wagons') ? 'on' : ''}">${icon}<span>${n}</span>${k === 'levels' && this.tab !== 'levels' && this.tab !== 'rewards' && claimable ? '<i class="dot"></i>' : ''}</button>`).join('')}<div class="vside r">${endlessBtn}</div></nav>
      <main class="vbody t-${this.tab === 'wagons' ? 'hero' : this.tab}">${body}</main>
      ${card}`);
    this.root.querySelectorAll<HTMLElement>('.vbody, .route').forEach((el, i) => {
      if (keep[i]) [el.scrollLeft, el.scrollTop] = keep[i];
    });
    this.line();
    // A new visit to home centres the route on the level to play next (the orbit has nothing to scroll).
    if (!this.root.querySelector('.orbit')) this.root.querySelector(`.node[data-v="${this.sel}"]`)?.scrollIntoView({ block: same ? 'nearest' : 'center', inline: same ? 'nearest' : 'center' });
    this.fitTabs();
  }

  /** A navigation label too long for its tab (Мастерская on a 375 px phone) shrinks to fit, never wraps. */
  private fitTabs(): void {
    for (const el of this.root.querySelectorAll<HTMLElement>('.vtabs button > span')) {
      el.style.fontSize = '';
      if (el.scrollWidth <= el.clientWidth) continue;
      const f = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${Math.max(8, Math.floor(f * el.clientWidth / el.scrollWidth * 10) / 10)}px`;
    }
  }
}
