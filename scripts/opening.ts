// Level 1's opening by player policy (none, follow the hand, buy every 20 s, greedy bot), 20 seeds: kills by
// 15/30/60 s, the crowd at the fence, and how long the level takes. Run: npx tsx scripts/opening.ts
// Try a tuning without editing levels.ts: HP=.. SW=.. PACE=.. TO=.. BITE=.. override LEVELS[0].
// Wagon picks (§10.1) are on as in the game (WG=0 turns them off); policies that never pick take the
// auto-pick. pick@s is when the first three picks came up (median run time, s).
import { World } from '../src/sim/world';
import { DT, STAT_KEYS } from '../src/sim/config';
import { botAct } from '../src/sim/bot';
import { LEVELS } from '../src/sim/levels';
import { newSave, worldOptions } from '../src/meta/progress';
import type { StatKey } from '../src/sim/types';
const L = LEVELS[0];
if (process.env.HP) L.hp = +process.env.HP;
if (process.env.SW) L.swarm = +process.env.SW;
if (process.env.PACE) L.pace = +process.env.PACE;
if (process.env.TO) L.paceTo = +process.env.TO;
if (process.env.BITE) L.bite = +process.env.BITE;
// The run's own cards only. Until 2026-11-12 this list was ['dmg','spd','crit','multi','range']: since
// 0.0.26 multi/range/move are training-only, `maxed()` is always true for them and `buy()` always fails,
// so the hand and slow policies bought almost nothing and every number they printed was wrong.
const cheapest = (w: World): StatKey | undefined => {
  const open = STAT_KEYS.filter((k) => !w.maxed(k));
  return open.length ? open.reduce((a, b) => (w.statCost(b) < w.statCost(a) ? b : a)) : undefined;
};
const buyOne = (w: World) => { const k = cheapest(w); return k ? w.buy(k) : false; };
type Pol = (w: World, t: number) => void;
const pols: Record<string, Pol> = {
  none: () => {},
  hand: (w, t) => { if (t % 30 === 0 && t * DT > 3) buyOne(w); }, // follows the hand, one buy a second
  slow: (w, t) => { if (t % (20 / DT) === 0 && t > 0) while (buyOne(w)) {} }, // buys every 20 s
  bot: (w, t) => { if (t % 15 === 0) botAct(w); },
};
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
console.log(`hp=${L.hp} swarm=${L.swarm} pace=${L.pace ?? 1} to=${L.paceTo} bite=${L.bite}`);
for (const [name, pol] of Object.entries(pols)) {
  const k15: number[] = [], k30: number[] = [], k60: number[] = [], w60: number[] = [], pile: number[] = [], picks: number[][] = [[], [], []], wall60: number[] = [], b60: number[] = [], end: number[] = [], wallEnd: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const w = new World({ ...worldOptions(newSave('2026-11-06'), 0), seed, wagons: process.env.WG !== '0' });
    let n = 0;
    let kills = 0, maxPile = 0;
    for (let t = 0; !w.over && t < 1800 / DT; t++) {
      pol(w, t);
      w.step();
      for (const e of w.events) if (e.t === 'kill') kills++;
        else if (e.t === 'offer' && n < 3) picks[n++].push(w.time);
      w.events.length = 0;
      if (w.wg?.offer) continue; // the fight stands still while the cards are up
      const s = w.time;
      if (s <= 60) maxPile = Math.max(maxPile, w.enemies.filter((e) => e.hp > 0 && e.d < 1).length);
      if (Math.abs(s - 15) < DT / 2) k15.push(kills);
      if (Math.abs(s - 30) < DT / 2) k30.push(kills);
      if (Math.abs(s - 60) < DT / 2) { k60.push(kills); w60.push(w.wave); wall60.push(w.wallHp / w.wallMax); b60.push(w.buys); }
    }
    pile.push(maxPile); end.push(w.time); wallEnd.push(w.wallHp / w.wallMax);
  }
  console.log(`${name.padEnd(5)} kills 15/30/60s ${med(k15)}/${med(k30)}/${med(k60)}  wave@60 ${med(w60)}  pile≤60s ${med(pile)}  wall@60 ${med(wall60).toFixed(2)}  buys@60 ${med(b60)}  pick@s ${picks.map((p) => (p.length ? Math.round(med(p)) : '-')).join('/')}  level ${(med(end) / 60).toFixed(1)} min wall ${med(wallEnd).toFixed(2)}`);
}
