// Boot: build the stage, run the sim at a fixed 30 Hz and render with interpolation.
// URL options: ?seed=123  ?deck=strawberry,lemon,grape  ?hero=farmer|beekeeper|chef

import { DT, ENEMIES, FRUITS, HEROES } from './sim/config';
import { HERO_CELL, cellX, cellZ } from './sim/board';
import { World } from './sim/world';
import type { FruitKind, HeroKind } from './sim/types';
import { createStage, paintFence, paintTiles, setHero, shakeCamera } from './view/scene';
import { animateHero } from './view/models';
import { Units } from './view/units';
import { Hud } from './view/hud';
import { Input } from './view/input';
import { Sound } from './view/audio';

const params = new URLSearchParams(location.search);
const deckParam = params.get('deck')?.split(',').filter((k): k is FruitKind => k in FRUITS);
const heroParam = params.get('hero') as HeroKind | null;
let seed = Number(params.get('seed')) || (Date.now() % 100000);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const stage = createStage(canvas);
const units = new Units(stage.scene, stage.camera);
let world = newWorld();
let speed = 1;
const sound = new Sound();
/** First-minute guide (§12), kept across restarts: once learned, never shown again this session. */
const guide = { summoned: false, merged: false, cast: false };
const GUIDE_SLOW = 0.2;

function newWorld(): World {
  const w = new World({ seed, deck: deckParam && deckParam.length === 3 ? deckParam : undefined, hero: heroParam && heroParam in HEROES ? heroParam : undefined });
  setHero(stage, w.heroKind);
  return w;
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
    lastWall = world.wallHp;
  },
  mute: () => hud.setMuted(sound.toggleMute()),
});
hud.setMuted(sound.muted);

const input = new Input(canvas, stage.camera, units, hud, {
  world: () => world,
  onDrop: (from, to) => world.drop(from, to),
  onSell: (cell) => world.sell(cell),
  onCast: () => world.cast(),
}, stage.tiles);

const CAST_TEXT: Record<HeroKind, string> = {
  farmer: '浇水！全体攻速 +30%',
  beekeeper: '蜂群出动！',
  chef: '榨汁！全场伤害',
};

const fx = units.fx;
const HERO_X = cellX(HERO_CELL);
const HERO_Z = cellZ(HERO_CELL);
const HIT_COLORS: Record<string, [number, number]> = {
  strawberry: [0xe8384f, 0xffe27a],
  coconut: [0x8a5a3b, 0xf4ecd8],
  watermelon: [0xf05060, 0x3fa34d],
  grape: [0x7b3fa0, 0xc89ae0],
  lemon: [0xf2d230, 0xfff8b0],
};

