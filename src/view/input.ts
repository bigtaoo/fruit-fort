// Pointer input: a tap anywhere on the field turns the train round; space does the same on a
// keyboard. With the hero charged, a tap on the tank itself casts the skill instead (the guide's line
// says "tap the hero", and players tapped the tank, which only turned it round). The buttons (stats,
// hero skill) are DOM and handle their own clicks.

import type { World } from '../sim/world';

export interface InputHost {
  world(): World;
  onReverse(): void;
  /** A tap at page point (x, y) while the hero is charged: cast if it is on the tank; true if it cast. */
  onTankTap?(x: number, y: number): boolean;
}

export class Input {
  constructor(canvas: HTMLCanvasElement, private host: InputHost) {
    canvas.addEventListener('pointerdown', (e) => this.tap(e.clientX, e.clientY));
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      this.tap(null, null);
    });
  }

  private tap(x: number | null, y: number | null): void {
    const w = this.host.world();
    if (w.over) return;
    if (x !== null && y !== null && w.heroReady() && this.host.onTankTap?.(x, y)) return;
    this.host.onReverse();
  }
}
