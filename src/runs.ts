// The run on screen and the way out of it: booking it into the save, the interstitial on leaving the
// result card, and the rewarded ads (revive, double). Split from main.ts.

import type { Analytics, Platform, RewardedPlacement } from './platform';
import type { PerfSampler } from './platform/perf';
import { finishRun, type RunMode, type Save } from './meta/progress';
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

export class Runs {
  /** The run on screen: a level, endless or the daily challenge; whether it was booked into the save
   * and what it paid; its ad rewards. */
  run: { mode: RunMode; booked: boolean; earned: number; doubled: boolean } = { mode: 0, booked: false, earned: 0, doubled: false };
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
    const earned = finishRun(save, { wave: world.wave, kills: world.kills, grabs: world.happenings.grabs, casts: world.casts, buys: world.buys, stars: world.stars(), wagons: world.wg?.list }, run.mode);
    run.earned = earned;
    if (run.doubled) save.crystals += earned;
    this.h.persist();
    this.h.perf.flush();
    // `bailed` marks the runs the player walked out of: they book as a loss (stars 0), so without it
    // a quit reads in the telemetry exactly like a fence that fell (2026-11-14).
    this.h.analytics().track('run_end', { wave: world.wave, hero: world.heroKind, kills: world.kills, time: Math.round(world.time), revived: world.revived, bailed, doubled: run.doubled, mode: run.mode, stars: world.stars(), crystals: earned * (run.doubled ? 2 : 1), ...shopFields(world), ...(world.wg ? { wagons: world.wg.list.map((g) => g.kind + g.lv).join(','), picks: world.wg.picks } : {}) });
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

  async rewarded(placement: RewardedPlacement): Promise<boolean> {
    if (this.adOpen) return false;
    this.adOpen = true;
    const ok = await this.h.platform().showRewarded(placement);
    this.adOpen = false;
    this.h.analytics().track('ad_rewarded', { placement, ok });
    return ok;
  }
}
