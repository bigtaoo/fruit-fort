// The village's pages (§11.4) as HTML: the chapter route (Battle), the upgrade tiles, the heroes and the
// rewards, with the small pieces they share (a list row, a star row, a price button). Split from village.ts.

import { META, STAT_KEYS } from '../sim/config';
import { CHAPTER_SIZE, LEVELS, levelName } from '../sim/levels';
import type { HeroKind } from '../sim/types';
import { t } from '../i18n';
import { ALL_HEROES, levelCrystals, type Save } from '../meta/progress';
import { DAILY, challengeOf, taskText } from '../meta/daily';
import { PRICES, TRAIN_KEYS, heroPrice, trainPrice, villagePrice, type VillageKey } from '../meta/shop';
import { levelOpen, starsOf } from '../meta/chapter';
import { ACH_ICON, BOSS_ICON, DAILY_ICON, HERO_ICON, LEVEL_ICON, LOCK_ICON, STAT_ICON } from './icons';
import { ACHIEVEMENTS, achievementClaimed, achievementDone } from '../meta/achievements';
import type { VillageActions } from './village';

/** A page's parts: the title bar's middle and the body. */
export interface Page {
  title: string;
  body: string;
}

/** A village building's effect at level `lv`. */
function buildText(k: VillageKey, lv: number): string {
  return t(`build.${k}.text`, { n: META[k] * lv });
}

/** Stars: solid gold for won, hollow outlines for missing, so a level's tally reads at a glance. */
function starRow(n: number): string {
  return `<span class="srow">${'<i class="st on"></i>'.repeat(n)}${'<i class="st"></i>'.repeat(3 - n)}</span>`;
}

/** One line of a list page: icon, name and effect, level, buttons. */
function row(icon: string, name: string, text: string, lv: string, buttons: string, cls = ''): string {
  return `<div class="item row ${cls}"><div class="ico">${icon}</div><div class="rtx"><b>${name}</b>${text}</div>`
    + `${lv ? `<span class="rlv">${lv}</span>` : ''}<div class="rbtn">${buttons}</div></div>`;
}

/** A buy button: the price in crystals, greyed out when short; maxed when there is no next level. */
export function price(p: number | null, a: string, v: string, label: string, crystals: number): string {
  if (p === null) return `<button class="buy" disabled>${t('village.maxed')}</button>`;
  return `<button class="buy" data-a="${a}" data-v="${v}" ${crystals < p ? 'disabled' : ''}>${label ? `${label} ` : ''}💎${p}</button>`;
}

