// The milestones of an endless run (§9.6, docs/design/battle.md): on the wave after every boss wave
// from MILES.from, the player is asked the one question endless never asked - go on, or walk away
// with what the run has earned. Owns the card on show and its clock; World holds one and steps it.
// A chapter level never has one. Split from world.ts.
//
// Why it exists: the mode's own developer stopped at wave 30 out of boredom, with the fence never
// once touched, and kept going only because nothing in the game ever said "this is a good place to
// stop". The two cards are not a difficulty knob - A and B of this change are - they are the run's
// punctuation, and the way out that does not read as giving up.
//
// Texts: the `mile` group of the i18n tables, all fifteen languages.

import { DT, MILES } from './config';
import { WAVES } from './wavedefs';
import type { MileNext } from './types';
import type { World } from './world';

/**
 * What the next ten waves bring that this run has not met, for the "go on" card's line. The gates are
 * read off WAVES, so moving one moves what the card promises; `on` means nothing in particular is
 * due, which is most of a long run.
 */
export function nextStep(wave: number): MileNext {
  const soon = (at: number) => at > wave && at <= wave + MILES.every;
  // The nearest gate wins, not the first one written down. Two gates can both be inside the same ten
  // waves (支援虫 25 夹在钻地虫 20 和自爆虫 30 中间)，按固定次序一个个 return 会把夹在中间
  // 那个永远吞掉 —— 玄卡会在第 21 波指着 30 波的自爆虫，而玩家 25 波就撞上支援虫。
  const gates: [number, MileNext][] = [
    [WAVES.diggerFrom, 'digger'],
    [WAVES.bomberFrom, 'bomber'],
    [WAVES.wardenFrom, 'warden'],
    [WAVES.digger.deepFrom, 'deep'],
    ...WAVES.bossBands.map((b): [number, MileNext] => [b.from, 'bosses']),
  ];
  let best: [number, MileNext] | null = null;
  for (const g of gates) if (soon(g[0]) && (!best || g[0] < best[0])) best = g;
  return best ? best[1] : 'on';
}

interface MileOffer {
  /** The wave it was dealt on. */
  wave: number;
  /** Which milestone of the run this is, from 1. */
  n: number;
  /** Seconds left before the clock takes "go on". */
  t: number;
  next: MileNext;
}

export class Miles {
  offer: MileOffer | null = null;
  /** Milestones the run has passed, for the leave event and the card's number. */
  passed = 0;
  /** The player took the way out: the run ended by choice, not by the fence falling. */
  banked = false;
  /** The wave the last card was dealt on, so a wave deals at most one. */
  private dealt = 0;

  /**
   * Due on the wave after every boss wave from `MILES.from`. It waits for a wagon pick or a tide
   * rather than landing on top of one: all three share the card strip, and TIDES.from is set so a
   * tide and a milestone are five waves apart to begin with.
   */
  step(w: World): void {
    if (this.offer) {
      if ((this.offer.t -= DT) <= 0) this.go();
      return;
    }
    if (w.level || w.over || w.wallHp <= 0) return;
    if (w.wave < MILES.from || (w.wave - MILES.from) % MILES.every !== 0) return;
    if (w.wave === this.dealt || w.wg?.offer || w.tides?.offer) return;
    // 只在那口气里开（§9.8）。`MILES.from` 因此从 21 改成 20：这张卡现在落在 Boss 倒下之后的那段
    // 长换气里，也就是一局真正的高点上，而不是下一波打到一半的时候。
    if (!w.pace.breathing) return;
    this.dealt = w.wave;
    const n = this.passed + 1;
    this.offer = { wave: w.wave, n, t: MILES.auto, next: nextStep(w.wave) };
    w.events.push({ t: 'mile', n, wave: w.wave, next: this.offer.next });
  }

  /**
   * Go on. The clock takes this card and never the other one: a player deep in a fight who never
   * looks at the strip loses nothing, which is the whole reason the exit is not the default.
   */
  go(): boolean {
    if (!this.offer) return false;
    this.passed = this.offer.n;
    this.offer = null;
    return true;
  }

  /**
   * Walk away. The run ends here at the wave it reached, which is what it would have paid had the
   * fence fallen on this very wave (`crystalsFor`), and the result card comes up as it does for any
   * ended run. `win` rather than `over` is what the board plays: a ring and the fanfare, no fireworks
   * (those check `World.won`) and none of the engine's death slump - the player left standing.
   */
  stop(w: World): boolean {
    if (!this.offer || w.over) return false;
    const { n, wave } = this.offer;
    this.passed = n;
    this.offer = null;
    this.banked = true;
    w.over = true;
    w.events.push({ t: 'bank', n, wave });
    w.events.push({ t: 'win' });
    return true;
  }
}
