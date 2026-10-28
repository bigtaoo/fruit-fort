// The village (§11): between runs the player spends crystals on fruits, heroes and the village,
// picks the deck and hero, and takes the daily reward, tasks and challenge. A DOM screen over
// the paused game; every change goes through `onChange` so main.ts can save it.

import { FRUITS, HEROES, META } from '../sim/config';
import {
  ALL_FRUITS, ALL_HEROES, DAILY, PRICES, buyFruit, buyHero, buyVillage, challengeOf, claimChallenge, claimDaily,
  claimTask, fruitPrice, hasClaim, heroPrice, pickDeck, pickHero, taskText, villagePrice, type Save, type VillageKey,
} from '../meta/progress';

type Tab = 'fruit' | 'hero' | 'village' | 'daily';

export interface VillageActions {
  /** Something was bought or picked; save it. */
  onChange(): void;
  onPlay(challenge: boolean): void;
  /** Feedback sound: true for a purchase or claim, false when it can't be done. */
  onClick(ok: boolean): void;
}

const HERO_TEXT: Record<string, string> = {
  farmer: '浇水：全体攻速 +30%，持续 5 秒',
  beekeeper: '蜂群：蜜蜂叮咬城墙边的害虫；英雄四邻的水果附毒',
  chef: '榨汁：吃掉两颗最低级水果，伤害全场；卖出水果双倍金币',
};

const VILLAGE_TEXT: Record<VillageKey, (lv: number) => string> = {
  wall: (lv) => `城墙上限 +${META.wall * lv}`,
  gold: (lv) => `开局金币 +${META.gold * lv}`,
  corner: (lv) => `角落格子提前 ${META.corner * lv} 波开放`,
};
const VILLAGE_NAME: Record<VillageKey, string> = { wall: '加固城墙', gold: '储钱罐', corner: '开垦角地' };

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

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
      default: return;
    }
    this.act.onClick(ok);
    if (ok) this.act.onChange();
    this.render();
  }

  private price(p: number | null, a: string, v: string, label: string, crystals: number): string {
    if (p === null) return `<button class="buy" disabled>已满级</button>`;
    return `<button class="buy" data-a="${a}" data-v="${v}" ${crystals < p ? 'disabled' : ''}>${label} 💎${p}</button>`;
  }

  render(): void {
    const s = this.save();
    const tabs: [Tab, string][] = [['fruit', '水果'], ['hero', '英雄'], ['village', '村落'], ['daily', '每日']];
    const badge = hasClaim(s) ? '<i class="dot"></i>' : '';
    let body = '';
    if (this.tab === 'fruit') {
      body = `<p class="sub">出战卡组：点「出战」换入，替换最早选的那个。</p><div class="grid">` + ALL_FRUITS.map((k) => {
        const lv = s.fruits[k];
        const inDeck = s.deck.includes(k);
        const p = fruitPrice(s, k);
        return `<div class="item ${lv ? '' : 'locked'} ${inDeck ? 'picked' : ''}">
          <div class="ico" style="background:${hex(FRUITS[k].color)}"></div>
          <b>${FRUITS[k].name}</b><span>${lv ? `Lv${lv} · 伤害 +${Math.round(META.fruitDmg * (lv - 1) * 100)}%` : '未解锁'}</span>
          ${this.price(p, 'buyFruit', k, lv ? '升级' : '解锁', s.crystals)}
          ${lv ? `<button class="pick" data-a="deck" data-v="${k}" ${inDeck ? 'disabled' : ''}>${inDeck ? '出战中' : '出战'}</button>` : ''}
        </div>`;
      }).join('') + '</div>';
    } else if (this.tab === 'hero') {
      body = `<div class="grid">` + ALL_HEROES.map((h) => {
        const lv = s.heroes[h];
        const p = heroPrice(s, h);
        return `<div class="item wide ${lv ? '' : 'locked'} ${s.hero === h ? 'picked' : ''}">
          <div class="ico" style="background:${hex(HEROES[h].color)}"></div>
          <b>${HEROES[h].name}</b><span>${HERO_TEXT[h]}</span>
          <span>${lv ? `Lv${lv} · 技能充能 +${Math.round(META.heroCharge * (lv - 1) * 100)}%` : `未解锁`}</span>
          ${this.price(p, 'buyHero', h, lv ? '升级' : '解锁', s.crystals)}
          ${lv ? `<button class="pick" data-a="hero" data-v="${h}" ${s.hero === h ? 'disabled' : ''}>${s.hero === h ? '出战中' : '选用'}</button>` : ''}
        </div>`;
      }).join('') + '</div>';
    } else if (this.tab === 'village') {
      body = `<div class="grid">` + (['wall', 'gold', 'corner'] as VillageKey[]).map((k) => {
        const lv = s.village[k];
        return `<div class="item wide">
          <b>${VILLAGE_NAME[k]}</b><span>Lv${lv} / ${PRICES.village[k].max}</span>
          <span>${lv ? VILLAGE_TEXT[k](lv) : '还没建'}${lv < PRICES.village[k].max ? ` → ${VILLAGE_TEXT[k](lv + 1)}` : ''}</span>
          ${this.price(villagePrice(s, k), 'buyVillage', k, '建造', s.crystals)}
        </div>`;
      }).join('') + '</div>';
    } else {
      const d = s.daily;
      const ch = challengeOf(d.day);
      body = `<div class="grid">
        <div class="item wide"><b>每日签到</b><span>每天领一次 💎${DAILY.reward}</span>
          <button class="buy" data-a="daily" ${d.claimed ? 'disabled' : ''}>${d.claimed ? '今天已领' : '领取'}</button></div>
        ${d.tasks.map((t, i) => `<div class="item wide"><b>${taskText(t)}</b>
          <span>${Math.min(t.progress, t.goal)} / ${t.goal} · 奖励 💎${DAILY.task}</span>
          <button class="buy" data-a="task" data-v="${i}" ${t.claimed || t.progress < t.goal ? 'disabled' : ''}>${t.claimed ? '已领' : '领取'}</button></div>`).join('')}
        <div class="item wide"><b>每日挑战 · ${ch.name}</b><span>${ch.text}；打到第 ${DAILY.challengeWave} 波得 💎${DAILY.challenge}</span>
          ${d.challengeBest ? `<span>今日最好：第 ${d.challengeBest} 波</span>` : ''}
          <button class="pick" data-a="play" data-v="challenge">挑战</button>
          <button class="buy" data-a="challenge" ${d.challengeClaimed || d.challengeBest < DAILY.challengeWave ? 'disabled' : ''}>${d.challengeClaimed ? '已领' : '领取'}</button></div>
      </div>`;
    }
    this.root.innerHTML = `<div class="vpanel">
      <div class="vtop"><h2>村落</h2><span class="crystals">💎 ${s.crystals}</span><span class="best">最远第 ${s.best} 波</span></div>
      <div class="vtabs">${tabs.map(([t, n]) => `<button data-a="tab" data-v="${t}" class="${this.tab === t ? 'on' : ''}">${n}${t === 'daily' ? badge : ''}</button>`).join('')}</div>
      <div class="vbody">${body}</div>
      <div class="vfoot"><span>${s.deck.map((k) => FRUITS[k].name).join(' · ')} ｜ ${HEROES[s.hero].name}</span>
        <button class="play" data-a="play" data-v="normal">开始战斗</button></div>
    </div>`;
  }
}