function drainEvents(): void {
  for (const ev of world.events) {
    sound.play(ev);
    if (ev.t === 'summon') guide.summoned = true;
    else if (ev.t === 'merge') guide.merged = true;
    else if (ev.t === 'cast') guide.cast = true;
    switch (ev.t) {
      case 'summon': {
        units.pop(ev.cell, world);
        const x = cellX(ev.cell);
        const z = cellZ(ev.cell);
        fx.burst(x, z, 0x8a5a32, { count: 12, speed: 2, up: 3, size: 0.09, alt: 0x5aae44 });
        fx.ring(x, z, 1.1, 0xffffff, 0.35);
        break;
      }
      case 'merge': {
        units.pop(ev.cell, world);
        const x = cellX(ev.cell);
        const z = cellZ(ev.cell);
        fx.ring(x, z, 1.5, 0xfff27a, 0.5);
        fx.burst(x, z, 0xffe066, { count: 18 + ev.level * 3, speed: 3, up: 4.5, size: 0.08, alt: 0xffffff, y: 0.8 });
        break;
      }
      case 'sell': {
        const x = cellX(ev.cell);
        const z = cellZ(ev.cell);
        fx.burst(x, z, 0xffd84a, { count: 10, speed: 2, up: 4, size: 0.08 });
        fx.text(x, 1.4, z, `+${ev.gold}`);
        break;
      }
      case 'fire': units.kick(ev.cell, world); break;
      case 'hit': {
        const [c, alt] = HIT_COLORS[ev.kind];
        if (ev.r > 0) fx.ring(ev.x, ev.z, ev.r, c, 0.35);
        fx.burst(ev.x, ev.z, c, { count: ev.r > 0 ? 12 : ev.kind === 'coconut' ? 7 : 4, speed: ev.r > 0 ? 3 : 1.8, up: 2.5, size: ev.kind === 'coconut' ? 0.1 : 0.06, alt, life: 0.45 });
        if (ev.kind === 'coconut') stage.shake = Math.max(stage.shake, 0.05);
        break;
      }
      case 'kill': {
        const color = ENEMIES[ev.kind].color;
        fx.burst(ev.x, ev.z, color, { count: ev.kind === 'boss' ? 60 : 14, speed: ev.kind === 'boss' ? 5 : 2.5, up: 4, size: ev.kind === 'boss' ? 0.16 : 0.09, alt: 0x9ad07e, life: 0.7 });
        fx.text(ev.x, 1.2, ev.z, `+${ev.gold}`);
        if (ev.kind === 'boss') stage.shake = 0.5;
        break;
      }
      case 'burst':
        fx.ring(ev.x, ev.z, ev.r, 0xffffff, 0.5);
        fx.burst(ev.x, ev.z, 0xffffff, { count: 16, speed: 3.5, up: 3, size: 0.07, alt: 0xfff27a });
        break;
      case 'trick':
        fx.ring(ev.x, ev.z, 1.6, ENEMIES.locust.color, 0.6);
        fx.burst(ev.x, ev.z, ENEMIES.locust.color, { count: 14, speed: 3, up: 3 });
        break;
      case 'cast':
        hud.flash(CAST_TEXT[world.heroKind]);
        fx.ring(HERO_X, HERO_Z, 4, HEROES[world.heroKind].color, 0.6);
        break;
      case 'bite':
        fx.stream(HERO_X, 1.8, HERO_Z, ev.x, 0.5, ev.z, 0xffc820, 3, 0.3, 0.06);
        fx.burst(ev.x, ev.z, 0xffc820, { count: 5, speed: 1.5, up: 2, size: 0.05, alt: 0x2b2b2b });
        break;
      case 'juice':
        for (const c of ev.cells) {
          fx.ring(cellX(c), cellZ(c), 1.2, 0xffa040, 0.5);
          fx.stream(cellX(c), 0.6, cellZ(c), HERO_X, 1.8, HERO_Z, 0xffa040, 12, 0.35, 0.08);
        }
        fx.ring(0, 0, 14, 0xffa040, 0.7);
        for (const e of world.enemies) fx.burst(e.x, e.z, 0xffa040, { count: 6, speed: 2, up: 3, size: 0.09, alt: 0xffe066 });
        stage.shake = 0.35;
        break;
      case 'wave':
        hud.flash(ev.boss ? `第 ${ev.wave} 波 · 蝗虫王！` : `第 ${ev.wave} 波`);
        if (ev.boss) stage.shake = 0.3;
        break;
      case 'unlock':
        hud.flash('新格子开放');
        fx.ring(cellX(ev.cell), cellZ(ev.cell), 1.6, 0xffffff, 0.6);
        fx.burst(cellX(ev.cell), cellZ(ev.cell), 0xc9a56a, { count: 20, speed: 2.5, up: 3, alt: 0x5aae44 });
        break;
      case 'card': if (ev.id === 'summonLevel') hud.flash(`召唤等级 Lv${world.summonLevel}`); break;
      case 'over':
        stage.shake = 0.6;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          fx.burst(Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0xa87444, { count: 10, speed: 3, up: 5, size: 0.1 });
        }
        break;
    }
  }
  world.events.length = 0;
}

