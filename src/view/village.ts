// The village (§11), on screen the toy box: the main screen between runs. The player picks the next
// level on the chapter route (§9.1) or endless, spends crystals on training (stat start levels),
// heroes and the workshop, picks the hero, and takes the daily reward, tasks and challenge. It fills
// the window over the paused, blurred picnic with the battle HUD hidden; every change goes through
// `onChange` so main.ts can save it.

import { META } from '../sim/config';
import { LEVELS, levelName } from '../sim/levels';
import { LOCALES, getLocale, isLocale, localeName, t, type Locale } from '../i18n';
import {
  ALL_HEROES, DAILY, PRICES, TRAIN_KEYS, buyHero, buyTrain, buyVillage, challengeOf, claimChallenge, claimDaily,
  claimTask, endlessOpen, hasClaim, heroPrice, levelCrystals, levelOpen, nextLevel, pickHero, starsOf, taskText, totalStars,
  trainPrice, villagePrice, type RunMode, type Save, type TrainKey, type VillageKey,
} from '../meta/progress';
import { ACH_ICON, DAILY_ICON, HERO_ICON, LEVEL_ICON, SOUND_OFF, SOUND_ON, STAT_ICON, TRAIN_ICON, VILLAGE_ICON, glyphs } from './icons';
import { ACHIEVEMENTS, achievementClaimed, achievementDone, claimAchievement, hasAchievement } from '../meta/achievements';

export type VillageTab = 'levels' | 'train' | 'hero' | 'village' | 'daily' | 'ach';
type Tab = VillageTab;

export interface VillageActions {
  /** Something was bought or picked; save it. */
  onChange(): void;
  onPlay(mode: RunMode): void;
  /** Feedback sound: true for a purchase or claim, false when it can't be done. */
  onClick(ok: boolean): void;
  /** The player picked another language. */
  onLanguage(locale: Locale): void;
  /** Sound on or off, from the settings popup. */
  onMute(): void;
  muted(): boolean;
}

/** A village building's effect at level `lv`. */
function buildText(k: VillageKey, lv: number): string {
  return t(`build.${k}.text`, { n: META[k] * lv });
}

/** Stars as text: gold for won, faint for missing. */
function starRow(n: number): string {
  return `<span class="srow">${'★'.repeat(n)}<s>${'★'.repeat(3 - n)}</s></span>`;
}

const GEAR = `<svg class="ic" viewBox="0 0 64 64" aria-hidden="true" stroke="#2b1d14" stroke-width="3" stroke-linejoin="round">`
  + `<path d="M28 6h8l2 8l6 3l7-4l6 6l-4 7l3 6l8 2v8l-8 2l-3 6l4 7l-6 6l-7-4l-6 3l-2 8h-8l-2-8l-6-3l-7 4l-6-6l4-7l-3-6l-8-2v-8l8-2l3-6l-4-7l6-6l7 4l6-3z" fill="#d7dee6"/>`
  + `<circle cx="32" cy="32" r="9" fill="#5a6b7c"/></svg>`;

const TAB_ICON: Record<Tab, string> = { levels: LEVEL_ICON, train: TRAIN_ICON, hero: HERO_ICON.farmer, village: VILLAGE_ICON, daily: DAILY_ICON, ach: ACH_ICON };

