// The village (§11): between runs the player picks the next level on the chapter route (§9.1) or
// endless, spends crystals on training (stat start levels), heroes and the village, picks the hero,
// and takes the daily reward, tasks and challenge. A DOM screen over the paused game; every change
// goes through `onChange` so main.ts can save it.

import { META } from '../sim/config';
import { LEVELS, levelName } from '../sim/levels';
import { LOCALES, getLocale, isLocale, localeName, t, type Locale } from '../i18n';
import {
  ALL_HEROES, DAILY, PRICES, TRAIN_KEYS, buyHero, buyTrain, buyVillage, challengeOf, claimChallenge, claimDaily,
  claimTask, endlessOpen, hasClaim, heroPrice, levelCrystals, levelOpen, nextLevel, pickHero, starsOf, taskText, totalStars,
  trainPrice, villagePrice, type RunMode, type Save, type TrainKey, type VillageKey,
} from '../meta/progress';
import { ACH_ICON, DAILY_ICON, HERO_ICON, LEVEL_ICON, STAT_ICON, TRAIN_ICON, VILLAGE_ICON, glyphs } from './icons';
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
}

/** A village building's effect at level `lv`. */
function buildText(k: VillageKey, lv: number): string {
  return t(`build.${k}.text`, { n: META[k] * lv });
}

/** Stars as text: gold for won, faint for missing. */
function starRow(n: number): string {
  return `<span class="srow">${'★'.repeat(n)}<s>${'★'.repeat(3 - n)}</s></span>`;
}

const TAB_ICON: Record<Tab, string> = { levels: LEVEL_ICON, train: TRAIN_ICON, hero: HERO_ICON.farmer, village: VILLAGE_ICON, daily: DAILY_ICON, ach: ACH_ICON };

export class Village {
  private root: HTMLElement;
  private tab: Tab = 'levels';
  /** The route node picked on the levels tab: a level index or endless. */
  private sel: number | 'endless' = 0;
  open = false;

  constructor(private save: () => Save, private act: VillageActions) {
    this.root = document.createElement('div');
    this.root.id = 'village';
    this.root.className = 'hidden';
    document.body.appendChild(this.root);
    // One listener for every button; each carries what it does in data-*.
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) this.press(b.dataset);
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
    this.root.classList.remove('hidden');
    this.render();
  }

  hide(): void {
    this.open = false;
    this.root.classList.add('hidden');
  }

  private press(d: DOMStringMap): void {
    const s = this.save();
    let ok = true;
    switch (d.a) {
      case 'tab': this.tab = d.v as Tab; break;
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
      body = `<div class="route">` + LEVELS.map((_, i) => {
        const open = levelOpen(s, i);
        const cls = [open ? '' : 'locked', starsOf(s, i) ? 'done' : '', this.sel === i ? 'on' : '', i === LEVELS.length - 1 ? 'boss' : ''].join(' ');
        return `<button class="node ${cls}" data-a="sel" data-v="${i}" ${open ? '' : 'disabled'}><b>${levelName(i)}</b>${open ? starRow(starsOf(s, i)) : '🔒'}</button>`;
      }).join('') + `<button class="node endless ${this.sel === 'endless' ? 'on' : ''}" data-a="sel" data-v="endless" ${endless ? '' : 'disabled'}><b>∞</b><span>${endless ? t('village.endless') : '🔒'}</span></button></div>`;
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
    this.root.innerHTML = glyphs(`<div class="vpanel">
      <div class="vtop"><h2>${t('village.title')}</h2><span class="crystals">💎 ${s.crystals}</span><span class="best">★ ${totalStars(s)} / ${LEVELS.length * 3}${endless ? ` · ${t('village.best', { n: s.best })}` : ''}</span>
        <select class="lang" aria-label="${t('lang.label')}">${LOCALES.map((l) => `<option value="${l}" ${l === getLocale() ? 'selected' : ''}>${localeName(l)}</option>`).join('')}</select></div>
      <div class="vtabs">${tabs.map(([t, n]) => `<button data-a="tab" data-v="${t}" class="${this.tab === t ? 'on' : ''}">${TAB_ICON[t]}<span>${n}</span>${badges[t] ? '<i class="dot"></i>' : ''}</button>`).join('')}</div>
      <div class="vbody">${body}</div>
      <div class="vfoot"><span>${foot}</span>
        <button class="play" data-a="play" ${canPlay ? '' : 'disabled'}>${t('village.play')}</button></div>
    </div>`);
    this.root.querySelector('.node.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
