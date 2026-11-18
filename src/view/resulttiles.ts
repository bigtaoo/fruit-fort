// The training tiles on the result card (docs/design/runloop.md §2.2, 2026-11-18): the crystals just
// earned are spent on the spot, one tap a level, instead of behind the village and a 20 s guide. Most
// players left before they ever saw the village, so the first card is where training has to be.

import type { TrainKey } from '../meta/shop';
import { t } from '../i18n';
import { el } from './dom';
import { STAT_ICON, glyphs } from './icons';

export interface ResultTile {
  k: TrainKey;
  /** The start level now; the tile buys the next one. */
  lv: number;
  price: number;
  /** The save and the run's pay together cover the price. */
  can: boolean;
}

export class ResultTiles {
  private row: HTMLElement;
  private btns = new Map<TrainKey, HTMLButtonElement>();
  private shown = '';

  constructor(parent: HTMLElement, before: Element, private readonly onBuy: (k: TrainKey) => void) {
    this.row = el('div', 'rtiles', parent);
    parent.insertBefore(this.row, before);
  }

  /** Lay out the tiles; nothing touched while they read the same. */
  set(tiles: ResultTile[]): void {
    const key = JSON.stringify(tiles);
    if (key === this.shown) return;
    this.shown = key;
    this.row.textContent = '';
    this.btns.clear();
    this.row.style.display = tiles.length ? '' : 'none';
    for (const tile of tiles) {
      const b = el('button', 'rtile', this.row);
      b.dataset.a = 'rtrain';
      b.dataset.v = tile.k;
      b.disabled = !tile.can;
      b.innerHTML = glyphs(`<i>${STAT_ICON[tile.k]}</i><span class="rtn"><b>${t(`stat.${tile.k}.name`)}</b><em>Lv${tile.lv} → ${tile.lv + 1}</em></span><span class="price">💎${tile.price}</span>`);
      b.onclick = () => this.onBuy(tile.k);
      this.btns.set(tile.k, b);
    }
  }

  /** Language changed: write the tiles again. */
  relabel(): void {
    this.shown = '';
  }

  /** A tile the guide can point at: up and affordable. */
  button(k: TrainKey): HTMLButtonElement | null {
    const b = this.btns.get(k);
    return b && !b.disabled && b.offsetParent ? b : null;
  }
}
