// Endless wave generation. Each wave draws a hidden primary side that most enemies come from;
// the rest spread over the other active sides. Nothing about this is shown on the map.

import { WAVES, spawnGap, waveCount } from './config';
import type { Prng } from './rng';
import type { EnemyKind, Side } from './types';

export interface Spawn {
  at: number;
  kind: EnemyKind;
  side: Side;
  /** Lane offset in [-1, 1]. */
  lane: number;
}

export function activeDirs(wave: number): number {
  for (const band of WAVES.dirBands) if (wave <= band.upTo) return band.dirs;
  return 4;
}

export function isBossWave(wave: number): boolean {
  return wave % WAVES.bossEvery === 0;
}

/** Sides in play this wave, primary first. */
export function pickSides(wave: number, rng: Prng, firstSide?: Side): Side[] {
  const all: Side[] = [0, 1, 2, 3];
  const primary = firstSide ?? (rng.int(4) as Side);
  const rest = all.filter((s) => s !== primary);
  // Shuffle the others so the second side is not always the clockwise one.
  for (let i = rest.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [primary, ...rest].slice(0, activeDirs(wave));
}

function pickKind(wave: number, rng: Prng): EnemyKind {
  const roll = rng.float();
  if (wave >= WAVES.crowFrom && roll < 0.15) return 'crow';
  if (wave >= WAVES.beetleFrom && roll < 0.4) return 'beetle';
  return 'caterpillar';
}

/** The spawn list for a wave, times relative to the wave start. */
export function planWave(wave: number, rng: Prng, firstSide?: Side): Spawn[] {
  const sides = pickSides(wave, rng, firstSide);
  const boss = isBossWave(wave);
  const count = boss ? Math.ceil(waveCount(wave) / 2) : waveCount(wave);
  const gap = spawnGap(wave);
  const out: Spawn[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const side = sides.length === 1 || rng.float() < WAVES.primaryShare ? sides[0] : sides[1 + rng.int(sides.length - 1)];
    out.push({ at: t, kind: pickKind(wave, rng), side, lane: rng.float() * 2 - 1 });
    t += gap * (0.6 + rng.float() * 0.8);
  }
  if (boss) out.push({ at: t + 1, kind: 'boss', side: sides[0], lane: 0 });
  return out;
}
