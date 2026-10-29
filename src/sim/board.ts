// Fort geometry: the train's ring track and where enemies come in from.

import { SPAWN_FAR, SPAWN_NEAR, TRAIN, WALL } from './config';

/** A point on the track at this angle. Angle 0 is east (+x), growing towards south (+z). */
export function trackPoint(angle: number): { x: number; z: number } {
  return { x: Math.cos(angle) * TRAIN.radius, z: Math.sin(angle) * TRAIN.radius };
}

/** How far apart two track angles are, either way round, in radians (0..π). */
export function arcGap(a: number, b: number): number {
  const d = (((a - b) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.min(d, Math.PI * 2 - d);
}

/**
 * Where an enemy approaching at this angle starts, and how far it walks before it reaches the
 * round fence. Angle 0 is east (+x), growing towards south (+z).
 */
export function approach(angle: number): { x: number; z: number; dirX: number; dirZ: number; d: number } {
  const cx = Math.cos(angle);
  const sz = Math.sin(angle);
  const r = SPAWN_NEAR + (SPAWN_FAR - SPAWN_NEAR) * cx * cx;
  return { x: cx * r, z: sz * r, dirX: -cx, dirZ: -sz, d: r - WALL };
}
