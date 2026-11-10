import { describe, expect, it } from 'vitest';
import { World } from './world';
import { WAGONS } from './config';
import { WAGON_KINDS } from './wagons';
import { botAct } from './bot';
import { LEVELS } from './levels';
import { trackPoint } from './board';

function wagonWorld(seed = 3): World {
  const w = new World({ seed, wagons: true, level: LEVELS[0] });
  return w;
}

const isWagon = (k: string) => (WAGON_KINDS as string[]).includes(k);

describe('wagons (§10.1)', () => {
  it('stay off unless asked for', () => {
    expect(new World({ seed: 1 }).wg).toBeNull();
  });

  it('a full charge waits for the first minute, then opens a pick of three new attack wagons', () => {
    const w = wagonWorld();
    const wg = w.wg!;
    wg.charge = wg.need();
    w.time = WAGONS.firstAt - 1;
    wg.due(w);
    expect(wg.offer).toBeNull();
    w.time = WAGONS.firstAt;
    wg.due(w);
    expect(wg.offer?.n).toBe(1);
    expect(wg.offer!.opts.map((o) => o.kind).sort()).toEqual(['arc', 'frost', 'missile']);
    expect(w.events.some((e) => e.t === 'offer')).toBe(true);
  });

  it('the fight stands still while the cards are up, and no command goes through', () => {
    const w = wagonWorld();
    w.time = WAGONS.firstAt;
    w.wg!.open(w);
    const t = w.time;
    const a = w.train.angle;
    w.gold = 1e6;
    expect(w.reverse()).toBe(false);
    expect(w.buy('dmg')).toBe(false);
    for (let i = 0; i < 30; i++) w.step();
    expect(w.time).toBe(t);
    expect(w.train.angle).toBe(a);
  });

  it('nobody waits forever: the first card is taken after autoPick seconds', () => {
    const w = wagonWorld();
    w.time = WAGONS.firstAt;
    w.wg!.open(w);
    const first = w.wg!.offer!.opts[0];
    for (let i = 0; i < WAGONS.autoPick * 30 + 2; i++) w.step();
    expect(w.wg!.offer).toBeNull();
    expect(w.wg!.list[0].kind).toBe(first.kind);
    const pick = w.events.find((e) => e.t === 'pick');
    expect(pick && pick.t === 'pick' && pick.auto).toBe(true);
  });

  it('later picks offer something new and an upgrade, levels stop at maxLv and wagons at max', () => {
    const w = wagonWorld(11);
    for (let n = 0; n < 30; n++) {
      w.wg!.open(w);
      const o = w.wg!.offer!;
      const have = w.wg!.list.length;
      if (n > 0 && have < WAGONS.max) expect(o.opts.some((x) => isWagon(x.kind) && x.lv === 1)).toBe(true);
      if (n > 0 && w.wg!.list.some((g) => g.lv < WAGONS.maxLv)) expect(o.opts.some((x) => x.lv > 1)).toBe(true);
      for (const x of o.opts) if (isWagon(x.kind)) expect(x.lv).toBeLessThanOrEqual(WAGONS.maxLv);
      expect(w.pickWagon(n % o.opts.length)).toBe(true);
      expect(w.wg!.list.length).toBeLessThanOrEqual(WAGONS.max);
    }
  });

  it('a full charge after a pick (say, after a basket) waits apart seconds of fight, never two picks back to back', () => {
    const w = wagonWorld();
    const wg = w.wg!;
    w.time = WAGONS.firstAt + 5;
    wg.open(w); // the basket
    wg.charge = wg.need() * 1.5;
    w.pickWagon(0);
    expect(wg.offer).toBeNull();
    w.queue = [];
    for (let i = 0; i < (WAGONS.apart - 1) * 30; i++) w.step();
    expect(wg.offer).toBeNull();
    for (let i = 0; i < 2 * 30; i++) w.step();
    expect(wg.offer?.n).toBe(2);
  });

  it('the supply cards pay out', () => {
    const w = wagonWorld();
    w.wg!.offer = { opts: [{ kind: 'repair', lv: 0 }, { kind: 'gold', lv: 0 }, { kind: 'skill', lv: 0 }], t: 10, n: 1 };
    w.wallHp = 1;
    w.pickWagon(0);
    expect(w.wallHp).toBe(w.wallMax);
    w.wg!.offer = { opts: [{ kind: 'gold', lv: 0 }], t: 10, n: 2 };
    const g = w.gold;
    const price = w.statCost('dmg');
    w.pickWagon(0);
    expect(w.gold).toBeCloseTo(g + WAGONS.supplyGold * price);
  });

  it('a bot plays level 1 through with picks along the way', () => {
    const w = wagonWorld(5);
    let guard = 0;
    while (!w.over && guard++ < 30 * 60 * 10) {
      botAct(w);
      w.step();
    }
    expect(w.wg!.picks).toBeGreaterThanOrEqual(4);
    expect(w.wg!.list.length).toBeGreaterThanOrEqual(2);
  });

  it('every wagon at every level does its work in a real fight', () => {
    const seen: Record<string, number> = {};
    for (const kind of WAGON_KINDS)
      for (let lv = 1; lv <= WAGONS.maxLv; lv++) {
        const w = wagonWorld(20 + lv);
        w.wg!.list.push({ kind, lv, t: 0 }, { kind: 'mine', lv: 3, t: 0 });
        w.wg!.charge = -1e9; // no picks: the test owns the wagons
        const hp0 = w.wallHp;
        for (let i = 0; i < 30 * 120 && !w.over; i++) {
          botAct(w);
          w.step();
          for (const e of w.events) seen[e.t] = (seen[e.t] ?? 0) + 1;
          w.events.length = 0;
        }
        expect(w.wallHp).toBeGreaterThan(0);
        expect(hp0).toBeGreaterThan(0);
        if (kind === 'magnet') expect(w.wg!.goldMul()).toBeCloseTo(1 + WAGONS.magnet.gold[w.wg!.lv('magnet') - 1]);
      }
    for (const t of ['zap', 'burn', 'frost', 'boom']) expect(seen[t] ?? 0).toBeGreaterThan(0);
  });

  it('the magnet pulls only what passes near it', () => {
    const w = wagonWorld();
    expect(w.wg!.pulls(w, 0)).toBe(false);
    w.wg!.list.push({ kind: 'magnet', lv: 1, t: 0 });
    const at = w.wg!.angle(w, 0);
    expect(w.wg!.pulls(w, at)).toBe(true);
    expect(w.wg!.pulls(w, at + Math.PI)).toBe(false);
  });

  it('a missile flies at the farthest bug within its reach, never across the board', () => {
    const w = wagonWorld();
    w.queue = [];
    w.wg!.list.push({ kind: 'missile', lv: 1, t: 0 });
    w.wg!.charge = -1e9;
    const at = trackPoint(w.wg!.angle(w, 0));
    const len = Math.hypot(at.x, at.z);
    const ux = at.x / len, uz = at.z / len;
    const near = w.addEnemy('beetle', ux * 5, uz * 5, -ux, -uz, 2, 500);
    const mid = w.addEnemy('beetle', ux * (len + WAGONS.missile.reach - 0.5), uz * (len + WAGONS.missile.reach - 0.5), -ux, -uz, 5, 500);
    w.addEnemy('beetle', -ux * 9, -uz * 9, ux, uz, 6, 500); // the far side of the board
    w.step();
    const m = w.projectiles.filter((p) => p.kind === 'missile');
    expect(m.map((p) => p.targetId)).toEqual([mid.id]);
    expect(near.id).not.toBe(mid.id);
  });

  it('plasma burns a bug at the fence beside it, and Lv3 sets it alight', () => {
    const w = wagonWorld();
    w.queue = [];
    w.wg!.list.push({ kind: 'plasma', lv: 3, t: 0 });
    w.wg!.charge = -1e9;
    const at = trackPoint(w.wg!.angle(w, 0));
    const len = Math.hypot(at.x, at.z);
    const e = w.addEnemy('beetle', (at.x / len) * 4.1, (at.z / len) * 4.1, -at.x / len, -at.z / len, 0, 500);
    w.step();
    expect(e.hp).toBeLessThan(500);
    expect(e.burnT).toBeGreaterThan(0);
    w.wg!.charge = w.wg!.need() * 2;
    expect(w.wg!.fill()).toBe(1);
  });
  it('a basket in the first minute, or under another pick, owes its pick and deals it when the rules allow', () => {
    const w = wagonWorld();
    const wg = w.wg!;
    w.time = WAGONS.firstAt - 10;
    wg.owe(w);
    expect(wg.offer).toBeNull();
    w.time = WAGONS.firstAt;
    wg.step(w);
    expect(wg.offer?.n).toBe(1);
    wg.owe(w); // a basket grabbed in the same tick as a charge-earned pick
    expect(wg.owed).toBe(1);
    w.pickWagon(0);
    w.queue = [];
    w.time += WAGONS.apart;
    wg.step(w);
    expect(wg.offer?.n).toBe(2);
    expect(wg.owed).toBe(0);
  });

  it('an arc Lv3 stun lasts its own time, even in frost', () => {
    const w = wagonWorld();
    w.queue = [];
    const at = trackPoint(w.wg!.angle(w, 0));
    const len = Math.hypot(at.x, at.z);
    const e = w.addEnemy('beetle', (at.x / len) * WAGONS.frost.out, (at.z / len) * WAGONS.frost.out, -at.x / len, -at.z / len, 1, 1e6);
    w.wg!.list.push({ kind: 'frost', lv: 1, t: 0 }, { kind: 'arc', lv: 3, t: 0 });
    w.wg!.charge = -1e9;
    w.step();
    expect(e.stunT).toBeGreaterThan(0);
    w.wg!.list.pop(); // the arc goes; the frost stays
    for (let i = 0; i < 30 * (WAGONS.arc.stun + 0.2); i++) w.step();
    expect(e.stunT).toBeLessThanOrEqual(0);
    expect(e.slowMul).toBeCloseTo(1 - WAGONS.frost.slow[0]);
    const d = e.d;
    w.step();
    expect(e.d).toBeLessThan(d);
  });

  it('a Lv3 mine that hits goes off; only one that misses lies waiting', () => {
    const w = wagonWorld();
    w.queue = [];
    const e = w.addEnemy('beetle', 0, 6, 0, -1, 2, 1e6);
    const shot = (x: number, z: number) =>
      w.projectiles.push({ id: w.nextId++, kind: 'mine', x, y: 1, z, px: x, py: 1, pz: z, targetId: -1, tx: x, tz: z, damage: 1, crit: false, poison: 0, splash: { r: 1, mul: 1 }, linger: 3 });
    shot(e.x, e.z);
    w.step();
    expect(w.wg!.mines.length).toBe(0);
    shot(-6, 0);
    w.step();
    expect(w.wg!.mines.length).toBe(1);
  });

  it('the leave event still says a card is in reach while a pick is up', () => {
    const w = wagonWorld();
    w.gold = 1e6;
    w.time = WAGONS.firstAt;
    w.wg!.open(w);
    expect(w.canBuy('dmg')).toBe(false);
    expect(w.scene().card).toBe(1);
  });
});
