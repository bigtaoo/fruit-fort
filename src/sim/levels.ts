// Chapter levels (§9.1): each level is a row of parameters for the wave generator in waves.ts,
// not a hand-placed spawn list. The last wave of a level is its boss; clearing it wins the level.

import type { EnemyKind } from './types';
import type { RunMods } from './world';

/** Level modifiers share their ids and text with the daily challenge rules (i18n challenge.<id>). */
export type ModId = 'rush' | 'tough' | 'poor' | 'paper';

/**
 * Every bug kind a level can put on the field: its pool, the mold's spores, and the boss wave with the
 * locusts it calls. A weak machine warms only these (main.ts, Quality.weak) instead of all eight.
 */
export function levelKinds(def: LevelDef): EnemyKind[] {
  const out = new Set<EnemyKind>(def.pool);
  if (out.has('mold')) out.add('spore');
  out.add('boss');
  out.add('locust');
  return [...out];
}

export const MODS: Record<ModId, RunMods> = {
  rush: { enemySpeed: 1.3 },
  tough: { enemyHp: 1.3 },
  poor: { startGold: -20 },
  paper: { wallMul: 0.6 },
};

export interface LevelDef {
  /** Waves in the level; the last one is the boss. */
  waves: number;
  /** Enemy health multiplier on top of the endless curve. */
  hp: number;
  /** Enemy damage to the fence multiplier (1 when left out). */
  bite?: number;
  /**
   * The boss's health, times `hp` and the wave curve like any other bug (1 when left out). The boss is
   * the one unit whose health sets a whole wave's length, so without this knob a level cannot tune its
   * last wave at all - see the boss-wave paragraph below the table.
   */
  boss?: number;
  /** Kinds that can turn up (the boss's locusts and the mold's spores come with them). */
  pool: EnemyKind[];
  /** At most this many attack angles a wave, under the endless default. */
  fronts?: number;
  mods?: ModId[];
  /**
   * Wave 1's front, as an angle, instead of a random one. Level 1 (2026-11-06): from the far side, the
   * top of the screen in both orientations, where the tank drives to first; a random front often came
   * from a side a portrait screen does not show, and the first kill took ~7 s even for a quick player.
   */
  open?: number;
  /**
   * Wave 1's first LEAD_BUGS bugs come at once, already up to this far walked in, so the field is busy
   * when the loading screen lifts. Level 1 (2026-11-06): half the new players left within 10 s, and
   * the first bug used to reach the tank only ~5 s in.
   */
  lead?: number;
  /** Bugs a wave, times the endless count (1 when left out). */
  swarm?: number;
  /** Gaps between a wave's bugs, times the endless gap (1 when left out), in waves up to `paceTo`. */
  pace?: number;
  paceTo?: number;
  /**
   * From wave `from` to wave `to`, this share of the caterpillars come tough: `hp` times the health,
   * drawn bigger, paying double. Level 1 (2026-11-10): the user's test found waves 1-5 dull, no bug got
   * near the fence; one-hit bugs throughout, with a few that take two or three (not all, as 0.0.20 did).
   */
  tough?: { share: number; hp: number; from: number; to: number };
  /**
   * The fence can't fall on this level: the bugs' bite fades below SAFE.from and stops at SAFE.floor,
   * the hero starts half charged, and a boss left standing fades (world.ts). Teaching levels.
   */
  safe?: boolean;
  /**
   * How much of that fade a level keeps, 0 to 1, when it is not `safe` (2026-11-14). `safe` levels are
   * a full net; without this knob the level after the last one is a cliff, not a step - measured with
   * scripts/ladder.ts, a slow player went from 17% fence left on 1-7 to losing 6/6 on 1-8, because
   * what changed between them was not the bugs but the net. A fading net lets the last three levels of
   * the chapter hand the fence back to the player a third at a time.
   */
  net?: number;
  /**
   * First wave a random event (a basket or a gold bug) can come in, instead of HAPPENINGS.firstWave.
   * Level 1 (2026-11-14): the first pickup sat behind wave 3, which only 52% of the players who
   * tapped ever reached, so `first_grab` stood at 40%. The hold freezes the event clock with the
   * wave clock, so a wave-1 event lands a few seconds after the tutorial lets go, not during it.
   */
  happenFrom?: number;
}

