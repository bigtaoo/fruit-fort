// Endless wave generation. Each wave draws hidden fronts (attack angles) around the fort, the
// first one primary; enemies spread over a small arc around their front, and later waves also
// scatter some from anywhere. Nothing about this is shown on the map.

import { WAVES, spawnGap, waveCount } from './config';
import type { Prng } from './rng';
import type { EnemyKind } from './types';

export interface Spawn {
  at: number;
  kind: EnemyKind;
  /** Approach angle in radians, 0 east, growing towards south. */
  angle: number;
}

const TAU = Math.PI * 2;

export function frontCount(wave: number): number {
  for (const band of WAVES.frontBands) if (wave <= band.upTo) return band.fronts;
  return WAVES.maxFronts;
}

export function isBossWave(wave: number): boolean {
  return wave % WAVES.bossEvery === 0;
}

function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return Math.min(d, TAU - d);
}

/** Front angles this wave, primary first, kept apart so two fronts never read as one. */
export function pickFronts(wave: number, rng: Prng): number[] {
  const fronts = [rng.float() * TAU];
  while (fronts.length < frontCount(wave)) {
    const a = rng.float() * TAU;
    if (fronts.every((f) => angleGap(f, a) >= WAVES.frontGap)) fronts.push(a);
  }
  return fronts;
}

function pickKind(wave: number, rng: Prng): EnemyKind {
  const roll = rng.float();
  if (wave >= WAVES.crowFrom && roll < 0.15) return 'crow';
  if (wave >= WAVES.beetleFrom && roll < 0.4) return 'beetle';
  return 'caterpillar';
}

function pickAngle(wave: number, fronts: number[], rng: Prng): number {
  if (wave >= WAVES.scatterFrom && rng.float() < WAVES.scatterShare) return rng.float() * TAU;
  const front = fronts.length === 1 || rng.float() < WAVES.primaryShare ? fronts[0] : fronts[1 + rng.int(fronts.length - 1)];
  return front + (rng.float() * 2 - 1) * WAVES.frontSpread;
}

/** The spawn list for a wave, times relative to the wave start. */
export function planWave(wave: number, rng: Prng): Spawn[] {
  const fronts = pickFronts(wave, rng);
  const boss = isBossWave(wave);
  const count = boss ? Math.ceil(waveCount(wave) / 2) : waveCount(wave);
  const gap = spawnGap(wave);
  const out: Spawn[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    out.push({ at: t, kind: pickKind(wave, rng), angle: pickAngle(wave, fronts, rng) });
    t += gap * (0.6 + rng.float() * 0.8);
  }
  if (boss) out.push({ at: t + 1, kind: 'boss', angle: fronts[0] });
  return out;
}
