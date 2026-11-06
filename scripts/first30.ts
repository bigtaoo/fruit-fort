// The first 30 s of a new player's first level (§12.2), simulated: a player who reads the hand and acts
// `react` seconds after it shows. Prints, over many seeds, when the first bug dies and how many die by
// 10 / 20 / 30 s. Run: npx tsx scripts/first30.ts [react=1.5] [guideNear=2, main.ts GUIDE_NEAR]
import { World } from '../src/sim/world';
import { DT } from '../src/sim/config';
import { newSave, worldOptions } from '../src/meta/progress';

const TAU = Math.PI * 2;
/** view/guide.ts's bugBehind (that module pulls in images, which node cannot load). */
function bugBehind(w: World): boolean {
  let near = null;
  for (const e of w.enemies) if (e.hp > 0 && (!near || e.d < near.d)) near = e;
  if (!near) return false;
  const arc = ((((Math.atan2(near.z, near.x) - w.train.angle) * w.train.dir) % TAU) + TAU) % TAU;
  return arc > Math.PI;
}

const GUIDE_NEAR = Number(process.argv[3] ?? 2);
const react = Number(process.argv[2] ?? 1.5);
const rows: number[][] = [];
for (let seed = 1; seed <= 40; seed++) {
  const w = new World({ ...worldOptions(newSave("2026-11-06"), 0), seed });
  let bought = false;
  let turned = false;
  let behind = false;
  let buyAt = -1;
  let turnAt = -1;
  let first = -1;
  const at: number[] = [];
  while (w.time < 30) {
    const alive = w.enemies.some((e) => e.hp > 0);
    if (bought && !behind && bugBehind(w)) behind = true;
    const holdBuy = !bought;
    const holdTurn = bought && behind && !turned;
    w.holdAt = alive && (holdBuy || holdTurn) ? GUIDE_NEAR : null;
    // The hand shows 0.6 s after its step comes; the player acts `react` s after that.
    if (!bought && buyAt < 0) buyAt = w.time + 0.6 + react;
    if (!bought && w.time >= buyAt) bought = w.buy('dmg');
    if (bought && behind && !turned && turnAt < 0) turnAt = w.time + 0.6 + react;
    if (!turned && turnAt >= 0 && w.time >= turnAt) turned = w.reverse();
    w.step();
    w.events.length = 0;
    if (first < 0 && w.kills > 0) first = w.time;
    for (const s of [10, 20, 30]) if (at.length < [10, 20, 30].indexOf(s) + 1 && w.time >= s) at.push(w.kills);
  }
  rows.push([first, ...at]);
}
const avg = (i: number) => (rows.reduce((a, r) => a + (r[i] < 0 ? 30 : r[i]), 0) / rows.length).toFixed(1);
const med = (i: number) => [...rows.map((r) => (r[i] < 0 ? 30 : r[i]))].sort((a, b) => a - b)[rows.length >> 1].toFixed(1);
console.log(`near ${GUIDE_NEAR}, react ${react}s, ${rows.length} seeds, DT ${DT}`);
console.log(`first kill  avg ${avg(0)} s  median ${med(0)} s`);
console.log(`kills by 10 s avg ${avg(1)}, by 20 s ${avg(2)}, by 30 s ${avg(3)}`);
