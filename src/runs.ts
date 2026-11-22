// The run on screen and the way out of it: booking it into the save, the interstitial on leaving the
// result card, and the rewarded ads (revive, double). Split from main.ts.

import type { Analytics, Platform, RewardedPlacement } from './platform';
import type { PerfSampler } from './platform/perf';
import { finishRun, type RunMode, type Save } from './meta/progress';
import type { TrainKey } from './meta/shop';
import { shopFields } from './runtrack';
import type { World } from './sim/world';

export interface RunsHost {
  world(): World;
  save(): Save;
  platform(): Platform;
  analytics(): Analytics;
  persist(): void;
  perf: PerfSampler;
}

/**
 * The run on screen. `trained`: training bought on its result card, in order (runloop.md §2.2).
 * `reach`: the level's furthest lost wave before this run (Save.reach), for the loss card's "new best".
 */
export interface RunState {
  mode: RunMode;
  reach: number;
  booked: boolean;
  earned: number;
  doubled: boolean;
  trained: TrainKey[];
}

/**
 * A lost level run that got further than every lost try of that level before it (Save.reach, read when
 * the run started) - the loss card's "New best!" (runloop.md §2.4). The first loss of a level is one:
 * it is the furthest so far, and that first loss card is where the loop is met.
 */
export function isRecord(w: World, run: RunState): boolean {
  return !w.won && w.level !== null && w.wave > run.reach;
}

export class Runs {
  /** The run on screen: a level, endless or the daily challenge; whether it was booked into the save
   * and what it paid; its ad rewards. */
  run: RunState = { mode: 0, reach: 0, booked: false, earned: 0, doubled: false, trained: [] };
  /** An ad is open (ours, or the host paused us): the sim and the sound wait. */
  adOpen = false;

  constructor(private readonly h: RunsHost) {}

  /**
   * Put the finished run into the save: crystals (twice if doubled), records, stars, task progress.
   * `bailed`: the run did not end, the player left it from the pause menu - it is booked as a loss
   * (stars 0, LEVEL_PAY.loss x wave), so the minutes still pay into the village (2026-11-14: 87% of the
   * sessions started one run and only 8 of 53 ever opened the village; a quit used to pay nothing at
   * all, which is the one place in the game where a player's time buys them nothing to come back to).
   */
  book(bailed = false): void {
    const world = this.h.world();
    const save = this.h.save();
    const run = this.run;
    if ((!world.over && !bailed) || run.booked) return;
    run.booked = true;
    // A run ended at a milestone (§9.6) is a run walked out of too: the wave pays the same either way
    // in endless, and `banked` is what tells the two apart from a fence that fell in the telemetry.
    const banked = !!world.miles?.banked;
    if (banked) bailed = true;
    const earned = finishRun(save, { wave: world.wave, kills: world.kills, grabs: world.happenings.grabs, casts: world.casts, buys: world.buys, stars: world.stars(), wagons: world.wg?.list, bailed }, run.mode);
    run.earned = earned;
    if (run.doubled) save.crystals += earned;
    this.h.persist();
    this.h.perf.flush();
    // `bailed` marks the runs the player walked out of: they book as a loss (stars 0), so without it
    // a quit reads in the telemetry exactly like a fence that fell (2026-11-14).
    this.h.analytics().track('run_end', { wave: world.wave, hero: world.heroKind, kills: world.kills, time: Math.round(world.time), revived: world.revived, bailed, banked, doubled: run.doubled, mode: run.mode, ...(world.level ? { reach: run.reach, record: !bailed && isRecord(world, run) } : {}), stars: world.stars(), crystals: earned * (run.doubled ? 2 : 1), ...shopFields(world), ...(world.wg ? { wagons: world.wg.list.map((g) => g.kind + g.lv).join(','), picks: world.wg.picks } : {}) });
  }

  /**
   * Leave the result card: book the run, ask for an interstitial (every natural pause; the platform
   * decides whether one shows, §14), then the next screen.
   */
  async leave(next: () => void): Promise<void> {
    // A double click lands twice before the card hides: the second must not start another run.
    if (this.adOpen || !this.h.world().over) return;
    this.book();
    this.adOpen = true;
    await this.h.platform().showInterstitial();
    this.adOpen = false;
    next();
  }

  /**
   * The double-crystals ad paid out. A run is booked before its card closes once a training tile is
   * tapped (the crystals have to be in the save to be spent), so the doubling can come after the
   * booking: then the second share goes straight into the save. run_end has already gone out with
   * `doubled` false in that case; ad_rewarded still records it.
   */
  double(): void {
    if (this.run.doubled) return;
    this.run.doubled = true;
    if (this.run.booked) {
      this.h.save().crystals += this.run.earned;
      this.h.persist();
    }
  }

  async rewarded(placement: RewardedPlacement): Promise<boolean> {
    if (this.adOpen) return false;
    this.adOpen = true;
    const ok = await this.h.platform().showRewarded(placement);
    this.adOpen = false;
    this.h.analytics().track('ad_rewarded', { placement, ok });
    return ok;
  }
}