export class Village {
  private root: HTMLElement;
  private tab: Tab = 'levels';
  /** The route node picked on the levels tab: a level index or endless. */
  private sel: number | 'endless' = 0;
  /** The settings popup (language, sound) is up. */
  private settings = false;
  /** A drag on the level route: where it started and whether it moved far enough to not be a tap. */
  private drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null;
  open = false;

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
      const b = target.closest('button');
      // A tap outside the settings popup closes it (and still does what was tapped).
      if (this.settings && !target.closest('.vset') && b?.dataset.a !== 'gear') {
        this.settings = false;
        if (!b) return this.render();
      }
      if (b) this.press(b.dataset);
    });
    // The route hides its scrollbar: drag it (mouse or finger; the page blocks native touch
    // scrolling) or use the arrows beside it.
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
    this.root.addEventListener('scroll', () => this.arrows(), true);
    window.addEventListener('resize', () => {
      if (!this.open) return;
      this.arrows();
      this.fitTabs();
    });
    this.root.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      if (isLocale(v)) this.act.onLanguage(v);
    });
  }

  show(tab?: Tab): void {
    this.tab = tab ?? 'levels';
    // The route starts on the first level not cleared, or endless once the chapter is done.
    const s = this.save();
    const next = nextLevel(s);
    this.sel = next < LEVELS.length ? next : endlessOpen(s) ? 'endless' : LEVELS.length - 1;
    this.open = true;
    this.settings = false;
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

  private route(): HTMLElement | null {
    return this.root.querySelector('.route');
  }

  /** Whether the route runs across (landscape) rather than down. */
  private across(r: HTMLElement): boolean {
    return getComputedStyle(r).flexDirection === 'row';
  }

  /** Grey out a route arrow when there is nothing more that way. */
  private arrows(): void {
    const r = this.route();
    const [back, on] = this.root.querySelectorAll<HTMLButtonElement>('.rarr');
    if (!r || !back || !on) return;
    const across = this.across(r);
    const at = across ? r.scrollLeft : r.scrollTop;
    const end = across ? r.scrollWidth - r.clientWidth : r.scrollHeight - r.clientHeight;
    back.disabled = at <= 1;
    on.disabled = at >= end - 1;
  }

  /** One arrow press: most of a screen of route along whichever way it runs. */
  private scrollRoute(dir: number): void {
    const r = this.route();
    if (!r) return;
    // Eased by hand: smooth scrollBy is ignored in some webviews.
    const key = this.across(r) ? 'scrollLeft' : 'scrollTop';
    const from = r[key];
    const by = dir * (key === 'scrollLeft' ? r.clientWidth : r.clientHeight) * 0.7;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 220);
      r[key] = from + by * (1 - (1 - k) ** 3);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private press(d: DOMStringMap): void {
    const s = this.save();
    let ok = true;
    switch (d.a) {
      case 'tab': this.tab = d.v as Tab; break;
      case 'gear': this.settings = !this.settings; this.render(); return;
      case 'mute': this.act.onMute(); break;
      case 'scroll': this.scrollRoute(Number(d.v)); return;
      case 'play': this.act.onPlay(d.v === 'challenge' ? 'challenge' : this.sel); return;
      case 'sel': this.sel = d.v === 'endless' ? 'endless' : Number(d.v); break;
      case 'buyTrain': ok = buyTrain(s, d.v as TrainKey); break;
      case 'buyHero': ok = buyHero(s, d.v as never); break;
      case 'hero': ok = pickHero(s, d.v as never); break;
      case 'buyVillage': ok = buyVillage(s, d.v as VillageKey); break;
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

  private price(p: number | null, a: string, v: string, label: string, crystals: number): string {
    if (p === null) return `<button class="buy" disabled>${t('village.maxed')}</button>`;
    return `<button class="buy" data-a="${a}" data-v="${v}" ${crystals < p ? 'disabled' : ''}>${label} 💎${p}</button>`;
  }

  render(): void {
    const s = this.save();
    const tabs: [Tab, string][] = [['levels', t('village.tabLevels')], ['train', t('village.tabTrain')], ['hero', t('village.tabHero')], ['village', t('village.tabVillage')], ['daily', t('village.tabDaily')], ['ach', t('village.tabAch')]];
    const badges: Partial<Record<Tab, boolean>> = { daily: hasClaim(s), ach: hasAchievement(s) };
    let body = '';
    const endless = endlessOpen(s);
    let foot = t(`hero.${s.hero}.name`);
    let canPlay = true;
    if (this.tab === 'levels') {
      // The route: a column in portrait, a row in landscape (the stylesheet turns it).
      // The level to play next is drawn larger; locked ones smaller and faded. Arrows either end.
      const next = nextLevel(s);
      body = `<div class="rwrap"><button class="rarr" data-a="scroll" data-v="-1" aria-label="${t('village.earlier')}"></button><div class="route">` + LEVELS.map((_, i) => {
        const open = levelOpen(s, i);
        const cls = [open ? '' : 'locked', starsOf(s, i) ? 'done' : '', this.sel === i ? 'on' : '', i === next ? 'cur' : '', i === LEVELS.length - 1 ? 'boss' : ''].join(' ');
        return `<button class="node ${cls}" data-a="sel" data-v="${i}" ${open ? '' : 'disabled'}><b>${levelName(i)}</b>${open ? starRow(starsOf(s, i)) : '🔒'}</button>`;
      }).join('') + `<button class="node endless ${endless ? '' : 'locked'} ${endless && next >= LEVELS.length ? 'cur' : ''} ${this.sel === 'endless' ? 'on' : ''}" data-a="sel" data-v="endless" ${endless ? '' : 'disabled'}><b>∞</b><span>${endless ? t('village.endless') : '🔒'}</span></button></div>`
        + `<button class="rarr" data-a="scroll" data-v="1" aria-label="${t('village.later')}"></button></div>`;
      if (this.sel === 'endless') {
        foot = `<b>${t('village.endless')}</b> · ${t('village.best', { n: s.best })}`;
      } else {
        const i = this.sel;
        const lv = LEVELS[i];
        const best = starsOf(s, i);
        const mods = (lv.mods ?? []).map((m) => t(`challenge.${m}.name`)).join(' · ');
        const pay = t(best ? 'village.replay' : 'village.firstClear', { n: levelCrystals(s, i, lv.waves, 1) });
        foot = `<b>${levelName(i)}</b> ${starRow(best)} · ${t('village.levelInfo', { n: lv.waves })}${mods ? ` · ${mods}` : ''} · ${pay}`;
      }
      if (!endless) foot += `<br><small>${t('village.endlessLocked')}</small>`;
    } else if (this.tab === 'train') {
      body = `<p class="sub">${t('village.trainHint')}</p><div class="grid">` + TRAIN_KEYS.map((k) => {
        const lv = s.train[k];
        return `<div class="item ${lv ? 'picked' : ''}">
          <div class="ico emoji">${STAT_ICON[k]}</div>
          <b>${t(`stat.${k}.name`)}</b><span>${t(`stat.${k}.text`)}</span>
          <span>${t('village.startLevel', { lv })} / ${PRICES.train[k].max}</span>
          ${this.price(trainPrice(s, k), 'buyTrain', k, t('village.upgrade'), s.crystals)}
        </div>`;
      }).join('') + '</div>';
    } else if (this.tab === 'hero') {
      body = `<div class="grid">` + ALL_HEROES.map((h) => {
        const lv = s.heroes[h];
        const p = heroPrice(s, h);
        return `<div class="item wide ${lv ? '' : 'locked'} ${s.hero === h ? 'picked' : ''}">
          <div class="ico">${HERO_ICON[h]}</div>
          <b>${t(`hero.${h}.name`)}</b><span>${t(`hero.${h}.text`)}</span>
          <span>${lv ? t('village.heroLevel', { lv, p: Math.round(META.heroCharge * (lv - 1) * 100) }) : t('village.locked')}</span>
          ${this.price(p, 'buyHero', h, t(lv ? 'village.upgrade' : 'village.unlock'), s.crystals)}
          ${lv ? `<button class="pick" data-a="hero" data-v="${h}" ${s.hero === h ? 'disabled' : ''}>${t(s.hero === h ? 'village.selected' : 'village.select')}</button>` : ''}
        </div>`;
      }).join('') + '</div>';
    } else if (this.tab === 'village') {
      body = `<div class="grid">` + (['wall', 'gold'] as VillageKey[]).map((k) => {
        const lv = s.village[k];
        return `<div class="item wide">
          <b>${t(`build.${k}.name`)}</b><span>${t('village.buildLevel', { lv, max: PRICES.village[k].max })}</span>
          <span>${lv ? buildText(k, lv) : t('village.notBuilt')}${lv < PRICES.village[k].max ? ` → ${buildText(k, lv + 1)}` : ''}</span>
          ${this.price(villagePrice(s, k), 'buyVillage', k, t('village.build'), s.crystals)}
        </div>`;
      }).join('') + '</div>';
    } else if (this.tab === 'ach') {
      // Ready to claim first, then the rest in table order, claimed last.
      const rank = (a: (typeof ACHIEVEMENTS)[number]) => (achievementClaimed(s, a) ? 2 : achievementDone(s, a) ? 0 : 1);
      body = `<div class="grid">` + [...ACHIEVEMENTS].sort((a, b) => rank(a) - rank(b)).map((a) => {
        const claimed = achievementClaimed(s, a);
        const done = achievementDone(s, a);
        return `<div class="item wide ${claimed ? 'picked' : ''}"><b>${a.text()}</b>
          <span>${t('village.taskProgress', { done: Math.min(a.of(s), a.goal), goal: a.goal, n: a.reward })}</span>
          <button class="buy" data-a="ach" data-v="${a.id}" ${claimed || !done ? 'disabled' : ''}>${t(claimed ? 'village.claimed' : 'village.claim')}</button></div>`;
      }).join('') + '</div>';
    } else {
      const d = s.daily;
      const ch = challengeOf(d.day);
      body = `<div class="grid">
        <div class="item wide"><b>${t('village.checkIn')}</b><span>${t('village.checkInText', { n: DAILY.reward })}</span>
          <button class="buy" data-a="daily" ${d.claimed ? 'disabled' : ''}>${t(d.claimed ? 'village.claimedToday' : 'village.claim')}</button></div>
        ${d.tasks.map((task, i) => `<div class="item wide"><b>${taskText(task)}</b>
          <span>${t('village.taskProgress', { done: Math.min(task.progress, task.goal), goal: task.goal, n: DAILY.task })}</span>
          <button class="buy" data-a="task" data-v="${i}" ${task.claimed || task.progress < task.goal ? 'disabled' : ''}>${t(task.claimed ? 'village.claimed' : 'village.claim')}</button></div>`).join('')}
        <div class="item wide"><b>${t('village.challenge', { name: t(`challenge.${ch.id}.name`) })}</b>
          <span>${t('village.challengeText', { rule: t(`challenge.${ch.id}.text`), wave: DAILY.challengeWave, n: DAILY.challenge })}</span>
          ${d.challengeBest ? `<span>${t('village.challengeBest', { n: d.challengeBest })}</span>` : ''}
          ${endless ? `<button class="pick" data-a="play" data-v="challenge">${t('village.challengeGo')}</button>` : `<span>${t('village.endlessLocked')}</span>`}
          <button class="buy" data-a="challenge" ${d.challengeClaimed || d.challengeBest < DAILY.challengeWave ? 'disabled' : ''}>${t(d.challengeClaimed ? 'village.claimed' : 'village.claim')}</button></div>
      </div>`;
    }
    // Keep where the lists were scrolled: a purchase re-renders the whole screen. A new tab starts at the top.
    const same = this.root.dataset.tab === this.tab;
    this.root.dataset.tab = this.tab;
    const keep = same ? [...this.root.querySelectorAll<HTMLElement>('.vbody, .route')].map((el) => [el.scrollLeft, el.scrollTop]) : [];
    const lang = `<select class="lang">${LOCALES.map((l) => `<option value="${l}" ${l === getLocale() ? 'selected' : ''}>${localeName(l)}</option>`).join('')}</select>`;
    const muted = this.act.muted();
    // Title bar on top, the tabs as a navigation bar (bottom in portrait, left in landscape), and
    // the start button in the bottom right corner under the right thumb in both.
    this.root.innerHTML = glyphs(`
      <header class="vhead"><h1 class="logo">${t('title')}</h1>
        <span class="crystals">💎 ${s.crystals}</span><span class="best"><span class="srow">★</span> ${totalStars(s)} / ${LEVELS.length * 3}${endless ? ` · ${t('village.best', { n: s.best })}` : ''}</span>
        <button class="gear ${this.settings ? 'on' : ''}" data-a="gear" aria-label="${t('village.settings')}" aria-expanded="${this.settings}">${GEAR}</button></header>
      ${this.settings ? `<div class="vset" role="dialog" aria-label="${t('village.settings')}"><b>${t('village.settings')}</b>
        <label><span>${t('lang.label')}</span>${lang}</label>
        <label><span>${t('village.sound')}</span><button class="sound ${muted ? 'off' : ''}" data-a="mute" aria-pressed="${!muted}" aria-label="${t('village.sound')}">${muted ? SOUND_OFF : SOUND_ON}</button></label></div>` : ''}
      <nav class="vtabs">${tabs.map(([t, n]) => `<button data-a="tab" data-v="${t}" class="${this.tab === t ? 'on' : ''}">${TAB_ICON[t]}<span>${n}</span>${badges[t] ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav>
      <main class="vbody t-${this.tab}">${body}</main>
      <footer class="vfoot"><span>${foot}</span>
        <button class="play" data-a="play" ${canPlay ? '' : 'disabled'}>${t('village.play')}</button></footer>`);
    this.root.querySelectorAll<HTMLElement>('.vbody, .route').forEach((el, i) => {
      if (keep[i]) [el.scrollLeft, el.scrollTop] = keep[i];
    });
    this.root.querySelector('.node.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.arrows();
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
