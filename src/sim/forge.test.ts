import { describe, expect, it } from 'vitest';
import { World } from './world';
import { DT, WAGONS } from './config';
import { WAGON_FORGES, WAGON_KINDS } from './wagons';
import { LEVELS } from './levels';
import { trackPoint } from './board';
import type { Enemy, ForgeKind, WagonKind } from './types';

/**
 * A level world with one maxed wagon, no spawns and no picks of its own: the test owns the train, so
 * what the reforge changes is the only thing that changes. The two worlds a test compares are built
 * the same way off the same seed, so a drifting bug drifts the same in both.
 */
function rig(kind: WagonKind, forges: ForgeKind[], seed = 11): World {
  const w = new World({ seed, wagons: true, level: LEVELS[0] });
  w.spawner.queue = [];
  w.enemies.length = 0;
  w.wg!.charge = -1e9;
  w.wg!.list.push({ kind, lv: WAGONS.maxLv, t: 0, forges: [...forges] });
  return w;
}

/** `n` bugs standing at the fence in front of the wagon, too tough to die during the test. */
function bugs(w: World, n: number): Enemy[] {
  const at = trackPoint(w.wg!.angle(w, 0));
  const len = Math.hypot(at.x, at.z) || 1;
  const ux = at.x / len, uz = at.z / len;
  return Array.from({ length: n }, (_, i) =>
    // Armourless, so a hit's damage is the dose itself: armour is subtracted after the multiplier
    // and would read as more than the reforge gives.
    w.addEnemy('caterpillar', ux * 4.1 + i * 0.12, uz * 4.1, -ux, -uz, 0, 1e7));
}

/**
 * Seconds of fight, counting the events of one kind. The engine's own gun is held shut throughout
 * (`shotT`), so the only thing hitting a bug is the wagon under test.
 */
function run(w: World, secs: number, t: string): number {
  let n = 0;
  for (let i = 0; i < secs / DT; i++) {
    w.train.shotT = 1e9;
    w.step();
    n += w.events.filter((e) => e.t === t).length;
    w.events.length = 0;
  }
  return n;
}

const hurt = (es: Enemy[]) => es.reduce((a, e) => a + (e.maxHp - e.hp), 0);

/** The pick on show, read through a call so that clearing it by hand does not narrow it away. */
const offer = (w: World) => w.wg!.offer;

/** Every reforge a pick would deal for this train, over enough picks to see them all. */
function dealt(w: World): Set<string> {
  const wg = w.wg!;
  const out = new Set<string>();
  wg.picks = 5;
  w.time = WAGONS.firstAt;
  for (let i = 0; i < 40; i++) {
    wg.offer = null;
    wg.open(w);
    for (const o of offer(w)?.opts ?? []) if (o.forge) out.add(`${o.kind}.${o.forge}`);
  }
  wg.offer = null;
  return out;
}

describe('wagon reforges (§10.1.16)', () => {
  it('a maxed wagon is offered its reforges, each one once, and keeps its level', () => {
    const w = rig('arc', []);
    const wg = w.wg!;
    const first = dealt(w);
    expect(first).toEqual(new Set(WAGON_FORGES.arc.map((f) => `arc.${f}`)));

    // Take one: the wagon stays at its level, carries the reforge, and is never offered it again.
    wg.picks = 5;
    w.time = WAGONS.firstAt;
    wg.open(w);
    const i = wg.offer!.opts.findIndex((o) => !!o.forge);
    const taken = wg.offer!.opts[i].forge!;
    expect(wg.pick(w, i)).toBe(true);
    expect(wg.list[0].lv).toBe(WAGONS.maxLv);
    expect(wg.list[0].forges).toEqual([taken]);
    expect([...dealt(w)]).not.toContain(`arc.${taken}`);
  });

  it('only the reforges a kind can show: no wider ice, no overdriven magnet', () => {
    for (const kind of WAGON_KINDS) {
      const w = rig(kind, []);
      expect(dealt(w)).toEqual(new Set(WAGON_FORGES[kind].map((f) => `${kind}.${f}`)));
    }
    expect(WAGON_FORGES.frost).not.toContain('spread');
    expect(WAGON_FORGES.magnet).not.toContain('overdrive');
  });

  it('overdrive: the wagon acts oftener over the same stretch of fight', () => {
    const plain = rig('arc', []), fast = rig('arc', ['overdrive']);
    bugs(plain, 2); bugs(fast, 2);
    const a = run(plain, 10, 'zap'), b = run(fast, 10, 'zap');
    expect(b / a).toBeCloseTo(WAGONS.forge.rate, 0);

    // Frost drops its ice on the same clock, so it is overdriven the same way.
    expect(run(rig('frost', ['overdrive']), 5, 'frost') / run(rig('frost', []), 5, 'frost'))
      .toBeCloseTo(WAGONS.forge.rate, 0);
  });

  it('power: the same attacks hit harder, and the magnet is paid more', () => {
    const plain = rig('arc', []), hard = rig('arc', ['power']);
    const pb = bugs(plain, 1), hb = bugs(hard, 1);
    run(plain, 10, 'zap'); run(hard, 10, 'zap');
    expect(hurt(pb)).toBeGreaterThan(0);
    expect(hurt(hb) / hurt(pb)).toBeCloseTo(WAGONS.forge.damage, 1);

    const m = rig('magnet', []), mp = rig('magnet', ['power']);
    expect(mp.wg!.goldMul(mp) - 1).toBeCloseTo((m.wg!.goldMul(m) - 1) * WAGONS.forge.damage, 5);
  });

  it('spread: an attack takes more bugs, and reaches further', () => {
    const plain = rig('arc', []), wide = rig('arc', ['spread']);
    bugs(plain, 8); bugs(wide, 8);
    const hit = (w: World) => {
      for (let i = 0; i < 10 / DT; i++) {
        w.step();
        const zap = w.events.find((e) => e.t === 'zap');
        if (zap && zap.t === 'zap') return zap.to.length;
        w.events.length = 0;
      }
      return 0;
    };
    expect(hit(plain)).toBe(WAGONS.arc.targets[WAGONS.maxLv - 1]);
    expect(hit(wide)).toBe(Math.ceil(WAGONS.arc.targets[WAGONS.maxLv - 1] * WAGONS.forge.wide));

    // The magnet's pull is a reach too: a basket this far round the track was out of it.
    const m = rig('magnet', []), mw = rig('magnet', ['spread']);
    const far = m.wg!.angle(m, 0) + 1.6;
    expect(m.wg!.pulls(m, far)).toBe(false);
    expect(mw.wg!.pulls(mw, far)).toBe(true);
  });

  it('a train with everything maxed still has cards to deal (which is what this layer is for)', () => {
    const w = new World({ seed: 5, wagons: true, level: LEVELS[0] });
    const wg = w.wg!;
    for (const kind of WAGON_KINDS.slice(0, WAGONS.max)) wg.list.push({ kind, lv: WAGONS.maxLv, t: 0 });
    wg.picks = 5;
    w.time = WAGONS.firstAt;
    w.hero.charge = 1e9;
    wg.open(w);
    // Before reforges this pick was gold alone, paid at once with no offer (wagons.test.ts).
    expect(wg.offer).not.toBeNull();
    expect(wg.offer!.opts.some((o) => !!o.forge)).toBe(true);
  });
});
