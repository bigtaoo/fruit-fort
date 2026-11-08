// The hero's engine on the rail (split from scene.ts): building it for a run, its reactions (a shot,
// a reversal, a buy, the skill, the end of a run) and its pose on the track each frame.

import * as THREE from 'three';
import { TRAIN } from '../sim/config';
import type { HeroKind } from '../sim/types';
import { flatten } from './flatten';
import type { Stage } from './scene';
import { spinOff } from './spin';
import { makeHoverTank } from './tank';
import { makeHero } from './troopers';

/** How high the rail stands off the ground. */
export const TRACK_TOP = 0.12;

/** Build the engine in the hero's colour and seat the hero in its cab, for a run. */
export function setHero(stage: Stage, kind: HeroKind): void {
  // The last run's engine and hero go for good: their baked geometries held ~22 GPU buffers a run,
  // never freed over a session. The materials are shared and stay.
  for (const g of [stage.train, stage.hero]) g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  stage.train.clear();
  const loco = makeHoverTank();
  flatten(loco);
  stage.train.add(loco);
  stage.hero.clear();
  const trooper = makeHero(kind);
  flatten(trooper);
  stage.hero.add(trooper);
  stage.hero.scale.setScalar(0.9);
  (loco.userData.seat as THREE.Object3D).add(stage.hero);
}

/** What the engine reacts to: a shot, a reversal, a stat bought, the hero's skill, the end of the run. */
export type TrainKick = 'fire' | 'reverse' | 'buy' | 'cast' | 'over' | 'revive';
/** How long each one-off reaction runs, in seconds of the view clock. */
const KICK_TIME: Record<Exclude<TrainKick, 'over' | 'revive'>, number> = { fire: 0.16, reverse: 0.8, buy: 0.55, cast: 0.9 };
/** Lean into the ring, as a toy pushed round a bend tips that way; radians. */
const LEAN = 0.035;
/** Height of the engine's frame above the rail: the body squashes and stretches about it. */
const SPRING_Y = 0.38;

/**
 * Start a reaction of the engine, at `t` on the view clock. One already running is left to finish
 * rather than restarted: fast fire or a burst of buys would otherwise snap it back to its start every
 * few frames and shake. 'over' slumps it until 'revive' (or the next run's new engine).
 */
export function kickTrain(stage: Stage, kind: TrainKick, t: number): void {
  const loco = stage.train.children[0];
  if (!loco) return;
  const k = (loco.userData.kick ??= {}) as Partial<Record<TrainKick, number>>;
  if (kind === 'revive') delete k.over;
  else if (kind === 'over') k.over ??= t;
  else if (k[kind] === undefined || t - k[kind]! >= KICK_TIME[kind]) k[kind] = t;
}

/** Twice per wheel turn, the beat the engine chuffs to: how many beats lie between two `roll`s. */
export function chuffs(from: number, to: number): number {
  return Math.max(0, Math.floor(to / Math.PI) - Math.floor(from / Math.PI));
}

/** 0..1 through a reaction started at `at`, or -1 when none is running. */
function kickAt(at: number | undefined, dur: number, t: number): number {
  if (at === undefined) return -1;
  const u = (t - at) / dur;
  return u >= 0 && u < 1 ? u : -1;
}

/** A shot's jolt over 0..1: all of it at once in the first 12%, then easing back out. */
export function shotCurve(u: number): number {
  if (u < 0 || u >= 1) return 0;
  return u < 0.12 ? u / 0.12 : (1 - (u - 0.12) / 0.88) ** 2;
}

/** A hop over the first `air` of a reaction, then the landing squash: [height 0..1, squash 0..1]. */
function hop(u: number, air: number): [number, number] {
  if (u < 0) return [0, 0];
  if (u < air) return [Math.sin((Math.PI * u) / air), 0];
  return [0, Math.sin((Math.PI * (u - air)) / (1 - air))];
}

/**
 * The engine's body on its springs. Driving, it chuffs twice per wheel turn (a quick lift and a
 * chimney stretch that eases off), rocks a little once per turn and leans into the ring; the
 * reactions from kickTrain go on top. Kept small: from the camera the engine is ~150 px long.
 */
