// The battle's juice: what each sim event looks like on the board (particles, rings, flashes,
// shake, toasts), and the tank-relative points the per-frame effects in main.ts start from.

import { ENEMIES } from '../sim/config';
import type { World } from '../sim/world';
import type { HeroKind, SimEvent } from '../sim/types';
import { t } from '../i18n';
import { toScreen, type Stage } from './scene';
import type { Fx } from './fx';
import type { Hud } from './hud';

/** Where the tank is drawn this frame (the hero rides it). */
export const trainAt = (stage: Stage) => stage.train.position;

/** The exhaust at the tank's back, for its puffs. */
export function chimney(stage: Stage): { x: number; z: number } {
  const p = stage.train.position;
  const a = stage.train.rotation.y;
  return { x: p.x + Math.sin(a) * 0.55, z: p.z + Math.cos(a) * 0.55 };
}

const HIT_COLORS: Record<string, [number, number]> = {
  strawberry: [0xe8384f, 0xffe27a],
  coconut: [0x8a5a3b, 0xf4ecd8],
  watermelon: [0xf05060, 0x3fa34d],
  grape: [0x7b3fa0, 0xc89ae0],
  lemon: [0xf2d230, 0xfff8b0],
  hero: [0x7ff0ff, 0xffffff],
};

/** Each trooper's skill colour, its visor's (scifi.ts TROOPERS) made lighter. */
export const SKILL_GLOW: Record<HeroKind, number> = { farmer: 0xa080ff, beekeeper: 0x50e0ff, chef: 0xffa030 };

/**
 * Heavy's skill: an orbital strike on every bug. A beam of hot particles drops onto each,
 * then a flash, an orange burst and a scorch ring where it lands; a wide ring sweeps the field.
 */
function orbitalStrike(stage: Stage, fx: Fx, world: World, p: { x: number; z: number }): void {
  fx.ring(p.x, p.z, 1.6, 0xffa030, 0.5);
  fx.ring(0, 0, 14, 0xff7a20, 0.7);
  for (const e of world.enemies) {
    fx.stream(e.x, 7, e.z, e.x, 0.3, e.z, 0xffd070, 6, 0.18, 0.09);
    fx.puff(e.x, 0.6, e.z, 0xffb040, { size: 0.9, grow: 1.8, life: 0.35, glow: true, opacity: 1 });
    fx.burst(e.x, e.z, 0xff8a20, { count: 8, speed: 2.4, up: 3, size: 0.08, alt: 0xfff0b0 });
    fx.ring(e.x, e.z, 0.7, 0xff7a20, 0.4);
  }
  stage.shake = 0.4;
}

