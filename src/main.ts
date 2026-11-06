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
import { groundCalm, groundSurge } from './view/current';
import { animateStage, createStage, kickTrain, setHero, shakeCamera, toScreen, unsized } from './view/scene';
import { heroPortrait } from './view/portrait';
import { TankRig } from './view/rig';
import { devHandle } from './view/dev';
import { showEvent } from './view/juice';
import { Guide } from './view/guide';
import { holdRing } from './view/holdring';
import { Units } from './view/units';
import { Hud } from './view/hud';
import { Input } from './view/input';
import { Sound } from './view/audio';
import { loadSoundPrefs, SOUND_KEYS, soundSwitches, toggleSound as flipSound } from './view/soundprefs';
import { Village, type VillageTab } from './view/village';
import { Quality } from './view/quality';
import { Ambience } from './view/ambience';
import { Threats } from './view/threats';
import { Analytics, getPlatform, type Platform, type RewardedPlacement } from './platform';
import { Funnel } from './platform/funnel';
import { PerfSampler } from './platform/perf';
import { finishRun, hasClaim, nextLevel, rollDaily, runCrystals, worldOptions, type RunMode, type Save } from './meta/progress';
import { LEVELS, levelName } from './sim/levels';
import { loadSave, writeSave } from './meta/store';
import { detectLocale, isLocale, loadLocale, setLocale, setOverlay, t, type Locale } from './i18n';
import { SCIFI_COPY } from './i18n/scifi';
import { hasAchievement } from './meta/achievements';
import { bootTimes, hideLoading, mark } from './loading';

// The game says shield, tank and trooper; the base tables still name the toy box's fence, train and toy.
setOverlay(SCIFI_COPY);

const params = new URLSearchParams(location.search);
const heroParam = params.get('hero') as HeroKind | null;
let seed = Number(params.get('seed')) || (Date.now() % 100000);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const stage = createStage(canvas);
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
/** The run on screen: a level, endless or the daily challenge; whether it was booked into the save
 * and what it paid; its ad rewards. */
let run: { mode: RunMode; booked: boolean; earned: number; doubled: boolean } = { mode: 0, booked: false, earned: 0, doubled: false };
/** An ad is open (ours, or the host paused us): the sim and the sound wait. */
let adOpen = false;
let hostPaused = false;
/** Frame times of active, visible play, sent as Playgama's performance_sample every ~30 s of it (docs/platform.md). */
const perf = new PerfSampler((d) => analytics?.track('performance_sample', d), __APP_VERSION__);
perf.context = () => ({ mode: String(run.mode), wave: world.wave, q: quality.level, bugs: world.enemies.length });
window.addEventListener('error', () => perf.counts.js_error_count++);
window.addEventListener('unhandledrejection', () => perf.counts.unhandled_rejection_count++);
canvas.addEventListener('webglcontextlost', () => perf.counts.webgl_context_loss_count++);
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) perf.longTask(e.duration);
  }).observe({ type: 'longtask', buffered: false });
} catch {
  // No long-task timing here (Safari, Firefox): the sample goes without it.
}
/** The player opened the pause menu: the sim waits, the sound plays on. */
let userPaused = false;
const sound = new Sound();
/** How close to the fence bugs come while the guide holds them (§12.2): the tank reaches them driving past. */
const GUIDE_NEAR = 2;
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
  });
  setHero(stage, w.heroKind);
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
  run = { mode, booked: false, earned: 0, doubled: false };
  // Every run starts at normal speed: x2 from the last run is not carried in.
  hud.setSpeed((speed = 1));
  village.hide();
  fitBoard();
  // The opening: the camera pulls in, the HUD slides into place, the run's name on the banner and the
  // tank warps onto the track.
  stage.intro = 1;
  hud.enter();
  rig.reset();
  hud.flash(typeof mode === 'number' ? levelName(mode) : t(mode === 'endless' ? 'village.endless' : 'village.challengeName'), null, 1.3);
  analytics.track('run_start', { mode, hero: world.heroKind, runs: save.runs });
}

