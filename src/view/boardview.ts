// The board's own motion each frame: the tank and its cars, the fence, the hero's pose, the ground,
// the ambience, the hold ring and the camera shake, and the engine's reaction to each sim event.
// Split from main.ts, which runs the loop and owns the sound and the telemetry.

import { WALL } from '../sim/config';
import type { World } from '../sim/world';
import type { SimEvent } from '../sim/types';
import { groundCalm, groundSurge } from './current';
import { animateStage, shakeCamera, type Stage } from './scene';
import { kickTrain } from './trainpose';
import { TankRig } from './rig';
import { showEvent } from './juice';
import { GUIDE_NEAR, holdRing } from './holdring';
import type { Ambience } from './ambience';
import type { Fx } from './fx';
import type { Hud } from './hud';

export class BoardView {
  readonly rig: TankRig;
  private clock = 0;

  constructor(
    private stage: Stage,
    private fx: Fx,
    private hud: Hud,
    private ambience: Ambience,
  ) {
    this.rig = new TankRig(stage, fx);
  }

  /** The engine reacts: a jolt per shot, a lurch on reversing, a hop for a buy or the skill. */
  event(ev: SimEvent, world: World): void {
    const { rig, stage, clock } = this;
    if (ev.t === 'fire' && ev.kind === 'hero') {
      rig.shot(ev.x, ev.z, ev.tx, ev.tz, clock);
    }
    if ((ev.t === 'fire' && ev.kind === 'hero') || ev.t === 'reverse' || ev.t === 'buy' || ev.t === 'cast' || ev.t === 'over' || ev.t === 'revive') kickTrain(stage, ev.t, clock);
    if (!rig.cars.event(ev)) showEvent(ev, stage, this.fx, this.hud, world);
  }

  /** Per-frame view state that is not an event: the train, fence damage, hero pose, skill effects. */
  update(world: World, dt: number, alpha: number, villageOpen: boolean, quality: number): void {
    const { rig, stage } = this;
    const clock = (this.clock += dt);
    rig.train(world, alpha, clock);
    // The reach ring tells a range change in a run; over the village it only crossed the route.
    if (villageOpen) stage.reach.visible = false;
    rig.fence(world);
    groundSurge(!villageOpen && !world.over && world.hero.buffT > 0);
    groundCalm(villageOpen);
    animateStage(stage, clock);
    this.ambience.update(dt, clock, world, quality);
    holdRing(stage, world.holdAt !== null && !world.over, WALL + GUIDE_NEAR, dt, clock);
    shakeCamera(stage, dt);
    rig.hero(world, clock, dt);
  }
}
