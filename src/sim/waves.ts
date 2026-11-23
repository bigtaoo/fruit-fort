// Wave generation, for endless runs and for levels (§9.1, which narrow it with a WavePlan). Each wave draws hidden fronts (attack angles) around the fort, the
// first one primary; enemies spread over a small arc around their front, and later waves also
// scatter some from anywhere. Nothing about this is shown on the map.

import { FLAVOR, flavorsAt, WAVES, spawnGap, waveCount, waveSurge, type Flavor } from './wavedefs';
import { BOSS_KINDS } from './config';
import type { Prng } from './rng';
import type { EnemyKind } from './types';

export interface Spawn {
  at: number;
  kind: EnemyKind;
  /** Approach angle in radians, 0 east, growing towards south. */
  angle: number;
  /** Distance already walked in when it shows (LevelDef.lead). */
  lead?: number;
  /** A tough one (LevelDef.tough): its health times this, drawn bigger, paying double. */
  tough?: number;
}

/** A level's say over a wave; endless runs pass none. */
export interface WavePlan {
  /** The only kinds that turn up; otherwise each kind joins from its endless wave. */
  pool?: EnemyKind[];
  /** At most this many fronts. */
  fronts?: number;
  /** Whether this wave has the boss; otherwise every `bossEvery`th does. */
  boss?: boolean;
  /** The first front's angle instead of a random one. */
  front?: number;
  /** Bugs a wave, times the endless count (1 when left out). */
  swarm?: number;
  /** Gaps between bugs, times the endless gap (1 when left out). */
  pace?: number;
  /** This share of the caterpillars come tough, with `hp` times the health. */
  tough?: { share: number; hp: number };
}

const TAU = Math.PI * 2;

export function frontCount(wave: number): number {
  for (const band of WAVES.frontBands) if (wave <= band.upTo) return band.fronts;
  return WAVES.maxFronts;
}

/**
 * How far past `WAVES.lateFrom` a wave is, 0 at the gate and 1 once `mix.mixOver` waves have passed.
 * Everything that makes a late endless wave look different from an early one rides on this, and it is
 * 0 for every wave a chapter level ever plans (none runs past wave 15), so chapters are untouched.
 */
export function lateness(wave: number): number {
  return Math.min(1, Math.max(0, (wave - WAVES.lateFrom) / WAVES.mix.mixOver));
}

export function isBossWave(wave: number): boolean {
  return wave % WAVES.bossEvery === 0;
}

/**
 * Which boss this endless boss wave brings (§9.9), and which the second and third of a late one are.
 *
 * No random draw: the wave number alone decides, so a run's bosses are 王 → 鼹鼠 → 蜂后 → 王 … and a
 * player can learn the order. The rotation is also the whole reason it is worth writing three bosses
 * - a boss wave is the one ceremony an endless run has (its own banner, its own breath, a milestone
 * five waves off), and until now a player met the identical locust king at waves 10, 20, 30, 40 and
 * 50. With three, the same boss comes back every thirty waves, and from wave 40 on a wave brings two
 * different ones at once, which no amount of health ever made new.
 *
 * Chapter levels never come here: they set `WavePlan.boss` themselves, and `planWave` only rotates
 * when that field is left out. Their boss stays the king it has always been.
 */
export function bossKind(wave: number, i = 0): EnemyKind {
  return BOSS_KINDS[(Math.floor(wave / WAVES.bossEvery) - 1 + i) % BOSS_KINDS.length];
}

/** Bosses on a boss wave: one, and more once the run is long (WAVES.bossBands). */
export function bossCount(wave: number): number {
  let n = 1;
  for (const band of WAVES.bossBands) if (wave >= band.from) n = band.bosses;
  return n;
}

/** The share of a late wave that comes tough: nothing before WAVES.elite.from, then rising to a cap. */
export function eliteShare(wave: number): number {
  const { from, share, per, cap } = WAVES.elite;
  return wave < from ? 0 : Math.min(cap, share + (wave - from) * per);
}

function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return Math.min(d, TAU - d);
}

/** Front angles this wave, primary first, kept apart so two fronts never read as one. */
export function pickFronts(wave: number, rng: Prng, most = Infinity): number[] {
  const fronts = [rng.float() * TAU];
  while (fronts.length < Math.min(most, frontCount(wave))) {
    // Keep drawing until the angle clears every front already taken - but give up after
    // `frontTries` and take it anyway. Four fronts `frontGap` apart only just fit on a circle
    // (4 x 1.2 < 2 pi), so pure rejection can run for a very long time at the late front count. Up to
    // three fronts it practically never gives up, which is why this draws the same angles from the
    // same seed as it always did, and every chapter level plays exactly the wave it played before.
    let a = rng.float() * TAU;
    for (let i = 1; i < WAVES.frontTries && !fronts.every((f) => angleGap(f, a) >= WAVES.frontGap); i++) a = rng.float() * TAU;
    fronts.push(a);
  }
  return fronts;
}

/**
 * This wave's flavor (§9.9), or null for an ordinary wave. Endless only and never on a boss wave:
 * the boss is already the event, and a boss wave's head count is halved, so a flavor on top of one
 * would read as neither.
 */
export function pickFlavor(wave: number, rng: Prng): Flavor | null {
  if (wave < FLAVOR.from || rng.float() >= FLAVOR.chance) return null;
  const opts = flavorsAt(wave);
  return opts.length === 0 ? null : opts[rng.int(opts.length)];
}