/** Put the finished run into the save: crystals (twice if doubled), records, stars, task progress. */
function book(): void {
  if (!world.over || run.booked) return;
  run.booked = true;
  const earned = finishRun(save, { wave: world.wave, kills: world.kills, grabs: world.grabs, casts: world.casts, buys: world.buys, stars: world.stars() }, run.mode);
  run.earned = earned;
  if (run.doubled) save.crystals += earned;
  persist();
  perf.flush();
  analytics.track('run_end', { wave: world.wave, hero: world.heroKind, kills: world.kills, time: Math.round(world.time), revived: world.revived, doubled: run.doubled, mode: run.mode, stars: world.stars(), crystals: earned * (run.doubled ? 2 : 1) });
}

/**
 * Leave the result card: book the run, ask for an interstitial (every natural pause; the platform
 * decides whether one shows, §14), then the next screen.
 */
async function leave(next: () => void): Promise<void> {
  // A double click lands twice before the card hides: the second must not start another run.
  if (adOpen || !world.over) return;
  book();
  adOpen = true;
  await platform.showInterstitial();
  adOpen = false;
  next();
}

async function rewarded(placement: RewardedPlacement): Promise<boolean> {
  if (adOpen) return false;
  adOpen = true;
  const ok = await platform.showRewarded(placement);
  adOpen = false;
  analytics.track('ad_rewarded', { placement, ok });
  return ok;
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
  // Leaving mid-run from the pause menu: the run is dropped unpaid, like closing the tab.
  quit: () => {
    userPaused = false;
    if (!world.over) openVillage();
  },
  restart: () => void leave(() => startRun(run.mode)),
  village: () => void leave(() => openVillage()),
  // A won level goes on to the first one not cleared (the one after, unless an earlier one is still open).
  next: () => void leave(() => (nextLevel(save) < LEVELS.length ? startRun(nextLevel(save)) : openVillage())),
  train: () => void leave(() => openVillage('train')),
  portrait: (kind) => heroPortrait(stage, kind),
  revive: async () => {
    if (world.revived || !world.over || run.booked) return;
    if ((await rewarded('revive')) && !run.booked && world.revive()) analytics.track('revive', { wave: world.wave });
  },
  double: async () => {
    if (run.doubled || run.booked) return;
    if ((await rewarded('double')) && !run.booked) run.doubled = true;
  },
  sound: (kind) => toggleSound(kind),
  language: (l) => void useLocale(l, true),
});

/**
 * The page lost focus (another tab, window or app, or a click outside the game's frame on a portal):
 * a fight under way stops behind the pause menu, so the player comes back to it rather than to a
 * battle that ran on (or jumps on) without them.
 */
function awayPause(): void {
  if (world && save && !village.open && !world.over && !adOpen) hud.openPause();
}
window.addEventListener('blur', awayPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    awayPause();
    perf.flush();
  }
});

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
    if (!village.open && !adOpen) world.reverse();
  },
});

const guide = new Guide({
  world: () => world,
  save: () => save,
  screen: () => (!world || !save || adOpen || hostPaused || userPaused ? null : village.open ? 'village' : world.over ? (hud.resultUp ? 'result' : null) : 'battle'),
  villageTab: () => village.current,
  hudButton: (name) => hud.button(name),
  toScreen: (x, y, z) => toScreen(stage, x, y, z),
  board: () => stage.board?.area ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight },
  setText: (text, title) => hud.setHint(text, title ?? null),
  persist: () => persist(),
  funnel,
});

const fx = units.fx;
const rig = new TankRig(stage, fx);

/** The guide held the bugs last frame, and the run whose banner already said they walk on. */
let held = false;
let wentOn: World | null = null;
/** Hold the bugs while the guide waits (§12.2); when they walk on, once a run, the banner says so. */
function holdBugs(): void {
  const on = guide.holding();
  if (held && !on && !world.over && wentOn !== world) {
    wentOn = world;
    hud.flash(t('flash.go'));
  }
  held = on;
  world.holdAt = on ? GUIDE_NEAR : null;
}
const threats = new Threats(document.body, document.getElementById('hud'));