/**
 * The safety net of the first levels (2026-11-05): a player who buys too little still wins, only
 * later and with fewer stars. Waves come only once the field is nearly clear, so bugs a weak player
 * can't kill would chew on forever; a lower bite alone just puts the loss off to the boss wave.
 */
export const LEAD_BUGS = 3;

export const SAFE = {
  from: 0.5,
  floor: 0.15,
  /**
   * A boss still standing this many seconds into its wave loses its full health over `bossFade` more
   * (2026-11-06: a player who barely bought spent ~16 min on level 1's boss and 20-40 min in the sim;
   * the bot kills it in ~40 s and a player buying every 20 s in ~70 s, both untouched).
   */
  bossAfter: 75,
  bossFade: 60,
};

/** Does this level have any safety net at all? `safe` is a full one, `net` a fraction of it. */
export function netted(def: LevelDef | null | undefined): boolean {
  return !!def && (def.net ?? (def.safe ? 1 : 0)) > 0;
}

/** What a bite on the fence is multiplied by on this level, with the fence at `frac` of its max. */
export function biteMul(def: LevelDef | null, frac: number): number {
  if (!def) return 1;
  const bite = def.bite ?? 1;
  const net = def.net ?? (def.safe ? 1 : 0);
  if (net <= 0) return bite;
  // The net scales with `net`: at full strength the bite fades from half a fence and stops at 15%, at
  // a third of it from 17% and stops at 5%, so a weaker net catches the player later and lower.
  const from = SAFE.from * net;
  const floor = SAFE.floor * net;
  return bite * Math.min(1, Math.max(0, (frac - floor) / (from - floor)));
}

const C: EnemyKind = 'caterpillar';
const ALL: EnemyKind[] = [C, 'beetle', 'crow', 'snail', 'mold'];

