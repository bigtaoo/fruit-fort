// The village (§11), on screen the base: the main screen between runs. Three pages on the navigation
// bar (§11.4): Battle in the middle is home, the chapter route (§9.1) with the level to play and the
// start button; Upgrade spends crystals on training (stat start levels) and the workshop; Heroes buys
// and picks the hero. Rewards (daily gift, tasks, challenge, achievements) opens from a button beside
// the route, as does endless. It fills the window over the paused battlefield with the battle HUD
// hidden; every change goes through `onChange` so main.ts can save it.

import { META } from '../sim/config';
import { LEVELS, levelName } from '../sim/levels';
import { LOCALES, getLocale, isLocale, localeName, t, type Locale } from '../i18n';
import {
  ALL_HEROES, DAILY, PRICES, TRAIN_KEYS, buyHero, buyTrain, buyVillage, challengeOf, claimChallenge, claimDaily,
  claimTask, endlessOpen, hasClaim, heroPrice, levelCrystals, levelOpen, nextLevel, pickHero, starsOf, taskText, totalStars,
  trainPrice, villagePrice, type RunMode, type Save, type TrainKey, type VillageKey,
} from '../meta/progress';
import { ACH_ICON, DAILY_ICON, HERO_ICON, GEAR_ICON, LEVEL_ICON, SOUND_OFF, SOUND_ON, STAT_ICON, TRAIN_ICON, glyphs } from './icons';
import { ACHIEVEMENTS, achievementClaimed, achievementDone, claimAchievement, hasAchievement } from '../meta/achievements';

export type VillageTab = 'levels' | 'train' | 'hero' | 'rewards';
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

