// Pointer input: a tap anywhere on the field turns the train round; space does the same on a
// keyboard. The buttons (stats, hero skill) are DOM and handle their own clicks.

import type { World } from '../sim/world';

export interface InputHost {
  world(): World;
  onReverse(): void;
}

export class Input {
  constructor(canvas: HTMLCanvasElement, private host: InputHost) {
    canvas.addEventListener('pointerdown', () => this.tap());
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      this.tap();
    });
  }

  private tap(): void {
    if (this.host.world().over) return;
    this.host.onReverse();
  }
}