/** Chapter 1: one new bug every couple of levels, modifiers from level 5 on, level 10 the chapter boss. */
export const LEVELS: LevelDef[] = [
  // The first level is short and dense (2026-11-12, docs/telemetry/2026-11-12-level1-pacing.md). It used
  // to be ten waves and `pace` 1: the median player left at 3.4 min on wave 6-7 with the fence still at
  // 89-94%, so almost nobody ever saw a win. Measured, the back half was the problem: waves grew 24 s ->
  // 45 s while the share of time with a bug at the fence fell 74% -> 25%, longer and safer at once,
  // because a late wave is paced by the spawn belt (waveCount(10) x swarm 3 x spawnGap(10) = 44 s), not
  // by killing. So: `pace` 0.6 compresses the belt (a wave keeps every bug, every coin and every bit of
  // charge, they just come closer together: 12 -> 20 bugs on screen, first-minute kills 47 -> 49 and
  // buys 12 -> 13), `waves` 6 ends the level before the threat curve goes flat - the
  // decline is structural, bought dps outgrows the 1.19/wave health curve - and `bite` 0.7 leaves the
  // fence at ~62% instead of ~90%, which is also what makes 1-1's stars mean anything. A buying player
  // now wins in 2.7-3.4 min on the clock (3.2-3.4 min if they never tap the cards), inside the quit
  // point, and nobody lost in 120 runs. The fence left is 99% for the bot, 62% buying by hand, 57%
  // buying every 20 s, 15% never buying - 3/2/2/1 stars, where every policy used to end above 80%
  // and take three. SAFE still catches the never-buyer every run, as it did before (ending 17%);
  // what is new is the 20 s buyer dipping under 50% on 6 seeds in 30, which is the point of it.
  // Over the whole level the totals follow the wave count: kills 396 -> 183, buys 51 -> 34, gold left
  // 270 -> 221. The rate went the other way - 7.7 buys a minute -> 13 - and the crystals follow the
  // waves too (LEVEL_PAY: first clear 20+10/star -> 12+6/star), which scripts/meta.ts absorbs: still
  // 230 crystals in run 1 and chapter 1 cleared on run 10.
  // The bite is above 1-2..1-5's (0.4..0.7) on purpose: this level's bugs have a third of the health, so
  // what the ladder is really about - fence left at the end - still climbs. See levels.test.ts.
  // 0.0.20's lesson stands (2026-11-10): that one guessed its cause and checked it with bots only, and
  // the median stay fell 94 s -> 60 s. This one is measured against the live quit context in quit_*
  // (fence, bugs, gold, card, quiet) and against four buying policies, 30 seeds each.
  { waves: 6, hp: 0.33, swarm: 3, pace: 0.6, bite: 0.7, pool: [C], fronts: 1, safe: true, open: -Math.PI / 2, lead: 4, happenFrom: 1, tough: { share: 0.3, hp: 3, from: 2, to: 5 } },
  // 1-2..1-10 carry 1-1's rebuild (2026-11-14). They were still the shape 1-1 was measured out of:
  // ten to fifteen waves at `pace` 1, 4-5 minutes, and a health line flat across the chapter (0.9 ->
  // 0.92). Measured with scripts/ladder.ts, that made a trained player - the only kind who reaches
  // 1-5 - end every level between 82% and 90% fence with three stars while the clock grew 2.8 -> 4.4
  // min: more time asked, no more fight, which is exactly the won-fight quit the live telemetry shows
  // (docs/telemetry/2026-11-12-level1-pacing.md). So the chapter now has two ladders of its own:
  //  - length grows from 1-1 instead of jumping +70% at 1-2 (6 -> 7 -> ... -> 12 waves), and `pace`
  //    stays compressed so a late wave is paced by killing and not by the spawn belt;
  //  - health climbs 0.9 -> 1.65, which is what makes training worth buying instead of something the
  //    level has to cancel out. The alternative - scaling enemy health by the training brought in -
  //    was built and measured and then dropped: it does flatten the ladder, but it takes back what
  //    the player just bought, and at the strength that worked it pushed the untrained back into a
  //    wall at 1-6.
  // `safe` now runs to 1-7 rather than 1-5: the old edge turned 1-6 from unloseable into unwinnable
  // in one step (a hand player who never trains lost 10/10 from 1-6 on). From 1-8 on the fence can
  // fall, which is where the chapter asks for training. 1-8..1-10 carried a fading `net` (0.6/0.4/0.2)
  // for a day; 2026-11-15 removed it, because a netted level ends at exactly its floor for everyone -
  // see the net paragraph in levels.test.ts.
  { waves: 7, hp: 0.9, boss: 0.55, bite: 0.4, pace: 0.65, pool: [C, 'beetle'], fronts: 1, safe: true },
  { waves: 7, hp: 1.0, boss: 0.55, bite: 0.5, pace: 0.7, pool: [C, 'beetle'], fronts: 2, safe: true },
  { waves: 8, hp: 1.05, boss: 0.55, bite: 0.6, pace: 0.7, pool: [C, 'beetle', 'crow'], fronts: 2, safe: true },
  { waves: 8, hp: 1.1, boss: 0.55, bite: 0.7, pace: 0.75, pool: [C, 'beetle', 'crow'], mods: ['rush'], safe: true },
  { waves: 9, hp: 1.15, boss: 0.55, bite: 0.8, pace: 0.75, pool: [C, 'beetle', 'crow', 'snail'], safe: true },
  { waves: 9, hp: 1.2, boss: 0.55, bite: 0.9, pace: 0.8, pool: [C, 'beetle', 'crow', 'snail'], mods: ['paper'], safe: true },
  { waves: 10, hp: 1.2, boss: 0.55, pace: 0.8, pool: [C, 'beetle', 'crow', 'snail', 'mold'] },
  // 1-9 lost its `poor` modifier on 2026-11-14. Twenty gold off the start used to be a scratch; now
  // that training is charged for, a trained player's first card costs 50-100, so `poor` was taking
  // their whole opening instead of a fifth of it, and every persona in scripts/personas.ts ended the
  // level at 0%. The extra front is the level's own step.
  { waves: 10, hp: 1.45, boss: 0.55, pace: 0.85, pool: [C, 'beetle', 'crow', 'snail', 'mold'], fronts: 2 },
  { waves: 12, hp: 1.65, boss: 0.55, pace: 0.85, pool: [C, 'beetle', 'crow', 'snail', 'mold'] },
  // Chapter 2 (2026-11-04): no new bug, but each level its own mix (a pool without caterpillars
  // shares their slice among the rest), three fronts, and the modifiers two at a time.
  // Chapter 2 was rescaled on 2026-11-14 along with chapter 1. It used to open at hp 4 against a
  // chapter 1 that ended at 0.92 - a four-fold step - and scripts/meta.ts's players bounced off 2-1
  // for twenty runs straight. The health line now carries on from 1-10's 1.65 instead of restarting,
  // and the levels keep chapter 1's compressed `pace` so a wave is still paced by killing.
  { waves: 10, hp: 1.8, pace: 0.85, pool: ALL, fronts: 2 },
  { waves: 10, hp: 1.95, pace: 0.85, pool: ['beetle', 'snail'] },
  { waves: 11, hp: 1.55, pace: 0.85, pool: [C, 'crow'], mods: ['rush'] },
  { waves: 11, hp: 1.7, pace: 0.9, pool: ALL, mods: ['tough'], fronts: 2 },
  { waves: 12, hp: 2.5, pace: 0.9, pool: ['crow', 'mold'] },
  { waves: 12, hp: 2.45, pace: 0.9, pool: ALL, mods: ['paper'], fronts: 2 },
  { waves: 13, hp: 3.05, pace: 0.9, pool: ['beetle', 'snail', 'mold'], mods: ['poor'] },
  { waves: 13, hp: 2.7, pace: 0.95, pool: ALL, mods: ['rush'] },
  { waves: 14, hp: 3.25, pace: 0.95, pool: ['crow', 'snail', 'mold'], mods: ['paper'], fronts: 3 },
  { waves: 15, hp: 3.1, pace: 0.95, pool: ALL, mods: ['tough'] },
  // Chapter 3 (2026-11-17): the first chapter with no new mechanic to teach, so what it adds is
  // pressure, not length. Every level is 15 waves, 2-10's length: WAVES.lateFrom is 15, and past it
  // the endless curves bend (twice the bugs a wave, bugs walking faster, a lower gap floor), which
  // is endless's shape and not a level's - see world.test.ts, "the endless curves". So the chapter
  // climbs on health, pools and modifiers: `pace` reaches 1 (the endless spawn belt) in the back
  // half, and from 3-6 the modifiers come two at a time, which nothing before this chapter does.
  // Fronts are left at the endless default from 3-3 on; the first two levels narrow them as the
  // chapter's own ramp.
  // The health numbers are not a line, they are what `scripts/ladder.ts` measured back: a modifier
  // carries part of the difficulty, and they are not equal - `tough` is the heavy one, `rush` the
  // light one, and `poor` bites hardest next to `tough`, so 3-9 at hp 3.8 with tough+poor is a
  // harder level than 3-7 at 4.6 with tough alone. Tuned over four passes against the fence a hand
  // player leaves, arriving with the training the campaign has paid for by then (8 seeds):
  // 52 51 32 23 30 43 38 34 22 4%, picking up where chapter 2 ends (24%) and walking down to the
  // chapter boss, which is lost 3 times in 8 - the 2-4 runs stuck on a chapter's last level that
  // battle.md 9.1 asks for. Only 3-4 (1/8) is lost anywhere before it. Levels run 4.9-6.1 min.
  { waves: 15, hp: 3.1, pace: 0.95, pool: ALL, fronts: 2 },
  { waves: 15, hp: 3.85, pace: 0.95, pool: ['beetle', 'crow'], fronts: 3 },
  { waves: 15, hp: 3.1, pace: 0.95, pool: [C, 'snail', 'mold'], mods: ['rush'] },
  { waves: 15, hp: 3.35, pace: 0.95, pool: ALL, mods: ['tough'] },
  { waves: 15, hp: 3.9, pace: 0.95, pool: ['crow', 'mold'], mods: ['paper'] },
  { waves: 15, hp: 4.0, pace: 1, pool: ALL, mods: ['poor', 'rush'] },
  { waves: 15, hp: 4.6, pace: 1, pool: ['beetle', 'snail', 'mold'], mods: ['tough'] },
  { waves: 15, hp: 4.3, pace: 1, pool: ALL, mods: ['paper', 'rush'] },
  { waves: 15, hp: 3.8, pace: 1, pool: [C, 'crow', 'snail'], mods: ['tough', 'poor'] },
  { waves: 15, hp: 5.0, pace: 1, pool: ALL, mods: ['tough', 'rush'] },
];

