// One bot run, logged wave by wave: what a player would feel (gold, wall, board, cards, idle time).
// Usage: npx tsx scripts/timeline.ts [seed]

import { World } from '../src/sim/world';
import { TICK_HZ } from '../src/sim/config';
import { botAct } from '../src/sim/bot';

const seed = Number(process.argv[2] ?? 1);
const w = new World({ seed });
const origUpgrade = w.upgrade.bind(w);
const origChoose = w.choose.bind(w);
let offered = '';
const picks: string[] = [];
w.upgrade = () => {
  const ok = origUpgrade();
  if (ok) offered = w.draft!.map((c) => c.id).join(',');
  return ok;
};
w.choose = (i: number) => {
  const id = w.draft?.[i]?.id;
  const ok = origChoose(i);
  if (ok) picks.push(`${id} [${offered}]`);
  return ok;
};

let wave = 0;
let waveT = 0;
let stuck = 0; // seconds with a full board and no merge or feed, gold for a summon sitting idle
let idleGold = 0; // seconds with gold >= summon cost but no summon possible or done
let merges = 0;
let summonsAtWave = 0;
const maxTicks = 30 * 60 * TICK_HZ;
const board = () => w.cells.map((c) => (c ? c.kind[0] + c.level : '.')).join('');
while (!w.over && w.tick < maxTicks) {
  if (w.tick % 15 === 0) botAct(w);
  if (w.tick % TICK_HZ === 0) {
    const canMerge = [...Array(10).keys()].some((a) => [...Array(9).keys()].some((b) => w.canMerge(a, b) || w.canFeed(a, b)));
    if (w.emptyCells().length === 0 && !canMerge) stuck++;
    if (w.gold >= w.summonCost() && !w.canSummon()) idleGold++;
  }
  w.step();
  for (const e of w.events) {
    if (e.t === 'merge') merges++;
    if (e.t === 'wave') {
      if (wave > 0) {
        console.log(
          `w${String(wave).padStart(2)} ${(w.time - waveT).toFixed(0).padStart(3)}s  t=${(w.time / 60).toFixed(1)}m  gold ${Math.floor(w.gold).toString().padStart(4)}  wall ${Math.ceil(w.wallHp)}/${w.wallMax}  board ${board()}  +summons ${w.summons - summonsAtWave} merges ${merges}  stuck ${stuck}s idleGold ${idleGold}s  picks ${picks.splice(0).join(' | ')}`,
        );
      }
      wave = e.wave;
      waveT = w.time;
      summonsAtWave = w.summons;
      merges = 0;
      stuck = 0;
      idleGold = 0;
    }
  }
  w.events.length = 0;
}
console.log(`END wave ${w.wave} at ${(w.time / 60).toFixed(1)} min, kills ${w.kills}, summons ${w.summons}, upgrades ${w.upgrades}, one buy per ${(w.time / (w.summons + w.upgrades)).toFixed(1)}s, summonLv ${w.summonLevel}, board ${board()}, picks ${picks.join(' | ')}`);
