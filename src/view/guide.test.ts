import { beforeAll, describe, expect, it } from 'vitest';
import { World } from '../sim/world';
import { HERO } from '../sim/config';
import { newSave, worldOptions, type Save } from '../meta/progress';
import { bugBehind, guideSteps, type GuideHost, type GuideScreen, type Step } from './guide';
import type { VillageTab } from './village';
import type { Funnel } from '../platform/funnel';

// The step table is plain logic over the world and the save; only the village aims look up the page,
// so a stub document stands in (the hand and its placing are checked in the browser, §12.8).
beforeAll(() => {
  (globalThis as { document?: unknown }).document = { querySelector: () => null };
});

interface Rig {
  host: GuideHost;
  w: World;
  s: Save;
  tab: VillageTab;
  table: Step[];
  step(id: string): Step;
}

function rig(runs = 0, level: number | null = 0): Rig {
  const s = newSave('2026-11-03');
  s.runs = runs;
  const r = { w: new World({ seed: 3, ...worldOptions(s, level ?? 'endless') }), s, tab: 'train' } as Rig;
  r.host = {
    world: () => r.w,
    save: () => r.s,
    screen: () => 'battle' as GuideScreen,
    villageTab: () => r.tab,
    hudButton: () => null,
    toScreen: () => ({ x: 0, y: 0 }),
    board: () => ({ x: 0, y: 0, w: 375, h: 812 }) as never,
    setText: () => {},
    persist: () => {},
    funnel: {} as Funnel,
  };
  r.table = guideSteps(r.host);
  r.step = (id) => r.table.find((x) => x.id === id)!;
  return r;
}

const live = (r: Rig, screen: GuideScreen) => r.table.filter((x) => x.screen === screen && x.when()).map((x) => x.id);
const button = (a: string, v?: string) => ({ dataset: { a, v } }) as unknown as HTMLElement;

