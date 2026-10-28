// Fort geometry: the 3x3 cells, which ones touch, and where things stand in the world.

import { CELL, SPAWN_FAR, SPAWN_NEAR, WALL } from './config';

export const HERO_CELL = 4;
export const EDGE_CELLS = [1, 5, 7, 3] as const; // N, E, S, W
export const CORNER_CELLS = [0, 2, 6, 8] as const;

export function cellX(cell: number): number {
  return ((cell % 3) - 1) * CELL;
}

export function cellZ(cell: number): number {
  return (Math.floor(cell / 3) - 1) * CELL;
}

export function isCorner(cell: number): boolean {
  return cell === 0 || cell === 2 || cell === 6 || cell === 8;
}

/** Orthogonal neighbours, the hero cell included. */
export function neighbours(cell: number): number[] {
  const r = Math.floor(cell / 3);
  const c = cell % 3;
  const out: number[] = [];
  if (r > 0) out.push(cell - 3);
  if (r < 2) out.push(cell + 3);
  if (c > 0) out.push(cell - 1);
  if (c < 2) out.push(cell + 1);
  return out;
}

/**
 * Where an enemy approaching at this angle starts, and how far it walks before it reaches the
 * square wall. Angle 0 is east (+x), growing towards south (+z).
 */
export function approach(angle: number): { x: number; z: number; dirX: number; dirZ: number; d: number } {
  const cx = Math.cos(angle);
  const sz = Math.sin(angle);
  const r = SPAWN_NEAR + (SPAWN_FAR - SPAWN_NEAR) * cx * cx;
  const atWall = WALL / Math.max(Math.abs(cx), Math.abs(sz));
  return { x: cx * r, z: sz * r, dirX: -cx, dirZ: -sz, d: r - atWall };
}
