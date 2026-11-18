// Boot: build the stage, load the platform and the save, run the sim at a fixed 30 Hz and render
// with interpolation. Between runs the village screen (§11) is up and the sim is paused.
// URL options: ?seed=123  ?hero=farmer|beekeeper|chef (override the save)
//              ?lang=de (one of i18n's LOCALES; overrides the saved pick and the browser's language)
//              ?quality=high|mid|low (pin the picture level; otherwise it drops by itself on slow devices)
//              The dev server pins high, so the art is judged at full quality; ?quality=auto there
//              brings back the automatic drop.

import { DT, HEROES, WALL } from './sim/config';
import { World } from './sim/world';
import type { HeroKind } from './sim/types';
import { createStage, toScreen, unsized } from './view/scene';
import { heroPortrait } from './view/portrait';
import { devHandle } from './view/dev';
import { Guide } from './view/guide';
import { GuideHold } from './view/holdring';
import { BoardView } from './view/boardview';
import { Units } from './view/units';
import { Hud } from './view/hud';
import { resultInfo } from './view/hudtext';
import { Input } from './view/input';
import { Sound } from './view/audio';
import { soundSwitches, toggleSound as flipSound } from './view/soundprefs';
import { Village, type VillageTab } from './view/village';
import { Quality } from './view/quality';
import { Ambience } from './view/ambience';
import { Threats } from './view/threats';
import type { Analytics, Platform } from './platform';
import { Funnel } from './platform/funnel';
import { PerfSampler, watchPerf } from './platform/perf';
import { busyMark } from './platform/busy';
import { watchPage } from './platform/pagewatch';
import { trackEvent } from './runtrack';
import { Runs } from './runs';
import { Boot } from './start';
import { worldOptions, type RunMode, type Save } from './meta/progress';
import { rollDaily } from './meta/daily';
import { nextLevel } from './meta/chapter';
import { LEVELS, levelName } from './sim/levels';
import { writeSave } from './meta/store';
import { setOverlay, t, type Locale } from './i18n';
import { switchLocale } from './view/locale';
import { SCIFI_COPY } from './i18n/scifi';
import { mark, noteBoot } from './loading';

// The game says shield, tank and trooper; the base tables still name the toy box's fence, train and toy.
setOverlay(SCIFI_COPY);

const params = new URLSearchParams(location.search);
const heroParam = params.get('hero') as HeroKind | null;
let seed = Number(params.get('seed')) || (Date.now() % 100000);

const canvas = document.getElementById('game') as HTMLCanvasElement;
// The game chunk's modules have run; the stage is built next (`build` marks the end of both). 2026-11-18: on
// the slowest live loads `build` came 3-10 s after the downloads, so the two are told apart.
mark('main');
const stageFrom = performance.now();
const stage = createStage(canvas);
noteBoot('stage_ms', performance.now() - stageFrom);
noteBoot('gl_ms', stage.glMs);
noteBoot('psc', stage.renderer.extensions.has('KHR_parallel_shader_compile') ? 1 : 0);
const units = new Units(stage.scene, stage.camera);
units.onBite = (x, z) => stage.fence.bite(Math.atan2(z, x));
units.gapAt = (x, z) => stage.fence.gapAt(Math.atan2(z, x));
const pin = params.get('quality') ?? (import.meta.env.DEV ? 'high' : null);
const quality = new Quality(stage, units.fx, pin === 'auto' ? null : pin);
const ambience = new Ambience(stage);
let platform!: Platform;
let analytics!: Analytics;
let save!: Save;
let world!: World;
let speed = 1;
/** When the run ended (performance.now()) and whether a tap skipped its show: the board plays the end
 *  (a moment of slow motion, a win's fireworks) before the result card comes up. */
let endAt = 0;
let endSkip = false;
const WIN_WAIT = 1300;
const LOSE_WAIT = 800;
const SLOW_TIME = 400;
const SLOW = 0.3;
/** The host paused us (Runs.adOpen covers our own ads): the sim and the sound wait. */
let hostPaused = false;
/** Frame times of active, visible play, sent as Playgama's performance_sample every ~30 s of it (docs/platform.md). */
const perf = new PerfSampler((d) => analytics?.track('performance_sample', d), __APP_VERSION__);
/** The run on screen, its booking and its ads (runs.ts). */
const runs = new Runs({ world: () => world, save: () => save, platform: () => platform, analytics: () => analytics, persist: () => persist(), perf });
perf.context = () => ({ mode: String(runs.run.mode), wave: world.wave, q: quality.level, bugs: world.enemies.length });
perf.longContext = () => busyMark();
watchPerf(perf, canvas);
/** The player opened the pause menu: the sim waits, the sound plays on. */
let userPaused = false;
const sound = new Sound();
/** A tap this near the tank on screen (CSS px, at least) casts a charged skill instead of turning round. */
const TANK_TAP = 56;
/** First-minute funnel, idle and quit telemetry (docs/platform.md). */
const funnel = new Funnel();
/** Crystals when the village last saw them: a drop in `onChange` is a purchase. */
let villageCrystals = 0;