/** One line of a list page: icon, name and effect, level, buttons. */
function row(icon: string, name: string, text: string, lv: string, buttons: string, cls = ''): string {
  return `<div class="item row ${cls}"><div class="ico">${icon}</div><div class="rtx"><b>${name}</b>${text}</div>`
    + `${lv ? `<span class="rlv">${lv}</span>` : ''}<div class="rbtn">${buttons}</div></div>`;
}

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
      const b = target.closest('button');
      // A tap outside the settings popup closes it (and still does what was tapped).
      if (this.settings && !target.closest('.vset') && b?.dataset.a !== 'gear') {
        this.settings = false;
        if (!b) return this.render();
      }
      if (b) this.press(b.dataset);
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

  /** The track through the node centres: dashed ahead, solid up to the level to play. */
  private line(): void {
    const r = this.root.querySelector<HTMLElement>('.rtrack');
    const svg = r?.querySelector('svg');
    if (!r || !svg) return;
    const nodes = [...r.querySelectorAll<HTMLElement>('.node')];
    const pts = nodes.map((n) => `${n.offsetLeft + n.offsetWidth / 2},${n.offsetTop + n.offsetHeight / 2}`);
    const cur = nodes.findIndex((n) => n.classList.contains('cur'));
    svg.setAttribute('width', String(r.offsetWidth));
    svg.setAttribute('height', String(r.offsetHeight));
    svg.innerHTML = `<polyline class="ahead" points="${pts.join(' ')}"/><polyline class="past" points="${pts.slice(0, cur < 0 ? pts.length : cur + 1).join(' ')}"/>`;
  }

  private press(d: DOMStringMap): void {
    const s = this.save();
    let ok = true;
    switch (d.a) {
      case 'tab': this.tab = d.v as Tab; break;
      case 'gear': this.settings = !this.settings; this.render(); return;
      case 'mute': this.act.onMute(); break;
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
    return `<button class="buy" data-a="${a}" data-v="${v}" ${crystals < p ? 'disabled' : ''}>${label ? `${label} ` : ''}💎${p}</button>`;
  }

  render(): void {
    const s = this.save();
    // Battle is home, in the middle of the bar; Rewards is reached from home, so no tab is lit there.
    const tabs: [Tab, string, string][] = [['train', TRAIN_ICON, t('village.tabUp')], ['levels', LEVEL_ICON, t('village.tabFight')], ['hero', HERO_ICON[s.hero], t('village.tabHero')]];
    const endless = endlessOpen(s);
    // Something to claim on the rewards page: a dot on its button, and on Battle from the other pages.
    const claimable = hasClaim(s) || hasAchievement(s);
    const next = nextLevel(s);
    let title = '';
    let body = '';
    let card = '';
    if (this.tab === 'levels') {
      const cleared = LEVELS.filter((_, i) => starsOf(s, i) > 0).length;
      title = `<b>${t('village.chapter', { n: 1 })}</b><span class="cbar"><i style="width:${(cleared / LEVELS.length) * 100}%"></i></span><span>${cleared} / ${LEVELS.length}</span>`;
      // Beside the route: rewards (a dot when something waits to be claimed) and endless.
      const side = `<div class="vside">
        <button class="sbtn" data-a="tab" data-v="rewards">${DAILY_ICON}<span>${t('village.tabRewards')}</span>${claimable ? '<i class="dot"></i>' : ''}</button>
        <button class="sbtn endless ${this.sel === 'endless' ? 'on' : ''}" data-a="sel" data-v="endless" ${endless ? '' : `disabled title="${t('village.endlessLocked')}"`}><b>∞</b><span>${endless ? t('village.endless') : '🔒'}</span></button></div>`;
      // The route: a zigzag column from the bottom up in portrait, a row in landscape (the stylesheet
      // turns it), on a track drawn through the node centres (line()). The level to play next is
      // drawn larger; locked ones smaller and faded; the chapter boss last.
      body = side + `<div class="route"><div class="rtrack"><svg class="rline" aria-hidden="true"></svg>` + LEVELS.map((_, i) => {
        const open = levelOpen(s, i);
        const cls = [open ? '' : 'locked', starsOf(s, i) ? 'done' : '', this.sel === i ? 'on' : '', i === next ? 'cur' : '', i === LEVELS.length - 1 ? 'boss' : ''].join(' ');
        return `<button class="node ${cls}" data-a="sel" data-v="${i}" ${open ? '' : 'disabled'}><b>${levelName(i)}</b>${open ? starRow(starsOf(s, i)) : '🔒'}</button>`;
      }).join('') + '</div></div>';
      // Under the route: the hero going in (tap for the heroes page), what the picked level is, and
      // the start button naming it.
      let info: string;
      let name: string;
      if (this.sel === 'endless') {
        name = t('village.endless');
        info = `<b>${name}</b><small>${t('village.best', { n: s.best })}</small>`;
      } else {
        const i = this.sel;
        const lv = LEVELS[i];
        const best = starsOf(s, i);
        const mods = (lv.mods ?? []).map((m) => t(`challenge.${m}.name`)).join(' · ');
        const pay = t(best ? 'village.replay' : 'village.firstClear', { n: levelCrystals(s, i, lv.waves, 1) });
        name = levelName(i);
        info = `<b>${name} ${starRow(best)}</b><small>${t('village.levelInfo', { n: lv.waves })}${mods ? ` · ${mods}` : ''} · ${pay}</small>`;
      }
      card = `<footer class="vcard"><button class="hchip" data-a="tab" data-v="hero" aria-label="${t(`hero.${s.hero}.name`)}">${HERO_ICON[s.hero]}<span>Lv${s.heroes[s.hero]}</span></button>
        <div class="cinfo">${info}</div>
        <button class="play" data-a="play">${t('village.playLevel', { name })}</button></footer>`;
    } else if (this.tab === 'train') {
      // Training and the workshop both raise what a run starts with: one page, one line each.
      title = `<b>${t('village.tabUp')}</b>`;
      body = `<p class="sec">${t('village.trainHint')}</p><div class="list">` + TRAIN_KEYS.map((k) => {
        const lv = s.train[k];
        return row(STAT_ICON[k], t(`stat.${k}.name`), `<span>${t(`stat.${k}.text`)}</span>`, `Lv${lv}/${PRICES.train[k].max}`, this.price(trainPrice(s, k), 'buyTrain', k, '', s.crystals), lv ? 'picked' : '');
      }).join('') + `</div><p class="sec">${t('village.tabVillage')}</p><div class="list">` + (['wall', 'gold'] as VillageKey[]).map((k) => {
        const lv = s.village[k];
        const max = PRICES.village[k].max;
        const text = `${lv ? buildText(k, lv) : t('village.notBuilt')}${lv < max ? ` → ${buildText(k, lv + 1)}` : ''}`;
        return row(STAT_ICON[k], t(`build.${k}.name`), `<span>${text}</span>`, `Lv${lv}/${max}`, this.price(villagePrice(s, k), 'buyVillage', k, '', s.crystals), lv ? 'picked' : '');
      }).join('') + '</div>';
    } else if (this.tab === 'hero') {
      title = `<b>${t('village.tabHero')}</b>`;
      body = `<div class="list">` + ALL_HEROES.map((h) => {
        const lv = s.heroes[h];
        const p = heroPrice(s, h);
        const text = `<span>${t(`hero.${h}.text`)}</span><span>${lv ? t('village.heroLevel', { lv, p: Math.round(META.heroCharge * (lv - 1) * 100) }) : t('village.locked')}</span>`;
        const pick = lv ? `<button class="pick" data-a="hero" data-v="${h}" ${s.hero === h ? 'disabled' : ''}>${t(s.hero === h ? 'village.selected' : 'village.select')}</button>` : '';
        return row(HERO_ICON[h], t(`hero.${h}.name`), text, '', this.price(p, 'buyHero', h, t(lv ? 'village.upgrade' : 'village.unlock'), s.crystals) + pick, `${lv ? '' : 'locked'} ${s.hero === h ? 'picked' : ''}`);
      }).join('') + '</div>';
    } else {
      title = `<b>${t('village.tabRewards')}</b>`;
      const d = s.daily;
      const ch = challengeOf(d.day);
      const claim = (a: string, v: string, claimed: boolean, ready: boolean, done = t('village.claimed')) =>
        `<button class="buy" data-a="${a}" ${v ? `data-v="${v}"` : ''} ${claimed || !ready ? 'disabled' : ''}>${claimed ? done : t('village.claim')}</button>`;
      // The challenge plays endless under a rule; until endless opens it says how to open it, with no buttons.
      const chText = `<span>${t('village.challengeText', { rule: t(`challenge.${ch.id}.text`), wave: DAILY.challengeWave, n: DAILY.challenge })}</span>`
        + (d.challengeBest ? `<span>${t('village.challengeBest', { n: d.challengeBest })}</span>` : '') + (endless ? '' : `<span>${t('village.endlessLocked')}</span>`);
      const chBtns = endless ? `<button class="pick" data-a="play" data-v="challenge">${t('village.challengeGo')}</button>${claim('challenge', '', d.challengeClaimed, d.challengeBest >= DAILY.challengeWave)}` : '';
      // Achievements ready to claim first, then the rest in table order, claimed last.
      const rank = (a: (typeof ACHIEVEMENTS)[number]) => (achievementClaimed(s, a) ? 2 : achievementDone(s, a) ? 0 : 1);
      body = `<p class="sec">${t('village.tabDaily')}</p><div class="list">`
        + row(DAILY_ICON, t('village.checkIn'), `<span>${t('village.checkInText', { n: DAILY.reward })}</span>`, '', claim('daily', '', d.claimed, true, t('village.claimedToday')), d.claimed ? 'picked' : '')
        + d.tasks.map((task, i) => row(DAILY_ICON, taskText(task), `<span>${t('village.taskProgress', { done: Math.min(task.progress, task.goal), goal: task.goal, n: DAILY.task })}</span>`, '', claim('task', String(i), task.claimed, task.progress >= task.goal), task.claimed ? 'picked' : '')).join('')
        + row(LEVEL_ICON, t('village.challenge', { name: t(`challenge.${ch.id}.name`) }), chText, '', chBtns, endless ? '' : 'locked')
        + `</div><p class="sec">${t('village.tabAch')}</p><div class="list">`
        + [...ACHIEVEMENTS].sort((a, b) => rank(a) - rank(b)).map((a) => {
          const claimed = achievementClaimed(s, a);
          return row(ACH_ICON, a.text(), `<span>${t('village.taskProgress', { done: Math.min(a.of(s), a.goal), goal: a.goal, n: a.reward })}</span>`, '', claim('ach', a.id, claimed, achievementDone(s, a)), claimed ? 'picked' : '');
        }).join('') + '</div>';
    }
    // Keep where the lists were scrolled: a purchase re-renders the whole screen. A new tab starts at the top.
    const same = this.root.dataset.tab === this.tab;
    this.root.dataset.tab = this.tab;
    const keep = same ? [...this.root.querySelectorAll<HTMLElement>('.vbody, .route')].map((el) => [el.scrollLeft, el.scrollTop]) : [];
    const lang = `<select class="lang">${LOCALES.map((l) => `<option value="${l}" ${l === getLocale() ? 'selected' : ''}>${localeName(l)}</option>`).join('')}</select>`;
    const muted = this.act.muted();
    // Title bar on top (the chapter on home, else the page), the pages as a navigation bar (bottom in
    // portrait, left in landscape); on home the level card with the start button over the bar.
    this.root.innerHTML = glyphs(`
      <header class="vhead"><div class="vtitle">${title}</div>
        <span class="crystals">💎 ${s.crystals}</span><span class="best"><span class="srow">★</span> ${totalStars(s)} / ${LEVELS.length * 3}</span>
        <button class="gear ${this.settings ? 'on' : ''}" data-a="gear" aria-label="${t('village.settings')}" aria-expanded="${this.settings}">${GEAR_ICON}</button></header>
      ${this.settings ? `<div class="vset" role="dialog" aria-label="${t('village.settings')}"><b>${t('village.settings')}</b>
        <label><span>${t('lang.label')}</span>${lang}</label>
        <label><span>${t('village.sound')}</span><button class="sound ${muted ? 'off' : ''}" data-a="mute" aria-pressed="${!muted}" aria-label="${t('village.sound')}">${muted ? SOUND_OFF : SOUND_ON}</button></label></div>` : ''}
      <nav class="vtabs">${tabs.map(([k, icon, n]) => `<button data-a="tab" data-v="${k}" class="${k === 'levels' ? 'home' : ''} ${this.tab === k ? 'on' : ''}">${icon}<span>${n}</span>${k === 'levels' && this.tab !== 'levels' && claimable ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav>
      <main class="vbody t-${this.tab}">${body}</main>
      ${card}`);
    this.root.querySelectorAll<HTMLElement>('.vbody, .route').forEach((el, i) => {
      if (keep[i]) [el.scrollLeft, el.scrollTop] = keep[i];
    });
    this.line();
    // A new visit to home centres the route on the picked level.
    this.root.querySelector('.node.on')?.scrollIntoView({ block: same ? 'nearest' : 'center', inline: same ? 'nearest' : 'center' });
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