/*
 * The boss wave (2026-11-17). Every level ends on one, and measured with scripts/wavetime.ts against
 * a trained hand player it was the one wave that stood still: 42-58 s against 12-25 s for a normal
 * wave, with 35-49% of it played on an empty board, on every level from 1-5 to 3-10. The shape is
 * the won fight the player quits (docs/telemetry/2026-11-12-level1-pacing.md), and it sat at the end
 * of every level, right before the reward - on the seven-wave levels 1-2 and 1-3 it IS wave 7, the
 * "wave 6-7" the live telemetry reads. Two things made it: waves.ts gives a boss wave half the usual
 * bugs and spawns the king behind all of them, so the escorts are gone before he walks, and his
 * locusts (config.ts LOCUST) came every 6 s and died on arrival.
 *
 * The fix is two knobs, not a redesign:
 *  - LOCUST.every 6 -> 3, globally. It fills the dead board and costs no frames (peak bugs on the
 *    wave is unchanged, they die as fast as they come) and nothing in endless moves (scripts/
 *    endless-prof.ts: wave 47 at 845 s against 853 s, same peaks).
 *  - `boss` 0.55 on chapter 1, which is where the quitting is measured. Chapter 1's boss waves ran
 *    42-67 s; they now run 32-44 s, about twice a normal wave, and the levels land at 2.5-3.5 min on
 *    the player's clock instead of 3.1-4.4, inside the 3.4-min quit point for the levels players
 *    actually reach. The fence left rises with it (1-2 39% -> 51%, 1-7 24% -> 35%): a shorter boss is
 *    an easier boss, and chapter 1 is where that is the right trade.
 * Chapters 2 and 3 keep `boss` 1: their ladder was tuned on 2026-11-14/17 and the locust change alone
 * already halves their dead time (3-10: 26.6 s -> 14.0 s), with the ladder's fence line unmoved.
 */

