// HUD text built from the language tables (split out of hud.ts): the wave badge's count and the
// result card's head and what it offers (ResultInfo).

import { t } from '../i18n';
import { hasAchievement } from '../meta/achievements';
import { hasClaim, nextLevel, runCrystals, type RunMode, type Save } from '../meta/progress';
import { LEVELS } from '../sim/levels';
import type { World } from '../sim/world';
import { el } from './dom';

/**
 * "Wave 1/8" from the language's own wording: the words small, the count big. The count is
 * dropped into the sentence as a marker and the text split round it, so word order (第 1/8 波)
 * comes from the table. Endless runs have no total: "Wave 12".
 */
export function showWaveNum(e: HTMLElement, wave: number, of: number | undefined): void {
  const mark = '\u0001';
  const text = of ? t('hud.waveOf', { n: mark, of: '\u0002' }).replace(/\u0001\s*\/\s*\u0002/, mark) : t('hud.wave', { n: mark });
  const [pre, post = ''] = text.split(mark);
  e.textContent = '';
  if (pre.trim()) el('small', '', e, pre.trim());
  el('b', '', e, of ? `${wave}/${of}` : String(wave));
  if (post.trim()) el('small', '', e, post.trim());
}

/** The result card's head: the outcome, then the stars or how far the run got, and the run's numbers. */
export function resultHead(w: World): string {
  const of = w.level?.waves;
  const wave = Math.max(1, w.wave);
  const stars = w.stars();
  // The stars pop in one by one: earned ones gold, the rest as empty slots.
  const row = [0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}" style="animation-delay:${0.45 + i * 0.3}s">★</i>`).join('');
  // The outcome on a plate over the card's top edge (gold won, red lost, as the settings panels'),
  // then the stars or how far the run got, big, and the run's numbers small.
  const head = w.won
    ? `<b class="splate">${t('hud.cleared')}</b><b class="stars">${row}</b>`
    : `<b class="splate lost">${t('hud.fallen')}</b><b class="reach">${of ? t('hud.reachedOf', { n: wave, of }) : t('hud.reached', { n: wave })}</b>`;
  return `${head}<small class="rstat">${t('hud.stats', { min: (w.time / 60).toFixed(1), kills: w.kills })}</small>`;
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

/**
 * The result card's offer for a finished run. Once booked the save has the stars and the run count, so the price
 * would change: it shows what was paid. `ads`: the platform has rewarded ads; `busy`: one is open.
 */
export function resultInfo(save: Save, w: World, run: { mode: RunMode; booked: boolean; earned: number; doubled: boolean }, ads: boolean, busy: boolean): ResultInfo {
  const c = run.booked ? run.earned : runCrystals(save, w.wave, run.mode, w.stars());
  return {
    crystals: run.doubled ? c * 2 : c,
    doubled: run.doubled,
    canRevive: ads && !w.revived && !w.won && !run.booked,
    canDouble: ads && !run.doubled && !run.booked,
    claim: hasClaim(save) || hasAchievement(save),
    busy,
    level: w.level !== null,
    won: w.won,
    hasNext: nextLevel(save) < LEVELS.length,
  };
}