describe('guide steps', () => {
  it('has one row per id, and only level 1 holds the bugs', () => {
    const r = rig();
    expect(new Set(r.table.map((x) => x.id)).size).toBe(r.table.length);
    expect(r.table.filter((x) => x.hold).map((x) => x.id)).toEqual(['buy', 'reverse']);
    expect(r.table.filter((x) => x.idle).every((x) => !x.hold && !x.text)).toBe(true);
  });

  it('level 1 starts on buying damage, then turning round once a bug is behind', () => {
    const r = rig();
    r.w.gold = 1e6;
    expect(r.step('buy').when()).toBe(true);
    expect(r.step('reverse').when()).toBe(false);
    r.s.guide.push('buy');
    const behind = r.w.train.angle + Math.PI * 1.5 * r.w.train.dir;
    r.w.addEnemy('caterpillar', Math.cos(behind) * 9, Math.sin(behind) * 9, 0, 0, 3, 100);
    expect(bugBehind(r.w)).toBe(true);
    expect(r.step('reverse').when()).toBe(true);
    expect(r.step('reverse').aim()).toBe('tap');
    // It stays the step for the run while the tank drives on.
    r.w.train.angle += Math.PI;
    expect(bugBehind(r.w)).toBe(false);
    expect(r.step('reverse').when()).toBe(true);
  });

  it('the skill, idle and level-2 hints wait for their run and their moment', () => {
    const r = rig();
    expect(r.step('cast').when()).toBe(false);
    r.w.hero.charge = HERO.chargeMax;
    expect(r.step('cast').when()).toBe(true);
    expect(r.step('idle_cast').when()).toBe(false);
    r.s.guide.push('cast');
    expect(r.step('idle_cast').when()).toBe(true);
    expect(r.step('idle_cast').aim()).toEqual({ el: null, last: true });
    r.w.gold = 1e6;
    expect(r.step('idle_buy1').when()).toBe(false);
    r.s.guide.push('buy');
    expect(r.step('idle_buy1').when()).toBe(true);
    expect(r.step('idle_buy').when()).toBe(false);
    expect(r.step('multi').when()).toBe(false);
    // Level 3 still gets the short, unlimited hints; level 4 and endless the long one.
    const three = rig(2, 2);
    three.w.gold = 1e6;
    three.s.guide.push('buy', 'cast');
    three.w.hero.charge = HERO.chargeMax;
    expect(three.step('idle_buy1').when()).toBe(true);
    expect(three.step('idle_cast').when()).toBe(true);
    expect(three.step('idle_buy').when()).toBe(false);
    expect(three.step('multi').when()).toBe(three.w.canBuy('multi'));
    for (const lv of [3, null]) {
      const four = rig(3, lv);
      four.w.gold = 1e6;
      four.s.guide.push('buy', 'cast');
      four.w.hero.charge = HERO.chargeMax;
      expect(four.step('idle_buy').when()).toBe(true);
      expect(four.step('idle_buy1').when()).toBe(false);
      expect(four.step('idle_cast').when()).toBe(false);
    }
  });

  it('a buy hint points at a stat that fights before a cheaper one that does not', () => {
    const r = rig();
    const asked: string[] = [];
    r.host.hudButton = (name) => (asked.push(name), null);
    r.s.guide.push('buy');
    r.w.lv.dmg = 10;
    r.w.gold = 25;
    r.step('idle_buy1').aim();
    expect(asked.pop()).toBe('stat:spd');
    // Nothing that fights in reach: the cheapest card still gets the hand.
    r.w.gold = 22;
    r.step('idle_buy1').aim();
    expect(asked.pop()).toBe('stat:move');
  });

  it('a basket or a gold bug points at itself; the speed button waits for a calm start in run 3', () => {
    const r = rig(1, 1);
    expect(r.step('basket').aim()).toBeNull();
    r.w.happening = { id: 1, kind: 'basket', x: 2, z: -3, t: 5, angle: 0 } as never;
    expect([r.step('basket').when(), r.step('goldbug').when()]).toEqual([true, false]);
    expect(r.step('basket').aim()).toEqual({ x: 2, z: -3 });
    r.w.happening = { id: 2, kind: 'bug', x: 0, z: 4, t: 5, angle: 0 } as never;
    expect([r.step('basket').when(), r.step('goldbug').when()]).toEqual([false, true]);
    const three = rig(2, 2);
    three.w.time = 5;
    three.w.enemies.length = 0;
    expect(three.step('speed').when()).toBe(true);
    three.w.addEnemy('caterpillar', 9, 0, 0, 0, 3, 100);
    expect(three.step('speed').when()).toBe(false);
    three.w.time = 30;
    three.w.enemies.length = 0;
    expect(three.step('speed').when()).toBe(false);
  });

  it('the result card points a win to the village and a loss to training', () => {
    const r = rig();
    expect(live(r, 'result')).toEqual(['lose']);
    r.w.won = true;
    expect(live(r, 'result')).toEqual(['win']);
    expect(live(rig(0, null), 'result')).toEqual([]);
  });

  it('visit 1 trains, claims the daily gift, then plays; the tab comes before the item', () => {
    const r = rig(1);
    r.s.crystals = 1e6;
    expect(live(r, 'village').slice(0, 3)).toEqual(['v_train', 'v_daily', 'play1']);
    r.tab = 'rewards';
    expect(r.step('v_train').aim()).toEqual({ el: null, last: false });
    r.tab = 'train';
    expect(r.step('v_train').aim()).toEqual({ el: null, last: true });
    expect(r.step('v_train').learns!(button('buyTrain', 'spd'))).toBe(true);
    expect(r.step('v_wall').learns!(button('buyVillage', 'gold'))).toBe(false);
    expect(r.step('play1').learns!(button('sel', '1'))).toBe(true);
    expect(r.step('play1').learns!(button('play', 'challenge'))).toBe(false);
    expect(live(rig(0), 'village')).toEqual([]);
  });

  it('visit 2 and the later features open with the save', () => {
    const r = rig(2);
    r.s.crystals = 1e6;
    const v = live(r, 'village');
    for (const id of ['v_hero', 'v_wall', 'v_route', 'play2', 'l_hero', 'l_piggy']) expect(v).toContain(id);
    expect(v).not.toContain('l_endless');
    expect(r.step('l_hero').learns!(button('buyHero', 'chef'))).toBe(true);
    expect(r.step('l_hero').learns!(button('buyHero', 'farmer'))).toBe(false);
    for (const x of r.table.filter((y) => y.screen === 'village')) expect(x.aim()).not.toBeUndefined();
    // From the fourth visit, a nudge to play once nothing is left to claim.
    const late = rig(3);
    expect(late.step('idle_play').when()).toBe(false);
    late.s.daily.claimed = true;
    expect(late.step('idle_play').when()).toBe(true);
  });
});

describe('bugBehind', () => {
  it('is false with no live bug, and judges the nearest one', () => {
    const w = new World({ seed: 3 });
    w.enemies.length = 0;
    expect(bugBehind(w)).toBe(false);
    const a = w.train.angle;
    const ahead = w.addEnemy('caterpillar', Math.cos(a + 0.5 * w.train.dir) * 9, Math.sin(a + 0.5 * w.train.dir) * 9, 0, 0, 2, 100);
    w.addEnemy('caterpillar', Math.cos(a - 0.5 * w.train.dir) * 9, Math.sin(a - 0.5 * w.train.dir) * 9, 0, 0, 4, 100);
    expect(bugBehind(w)).toBe(false);
    ahead.hp = 0;
    expect(bugBehind(w)).toBe(true);
    w.train.dir = -w.train.dir as 1 | -1;
    expect(bugBehind(w)).toBe(false);
  });
});