function drainEvents(): void {
  for (const ev of world.events) {
    sound.play(ev);
    if (ev.t === 'buy') {
      guide.done('buy');
      if (ev.stat === 'multi') guide.done('multi');
      analytics.once('first_buy', { t: Math.round(world.time), stat: ev.stat });
      funnel.step('first_buy', { stat: ev.stat });
    } else if (ev.t === 'reverse') {
      guide.done('reverse');
      analytics.once('first_reverse', { t: Math.round(world.time) });
      funnel.step('first_reverse');
    } else if (ev.t === 'cast') {
      guide.done('cast');
      funnel.step('first_cast', { hero: world.heroKind });
    }
    if (ev.t === 'over' || ev.t === 'win') {
      endAt = performance.now();
      endSkip = false;
    }
    if (ev.t === 'over') funnel.step('first_death', { wave: world.wave, run_t: Math.round(world.time) });
    else if (ev.t === 'happen') analytics.track('happening_shown', { kind: ev.kind, wave: world.wave });
    else if (ev.t === 'grab') {
      analytics.track('happening_grabbed', { kind: ev.kind, wave: world.wave });
      funnel.step('first_grab', { kind: ev.kind });
      guide.done(ev.kind === 'basket' ? 'basket' : 'goldbug');
    }
    else if (ev.t === 'escape') analytics.track('happening_missed', { kind: ev.kind, wave: world.wave });
    if (ev.t === 'wave' && (ev.wave === 3 || ev.wave === 5 || ev.wave === 10)) funnel.step(`wave_${ev.wave}`, { run_t: Math.round(world.time) });
    else if (ev.t === 'wave' && ev.wave > 1) analytics.track('wave_cleared', { wave: ev.wave - 1, mode: run.mode });
    // The engine reacts: a jolt per shot, a lurch on reversing, a hop for a buy or the skill.
    if (ev.t === 'fire' && ev.kind === 'hero') {
      rig.shot(ev.x, ev.z, ev.tx, ev.tz, clock);
    }
    if ((ev.t === 'fire' && ev.kind === 'hero') || ev.t === 'reverse' || ev.t === 'buy' || ev.t === 'cast' || ev.t === 'over' || ev.t === 'revive') kickTrain(stage, ev.t, clock);
    showEvent(ev, stage, fx, hud, world);
  }
  world.events.length = 0;
}

let clock = 0;

/** Per-frame view state that is not an event: the train, fence damage, hero pose, skill effects. */
function ambient(dt: number, alpha: number): void {
  clock += dt;
  rig.train(world, alpha, clock);
  // The reach ring tells a range change in a run; over the village it only crossed the route.
  if (village.open) stage.reach.visible = false;
  rig.fence(world);
  groundSurge(!village.open && !world.over && world.hero.buffT > 0);
  groundCalm(village.open);
  animateStage(stage, clock);
  ambience.update(dt, clock, world, quality.level);
  holdRing(stage, world.holdAt !== null && !world.over, WALL + GUIDE_NEAR, dt, clock);
  shakeCamera(stage, dt);
  rig.hero(world, clock, dt);
}

function drawHud(dt: number): void {
  if (world.over) {
    // Once booked the save has the stars and the run count, so the price would change: show what was paid.
    const c = run.booked ? run.earned : runCrystals(save, world.wave, run.mode, world.stars());
    hud.setResult({
      crystals: run.doubled ? c * 2 : c,
      doubled: run.doubled,
      canRevive: platform.rewardedSupported() && !world.revived && !world.won && !run.booked,
      canDouble: platform.rewardedSupported() && !run.doubled && !run.booked,
      claim: hasClaim(save) || hasAchievement(save),
      busy: adOpen,
      level: world.level !== null,
      won: world.won,
      hasNext: nextLevel(save) < LEVELS.length,
    });
  }
  hud.update(world, dt);
}