function newWorld(mode: RunMode): World {
  const o = worldOptions(save, mode);
  const w = new World({
    ...o,
    seed: o.seed ?? seed,
    hero: heroParam && heroParam in HEROES ? heroParam : o.hero,
    wagons: o.wagons && params.get('wagons') !== '0',
  });
  stage.engine.setHero(w.heroKind);
  return w;
}

function persist(): void {
  writeSave(platform.storage, save);
}

function startRun(mode: RunMode): void {
  if (rollDaily(save)) persist();
  seed++;
  units.reset();
  stage.fence.reset();
  world = newWorld(mode);
  runs.run = { mode, booked: false, earned: 0, doubled: false };
  // Every run starts at normal speed: x2 from the last run is not carried in.
  hud.setSpeed((speed = 1));
  village.hide();
  fitBoard();
  // The opening: the camera pulls in, the HUD slides into place, the run's name on the banner and the
  // tank warps onto the track.
  stage.shake.startIntro();
  hud.enter();
  board.rig.reset();
  hud.flash(typeof mode === 'number' ? levelName(mode) : t(mode === 'endless' ? 'village.endless' : 'village.challengeName'), null, 1.3);
  hud.setQuit(save.runs > 0);
  analytics.track('run_start', { mode, hero: world.heroKind, runs: save.runs });
}

function openVillage(tab?: VillageTab): void {
  // The page may have stayed open past midnight: today's reward, tasks and challenge.
  if (rollDaily(save)) persist();
  funnel.step('village_open', { runs: save.runs });
  villageCrystals = save.crystals;
  // The route is the way in (§9.1); a waiting claim shows as the daily tab's dot.
  village.show(tab);
  fitBoard();
}

const hud = new Hud(document.getElementById('hud')!, {
  buy: (k) => world.buy(k),
  cast: () => world.cast(),
  speed: () => hud.setSpeed((speed = speed === 1 ? 2 : 1)),
  pause: (on) => (userPaused = on),
  // Leaving mid-run from the pause menu: the run is booked as a loss (book's `bailed`), so the
  // player lands in the village with crystals to spend instead of nothing.
  quit: () => {
    userPaused = false;
    if (world.over) return;
    runs.book(true);
    analytics.track('run_quit', { mode: runs.run.mode, wave: world.wave, t: Math.round(world.time), runs: save.runs, crystals: runs.run.earned });
    openVillage();
  },
  restart: () => void runs.leave(() => startRun(runs.run.mode)),
  village: () => void runs.leave(() => openVillage()),
  // A won level goes on to the first one not cleared (the one after, unless an earlier one is still open).
  next: () => void runs.leave(() => (nextLevel(save) < LEVELS.length ? startRun(nextLevel(save)) : openVillage())),
  train: () => void runs.leave(() => openVillage('train')),
  portrait: (kind) => heroPortrait(stage, kind),
  revive: async () => {
    if (world.revived || !world.over || runs.run.booked) return;
    if ((await runs.rewarded('revive')) && !runs.run.booked && world.revive()) analytics.track('revive', { wave: world.wave });
  },
  double: async () => {
    if (runs.run.doubled || runs.run.booked) return;
    if ((await runs.rewarded('double')) && !runs.run.booked) runs.run.doubled = true;
  },
  sound: (kind) => toggleSound(kind),
  language: (l) => void useLocale(l, true),
});

/** A fight under way stops behind the pause menu while the page is away, so the player comes back to it. */
function awayPause(): void {
  if (world && save && !village.open && !world.over && !runs.adOpen) hud.openPause();
}
/** The page goes hidden: where and when the player left goes out (every leave), and the frame times. */
function leaving(): void {
  if (world && save) funnel.quit({ at: village.open ? 'village' : world.over ? 'over' : runs.adOpen ? 'ad' : 'run', wave: world.wave, runTime: world.time, q: quality.level, scene: world.scene() });
  perf.flush();
}
// A run ended but the player closes the tab on the result card: still pay it out.
watchPage(awayPause, leaving, () => world && runs.book());

