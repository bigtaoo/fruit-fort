// Boot: build the stage, run the sim at a fixed 30 Hz and render with interpolation.
// URL options: ?seed=123  ?deck=strawberry,lemon,grape

import { DT, FRUITS } from './sim/config';
import { cellX, cellZ } from './sim/board';
import { World } from './sim/world';
import type { FruitKind } from './sim/types';
import { createStage, paintTiles } from './view/scene';
import { Units } from './view/units';
import { Hud } from './view/hud';
import { Input } from './view/input';

const params = new URLSearchParams(location.search);
const deckParam = params.get('deck')?.split(',').filter((k): k is FruitKind => k in FRUITS);
let seed = Number(params.get('seed')) || (Date.now() % 100000);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const stage = createStage(canvas);
const units = new Units(stage.scene, stage.camera);
let world = newWorld();
let speed = 1;

function newWorld(): World {
  return new World({ seed, deck: deckParam && deckParam.length === 3 ? deckParam : undefined });
}

const hud = new Hud(document.getElementById('hud')!, {
  summon: () => world.summon(),
  upgrade: () => world.upgrade(),
  choose: (i) => world.choose(i),
  cast: () => world.cast(),
  speed: () => hud.setSpeed((speed = speed === 1 ? 2 : 1)),
  restart: () => {
    seed++;
    units.reset();
    world = newWorld();
  },
});

const input = new Input(canvas, stage.camera, units, hud, {
  world: () => world,
  onDrop: (from, to) => world.drop(from, to),
  onSell: (cell) => world.sell(cell),
  onCast: () => world.cast(),
}, stage.tiles);

function drainEvents(): void {
  for (const ev of world.events) {
    switch (ev.t) {
      case 'summon': units.pop(ev.cell, world); break;
      case 'merge':
        units.pop(ev.cell, world);
        units.ring(cellX(ev.cell), cellZ(ev.cell), 1.4, 0xfff27a, 0.5);
        break;
      case 'hit': if (ev.r > 0) units.ring(ev.x, ev.z, ev.r, FRUITS[ev.kind].color); break;
      case 'burst': units.ring(ev.x, ev.z, ev.r, 0xffffff, 0.5); break;
      case 'cast': hud.flash('浇水！全体攻速 +30%'); break;
      case 'wave': hud.flash(ev.boss ? `第 ${ev.wave} 波 · Boss！` : `第 ${ev.wave} 波`); break;
      case 'unlock': hud.flash('新格子开放'); break;
      case 'card': if (ev.id === 'summonLevel') hud.flash(`召唤等级 Lv${world.summonLevel}`); break;
    }
  }
  world.events.length = 0;
}

let acc = 0;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt * speed;
  while (acc >= DT) {
    world.step();
    acc -= DT;
  }
  drainEvents();
  units.sync(world, acc / DT, dt);
  paintTiles(stage, world.unlocked, input.targets, input.hover);
  hud.update(world, dt);
  stage.hero.rotation.y += world.hero.buffT > 0 ? dt * 6 : 0;
  stage.renderer.render(stage.scene, stage.camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Dev handle: advance(sec) steps the sim and draws one frame, for a hidden tab where rAF sleeps.
if (import.meta.env.DEV) {
  const advance = (sec: number) => {
    for (let i = 0; i < Math.round(sec / DT); i++) world.step();
    input.targets.clear();
    drainEvents();
    units.sync(world, 1, 0.05);
    paintTiles(stage, world.unlocked, input.targets);
    hud.update(world, 0.05);
    stage.renderer.render(stage.scene, stage.camera);
  };
  const bot = async (sec: number) => {
    const { botAct } = await import('./sim/bot');
    for (let t = 0; t < sec && !world.over; t += 0.5) {
      botAct(world);
      for (let i = 0; i < 15; i++) world.step();
      world.events.length = 0;
    }
    advance(0);
  };
  Object.assign(window, { game: { world: () => world, stage, advance, bot } });
}
