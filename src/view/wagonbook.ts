// The wagon book (§10.1.12): a page under Heroes in the base. The six wagons as cards, the tapped one
// large with what each level does; ones not unlocked yet carry their price, and only unlocked ones
// can come up in a run's pick of three. Laid out like the hero page (its classes), so both
// orientations follow it.

import { t } from '../i18n';
import type { Save } from '../meta/progress';
import { wagonOwned, wagonPrice } from '../meta/wagonmeta';
import { WAGONS } from '../sim/config';
import type { WagonKind } from '../sim/types';
import { WAGON_KINDS } from '../sim/wagons';
import { WAGON_ICON } from './icons';

/** A buy button: price, action, value, label. */
type Price = (p: number | null, a: string, v: string, label: string) => string;

/** Levels as pips, lit up to the best one the wagon reached. */
function pips(lv: number): string {
  return `<span class="pips">${'<i class="on"></i>'.repeat(lv)}${'<i></i>'.repeat(WAGONS.maxLv - lv)}</span>`;
}

export function wagonBook(s: Save, look: WagonKind | null, price: Price): { title: string; body: string } {
  const k = look ?? WAGON_KINDS.find((x) => !wagonOwned(s, x)) ?? WAGON_KINDS[0];
  const owned = wagonOwned(s, k);
  const best = s.wagonLv[k] ?? 0;
  const unlock = (x: WagonKind) => price(wagonPrice(s, x), 'buyWagon', x, t('village.unlock'));
  const lines = [1, 2, 3].map((lv) => `<span class="${lv <= best ? 'on' : ''}">Lv${lv} · ${t(`wagon.${k}.l${lv}` as 'wagon.arc.l1')}</span>`).join('');
  const state = !owned ? t('village.wagonLocked') : best ? t('village.wagonBest', { lv: best }) : t('village.wagonNew');
  const title = `<button class="back" data-a="tab" data-v="hero" aria-label="${t('village.back')}">‹</button><b>${t('village.tabWagons')}</b>`;
  const body = `<div class="item hshow wshow ${owned ? '' : 'locked'}"><div class="hpic">${WAGON_ICON[k]}</div><div class="hinfo"><b>${t(`wagon.${k}.name` as 'wagon.arc.name')}</b>`
    + `<span class="wlines">${lines}</span><span class="rlv">${state}</span>${owned ? '' : `<span class="hbtns">${unlock(k)}</span>`}</div></div>`
    + `<div class="hgrid wgrid">` + WAGON_KINDS.map((x) => {
      const own = wagonOwned(s, x);
      return `<div class="item hcard ${own ? '' : 'locked'} ${x === k ? 'look' : ''}" data-a="wlook" data-v="${x}"><div class="hpic">${WAGON_ICON[x]}</div>`
        + `<b>${t(`wagon.${x}.name` as 'wagon.arc.name')}</b>${own ? pips(s.wagonLv[x] ?? 0) : unlock(x)}</div>`;
    }).join('') + '</div>';
  return { title, body };
}