/** Battle (home): one chapter of the route, `side` (Rewards and endless) beside it. */
export function levelsPage(s: Save, sel: number | 'endless', chap: number | null, side: string): Page {
  // One chapter on the route at a time: the one holding the level to play next (the last open one
  // once everything is cleared), with ‹ › to page through the open ones.
  const chapters = Math.ceil(LEVELS.length / CHAPTER_SIZE);
  let lastOpen = 0;
  while (lastOpen + 1 < chapters && levelOpen(s, (lastOpen + 1) * CHAPTER_SIZE)) lastOpen++;
  const ch = Math.min(lastOpen, Math.max(0, chap ?? (sel === 'endless' ? lastOpen : Math.floor(sel / CHAPTER_SIZE))));
  const first = ch * CHAPTER_SIZE;
  const levels = LEVELS.slice(first, first + CHAPTER_SIZE);
  const stars = levels.reduce((a, _, j) => a + starsOf(s, first + j), 0);
  // ‹ › page through the open chapters. Before the first there is nothing (the button keeps its
  // place, hidden); the next one, still locked, shows a lock and says on a tap what opens it.
  const page = (to: number, label: string) => {
    if (to < 0 || to >= chapters) return `<button class="cpage" disabled aria-hidden="true" tabindex="-1"></button>`;
    const locked = to > lastOpen;
    return `<button class="cpage ${locked ? 'locked' : ''}" data-a="${locked ? 'chapLocked' : 'chap'}" data-v="${to}" aria-label="${label}">${to < ch ? '‹' : '›'}${locked ? LOCK_ICON : ''}</button>`;
  };
  const pager = chapters > 1 ? [page(ch - 1, t('village.chapter', { n: ch })), page(ch + 1, t('village.chapter', { n: ch + 2 }))] : ['', ''];
  // The chapter's own stars beside its name (the route shows which levels are cleared; the total
  // over every chapter is the achievements' business).
  const title = `${pager[0]}<b>${t('village.chapter', { n: ch + 1 })}</b>${pager[1]}<span class="cstars"><i class="st on"></i>${stars} / ${levels.length * 3}</span>`;
  // The route: a zigzag column from the bottom up in portrait, a row in landscape (the stylesheet
  // turns it), on a track drawn through the node centres (Village.line). A tap on an open level plays it,
  // so there is no start button: the level to play next (cardLevel: the first not cleared, then the
  // fewest stars) is drawn larger and gold with a play badge and what it pays under it, or with every
  // star won the Endless button is; locked ones smaller and dark; the chapter boss last, large with
  // its queen's head, locked or not.
  const body = side + `<div class="route"><div class="rtrack"><svg class="rline" aria-hidden="true"></svg>` + levels.map((_, j) => {
    const i = first + j;
    const open = levelOpen(s, i);
    const cls = [open ? '' : 'locked', starsOf(s, i) ? 'done' : '', i === sel ? 'cur' : '', j === CHAPTER_SIZE - 1 ? 'boss' : ''].join(' ');
    // What it pays as a gain, "+42 💎", not "💎42" (which read as a price to pay).
    const pay = i === sel ? `<small class="npay">+${levelCrystals(s, i, LEVELS[i].waves, 1)} 💎</small><i class="nplay"></i>` : '';
    const boss = j === CHAPTER_SIZE - 1 ? BOSS_ICON : '';
    return `<button class="node ${cls}" data-a="${open ? 'sel' : 'locked'}" data-v="${i}">${boss}<b>${levelName(i)}</b>${open ? starRow(starsOf(s, i)) : LOCK_ICON}${pay}</button>`;
  }).join('') + '</div></div>';
  return { title, body };
}

/** Upgrade: the training and workshop tiles, and the picked one's card. */
export function trainPage(s: Save, up: string): Page & { card: string } {
  // Training and the workshop both raise what a run starts with: one page of tiles, read by their
  // icons, each with its level as pips and its price as the buy button. The cheapest one in reach
  // is lit; with none in reach, the cheapest says how much is missing. Tapping a tile (or buying)
  // shows what it does in the strip under the grid.
  const title = `<b>${t('village.tabUp')}</b>`;
  const items = [
    // Training sets the level a run starts at; gold raises it further in the run, but for
    // multi, range and move, which have no card in a run since 0.0.26 (battle.md §4.1).
    ...TRAIN_KEYS.map((k) => {
      const more = STAT_KEYS.includes(k) ? t('village.runMore') : t('village.runOnly');
      return { id: `t:${k}`, k, a: 'buyTrain', icon: STAT_ICON[k], name: t(`stat.${k}.name`), lv: s.train[k], max: PRICES.train[k].max, p: trainPrice(s, k), text: `${t(`stat.${k}.text`)}<br>${more}`, train: true };
    }),
    ...(['wall', 'gold'] as VillageKey[]).map((k) => {
      const lv = s.village[k];
      const max = PRICES.village[k].max;
      return { id: `v:${k}`, k, a: 'buyVillage', icon: STAT_ICON[k], name: t(`build.${k}.name`), lv, max, p: villagePrice(s, k), text: `${lv ? buildText(k, lv) : t('village.notBuilt')}${lv < max ? ` → ${buildText(k, lv + 1)}` : ''}`, train: false };
    }),
  ];
  const open = items.filter((it) => it.p !== null).sort((a, b) => a.p! - b.p!);
  const lit = open.find((it) => it.p! <= s.crystals) ?? open[0];
  const cur = items.find((it) => it.id === up) ?? lit ?? items[0];
  const tile = (it: (typeof items)[number]) => {
    // Pips up to ten levels; past that (damage's twenty) a bar with the count on it, since twenty
    // tiny pips could not be read or counted.
    const pips = it.max > 10
      ? `<span class="lvbar"><i style="width:${Math.round((it.lv / it.max) * 100)}%"></i><em>${it.lv} / ${it.max}</em></span>`
      : `<span class="pips">${'<i class="on"></i>'.repeat(it.lv)}${'<i></i>'.repeat(it.max - it.lv)}</span>`;
    const need = it === lit && it.p! > s.crystals ? `<small class="need">${t('village.need', { n: it.p! - s.crystals })}</small>` : '';
    const cls = [it === lit ? 'lit' : '', it === cur ? 'on' : '', it.p === null ? 'max' : ''].join(' ');
    return `<div class="item tile ${cls}" data-a="up" data-v="${it.id}"><div class="ico">${it.icon}</div><b>${it.name}</b>${pips}${need}${it.p === null && it.train ? `<button class="buy" disabled>${t('village.startMax')}</button>` : price(it.p, it.a, it.k, '', s.crystals)}</div>`;
  };
  // The counts ride along for the landscape layout: one row of equal columns, training then workshop.
  const body = `<div class="tpage" style="--nt:${TRAIN_KEYS.length};--nw:${items.length - TRAIN_KEYS.length};--n:${items.length}">`
    + `<p class="sec thint"><span class="tl">${t('village.trainHint')}</span><span class="ts">${t('village.tabTrain')}</span></p><div class="tiles">${items.slice(0, TRAIN_KEYS.length).map(tile).join('')}</div>`
    + `<p class="sec wsec">${t('village.tabVillage')}</p><div class="tiles">${items.slice(TRAIN_KEYS.length).map(tile).join('')}</div></div>`;
  const card = `<footer class="vcard udet"><div class="ico">${cur.icon}</div><div class="cinfo"><b>${cur.name} <span class="rlv">${cur.train ? t('village.startLv', { lv: cur.lv, max: cur.max }) : `Lv${cur.lv}/${cur.max}`}</span></b><small>${cur.text}</small></div></footer>`;
  return { title, body, card };
}