let acc = 0;
let last = performance.now();
function frame(now: number): void {
  if (unsized()) return void ((last = now), platform.gameplayStop(), requestAnimationFrame(frame));
  quality.sample(now - last);
  const dt = Math.min(0.1, (now - last) / 1000);
  const prev = last;
  last = now;
  const paused = village.open || adOpen || hostPaused || userPaused;
  if (paused || world.over) platform.gameplayStop();
  else platform.gameplayStart();
  perf.frame(now - prev, !paused && !world.over && !document.hidden);
  sound.hold(adOpen || hostPaused);
  funnel.tick(dt, !paused && !world.over, { wave: world.wave });
  // No slow-down: the guide's two first steps hold the bugs outside the fence instead (§12.2).
  holdBugs();
  if (!paused) acc += dt * speed;
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
  requestAnimationFrame(frame);
}

// A run ended but the player closes the tab on the result card: still pay it out.
window.addEventListener('pagehide', () => {
  if (world && !world.over && !village.open) funnel.quit({ wave: world.wave, runTime: world.time });
  if (world) book();
});
canvas.addEventListener('pointerdown', () => funnel.step('first_tap'));

// The board is whatever the HUD leaves free (in landscape, while the village is up, the room above its
// navigation row); refit the camera to it when the window turns or the village opens and closes.
function fitBoard(): void {
  const area = village.area();
  stage.board = area ? { area, avoid: [] } : hud.board();
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
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => funnel.input(), true);

// The shaders compile while the save and the language are read; the fight starts when all are in.
const bootAt = performance.now();
mark('build');
const warmed = units.warm(stage.warm, stage.render).then(() => {
  stage.render();
  mark('warm');
  funnel.step('first_frame');
});

/**
 * Switch the language: fetch its table, relabel the screens, and keep the pick when the player
 * made it. A failed fetch (offline) keeps the language on screen.
 */
async function useLocale(locale: Locale, picked: boolean): Promise<void> {
  if (!(await loadLocale(locale))) return;
  setLocale(locale);
  document.documentElement.lang = locale;
  document.title = t('title');
  hud.relabel();
  if (village.open) village.render();
  if (picked) {
    void platform.storage.set('lang', locale);
    analytics.track('language', { locale });
  }
}

getPlatform().then(async (p) => {
  platform = p;
  analytics = new Analytics(p);
  funnel.connect((e, d) => analytics.track(e, d));
  // Everything the game keeps, in one read (Bridge storage required step).
  await p.storage.preload(['save', 'lang', ...SOUND_KEYS]);
  save = await loadSave(p.storage);
  await loadSoundPrefs(sound, p.storage);
  hud.setSound(soundSwitches(sound));
  sound.setHostAudio(p.audioEnabled());
  p.onAudio((on) => sound.setHostAudio(on));
  // Language: ?lang=, then the player's own pick, then the platform's (on Playgama that is
  // Bridge's platform.language only; the stub gives the browser's).
  const asked = params.get('lang') ?? (await p.storage.get('lang'));
  await useLocale(isLocale(asked) ? asked : detectLocale([p.language()]), false);
  // A first-timer goes straight into level 1-1 (§12); a returning player lands in the village.
  mark('save');
  world = newWorld(run.mode);
  p.onPause((v) => (hostPaused = v));
  if (save.runs > 0) openVillage();
  await warmed;
  requestAnimationFrame((now) => {
    frame(now);
    hideLoading();
    p.gameReady();
    analytics.track('load', { ms: Math.round(performance.now() - bootAt), page: Math.round(performance.now()), platform: p.id, runs: save.runs, best: save.best, ...bootTimes() });
  });
  analytics.startHeartbeat(() => ({ q: quality.level, fps: Math.round(quality.fps) }));
});

// Dev handle (view/dev.ts): advance(sec) steps the sim and draws one frame, for a hidden tab where rAF sleeps.
if (import.meta.env.DEV) {
  devHandle({
    world: () => world,
    // The guide steps with the sim, so its waits and holds play out as in a real run.
    step: () => {
      holdBugs();
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
    },
    expose: { stage, units, quality, save: () => save, village, guide },
  });
}