let lastWall = world.wallHp;
let clock = 0;

/** Per-frame view state that is not an event: fence damage, hero pose, skill effects. */
function ambient(dt: number): void {
  clock += dt;
  if (world.wallHp < lastWall - 0.5) stage.shake = Math.max(stage.shake, 0.04);
  lastWall = world.wallHp;
  paintFence(stage, world.wallHp / world.wallMax);
  shakeCamera(stage, dt);
  const hero = stage.hero.children[0];
  const casting = world.hero.buffT > 0;
  if (hero) animateHero(hero, clock, casting);
  // Farmer's water: drops falling on every fruit while the skill runs.
  if (casting && world.heroKind === 'farmer') {
    for (let c = 0; c < 9; c++) {
      if (!world.cells[c] || Math.random() > dt * 10) continue;
      fx.emit(cellX(c) + (Math.random() - 0.5) * 1.2, 3, cellZ(c) + (Math.random() - 0.5) * 1.2, 0, -4, 0, 0x6ac8ff, 0.07, 0.6, 6);
    }
  }
  // Bees buzz round the hero while the swarm is out.
  if (casting && world.heroKind === 'beekeeper' && Math.random() < dt * 20) {
    const a = clock * 6 + Math.random() * 6;
    fx.emit(HERO_X + Math.cos(a) * 0.8, 1.9 + Math.random() * 0.4, HERO_Z + Math.sin(a) * 0.8, -Math.sin(a) * 3, 0, Math.cos(a) * 3, 0xffc820, 0.06, 0.3, 0, false);
  }
  // A full charge sparkles above the hero until the player casts.
  if (world.heroReady() && Math.random() < dt * 8) {
    fx.emit(HERO_X + (Math.random() - 0.5), 2.2, HERO_Z + (Math.random() - 0.5), 0, 1.2, 0, 0xfff27a, 0.07, 0.7, 0, false);
  }
}

/** Cells holding a pair that can merge (same kind and level), for the guide highlight. */
function mergePair(): number[] {
  for (let a = 0; a < 9; a++) for (let b = a + 1; b < 9; b++) if (world.canMerge(a, b)) return [a, b];
  return [];
}

/** One line of guidance above the buttons, and tiles to light up. No popups, input never blocked. */
function guideStep(): Set<number> {
  const lit = new Set(input.targets);
  let text: string | null = null;
  if (world.over) {
    // Nothing.
  } else if (!guide.summoned) {
    text = '点「召唤」，种下第一颗水果';
  } else if (!guide.merged) {
    const pair = mergePair();
    if (pair.length && input.targets.size === 0) {
      text = '把水果拖到一样的水果上，合成升级';
      for (const c of pair) lit.add(c);
    } else if (!pair.length && world.canSummon()) {
      text = '再召唤几次，凑出一对一样的水果';
    }
  } else if (!guide.cast && world.heroReady()) {
    text = world.heroKind === 'chef' && world.emptyCells().length === 0 ? '格子满了：点英雄榨汁，吃掉低级水果打全场' : '英雄蓄满了，点左下角释放技能';
  }
  hud.setHint(text);
  return lit;
}

let acc = 0;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // Until the first summon the fight runs at 0.2x, so the player can look around (§12).
  acc += dt * speed * (guide.summoned ? 1 : GUIDE_SLOW);
  while (acc >= DT) {
    world.step();
    acc -= DT;
  }
  drainEvents();
  units.sync(world, acc / DT, dt);
  ambient(dt);
  paintTiles(stage, world.unlocked, guideStep(), input.hover);
  if (world.enemies.some((e) => e.d === 0)) sound.chew();
  sound.tickMusic(world.wave >= 10, world.over);
  hud.update(world, dt);
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
    ambient(0.05);
    paintTiles(stage, world.unlocked, guideStep());
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
