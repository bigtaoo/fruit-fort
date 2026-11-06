// The dev server's console handle (split out of main.ts): window.game with the live world and parts,
// advance(sec) to step the sim and draw one frame in a hidden tab where rAF sleeps, bot(sec) to let
// the bot play, and the first-minute funnel as a table.

import { DT } from '../sim/config';
import type { World } from '../sim/world';
import { funnelReport } from '../platform/funnel';

export function devHandle(h: { world: () => World; step: () => void; draw: () => void; expose: Record<string, unknown> }): void {
  const advance = (sec: number) => {
    for (let i = 0; i < Math.round(sec / DT); i++) h.step();
    h.draw();
  };
  const bot = async (sec: number) => {
    const { botAct } = await import('../sim/bot');
    const world = h.world();
    for (let t = 0; t < sec && !world.over; t += 0.5) {
      botAct(world);
      for (let i = 0; i < 15; i++) world.step();
      world.events.length = 0;
    }
    advance(0);
  };
  /** The first-minute funnel from `window.__track` (stub platform), as a console table. */
  const funnelLog = () => {
    const rows = funnelReport(window.__track ?? []);
    console.table(rows);
    return rows;
  };
  Object.assign(window, { game: { world: h.world, advance, bot, funnel: funnelLog, ...h.expose } });
}
