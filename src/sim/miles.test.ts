import { describe, expect, it } from 'vitest';
import { World } from './world';
import { DT, MILES } from './config';
import { WAVES } from './wavedefs';
import { nextStep } from './miles';
import { botAct } from './bot';
import { LEVELS } from './levels';

/** An endless world (no level), wagons on, as a run past wave twenty is. */
function mileWorld(seed = 3): World {
  return new World({ seed, wagons: true });
}

/**
 * Ask for a milestone on `wave`. The wave is set and `Miles.step` called by hand, as in tides.test:
 * `World.step` turns the wave before it steps the milestones, so a faked wave would be gone again.
 */
function ask(w: World, wave: number): void {
  w.wave = wave;
  w.miles!.step(w);
}

describe('milestones (§9.6)', () => {
  it('belong to endless: a chapter level never deals one', () => {
    expect(new World({ seed: 1, level: LEVELS[0] }).miles).toBeNull();
  });

  it('deals the card on its wave, and not before MILES.from', () => {
    const early = mileWorld();
    ask(early, MILES.from - MILES.every);
    expect(early.miles!.offer).toBeNull();

    const w = mileWorld();
    ask(w, MILES.from);
    expect(w.miles!.offer?.n).toBe(1);
    expect(w.events.some((e) => e.t === 'mile')).toBe(true);
  });

  it('only on its own waves, and at most one a wave', () => {
    const w = mileWorld();
    ask(w, MILES.from);
    expect(w.mileGo()).toBe(true);
    ask(w, MILES.from);
    expect(w.miles!.offer).toBeNull();
    ask(w, MILES.from + MILES.every - 1);
    expect(w.miles!.offer).toBeNull();
    ask(w, MILES.from + MILES.every);
    expect(w.miles!.offer?.n).toBe(2);
  });

  it('waits while a wagon pick is up: the three share the strip', () => {
    const w = mileWorld();
    const wg = w.wg!;
    wg.charge = wg.need();
    w.time = 999;
    wg.due(w);
    expect(wg.offer).not.toBeNull();
    ask(w, MILES.from);
    expect(w.miles!.offer).toBeNull();
    w.pickWagon(0);
    ask(w, MILES.from);
    expect(w.miles!.offer?.n).toBe(1);
  });

  it('the clock takes "go on", never the way out', () => {
    const w = mileWorld();
    // The fight is not what this test is about, so the fence is propped (as in tides.test).
    w.wallMax *= 20;
    w.wallHp = w.wallMax;
    ask(w, MILES.from);
    for (let i = 0; i < (MILES.auto + 1) / DT && w.miles!.offer; i++) w.step();
    expect(w.miles!.offer).toBeNull();
    expect(w.miles!.passed).toBe(1);
    // The one thing the clock must never do: end someone's run for them.
    expect(w.miles!.banked).toBe(false);
    expect(w.over).toBe(false);
  });

  it('the way out ends the run where it stands, and does not read as a death', () => {
    const w = mileWorld();
    ask(w, MILES.from);
    w.events.length = 0;
    expect(w.mileStop()).toBe(true);
    expect(w.miles!.banked).toBe(true);
    expect(w.over).toBe(true);
    expect(w.wave).toBe(MILES.from);
    // `bank` is what the telemetry reads; `win` is what the board plays - a ring and the fanfare,
    // no fireworks (those check World.won) and none of the engine's death slump.
    expect(w.events.map((e) => e.t)).toEqual(['bank', 'win']);
    expect(w.events.some((e) => e.t === 'over')).toBe(false);
    // And it is not offered twice: the run is over.
    expect(w.mileStop()).toBe(false);
    expect(w.mileGo()).toBe(false);
  });

  it('a run walked out of is not offered a revive', () => {
    const w = mileWorld();
    ask(w, MILES.from);
    w.mileStop();
    expect(w.revive()).toBe(false);
  });

  it('a dead run is asked nothing', () => {
    const w = mileWorld();
    w.wallHp = 0;
    ask(w, MILES.from);
    expect(w.miles!.offer).toBeNull();
  });

  it('the "go on" card names what the next ten waves bring, off the WAVES gates', () => {
    expect(nextStep(WAVES.diggerFrom - MILES.every + 1)).toBe('digger');
    expect(nextStep(MILES.from)).toBe('bomber');
    expect(nextStep(WAVES.digger.deepFrom - MILES.every + 1)).toBe('deep');
    expect(nextStep(WAVES.bossBands[1].from - MILES.every + 1)).toBe('bosses');
    // Most of a long run has nothing in particular due, and the card says so rather than inventing one.
    expect(nextStep(WAVES.bossBands[1].from + 1)).toBe('on');
  });

  it('a real endless run meets its first milestone', () => {
    const w = mileWorld(2);
    // Propped for the same reason tides.test props it: 钻地虫 arrive at wave 20 (§9.5) and a bot on a
    // bare save does not live to 21. What is being tested is that a run reaching MILES.from is dealt
    // its card, in a world built the way a real run builds it.
    w.wallMax *= 20;
    w.wallHp = w.wallMax;
    let cards = 0;
    for (let i = 0; i < 40 * 60 * 30 && !w.over && w.wave <= MILES.from; i++) {
      botAct(w);
      w.step();
      cards += w.events.filter((e) => e.t === 'mile').length;
      w.events.length = 0;
    }
    expect(w.wave).toBeGreaterThanOrEqual(MILES.from);
    expect(cards).toBeGreaterThan(0);
  });
});
