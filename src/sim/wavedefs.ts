// Wave rules: when bugs come, how many, from where, what mix, and how fast late waves walk.
// Split from config.ts.

export const WAVES = {
  firstDelay: 1.5,
  /** Next batch comes in once this few enemies are left and the queue is empty. */
  callAt: 2,
  bossEvery: 10,
  primaryShare: 0.6,
  /** Hidden fronts (attack angles) by wave: one up to wave 3, two up to 8, three up to 25, then four. */
  frontBands: [
    { upTo: 3, fronts: 1 },
    { upTo: 8, fronts: 2 },
    { upTo: 25, fronts: 3 },
  ],
  maxFronts: 4,
  /**
   * Tries `pickFronts` gives each new front before it settles for the roomiest angle it drew. Four
   * fronts `frontGap` apart barely fit on a circle (4 x 1.2 < 2 pi), so rejection sampling alone can
   * run for a very long time; the cap keeps a wave's plan O(1).
   */
  frontTries: 60,
  /** Half width of the arc an enemy spreads over around its front, in radians. */
  frontSpread: 0.55,
  /** Each enemy takes the best of this many angles: the one furthest from the last `spreadRecall` in. */
  spreadTries: 4,
  spreadRecall: 5,
  /** Fronts are at least this far apart, in radians. */
  frontGap: 1.2,
  /** From this wave on, this share of enemies comes from any angle at all. */
  scatterFrom: 9,
  scatterShare: 0.25,
  beetleFrom: 3,
  crowFrom: 5,
  snailFrom: 7,
  moldFrom: 11,
  /**
   * The wave past which an endless run stops looking like a chapter level (§9.2). No chapter level
   * runs longer than 15 waves, so every curve keyed on this is endless-only by construction - no
   * `this.level ?` gate, and nothing in chapters 1 and 2 moves. Only HP_GROWTH cannot be written this
   * way, because it compounds from wave 1; that one is gated in World.spawn.
   */
  lateFrom: 15,
  /**
   * What turns up, early and late. The shares used to be these four constants flat, with the last
   * threshold at `moldFrom: 11` - so from wave 11 to wave 81 the composition of a wave never changed
   * once, only the health bar and the head count. Seventy waves of the identical picture is the
   * boredom players report, and it is also why the run has no texture: the only thing that ever moved
   * was a number. Past `lateFrom` the mix walks to `late` over `mixOver` waves, trading the cheap fast
   * bugs for armored and heavy ones, so the late game asks a different question from the early game.
   * Caterpillars take whatever share is left.
   */
  mix: {
    early: { crow: 0.15, snail: 0.08, mold: 0.15, beetle: 0.25 },
    late: { crow: 0.17, snail: 0.22, mold: 0.2, beetle: 0.31 },
    mixOver: 40,
  },
  /**
   * Endless elites: past `from`, this share of the bugs comes tough - `hp` times the health, drawn
   * bigger, paying double. Levels drive the same flag through `WavePlan.tough` and are untouched.
   */
  elite: { from: 20, share: 0.04, per: 0.006, cap: 0.3, hp: 3 },
  /** Past these waves a boss wave brings this many bosses instead of one. */
  bossBands: [
    { from: 40, bosses: 2 },
    { from: 70, bosses: 3 },
  ],
  /** `scatterShare` walks to this by `lateFrom + mix.mixOver`: late waves come from everywhere. */
  scatterLate: 0.45,

  /**
   * Endless only, by the same wave-15 gate (§9.2). Measured 2026-11-15: from wave 30 to 55 the fence
   * never moved (96-99% at every training level tried), because damage is multiplicative and uncapped
   * while the kill zone is a fixed ring - once the train kills a bug at range, nothing reaches the
   * fence at all, and buying more damage cannot be felt. Speed is the one pressure that does not race
   * damage: a bug that crosses the ring faster gets hit fewer times on the way in whatever the DPS is.
   */
  speedLate: { per: 0.012, cap: 1.6 },
};

/**
 * Bugs in a wave. Past `WAVES.lateFrom` the slope doubles, so an endless wave late on puts twice as
 * many bugs on the board as the old curve did. On its own this is a length knob, not a shape one
 * (measured 2026-11-15: twice the bugs moved the death from wave 58 to 62 and the run from 27 to 46
 * minutes, because gold comes from kills and more bugs pay for themselves) - it is in for the density,
 * and `spawnGap`'s lower late floor is what pays the minutes back.
 */
/**
 * How fast bugs walk, as a multiple of their kind's speed. 1 up to `WAVES.lateFrom`, and no chapter
 * level runs past that wave, so this is endless-only without a level check (§9.2).
 */
export function waveSpeed(wave: number): number {
  const late = Math.max(0, wave - WAVES.lateFrom);
  return Math.min(WAVES.speedLate.cap, 1 + late * WAVES.speedLate.per);
}

export function waveCount(wave: number): number {
  const late = Math.max(0, wave - WAVES.lateFrom);
  return 6 + Math.floor(wave * 1.5 + late * 1.5);
}

/**
 * Seconds between two bugs. The floor is what a wave's pace settles at; chapter levels scale this by
 * `WavePlan.pace` and none of them runs past `WAVES.lateFrom`, so they keep the 0.35 floor they were
 * tuned with. Endless keeps falling to a much tighter belt, which is what buys back the minutes the
 * doubled head count costs.
 */
export function spawnGap(wave: number): number {
  return Math.max(wave <= WAVES.lateFrom ? 0.35 : 0.1, 1.0 - wave * 0.03);
}
