// HUD text built from the language tables (split out of hud.ts): the wave badge's count and the
// result card's head.

import { t } from '../i18n';
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
