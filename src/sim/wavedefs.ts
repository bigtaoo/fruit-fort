// Wave rules: when bugs come, how many, from where, what mix, and how fast late waves walk.
// Split from config.ts.

import type { EnemyKind } from './types';

export const WAVES = {
  firstDelay: 1.5,
  /** Next batch comes in once this few enemies are left and the queue is empty. */
  callAt: 2,
  /**
   * 换气（§9.8）：一波清完到下一波开始之间的停顿，秒。这是一局里唯一的下拍。
   *
   * 在它之前 `callAt` 就是全部的节拍规则：场上还剩 2 只，下一波已经在放了，所以一局从头到尾是一条
   * 不断的流 —— 没有「这波我扛住了」的那一下，Boss 波和普通波一样长，波次号往上跳是唯一的信号。量过
   * 一局（`arrivingAt(10)` 的存档、第 51 波自然结束）：第 4 波往后每一波都是 17～26 秒，到局末都没有
   * 趋势，Boss 波（10/20/30/40/50）和它旁边的普通波一样长。
   *
   * 一口气里发生三件事：这一波的金币结清（原本在下一波开始时给，正好给在打仗中间，玩家没有一秒钟是
   * 空的）、下拍的横幅和音效、以及卡条（挑车厢、局势牌、里程碑）唯一会开的时机。于是一局是「打 → 清
   * → 选 → 打」的循环，而不是打到一半被卡面打断。
   *
   * Boss 波之后长一些：峰之后的释放也该长一些。
   */
  breath: { base: 1.6, boss: 3.2 },
  /**
   * 波内的起伏（§9.8）。原本一波里的出怪间隔是常数乘一个 ±40% 的抖动，所以一波没有形状：第 1 只和
   * 第 40 只之间什么都没变。现在间隔从 `open` 倍线性收到 `close` 倍 —— 开头是零星试探，结尾是压上来
   * 的一堵墙，Boss 正好跟在这堵墙后面，换气正好接在这堵墙清掉之后。
   *
   * 两者之和是 2，所以一波的平均间隔不变：改的是形状，不是时长。也不多抽一次随机数（抖动那一次还在
   * 原地），所以每一关从同一个种子抽到的虫种和角度逐个不变，变的只有它们到场的时刻。
   */
  surge: { open: 1.55, close: 0.45 },
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
   * 钻地虫 and 自爆虫 (§9.5): the two kinds an endless run meets that a chapter never does. The gates
   * are the three steps the late run is built around - a new question at 20, a second at 30, and at
   * 40 the first one asked harder (`digger.deepFrom`).
   *
   * What the pair costs a run, as medians of 6 seeds of scripts/reach.ts (`arrivingAt(19)`): wave 69
   * / 25 min with neither kind, 58 / 20 with diggers alone, 57 / 20 with both. On the save a
   * developer who has cleared everything plays (MAX=1), 93 / 36 min -> 74 / 27. That is what §9.2 is
   * after - the screenshot that started this was wave 66 with nothing ever touching the fence, and
   * wave 66 is now near the end of the road rather than the middle of it. Read the median: a single
   * seed lives or dies at one dip (seed 1 is down to 9% fence around wave 40), so one seed reads any
   * change as a swing of twenty waves.
   */
  diggerFrom: 20,
  bomberFrom: 30,
  /** 支援虫 (§9.9): between the two, so each of the late run's three steps brings one new kind. */
  wardenFrom: 25,
  /**
   * How far short of the fence a digger breaks ground, in world units. It is untouchable until then
   * (`Enemy.buried`), so this number alone says how long the train has to kill it: everything else
   * about it is ordinary. From `deepFrom` it shrinks by `per` a wave to `deepest`, so the bug that
   * surfaced at the edge of the kill ring at wave 20 surfaces under the fence by wave 70 - the one
   * curve in the game that gets inside a kill zone instead of racing it.
   */
  digger: { surfaceAt: 0.8, deepFrom: 40, per: 0.02, deepest: 0.2 },
  /**
   * A bomber at the fence (§9.5): `fuse` seconds standing still with its fuse lit, then `blast` of
   * the whole fence pool at once.
   *
   * The fuse is the kind, and it is the one thing here that measured. A charge on arrival with no
   * fuse was written first and does not work: past wave 30 about half of everything spawned reaches
   * the fence anyway, so a charge on arrival is a flat tax on the clock that no amount of damage
   * answers. At these very shares and this very blast, 6 seeds of scripts/reach.ts at
   * `arrivingAt(19)` end at a median wave of 57 with the fuse and 40 without it - the same bugs, the
   * same damage, and seventeen waves between them, because a bomber at the fence is 26 hp standing
   * still inside everything's reach and a train that is keeping up spends one shot on it.
   *
   * The dose is the share, not the blast. Bombers arrive in numbers, so `blast` times the share is
   * what the fence actually pays: at the 0.09/0.13 share this kind was born with, every blast from
   * 1.5% of the pool to 4.5% ended the run at a median wave of 35-38, and 0.4% of the pool ended it
   * at 58, with nothing in between to tune. A rare bomber that takes a chunk you can see is the one
   * worth having, so the share came down to 0.03/0.04 and the blast stayed at 1%. Bracket the pair
   * (BOMBS=/BLAST=/FUSE= in reach.ts); neither number means anything alone.
   */
  bomber: { blast: 0.01, fuse: 1.2 },
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
    early: { crow: 0.15, snail: 0.08, mold: 0.15, beetle: 0.25, digger: 0.08, bomber: 0.03, warden: 0.03 },
    // The four old shares were 0.17 / 0.22 / 0.2 / 0.31 before the two new kinds; they are those
    // times 0.78, so the late wave is the same shape it was measured as with a quarter of it handed
    // to the diggers and bombers, instead of the new kinds coming on top of a wave that was already
    // 90% not-caterpillar. Their own shares do not need the ramp the others have - their gates are
    // what keeps them out of an early wave - so early and late are a tenth apart, not a third.
    // 2026-11-23: the six were 0.13 / 0.17 / 0.16 / 0.24 / 0.11 / 0.04 before the warden; they are
    // those times 0.94, so the late wave keeps the shape it was measured with and the caterpillars'
    // remainder stays near 0.14 instead of being squeezed to nothing.
    late: { crow: 0.122, snail: 0.16, mold: 0.15, beetle: 0.226, digger: 0.103, bomber: 0.038, warden: 0.06 },
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
  /**
   * How much harder a bug bites the fence per wave past `lateFrom`, and the ceiling (§9.3).
   *
   * `ENEMIES[kind].wallDps` is a flat number, so a caterpillar takes the same 2 a second off the
   * fence at wave 90 as at wave 2 - while the fence pool it is eating grows with every `wall` card
   * bought, 1450 at the start of an endless run against 6550 by wave 66 in the screenshot of
   * 2026-11-21. That is the quiet half of why endless has no end: even once bugs do reach the fence,
   * what they do to it shrinks wave by wave in the only terms that matter, the share of the pool.
   * 0.05 a wave to a cap of 6 holds that share roughly level against a player who keeps buying wall,
   * and punishes one who does not - which is the point of the card.
   *
   * Measured on seed 1 of scripts/reach.ts, `arrivingAt(19)`, as the end of the run: 86 waves / 34
   * min before, 78 with the reach cut alone, 55 with this alone, 51 with both. So this knob carries
   * the change and the reach cut is a tenth of it; the reach cut stays for what the numbers do not
   * show, which is bugs dying the tick they spawn. On a save with every training maxed the same four
   * are 109 / 89 / - / 86 waves. Bracket a new dose, never extrapolate: half of this is not half the
   * effect, since gold comes from kills and a fence that falls faster also ends the run sooner.
   */
  biteLate: { per: 0.05, cap: 6 },
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

/**
 * How hard bugs bite the fence, as a multiple of their kind's `wallDps`. 1 up to `WAVES.lateFrom`,
 * and no chapter level runs past that wave, so this is endless-only without a level check (§9.2) -
 * the per-level `bite` in `LevelDef` is a separate, chapter-side knob and the two multiply.
 */
/**
 * How far short of the fence a digger comes up (§9.5), by wave. Flat until `deepFrom`, then closing
 * on the fence - the answer to a kill ring that grows with every damage card while the ring's radius
 * is all that ever decided whether a bug arrives.
 */
export function diggerSurface(wave: number): number {
  const { surfaceAt, deepFrom, per, deepest } = WAVES.digger;
  return Math.max(deepest, surfaceAt - Math.max(0, wave - deepFrom) * per);
}

export function waveBite(wave: number): number {
  const late = Math.max(0, wave - WAVES.lateFrom);
  return Math.min(WAVES.biteLate.cap, 1 + late * WAVES.biteLate.per);
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

/**
 * 波内第 i 只（共 n 只）的出怪间隔倍率：开头稀，结尾密（`WAVES.surge`）。一波只有一只的时候没有
 * 形状可言，给 1。
 */
/**
 * 波次口味（§9.9）：第 `FLAVOR.from` 波起，无尽的每一波有 `chance` 的机会整波换一个组合 —— 一波全是
 * 飞的、一波全是重甲、一波只有小怪但数量翻倍。
 *
 * 治的是 `mix.mixOver` 的尽头：组合从第 15 波走到第 55 波就**冻住了**，之后每一波的配方一模一样，
 * 只有血条和人头在动 —— 这正是 `mix` 上面那段注释批评过的那件事，只是从第 11 波挪到了第 55 波。口味
 * 不是一条会走完的斜坡，它每一波重新掷一次，所以到第 100 波也还在变。
 *
 * **不预告**：没有横幅，没有图标。§9 的规矩是出怪方向都不在画面上表现，玩家只能从场上正在发生的事
 * 情来判断 —— 而一整片飞行虫或一堵重甲墙是**一眼就看得出来的**，它自己就是公告。
 *
 * `needs` 是这个口味靠的虫种：它们各自的 `*From` 都过了，这个口味才会被抽到，所以第 16 波抽不到钻地
 * 虫波。`mix` 是**绝对份额**（不是乘在正常组合上），剩下的全是毛毛虫。
 */
export const FLAVOR = { from: 16, chance: 0.35 };

export const FLAVORS = [
  { id: 'air', needs: ['crow'], mix: { crow: 0.8 } },
  { id: 'armor', needs: ['beetle', 'snail'], mix: { beetle: 0.5, snail: 0.35 } },
  // 小怪潮：份额上什么都不改（全是毛毛虫），改的是数量和密度。
  { id: 'horde', needs: [], mix: {}, swarm: 1.7, pace: 0.7 },
  { id: 'split', needs: ['mold'], mix: { mold: 0.8 } },
  { id: 'deep', needs: ['digger'], mix: { digger: 0.7 } },
  { id: 'guard', needs: ['warden', 'beetle'], mix: { warden: 0.25, beetle: 0.45 } },
] as const satisfies readonly Flavor[];

export interface Flavor {
  id: string;
  needs: readonly EnemyKind[];
  mix: Partial<Record<EnemyKind, number>>;
  /** Bugs this wave, times the usual count; gaps between them, times the usual gap. */
  swarm?: number;
  pace?: number;
}

/** The wave each kind starts turning up on, for a flavor's `needs`. */
export const KIND_FROM: Partial<Record<EnemyKind, number>> = {
  beetle: WAVES.beetleFrom,
  crow: WAVES.crowFrom,
  snail: WAVES.snailFrom,
  mold: WAVES.moldFrom,
  digger: WAVES.diggerFrom,
  bomber: WAVES.bomberFrom,
  warden: WAVES.wardenFrom,
};

/** The flavors this wave is allowed to draw: every kind they lean on is past its own gate. */
export function flavorsAt(wave: number): readonly Flavor[] {
  return FLAVORS.filter((f) => f.needs.every((k) => wave >= (KIND_FROM[k] ?? 0)));
}

export function waveSurge(i: number, n: number): number {
  const { open, close } = WAVES.surge;
  return n <= 1 ? 1 : open + (close - open) * (i / (n - 1));
}
