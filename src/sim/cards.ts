// The three decks a run deals (sim/wagons.ts, sim/tides.ts, sim/miles.ts). Split out of config.ts
// 2026-11-24: the tuning each of them carries is mostly the reasoning behind a number, and together it
// was over a quarter of a file the line limit had outgrown.
/**
 * Wagons (§10.1): kills charge the train with each bug's base gold; a full charge stops the fight for
 * a pick of three. `charge` is the first pick's cost, each later one costs `growth` times more.
 * Damage is a share of the train's shot (trainDamage), so damage cards feed the wagons too.
 */
export const WAGONS = {
  charge: 300,
  growth: 1.1,
  /**
   * No pick before this much fight (§12): a charge filled sooner waits till then.
   * 2026-11-21, 60 -> 25 (docs/telemetry/2026-11-21-0040.md).
   * 0.0.39's live read: a new player has tried everything the opening has by ~25 s (tap 11.1 s, buy
   * 15.6, cast 15.7, reverse 16.9, grab 25.3), and the next new thing was this pick at 60 s - 1-1's
   * wave 3 is at 53 s and its card at 76. The 39 players who cast but never reached wave 3 left at a
   * median 33 s, wave 2, fence 97%, last input 3 s before: a won fight with nothing coming. Measured
   * over 12 seeds buying by hand, 60 opened the first pick at exactly 60.0 s in 12/12 - the charge was
   * long full and this was the gate. At 25 the first pick comes at 25 s in 7/12 seeds and 47-52 s in
   * the rest, and 7/12 get a second at ~45-54 s, so the 25-53 s stretch has a beat in it.
   * `charge` 300 -> 200 would open a pick in every seed by 41 s, but it takes 1-2's "training gets the
   * player further" guard from +0.124 to -0.010 (levels.test.ts), so it was left alone.
   * `firstAt` was left at 60 on 2026-11-12 (wagons.md §10.1) for one reason: a pick froze the fight,
   * which was the thing 1-1 was being cured of. 0.0.36 (2026-11-17) removed the freeze, so that
   * reason is gone. Both constants are global - every level and endless - and serve one change: put
   * the first pick inside the stretch where players leave. `growth` 1.1 still spaces the later ones and
   * `max` 4 caps the train, so what moves is when a pick comes, not how many.
   * What this cost, and what it turned out not to cost: 1-1's "softer bugs get the player further"
   * guard - whether its health dial answers at all - fell from 0.221 to 0.116 against a 0.15 bar, the
   * only level to go under, and a wagon at 25 s is indeed free power in a 76 s level. But that guard
   * summed two seeds, and over twelve the same change moves the per-seed gap 0.102 -> 0.095, with no
   * seed of the twelve negative either way: the fall was seed 11 alone (0.138 -> 0.026). So 1-1's
   * difficulty was left where it is and the guard was widened to six seeds averaged (levels.test.ts,
   * 2026-11-21). The compensations tried before that measurement all failed anyway and are not worth
   * revisiting: `hp` 0.45 breaks the chapter's own ramp (levels.test.ts wants 1-1 under 0.6 x 1-2's
   * 0.58), `bite` 1.1 read backwards, and a fourth wave undoes 2026-11-12's shortening. See the
   * telemetry note.
   */
  firstAt: 25,
  /** Seconds of fight after any pick before a charge can open the next, so two never come back to back. */
  apart: 20,
  /** Seconds before the clock picks for the player (the `def` card, `fallback()`). */
  autoPick: 10,
  max: 4,
  maxLv: 3,
  /** Track distance from the engine's centre to the first wagon's, and between wagons. */
  first: 1.9,
  gap: 1.3,
  arc: { every: 2.5, targets: [3, 4, 4], mul: [0.6, 0.8, 0.8], stun: 0.6 },
  missile: { every: 3, count: [1, 2, 2], mul: 2, splash: 0.8, splashMul: 0.5, reach: 6 },
  frost: { every: 0.35, slow: [0.35, 0.5, 0.5], life: [4, 6, 6], radius: 0.9, out: 4.15, frail: 1.25 },
  plasma: { every: 0.25, reach: 3, perSec: [2.5, 4, 4], burn: 3 },
  mine: { every: 4, count: [1, 2, 2], radius: 1, mul: 2, linger: 3, touch: 0.6 },
  magnet: { gold: [0.2, 0.35, 0.35], reach: [2, 3, 3] },
  /**
   * Reforges of a maxed wagon (§10.1.16, `ForgeKind`). A wagon at `maxLv` can be reforged three ways
   * and each way once, so the four wagons of a train hold up to ten more cards past the point where
   * everything is maxed - which is where an endless pick used to have nothing left but gold.
   *
   * `rate` is how much oftener the wagon acts (so also that much more damage over time), `damage`
   * what a reforged shot hits for, `wide` what reach and the number of bugs an attack takes are
   * multiplied by, and `slowCap` keeps a reforged frost from stopping a bug dead.
   *
   * The doses are what a card can still be felt at without undoing §9.2's whole point, which is that
   * an endless run ends. Measured on seed 1 of scripts/reach.ts, `arrivingAt(19)`, as the end of the
   * run: 46 waves / 15 min with no reforges at all, 63 / 22 at three tenths of these doses, 69 / 25
   * at a half, and 104 / 51 at the doses first written here (rate 1.5, damage 1.8, wide 1.5) - which
   * handed back everything the reach cut and the late bite had taken off and then some. A half it is.
   * On a save with every training maxed the same change is 84 -> 92 waves, so the layer is worth most
   * to the player who has not maxed his trainings, which is the player it is for. Bracket a new dose
   * (FORGE= in reach.ts), never extrapolate: 46 / 63 / 69 / 104 is not a line.
   */
  forge: { rate: 1.25, damage: 1.4, wide: 1.25, slowCap: 0.85 },
  /** A supply card's gold, in damage cards at today's price. */
  supplyGold: 2,
};