/** Heroes: the one looked at large, and a card each under it. */
export function heroPage(s: Save, look: HeroKind | null, act: Pick<VillageActions, 'portrait'>): Page {
  // The wagon book is a page under Heroes, opened from the title bar.
  const title = `<b>${t('village.tabHero')}</b><button class="more wbook" data-a="tab" data-v="wagons">${t('village.tabWagons')} ›</button>`;
  // The hero tapped (else the one in use), large (its 3D trooper, as on the skill button), with
  // its skill and the upgrade, or the unlock and a Select for one not in use; under it a card a
  // hero: tap the card to look at it, its button to switch to or unlock it.
  const pic = (h: HeroKind) => {
    let src = '';
    try { src = act.portrait?.(h) ?? ''; } catch { /* lost context */ }
    return src ? `<img class="ic" src="${src}" alt="">` : HERO_ICON[h];
  };
  const pickBtn = (k: HeroKind) => `<button class="pick" data-a="hero" data-v="${k}" ${s.hero === k ? 'disabled' : ''}>${s.hero === k ? `✓ ${t('village.selected')}` : t('village.select')}</button>`;
  const h = look ?? s.hero;
  const lv = s.heroes[h];
  const owned = lv > 0;
  const body = `<div class="item hshow ${owned ? '' : 'locked'}"><div class="hpic">${pic(h)}</div><div class="hinfo"><b>${t(`hero.${h}.name`)}</b>`
    + `<span class="hskill">${t(`hero.${h}.text`)}</span>`
    // At Lv1 the charge bonus is +0%, which read as broken: just the level then.
    + (owned ? `<span class="rlv">${lv > 1 ? t('village.heroLevel', { lv, p: Math.round(META.heroCharge * (lv - 1) * 100) }) : `Lv${lv}`}</span>` : '')
    + `<span class="hbtns">${owned ? price(heroPrice(s, h), 'buyHero', h, t('village.upgrade'), s.crystals) + (s.hero === h ? '' : pickBtn(h)) : price(heroPrice(s, h), 'buyHero', h, t('village.unlock'), s.crystals)}</span>`
    + `</div></div><div class="hgrid">` + ALL_HEROES.map((k) => {
    const own = s.heroes[k] > 0;
    const btn = own ? pickBtn(k) : price(heroPrice(s, k), 'buyHero', k, t('village.unlock'), s.crystals);
    return `<div class="item hcard ${own ? '' : 'locked'} ${s.hero === k ? 'picked' : ''} ${h === k ? 'look' : ''}" data-a="look" data-v="${k}"><div class="hpic">${pic(k)}</div><b>${t(`hero.${k}.name`)}</b>${btn}</div>`;
  }).join('') + '</div>';
  return { title, body };
}