/** The music or the effects switched on or off (the map's settings or the pause menu). */
function toggleSound(kind: 'music' | 'sfx'): void {
  flipSound(sound, platform.storage, kind);
  hud.setSound(soundSwitches(sound));
}

const village = new Village(() => save, {
  onChange: () => {
    if (save.crystals < villageCrystals) funnel.step('first_purchase', { spent: villageCrystals - save.crystals });
    villageCrystals = save.crystals;
    persist();
  },
  onPlay: (mode) => startRun(mode),
  onClick: (ok) => sound.click(ok),
  onLanguage: (l) => void useLocale(l, true),
  onSound: (kind) => toggleSound(kind),
  sound: () => soundSwitches(sound),
  portrait: (kind) => heroPortrait(stage, kind),
  fort: () => {
    const e = [toScreen(stage, -WALL, 0, 0), toScreen(stage, WALL, 0, 0), toScreen(stage, 0, 0, -WALL), toScreen(stage, 0, 0, WALL)];
    return { l: e[0].x, r: e[1].x, t: e[2].y, b: e[3].y };
  },
});

new Input(canvas, {
  world: () => world,
  onReverse: () => {
    if (!village.open && !runs.adOpen) world.reverse();
  },
  onTankTap: (x, y) => {
    if (village.open || runs.adOpen || hostPaused || userPaused) return false;
    const tank = world.trainPos();
    const p = toScreen(stage, tank.x, 0.5, tank.z);
    const b = stage.board?.area ?? { w: window.innerWidth, h: window.innerHeight };
    return Math.hypot(x - p.x, y - p.y) <= Math.max(TANK_TAP, Math.min(b.w, b.h) * 0.12) && world.cast();
  },
});

const guide = new Guide({
  world: () => world,
  save: () => save,
  screen: () => (!world || !save || runs.adOpen || hostPaused || userPaused ? null : village.open ? 'village' : world.over ? (hud.resultUp ? 'result' : null) : 'battle'),
  villageTab: () => village.current,
  hudButton: (name) => hud.button(name),
  toScreen: (x, y, z) => toScreen(stage, x, y, z),
  board: () => stage.board?.area ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight },
  setText: (text, title) => hud.setHint(text, title ?? null),
  persist: () => persist(),
  funnel,
});

const board = new BoardView(stage, units.fx, hud, ambience);
const hold = new GuideHold();
// `dt` is the fight's own seconds: 0 while paused, in an ad or on the result card, so the hold's
// HOLD_TTL only spends time the player is actually being asked to act.
const holdBugs = (dt: number): void => hold.update(world, guide.holding(dt), () => hud.flash(t('flash.go')));
const threats = new Threats(document.body, document.getElementById('hud'));

function drainEvents(): void {
  for (const ev of world.events) {
    sound.play(ev);
    trackEvent(ev, world, runs.run.mode, analytics, funnel, guide);
    if (ev.t === 'over' || ev.t === 'win') {
      endAt = performance.now();
      endSkip = false;
    }
    board.event(ev, world);
  }
  world.events.length = 0;
}

const ambient = (dt: number, alpha: number): void => board.update(world, dt, alpha, village.open, quality.level);

function drawHud(dt: number): void {
  if (world.over) hud.setResult(resultInfo(save, world, runs.run, platform.rewardedSupported(), runs.adOpen));
  hud.update(world, dt);
}

