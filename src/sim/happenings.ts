// The random event on the track (§4): when it comes, the golden bug crawling, the train grabbing it.
// Owns its state and its own random stream; World holds one and steps it. Split from world.ts.

import { DT, HAPPENINGS, STAT_KEYS, TRAIN } from './config';
import { arcGap, trackPoint } from './board';
import { Prng } from './rng';
import type { World } from './world';
import type { Happening, StatKey } from './types';

export class Happenings {
  /** The event on the track now. */
  now: Happening | null = null;
  /** Events that came this run, and how many of them the train picked up. */
  count = 0;
  grabs = 0;
  /** The wave the next event may come in, and the seconds into its wave it comes (-1: none due). */
  next: number;
  private at = -1;
  private readonly rng: Prng;

  constructor(seed: number, firstWave: number) {
    this.rng = new Prng(seed * 11 + 5);
    this.next = firstWave;
  }

  /** At a wave's start: if an event is due and the wave has no boss, pick when it comes. */
  plan(wave: number, boss: boolean): void {
    if (wave < this.next || boss) return;
    const [g0, g1] = HAPPENINGS.gap;
    const [d0, d1] = HAPPENINGS.delay;
    this.next = wave + g0 + this.rng.int(g1 - g0 + 1);
    this.at = d0 + this.rng.float() * (d1 - d0);
  }

  /** Bring on the wave's event when it is due, crawl the bug along, let the train pick it up. */
  step(w: World): void {
    const h = this.now;
    if (h) {
      h.t -= DT;
      if (h.kind === 'bug') {
        h.angle += h.turn * HAPPENINGS.bug.speed * DT;
        const p = trackPoint(h.angle);
        h.x = p.x;
        h.z = p.z;
      }
      if (arcGap(h.angle, w.train.angle) * TRAIN.radius <= TRAIN.pickup || w.wg?.pulls(w, h.angle)) this.grab(w, h);
      else if (h.t <= 0) {
        this.now = null;
        w.events.push({ t: 'escape', kind: h.kind });
      }
      return;
    }
    if (this.at < 0 || w.time - w.waveStart < this.at) return;
    this.at = -1;
    // Never while a boss is on the field: the player's hands are full.
    if (w.enemies.some((e) => e.kind === 'boss')) return;
    const kind = this.rng.float() < HAPPENINGS.basketShare ? 'basket' : 'bug';
    // Somewhere on the far half of the ring from the train, so getting there takes a choice.
    const angle = w.train.angle + Math.PI * (0.5 + this.rng.float());
    const p = trackPoint(angle);
    this.now = {
      id: w.nextId++, kind, x: p.x, z: p.z,
      t: kind === 'bug' ? HAPPENINGS.bug.life : HAPPENINGS.basket.life, angle, turn: this.rng.float() < 0.5 ? -1 : 1,
    };
    this.count++;
    w.events.push({ t: 'happen', kind });
  }

  /** The train drove through the event: gold for the bug, a free stat level from the basket (with wagons, a pick of three). */
  private grab(w: World, h: Happening): void {
    this.now = null;
    this.grabs++;
    let gold = 0;
    let stat: StatKey | null = null;
    if (h.kind === 'bug') {
      gold = Math.round((HAPPENINGS.bug.gold + HAPPENINGS.bug.goldPerWave * w.wave) * w.incomeMul());
      w.gold += gold;
    } else if (!w.wg) {
      stat = this.rng.pick(STAT_KEYS.filter((k) => !w.maxed(k)));
      w.levelUp(stat);
    }
    w.events.push({ t: 'grab', kind: h.kind, x: h.x, z: h.z, gold, stat });
    if (h.kind === 'basket') w.wg?.owe();
  }
}