/**
 * The tides of an endless run (§9.4, src/sim/tides.ts).
 *
 * Endless had one decision that mattered - which card to buy next - and after wave 20 the answer was
 * always the cheapest one, so the run turned into reading numbers. A tide is the other kind of
 * decision: every ten waves, three cards, each one a bargain. The bugs keep what the card gives them
 * for the rest of the run and the player is paid now, so the run has a shape the player chose, and
 * two runs from the same save stop being the same run.
 *
 * `from` 25 and `every` 10 puts a tide five waves off every boss (WAVES.bossEvery), so the boss wave,
 * its milestone (§9.6) and a tide never land together, and something happens every five waves.
 *
 * The presses multiply into `RunMods` and stack: four tides of `hardy` are 1.3^4 = 2.9x health on top
 * of the wave curve. They are deliberately bigger than one wave's worth of growth - a tide the player
 * cannot feel is a card not worth reading.
 */
export const TIDES = {
  from: 25,
  every: 10,
  /** Seconds before the clock takes the first card. The wagon pick's is 10; a tide reads longer. */
  autoPick: 14,
  cards: 3,
  /** What one tide multiplies, for the rest of the run. */
  press: { swift: 1.15, hardy: 1.3, gnaw: 1.4, swarm: 1.25 },
  /** Gold as a multiple of the damage card's price now, free stat levels, and the share of fence mended. */
  gift: { gold: 10, levels: 3, mend: 0.5 },
};

/**
 * The milestones of an endless run (§9.6, src/sim/miles.ts).
 *
 * This answers the plainest complaint the game has had: "even as the developer I am bored by wave 30,
 * and I keep going because nothing tells me to stop." An endless run had no punctuation in it and no
 * ending that was not a death - the only way out was the pause menu, which is behind a cog and reads
 * as giving up. A milestone is the punctuation: the wave after a boss wave, two cards, one of them
 * the way out.
 *
 * Walking away pays nothing extra and costs nothing: an endless run books for the wave it reached
 * whether the fence fell or the player left (meta/progress.ts, `crystalsFor`), so the card is not a
 * gamble and does not pretend to be one. What changes is that stopping becomes something the game
 * offered, taken at a high point and landing on the result card with its crystals and its training
 * tiles - instead of a player closing the tab in the middle of wave 34, which pays the same and
 * teaches them that the mode has no end worth reaching.
 *
 * `from` is 20, not 11, and that is the whole of the risk here: the card names the exit, and naming
 * it four minutes into someone's first endless run would be walking them out of a run they were
 * still enjoying, against the one number this game is judged on (average play time). 20 是报告厌烦
 * 的地方，也是第一种无尽专属虫（`WAVES.diggerFrom`）出现的那一波。The clock takes "go on" and never
 * the exit, so a player who is busy fighting is never walked out of their run by a timer.
 *
 * 2026-11-23，21 → 20（§9.8）：卡条现在只在换气里开（sim/pace.ts），所以 `from: 20` 不再是「第 20
 * 波打到一半」，而是**第 20 波的 Boss 倒下之后那段加长的换气**——一局真正的高点，也是「这里是个好
 * 的收手点」唯一说得通的时刻。原来的 21 配上换气会把它推到第 21 波清完，离 Boss 整整一波。
 */
export const MILES = {
  from: 20,
  /** Every boss wave (WAVES.bossEvery), so a milestone sits five waves off every tide. */
  every: 10,
  /** Seconds before the clock takes "go on". The tide's is 14; this card is two cards and shorter. */
  auto: 10,
};