let acc = 0;
let last = performance.now();
/** Frames put on screen, so warmRest can pace its compiles by real play rather than wall clock. */
let drawn = 0;
function frame(now: number): void {
  if (unsized()) return void ((last = now), platform.gameplayStop(), requestAnimationFrame(frame));
  quality.sample(now - last);
  const dt = Math.min(0.1, (now - last) / 1000);
  const prev = last;
  last = now;
  const paused = village.open || runs.adOpen || hostPaused || userPaused;
  if (paused || world.over) platform.gameplayStop();
  else platform.gameplayStart();
  perf.frame(now - prev, !paused && !world.over && !document.hidden);
  sound.hold(runs.adOpen || hostPaused);
  funnel.tick(dt, !paused && !world.over, { wave: world.wave });
  // No slow-down: the guide's two first steps hold the bugs outside the fence instead (§12.2).
  holdBugs(paused || world.over ? 0 : dt);
  // Under a wagon pick the fight and its auto-pick clock run at x1, x2 or not: room to read three cards.
  if (!paused) acc += dt * (world.wg?.offer ? 1 : speed);
  while (acc >= DT) {
    world.step();
    acc -= DT;
  }
  drainEvents();
  // The run's end plays on the board: a moment of slow motion, then the card (sooner on a loss).
  const ended = world.over ? now - endAt : Infinity;
  hud.holdResult = world.over && !endSkip && ended < (world.won ? WIN_WAIT : LOSE_WAIT);
  const vdt = ended < SLOW_TIME ? dt * SLOW : dt;
  units.sync(world, acc / DT, vdt);
  ambient(vdt, acc / DT);
  threats.update(world.enemies, stage.camera, stage.board, dt, world.over || village.open);
  guide.update(dt);
  // Knocks only while the fight runs: after the fall (or paused) the bugs still stand at the fence.
  if (!paused && !world.over && world.enemies.some((e) => e.d === 0)) sound.chew();
  sound.tickMusic(world.wave >= 10, world.over || village.open);
  drawHud(dt);
  stage.render();
  drawn += 1;
  requestAnimationFrame(frame);
}

// The board is whatever the HUD leaves free (in landscape, while the village is up, the room above its
// navigation row); refit the camera to it when the window turns or the village opens and closes.
function fitBoard(): void {
  const area = village.area();
  stage.board = area ? { area, avoid: [] } : hud.board();
  // The depth of field frames a fight; the level map is read right across the window, and on a wide
  // one its sharp circle covered only the middle third, so the ground, the rocks and the far nodes
  // all came out soft (the owner, 2026-11-15; measured: it is this pass, not the pixel ratio).
  stage.setSoftFocus(!village.open);
  quality.fit();
  stage.resize();
  village.place();
}
window.addEventListener('resize', fitBoard);
hud.onLayout(fitBoard);
fitBoard();
// A tap while the end plays brings the card straight up.
window.addEventListener('pointerdown', () => {
  if (world?.over) endSkip = true;
}, true);
// Any press counts as the first tap once the game shows (a stat card too, not just the canvas).
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => funnel.input(), true);

/**
 * Switch the language: fetch its table, relabel the screens, and keep the pick when the player
 * made it. A failed fetch (offline) keeps the language on screen.
 */
async function useLocale(locale: Locale, picked: boolean): Promise<void> {
  if (!(await switchLocale(locale))) return;
  hud.relabel();
  if (village.open) village.render();
  if (!picked) return;
  void platform.storage.set('lang', locale);
  analytics.track('language', { locale });
}

// The rest of the boot (start.ts): warm the shaders, start the platform, read the save and the language,
// put up the first screen, send `load` and start the frame loop.
const boot = new Boot({ stage, units, quality, sound, hud, funnel });
void (async () => {
  ({ platform, analytics } = await boot.connect());
  save = await boot.read(platform, params.get('lang'), useLocale);
  // A first-timer goes straight into level 1-1 (§12), which starts here, not in startRun; a returning
  // player lands in the village.
  world = newWorld(runs.run.mode);
  platform.onPause((v) => (hostPaused = v));
  hud.setQuit(save.runs > 0);
  if (save.runs > 0) openVillage();
  else analytics.track('run_start', { mode: runs.run.mode, hero: world.heroKind, runs: 0 });
  await boot.show(platform, analytics, save, world);
  requestAnimationFrame(frame);
  boot.rest(analytics, () => drawn);
})().catch((e) => boot.failed(e));

// Dev handle (view/dev.ts): advance(sec) steps the sim and draws one frame, for a hidden tab where rAF sleeps.
if (import.meta.env.DEV) {
  devHandle({
    world: () => world,
    // The guide steps with the sim, so its waits and holds play out as in a real run.
    step: () => {
      holdBugs(DT);
      world.step();
      drainEvents();
      guide.update(DT);
    },
    draw: () => {
      drainEvents();
      units.sync(world, 1, 0.05);
      ambient(0.05, 1);
      threats.update(world.enemies, stage.camera, stage.board, 1, world.over || village.open);
      guide.update(0.05);
      drawHud(0.05);
      stage.render();
      // A real draw, so it counts; with rAF asleep it is the only one (warmPause then skips the frame wait).
      drawn += 1;
    },
    expose: { stage, units, quality, save: () => save, village, guide },
  });
}