function poseLocomotive(loco: THREE.Object3D, dir: number, roll: number, t: number): void {
  const body = loco.userData.body as THREE.Object3D | undefined;
  const stack = loco.userData.stack as THREE.Object3D | undefined;
  if (!body || !stack) return;
  const k = (loco.userData.kick ?? {}) as Partial<Record<TrainKick, number>>;
  // Chuff: a fast rise over the first 15% of the beat, then a slow ease back.
  const f = roll / Math.PI - Math.floor(roll / Math.PI);
  const chuff = f < 0.15 ? f / 0.15 : Math.exp(-(f - 0.15) * 6);
  let y = 0.025 * chuff;
  let z = 0;
  let pitch = 0;
  let tilt = dir * LEAN + 0.012 * Math.sin(roll);
  let stretch = 0;
  let puff = 0.14 * chuff;
  // Shot: a sharp kick back and nose-up, then easing level, over in a sixth of a second.
  const fire = kickAt(k.fire, KICK_TIME.fire, t);
  if (fire >= 0) {
    const b = shotCurve(fire);
    z -= 0.06 * b;
    pitch -= 0.045 * b;
    y -= 0.012 * b;
  }
  // Reverse: the brakes bite, the nose dips and lurches on, then bobs back past level and settles.
  const rev = kickAt(k.reverse, KICK_TIME.reverse, t);
  if (rev >= 0) {
    const s = rev * KICK_TIME.reverse;
    const d = Math.exp(-5 * s) * Math.sin((2 * Math.PI * s) / 0.5);
    pitch += 0.1 * d;
    z += 0.04 * d;
  }
  // Buy: a happy hop of the whole engine, stretched in the air and squashed on landing.
  const [buyUp, buyLand] = hop(kickAt(k.buy, KICK_TIME.buy, t), 0.7);
  // Skill: a bigger hop rearing up, the chimney shooting up like a whistle and wobbling back.
  const castU = kickAt(k.cast, KICK_TIME.cast, t);
  const [castUp, castLand] = hop(castU, 0.6);
  if (castU >= 0) puff += 0.45 * Math.sin(Math.PI * castU) * (1 + 0.25 * Math.sin(castU * 40));
  stretch += 0.07 * buyUp - 0.1 * buyLand + 0.08 * castUp - 0.14 * castLand;
  pitch -= 0.05 * castUp;
  // Game over: sinks on its springs, slumps sideways and the chimney droops.
  const sag = k.over === undefined ? 0 : THREE.MathUtils.smoothstep(t - k.over, 0, 0.6);
  y -= 0.03 * sag;
  tilt += 0.07 * sag;
  puff -= 0.18 * sag;
  loco.position.y = 0.1 * buyUp + 0.2 * castUp;
  // Squash and stretch about the top of the frame, not the rail, so a squash doesn't push the cab
  // down over the wheels.
  body.position.set(0, y - SPRING_Y * stretch, z);
  body.rotation.set(pitch, 0, tilt);
  body.scale.set(1 - stretch / 2, 1 + stretch, 1 - stretch / 2);
  // The chimney keeps its volume: taller is thinner.
  stack.scale.set(1 / Math.sqrt(1 + puff), 1 + puff, 1 / Math.sqrt(1 + puff));
}

/** Seconds the reach ring stays up after the range changes, then how long it takes to fade. */
const REACH_HOLD = 1.2;
const REACH_FADE = 0.8;

/**
 * Put the train at `angle` on the track facing the way it drives, wheels turning; the reach ring
 * follows. Left on, the ring crossed the whole lawn as a pale stripe, so it only shows for a moment
 * when `range` changes (a Range upgrade, a new run); `t` is the view clock in seconds.
 */
export function placeTrain(stage: Stage, angle: number, dir: number, range: number, roll: number, t: number): void {
  const x = Math.cos(angle) * TRAIN.radius;
  const z = Math.sin(angle) * TRAIN.radius;
  stage.train.position.set(x, TRACK_TOP, z);
  // Nose (+z) along the tangent of travel: dir * (-sin a, cos a). A reversal drives the new way at
  // once, but the hull swings round over SPIN, always the same way, from wherever it is.
  const sp = stage.train.userData as { dir?: number; at?: number; off?: number };
  if (sp.dir !== undefined && sp.dir !== dir) {
    // Reversed again mid-swing: the short way back, not a full turn on top.
    const off = spinOff(sp.off ?? 0, t - (sp.at ?? -1)) + Math.PI;
    sp.off = off > Math.PI ? off - 2 * Math.PI : off;
    sp.at = t;
  }
  sp.dir = dir;
  stage.train.rotation.y = Math.atan2(-dir * Math.sin(angle), dir * Math.cos(angle)) + spinOff(sp.off ?? 0, t - (sp.at ?? -1));
  const loco = stage.train.children[0];
  if (loco) poseLocomotive(loco, dir, roll, t);
  stage.reach.position.set(x, TRACK_TOP + 0.01, z);
  stage.reach.scale.setScalar(range);
  const ring = stage.reach.userData as { range?: number; at?: number };
  if (ring.range !== range) {
    ring.range = range;
    ring.at = t;
  }
  const fade = 1 - Math.min(1, Math.max(0, (t - ring.at! - REACH_HOLD) / REACH_FADE));
  (stage.reach.material as THREE.MeshBasicMaterial).opacity = 0.35 * fade;
  stage.reach.visible = fade > 0;
}
