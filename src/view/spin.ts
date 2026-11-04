/** Seconds the tank's hull takes to swing round on a reversal (placeTrain). */
export const SPIN = 0.35;

/**
 * What is left of a swing of `from` radians `s` seconds in: fast at first, a slight overshoot,
 * settled at SPIN. Kept short: players reverse all the time, and the run already drives the new way.
 */
export function spinOff(from: number, s: number): number {
  if (s < 0 || s >= SPIN) return 0;
  const u = s / SPIN - 1; // ease-out-back: 1 - e(x) with x = u + 1
  return -from * u * u * (2.2 * u + 1.2);
}