function pickKind(wave: number, rng: Prng, pool?: EnemyKind[], flavor?: Flavor | null): EnemyKind {
  // Each kind takes its slice of the roll once it has started showing up; caterpillars get the rest.
  // The slices are not constants: past WAVES.lateFrom they walk from `mix.early` to `mix.late`, so a
  // wave late in an endless run is mostly armored and heavy where an early one is mostly caterpillars.
  // `t` is 0 for every wave a chapter level plans, so chapter shares are exactly what they were.
  let roll = rng.float();
  // A flavored wave (§9.9) reads its own absolute shares instead, and skips the gates: it was only
  // drawn at all once every kind it leans on was past its own. Caterpillars still take the rest.
  if (flavor) {
    for (const [kind, share] of Object.entries(flavor.mix) as [EnemyKind, number][]) {
      if (roll < share) return kind;
      roll -= share;
    }
    return 'caterpillar';
  }
  const t = lateness(wave);
  const { early, late } = WAVES.mix;
  const share = (k: keyof typeof early) => early[k] + (late[k] - early[k]) * t;
  // The two endless-only kinds (§9.5) come last, so adding them left every slice before them drawing
  // from the same stretch of the same roll: a chapter level plays exactly the wave it played before.
  const slices: [EnemyKind, number, number][] = [
    ['crow', WAVES.crowFrom, share('crow')],
    ['snail', WAVES.snailFrom, share('snail')],
    ['mold', WAVES.moldFrom, share('mold')],
    ['beetle', WAVES.beetleFrom, share('beetle')],
    ['digger', WAVES.diggerFrom, share('digger')],
    ['bomber', WAVES.bomberFrom, share('bomber')],
    ['warden', WAVES.wardenFrom, share('warden')],
  ];
  for (const [kind, from, share] of slices) {
    if (pool ? !pool.includes(kind) : wave < from) continue;
    if (roll < share) return kind;
    roll -= share;
  }
  // A pool without caterpillars hands their share out evenly instead.
  if (pool && !pool.includes('caterpillar')) return pool[Math.floor(rng.float() * pool.length)];
  return 'caterpillar';
}

function pickAngle(wave: number, fronts: number[], rng: Prng, taken: number[]): number {
  const scatter = WAVES.scatterShare + (WAVES.scatterLate - WAVES.scatterShare) * lateness(wave);
  if (wave >= WAVES.scatterFrom && rng.float() < scatter) return rng.float() * TAU;
  const front = fronts.length === 1 || rng.float() < WAVES.primaryShare ? fronts[0] : fronts[1 + rng.int(fronts.length - 1)];
  // Of a few tries, the one furthest from the last bugs in, so they spread along the arc instead
  // of piling onto one stretch of fence.
  let best = 0;
  let room = -1;
  for (let i = 0; i < WAVES.spreadTries; i++) {
    const a = front + (rng.float() * 2 - 1) * WAVES.frontSpread;
    const near = Math.min(Infinity, ...taken.slice(-WAVES.spreadRecall).map((t) => angleGap(t, a)));
    if (near > room) [best, room] = [a, near];
  }
  return best;
}

/** The spawn list for a wave, times relative to the wave start. */
export function planWave(wave: number, rng: Prng, plan: WavePlan = {}): Spawn[] {
  const fronts = pickFronts(wave, rng, plan.fronts);
  if (plan.front !== undefined) fronts[0] = plan.front;
  const boss = plan.boss ?? isBossWave(wave);
  // Endless only: a level says `boss` for itself, so `plan.boss === undefined` is the endless gate
  // for both the flavor and the boss rotation, and no chapter wave draws a number it did not before.
  const endless = plan.boss === undefined;
  const flavor = endless && !boss ? pickFlavor(wave, rng) : null;
  const many = Math.round(waveCount(wave) * (plan.swarm ?? 1) * (flavor?.swarm ?? 1));
  const count = boss ? Math.ceil(many / 2) : many;
  const gap = spawnGap(wave) * (plan.pace ?? 1) * (flavor?.pace ?? 1);
  // Nothing is drawn for elites when there are none - a wave before WAVES.elite.from, or a level,
  // which says for itself which bugs come tough. Drawing anyway would shift the random stream and
  // every chapter level would play a different wave from the same seed.
  const elite = plan.tough ? 0 : eliteShare(wave);
  const out: Spawn[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const s: Spawn = { at: t, kind: pickKind(wave, rng, plan.pool, flavor), angle: pickAngle(wave, fronts, rng, out.map((o) => o.angle)) };
    if (plan.tough) {
      if (s.kind === 'caterpillar' && rng.float() < plan.tough.share) s.tough = plan.tough.hp;
    } else if (elite > 0 && rng.float() < elite) {
      // Endless elites. A level says which bugs come tough through `plan.tough` and is left alone;
      // an endless run past WAVES.elite.from promotes any kind, so a late wave has big ones in it
      // whatever the mix rolled - something to aim the heavy card at, and a reason to own one.
      s.tough = WAVES.elite.hp;
    }
    out.push(s);
    // 一波的形状（WAVES.surge，§9.8）：开头稀、结尾密，所以一波自己是一个弧，而不是一条
    // 匀速的滴水。抖动那一次随机数还在原地，所以同一个种子抽到的虫种和角度一个不变。
    t += gap * waveSurge(i, count) * (0.6 + rng.float() * 0.8);
  }
  // One boss, or several once the run is long enough (WAVES.bossBands); a level plans wave <= 15, so
  // `bossCount` is 1 for every wave a level ever asks for. They come in off different fronts, far
  // enough apart that they cannot be met with one answer.
  if (boss) for (let i = 0; i < bossCount(wave); i++) out.push({ at: t + 1 + i * 1.5, kind: endless ? bossKind(wave, i) : 'boss', angle: fronts[i % fronts.length] });
  return out;
}
