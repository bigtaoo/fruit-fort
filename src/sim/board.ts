// Fort geometry: the 3x3 cells, which ones touch, and where things stand in the world.

import { CELL, LANE_HALF, SPAWN_DIST, WALL } from './config';
import type { Side } from './types';

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

/** Spawn point for a side and a lane offset in [-1, 1]. */
export function spawnPoint(side: Side, lane: number): { x: number; z: number } {
  const off = lane * LANE_HALF;
  const d = SPAWN_DIST[side];
  switch (side) {
    case 0: return { x: off, z: -d };
    case 1: return { x: d, z: off };
    case 2: return { x: off, z: d };
    default: return { x: -d, z: off };
  }
}

/** Unit vector an enemy on this side walks along. */
export function inward(side: Side): { x: number; z: number } {
  switch (side) {
    case 0: return { x: 0, z: 1 };
    case 1: return { x: -1, z: 0 };
    case 2: return { x: 0, z: -1 };
    default: return { x: 1, z: 0 };
  }
}

export function wallDistance(side: Side): number {
  return SPAWN_DIST[side] - WALL;
}
