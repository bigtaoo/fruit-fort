// The village (§11): between runs the player spends crystals on fruits, heroes and the village,
// picks the deck and hero, and takes the daily reward, tasks and challenge. A DOM screen over
// the paused game; every change goes through `onChange` so main.ts can save it.

import { META } from '../sim/config';
import { LOCALES, getLocale, isLocale, localeName, t, type Locale } from '../i18n';
import {
  ALL_FRUITS, ALL_HEROES, DAILY, PRICES, buyFruit, buyHero, buyVillage, challengeOf, claimChallenge, claimDaily,
  claimTask, fruitPrice, hasClaim, heroPrice, pickDeck, pickHero, taskText, villagePrice, type Save, type VillageKey,
} from '../meta/progress';
import { ACH_ICON, DAILY_ICON, FRUIT_ICON, HERO_ICON, VILLAGE_ICON, glyphs } from './icons';
import { ACHIEVEMENTS, achievementClaimed, achievementDone, claimAchievement, hasAchievement } from '../meta/achievements';

type Tab = 'fruit' | 'hero' | 'village' | 'daily' | 'ach';

export interface VillageActions {
  /** Something was bought or picked; save it. */
  onChange(): void;
  onPlay(challenge: boolean): void;
  /** Feedback sound: true for a purchase or claim, false when it can't be done. */
  onClick(ok: boolean): void;
  /** The player picked another language. */
  onLanguage(locale: Locale): void;
}

/** A village building's effect at level `lv`. */
function buildText(k: VillageKey, lv: number): string {
  return t(`build.${k}.text`, { n: META[k] * lv });
}

const TAB_ICON: Record<Tab, string> = { fruit: FRUIT_ICON.strawberry, hero: HERO_ICON.farmer, village: VILLAGE_ICON, daily: DAILY_ICON, ach: ACH_ICON };

export class Village {
  private root: HTMLElement;
  private tab: Tab = 'fruit';
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
    if (tab) this.tab = tab;
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
      case 'play': this.act.onPlay(d.v === 'challenge'); return;
      case 'buyFruit': ok = buyFruit(s, d.v as never); break;
      case 'deck': ok = pickDeck(s, d.v as never); break;
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
    const tabs: [Tab, string][] = [['fruit', t('village.tabFruit')], ['hero', t('village.tabHero')], ['village', t('village.tabVillage')], ['daily', t('village.tabDaily')], ['ach', t('village.tabAch')]];
    const badges: Partial<Record<Tab, boolean>> = { daily: hasClaim(s), ach: hasAchievement(s) };
    let body = '';
    if (this.tab === 'fruit') {
      body = `<p class="sub">${t('village.deckHint')}</p><div class="grid">` + ALL_FRUITS.map((k) => {
        const lv = s.fruits[k];
        const inDeck = s.deck.includes(k);
        const p = fruitPrice(s, k);
        return `<div class="item ${lv ? '' : 'locked'} ${inDeck ? 'picked' : ''}">
          <div class="ico">${FRUIT_ICON[k]}</div>
          <b>${t(`fruit.${k}`)}</b><span>${lv ? t('village.fruitLevel', { lv, p: Math.round(META.fruitDmg * (lv - 1) * 100) }) : t('village.locked')}</span>
          ${this.price(p, 'buyFruit', k, t(lv ? 'village.upgrade' : 'village.unlock'), s.crystals)}
          ${lv ? `<button class="pick" data-a="deck" data-v="${k}" ${inDeck ? 'disabled' : ''}>${t(inDeck ? 'village.deployed' : 'village.deploy')}</button>` : ''}
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
      body = `<div class="grid">` + (['wall', 'gold', 'corner'] as VillageKey[]).map((k) => {
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
          <button class="pick" data-a="play" data-v="challenge">${t('village.challengeGo')}</button>
          <button class="buy" data-a="challenge" ${d.challengeClaimed || d.challengeBest < DAILY.challengeWave ? 'disabled' : ''}>${t(d.challengeClaimed ? 'village.claimed' : 'village.claim')}</button></div>
      </div>`;
    }
    this.root.innerHTML = glyphs(`<div class="vpanel">
      <div class="vtop"><h2>${t('village.title')}</h2><span class="crystals">💎 ${s.crystals}</span><span class="best">${t('village.best', { n: s.best })}</span>
        <select class="lang" aria-label="${t('lang.label')}">${LOCALES.map((l) => `<option value="${l}" ${l === getLocale() ? 'selected' : ''}>${localeName(l)}</option>`).join('')}</select></div>
      <div class="vtabs">${tabs.map(([t, n]) => `<button data-a="tab" data-v="${t}" class="${this.tab === t ? 'on' : ''}">${TAB_ICON[t]}<span>${n}</span>${badges[t] ? '<i class="dot"></i>' : ''}</button>`).join('')}</div>
      <div class="vbody">${body}</div>
      <div class="vfoot"><span>${s.deck.map((k) => t(`fruit.${k}`)).join(' · ')} ｜ ${t(`hero.${s.hero}.name`)}</span>
        <button class="play" data-a="play" data-v="normal">${t('village.play')}</button></div>
    </div>`);
  }
}