export const CHAPTER_SIZE = 10;

/** "1-3" for the third level of chapter 1. */
export function levelName(i: number): string {
  return `${Math.floor(i / CHAPTER_SIZE) + 1}-${(i % CHAPTER_SIZE) + 1}`;
}

/** The run rules a level's modifiers add up to. */
export function levelMods(def: LevelDef): RunMods {
  const out: RunMods = {};
  for (const id of def.mods ?? []) Object.assign(out, MODS[id]);
  return out;
}

/**
 * Stars for a won level from the fence left: 1, 2 at a quarter, 3 at 60%.
 *
 * Half and 80% until 2026-11-15, which the ladder had outgrown: measured end to end, a player
 * arriving with the crystals the campaign pays ends a level between 11% and 55% fence, so 18 of the
 * 20 levels gave one star and three was out of reach everywhere. Stars are the replay hook and part
 * of the pay, so thresholds nobody can cross cost the player both. At a quarter and a half, most
 * levels give two on the first clear and the third is a run that went well: measured over twelve
 * kinds of player in scripts/personas.ts, an engaged one ends chapter 1 between 51% and 87%, so 60%
 * splits them instead of handing every one of them three stars.
 */
export function starsFor(wallFrac: number): number {
  return 1 + (wallFrac >= 0.25 ? 1 : 0) + (wallFrac >= 0.6 ? 1 : 0);
}