/** One sim event's look on the board. */
export function showEvent(ev: SimEvent, stage: Stage, fx: Fx, hud: Hud, world: World): void {
  switch (ev.t) {
    case 'happen': hud.flash(t(`flash.${ev.kind}`)); break;
    case 'buy': {
      const p = trainAt(stage);
      fx.ring(p.x, p.z, 1.2, 0xffe066, 0.4);
      fx.burst(p.x, p.z, 0xffe066, { count: 10, speed: 2, up: 4, size: 0.07, alt: 0xffffff, y: 1 });
      break;
    }
    case 'reverse': {
      const c = chimney(stage);
      fx.burst(c.x, c.z, 0xffffff, { count: 8, speed: 1.2, up: 2.5, size: 0.12, y: 1.2, life: 0.6 });
      break;
    }
    case 'grab': {
      fx.ring(ev.x, ev.z, 1.4, 0xffe066, 0.5);
      fx.burst(ev.x, ev.z, 0xffd84a, { count: 20, speed: 3, up: 5, size: 0.09, alt: 0xffffff, y: 0.5 });
      if (ev.gold > 0) {
        fx.text(ev.x, 2, ev.z, `+${ev.gold}`);
        const s = toScreen(stage, ev.x, 0.5, ev.z);
        hud.coinFly(s.x, s.y, 4);
      }
      if (ev.stat) hud.flash(t('flash.stat', { name: t(`stat.${ev.stat}.name`) }));
      break;
    }
    case 'fire':
      // Muzzle flash: a wide cyan bloom round a white-hot pop at the gun, and a spit of sparks.
      // Big and brief, so each shot is seen leaving the tank without hiding it.
      fx.puff(ev.x, 1.25, ev.z, 0x60e0ff, { size: 1.3, grow: 1.5, life: 0.13, rise: 0, opacity: 0.9, glow: true });
      fx.puff(ev.x, 1.25, ev.z, 0xffffff, { size: 0.6, grow: 1.2, life: 0.08, rise: 0, opacity: 1, glow: true });
      fx.burst(ev.x, ev.z, 0xb8f8ff, { count: 6, speed: 3, up: 1.2, size: 0.07, alt: 0xffffff, y: 1.25, life: 0.22, gravity: 3 });
      break;
    case 'hit': {
      const [c, alt] = HIT_COLORS[ev.kind];
      // A hard flash where the shot lands (the bug itself flares too, units.ts), a quick shock ring
      // on the ground under it and a spray of hot sparks; all bigger and gold on a crit.
      fx.puff(ev.x, 0.55, ev.z, ev.crit ? 0xffd070 : 0x80eaff, { size: ev.crit ? 1.7 : 1.1, grow: 1.5, life: ev.crit ? 0.24 : 0.16, rise: 0, opacity: 1, glow: true });
      fx.puff(ev.x, 0.55, ev.z, 0xffffff, { size: ev.crit ? 0.8 : 0.5, grow: 1.2, life: 0.09, rise: 0, opacity: 1, glow: true });
      if (ev.crit) {
        fx.ring(ev.x, ev.z, 1.1, 0xffe066, 0.3, 0.1);
        fx.burst(ev.x, ev.z, 0xffe066, { count: 14, speed: 4, up: 3, size: 0.09, alt: 0xffffff, life: 0.45, y: 0.55 });
      } else {
        fx.ring(ev.x, ev.z, 0.65, c, 0.2, 0.1);
        fx.burst(ev.x, ev.z, c, { count: 8, speed: 3.2, up: 2.5, size: 0.08, alt, life: 0.35, y: 0.55 });
      }
      break;
    }
    case 'kill': {
      const color = ENEMIES[ev.kind].color;
      fx.burst(ev.x, ev.z, color, { count: ev.kind === 'boss' ? 60 : 14, speed: ev.kind === 'boss' ? 5 : 2.5, up: 4, size: ev.kind === 'boss' ? 0.16 : 0.09, alt: 0xffb040, life: 0.7 });
      // A soft dust cloud where it fell, and its coin flies to the purse.
      const big = ev.kind === 'boss' ? 2.4 : 1;
      for (let i = 0; i < (ev.kind === 'boss' ? 10 : 4); i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.3 * big;
        fx.puff(ev.x + Math.cos(a) * r, 0.25 + Math.random() * 0.2, ev.z + Math.sin(a) * r, 0xa8b4c8, { size: 0.5 * big, grow: 2, life: 0.55 + Math.random() * 0.25, rise: 0.5, opacity: 1 });
      }
      fx.text(ev.x, 1.8, ev.z, `+${ev.gold}`);
      const s = toScreen(stage, ev.x, 0.5, ev.z);
      hud.coinFly(s.x, s.y, ev.kind === 'boss' ? 6 : 1);
      if (ev.kind === 'boss') stage.shake = 0.5;
      break;
    }
    case 'trick':
      fx.ring(ev.x, ev.z, 1.6, ENEMIES.locust.color, 0.6);
      fx.burst(ev.x, ev.z, ENEMIES.locust.color, { count: 14, speed: 3, up: 3 });
      break;
    case 'cast': {
      hud.flash(t(`hero.${world.heroKind}.cast`));
      const p = trainAt(stage);
      // A double shock ring and a flash in the trooper's visor colour.
      const c = SKILL_GLOW[world.heroKind];
      fx.ring(p.x, p.z, 4, c, 0.6);
      fx.ring(p.x, p.z, 2.2, 0xffffff, 0.4);
      fx.puff(p.x, 1.2, p.z, c, { size: 1.6, grow: 2.2, life: 0.4, glow: true, opacity: 0.9 });
      break;
    }
    case 'bite': {
      const p = trainAt(stage);
      fx.stream(p.x, 1.4, p.z, ev.x, 0.5, ev.z, 0x6fe8ff, 3, 0.3, 0.06);
      fx.burst(ev.x, ev.z, 0x6fe8ff, { count: 5, speed: 1.5, up: 2, size: 0.05, alt: 0xffffff });
      break;
    }
    case 'juice': {
      const p = trainAt(stage);
      orbitalStrike(stage, fx, world, p);
      break;
    }
    case 'wave':
      // While the guide holds the bugs at the ring, the banner says the fight waits for the player.
      if (world.holdAt !== null) hud.flash(t('flash.wave', { n: ev.wave }), t('flash.ready'), 3);
      else hud.flash(t(ev.boss ? 'flash.boss' : 'flash.wave', { n: ev.wave }));
      if (ev.boss) stage.shake = 0.3;
      break;
    case 'revive':
      hud.flash(t('flash.revive'));
      fx.ring(0, 0, 6, 0x9be7ff, 0.8);
      stage.shake = 0.3;
      break;
    case 'over':
      stage.shake = 0.6;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        fx.burst(Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0xa87444, { count: 10, speed: 3, up: 5, size: 0.1 });
      }
      break;
  }
}
