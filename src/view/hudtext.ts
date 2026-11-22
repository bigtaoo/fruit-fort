// HUD text built from the language tables (split out of hud.ts): the wave badge's count and the
// result card's head and what it offers (ResultInfo).

import { t } from '../i18n';
import { hasAchievement } from '../meta/achievements';
import { runCrystals, type Save } from '../meta/progress';
import { TRAIN_KEYS, cardTrain, trainPrice, type TrainKey } from '../meta/shop';
import { isRecord, type RunState } from '../runs';
import type { ResultTile } from './resulttiles';
import { hasClaim } from '../meta/daily';
import { nextLevel } from '../meta/chapter';
import { LEVELS } from '../sim/levels';
import type { World } from '../sim/world';
import { el } from './dom';
import { WAGON_ICON } from './icons';
import { WAGON_COLOR } from './wagons';

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

/**
 * The result card's head: the outcome, then the stars or how far the run got, and the run's numbers.
 * `record`: a lost level run got further than any lost try before it - "New best!" by the wave
 * (runloop.md §2.4: a loss reads as nearly there, stronger next time).
 */
export function resultHead(w: World, record = false): string {
  const of = w.level?.waves;
  const wave = Math.max(1, w.wave);
  const stars = w.stars();
  // The stars pop in one by one: earned ones gold, the rest as empty slots.
  const row = [0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}" style="animation-delay:${0.45 + i * 0.3}s">★</i>`).join('');
  // The outcome on a plate over the card's top edge (gold won, red lost, as the settings panels'),
  // then the stars or how far the run got, big, and the run's numbers small.
  // Three outcomes, not two: a run the player walked out of at a milestone (§9.6) ended on their
  // say-so with the fence still standing, and a card headed "Fence down" would call that a defeat.
  const head = w.miles?.banked
    ? `<b class="splate">${t('hud.banked')}</b><b class="reach">${t('hud.reached', { n: wave })}</b>`
    : w.won
    ? `<b class="splate">${t('hud.cleared')}</b><b class="stars">${row}</b>`
    : `<b class="splate lost">${t('hud.fallen')}</b><b class="reach">${of ? t('hud.reachedOf', { n: wave, of }) : t('hud.reached', { n: wave })}</b>${record ? `<b class="rrec">${t('hud.record')}</b>` : ''}`;
  return `${head}<small class="rstat">${t('hud.stats', { min: (w.time / 60).toFixed(1), kills: w.kills })}</small>${wagonRow(w)}`;
}

/**
 * The run's wagons under its numbers, in the order they were hooked on: icon and level on a chip in the
 * wagon's colour, so a lost run still shows the build it made (and a retry has something to beat).
 */
function wagonRow(w: World): string {
  const list = w.wg?.list ?? [];
  if (!list.length) return '';
  const chips = list.map((g, i) => {
    const name = t(`wagon.${g.kind}.name`).replace(/[<&"]/g, '');
    const color = `#${WAGON_COLOR[g.kind].toString(16).padStart(6, '0')}`;
    return `<i style="--wc:${color};animation-delay:${0.5 + i * 0.12}s" title="${name} Lv${g.lv}">${WAGON_ICON[g.kind]}<b>Lv${g.lv}</b></i>`;
  });
  return `<span class="rwag">${chips.join('')}</span>`;
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
  /** Training to buy on the card (runloop.md §2.2); empty when none is affordable and none was bought. */
  tiles: ResultTile[];
  /** The last training bought on this card, for the main button: "Next level · Damage Lv2 ↑". */
  up: { k: TrainKey; lv: number } | null;
  /** A lost level run that got further than every lost try before it (isRecord). */
  record: boolean;
}

/**
 * The result card's offer for a finished run. Once booked the save has the stars and the run count, so the price
 * would change: it shows what was paid. `ads`: the platform has rewarded ads; `busy`: one is open.
 */
/**
 * The run-start banner's second line (docs/design/runloop.md §2.3): the training levels gained since the
 * last run started, "Damage Lv1 ↑", so the next run opens on the player being stronger. null for none.
 */
export function trainUp(before: Record<TrainKey, number>, after: Record<TrainKey, number>): string | null {
  const up = (Object.keys(after) as TrainKey[]).filter((k) => after[k] > (before[k] ?? 0));
  return up.length ? up.map((k) => t('hud.trainUp', { stat: t(`stat.${k}.name`), lv: after[k] })).join('  ') : null;
}

/**
 * The card's training tiles, worked out again only when the purse or a training level changed: the card
 * asks every frame while it is up, and the answer moves only on a tap, an ad or the booking.
 */
class TileOffer {
  private key = '';
  private tiles: ResultTile[] = [];

  get(save: Save, purse: number): ResultTile[] {
    const key = `${purse}|${TRAIN_KEYS.map((k) => save.train[k]).join(',')}`;
    if (key !== this.key) {
      this.key = key;
      this.tiles = cardTrain(save).map((k) => {
        const price = trainPrice(save, k)!;
        return { k, lv: save.train[k], price, can: price <= purse };
      });
    }
    return this.tiles;
  }
}
const offer = new TileOffer();

export function resultInfo(save: Save, w: World, run: RunState, ads: boolean, busy: boolean): ResultInfo {
  const c = run.booked ? run.earned : runCrystals(save, w.wave, run.mode, w.stars());
  // What a tile can spend: the save, and this run's pay while it is not in the save yet.
  const purse = save.crystals + (run.booked ? 0 : run.doubled ? c * 2 : c);
  const tiles = offer.get(save, purse);
  const last = run.trained[run.trained.length - 1];
  return {
    crystals: run.doubled ? c * 2 : c,
    doubled: run.doubled,
    canRevive: ads && !w.revived && !w.won && !w.miles?.banked && !run.booked,
    // Still offered once booked: a training tile books the run before the card closes (Runs.double).
    canDouble: ads && !run.doubled,
    claim: hasClaim(save) || hasAchievement(save),
    busy,
    level: w.level !== null,
    won: w.won,
    hasNext: nextLevel(save) < LEVELS.length,
    tiles: tiles.some((x) => x.can) || run.trained.length ? tiles : [],
    up: last ? { k: last, lv: save.train[last] } : null,
    record: isRecord(w, run),
  };
}
