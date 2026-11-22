import { describe, expect, it } from 'vitest';
import { World } from './world';
import { DT, STAT_KEYS, TIDES } from './config';
import { botAct } from './bot';
import { LEVELS } from './levels';

/** An endless world (no level), wagons on, as a run past wave twenty-odd is. */
function tideWorld(seed = 4): World {
  return new World({ seed, wagons: true });
}

/**
 * Ask for a tide on `wave`. The wave is set and `Tides.step` called by hand: `World.step` turns the
 * wave before it steps the tides, so a faked wave would be gone by the time the tide looked at it.
 */
function ask(w: World, wave: number): void {
  w.wave = wave;
  w.tides!.step(w);
}

describe('tides (§9.4)', () => {
  it('belong to endless: a chapter level never deals one', () => {
    expect(new World({ seed: 1, level: LEVELS[0] }).tides).toBeNull();
  });

  it('deals three bargains on its wave, and not before TIDES.from', () => {
    const early = tideWorld();
    ask(early, TIDES.from - TIDES.every);
    expect(early.tides!.offer).toBeNull();

    const w = tideWorld();
    ask(w, TIDES.from);
    const o = w.tides!.offer;
    expect(o?.n).toBe(1);
    expect(o!.opts.length).toBe(TIDES.cards);
    // A card is a bargain with two halves, and no two on the strip read the same.
    expect(new Set(o!.opts.map((c) => c.press)).size).toBe(TIDES.cards);
    expect(w.events.some((e) => e.t === 'tideoffer')).toBe(true);
  });

  it('only on its own waves, and at most one a wave', () => {
    const w = tideWorld();
    ask(w, TIDES.from);
    w.pickTide(0);
    ask(w, TIDES.from);
    expect(w.tides!.offer).toBeNull();
    ask(w, TIDES.from + TIDES.every - 1);
    expect(w.tides!.offer).toBeNull();
    ask(w, TIDES.from + TIDES.every);
    expect(w.tides!.offer?.n).toBe(2);
  });

  it('a pick gives the bugs something for the rest of the run and pays now', () => {
    const w = tideWorld();
    const before = { ...w.mods };
    const gold = w.gold, fence = w.wallHp, levels = STAT_KEYS.reduce((a, k) => a + w.lv[k], 0);
    ask(w, TIDES.from);
    const opt = w.tides!.offer!.opts[0];
    expect(w.pickTide(0)).toBe(true);
    expect(w.tides!.offer).toBeNull();
    expect(w.tides!.taken).toEqual([opt]);
    expect(w.tides!.count(opt.press)).toBe(1);
    // The press is a multiplier the spawner reads later, so exactly one of the four mods moved.
    const m = w.mods, b = before;
    expect([m.enemySpeed !== b.enemySpeed, m.enemyHp !== b.enemyHp, m.bite !== b.bite, m.count !== b.count].filter(Boolean).length).toBe(1);
    // And the player was paid now: gold, a wagon pick, a mended fence or free levels.
    const paid = w.gold > gold || !!w.wg!.offer || w.wg!.owed > 0 || w.wallHp > fence
      || STAT_KEYS.reduce((a, k) => a + w.lv[k], 0) > levels;
    expect(paid).toBe(true);
  });

  it('the clock takes the first card', () => {
    const w = tideWorld();
    ask(w, TIDES.from);
    const first = w.tides!.offer!.opts[0];
    for (let i = 0; i < (TIDES.autoPick + 1) / DT && w.tides!.offer; i++) w.step();
    expect(w.tides!.taken).toEqual([first]);
    expect(w.events.some((e) => e.t === 'tidepick' && e.auto)).toBe(true);
  });

  it('waits while a wagon pick is up: the two share the strip', () => {
    const w = tideWorld();
    const wg = w.wg!;
    wg.charge = wg.need();
    w.time = 999;
    wg.due(w);
    expect(wg.offer).not.toBeNull();
    ask(w, TIDES.from);
    expect(w.tides!.offer).toBeNull();
    w.pickWagon(0);
    ask(w, TIDES.from);
    expect(w.tides!.offer?.n).toBe(1);
  });

  it('a dead run takes no more bargains', () => {
    const w = tideWorld();
    w.wallHp = 0;
    ask(w, TIDES.from);
    expect(w.tides!.offer).toBeNull();
  });

  it('a real endless run meets its first tide', () => {
    const w = new World({ seed: 2, wagons: true });
    // The fence is propped up because the fight is not what this test is about. On a bare save with a
    // bot at the controls the run no longer lives to wave 25: 钻地虫 arrive at wave 20 (§9.5) and
    // cross the kill ring whatever the train does, so the fence is gone by 21. The point here is that
    // a run which reaches TIDES.from is dealt its tide, in a world built the way a real run builds it.
    w.wallMax *= 20;
    w.wallHp = w.wallMax;
    let offers = 0;
    for (let i = 0; i < 40 * 60 * 30 && !w.over && w.wave <= TIDES.from + 1; i++) {
      botAct(w);
      w.step();
      offers += w.events.filter((e) => e.t === 'tideoffer').length;
      w.events.length = 0;
    }
    // The wave the run stops on is not the point: the point is that the tide was dealt the moment
    // the run reached that wave.
    expect(w.wave).toBeGreaterThanOrEqual(TIDES.from);
    expect(offers).toBeGreaterThan(0);
  });
});