/** Rewards: the daily gift, tasks and challenge, and the goals (achievements). */
export function rewardsPage(s: Save, allGoals: boolean, endless: boolean): Page {
  // Rewards is a page under Battle: a back arrow in the title, and Battle stays lit in the bar.
  const title = `<button class="back" data-a="tab" data-v="levels" aria-label="${t('village.back')}">‹</button><b>${t('village.tabRewards')}</b>`;
  const d = s.daily;
  const ch = challengeOf(d.day);
  // Only a reward that can be taken has a button, gold with what it pays; one on its way has a
  // progress bar and the pay beside it; one taken a tick.
  const claim = (a: string, v: string, n: number, claimed: boolean, done: number, goal: number) =>
    claimed ? '<span class="rew got">✓</span>'
      : done >= goal ? `<button class="buy claim" data-a="${a}" ${v ? `data-v="${v}"` : ''}>${t('village.claim')} 💎${n}</button>`
      : `<span class="rew">💎${n}</span>`;
  const bar = (done: number, goal: number, claimed: boolean) => claimed ? ''
    : `<span class="pbar"><i style="width:${Math.min(1, done / goal) * 100}%"></i><em>${Math.min(done, goal)} / ${goal}</em></span>`;
  const cls = (claimed: boolean, ready: boolean) => (claimed ? 'got' : ready ? 'ready' : '');
  // The challenge plays endless under a rule; until endless opens it is one line saying how to open it.
  const chRow = endless
    ? row(LEVEL_ICON, t('village.challenge', { name: t(`challenge.${ch.id}.name`) }), `<span>${t('village.challengeText', { rule: t(`challenge.${ch.id}.text`), wave: DAILY.challengeWave, n: DAILY.challenge })}</span>`
      + (d.challengeBest ? `<span>${t('village.challengeBest', { n: d.challengeBest })}</span>` : ''), '',
      `<button class="pick" data-a="play" data-v="challenge">${t('village.challengeGo')}</button>${d.challengeBest >= DAILY.challengeWave || d.challengeClaimed ? claim('challenge', '', DAILY.challenge, d.challengeClaimed, 1, 1) : ''}`, cls(d.challengeClaimed, !d.challengeClaimed && d.challengeBest >= DAILY.challengeWave))
    : row(LEVEL_ICON, t('village.challengeName'), `<span>${t('village.challengeLocked')}</span>`, '', '', 'locked');
  // Goals: the ones ready to take, then the two nearest done; the rest behind "all goals".
  const near = (a: (typeof ACHIEVEMENTS)[number]) => (achievementClaimed(s, a) ? -1 : Math.min(1, a.of(s) / a.goal));
  const goals = [...ACHIEVEMENTS].sort((a, b) => near(b) - near(a));
  const ready = goals.filter((a) => !achievementClaimed(s, a) && achievementDone(s, a)).length;
  const shown = allGoals ? goals : goals.slice(0, ready + 2);
  // Daily and goals: one under the other in portrait, side by side in landscape; "all goals" sits
  // in the goals heading, so it never falls below a short screen's fold.
  const body = `<section class="rcol"><p class="sec">${t('village.tabDaily')}</p><div class="list">`
    + row(DAILY_ICON, t('village.checkIn'), '', '', claim('daily', '', DAILY.reward, d.claimed, 1, 1), cls(d.claimed, !d.claimed))
    + d.tasks.map((task, i) => row(DAILY_ICON, taskText(task), bar(task.progress, task.goal, task.claimed), '', claim('task', String(i), DAILY.task, task.claimed, task.progress, task.goal), cls(task.claimed, task.progress >= task.goal))).join('')
    + chRow
    + `</div></section><section class="rcol"><p class="sec">${t('village.tabAch')}`
    + `<button class="more" data-a="goals">${allGoals ? t('village.fewerGoals') : t('village.allGoals', { n: goals.length })}</button></p><div class="list">`
    + shown.map((a) => {
      const claimed = achievementClaimed(s, a);
      return row(ACH_ICON, a.text(), bar(a.of(s), a.goal, claimed), '', claim('ach', a.id, a.reward, claimed, a.of(s), a.goal), cls(claimed, achievementDone(s, a)));
    }).join('') + '</div></section>';
  return { title, body };
}
