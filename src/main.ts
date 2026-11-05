// Boot: build the stage, load the platform and the save, run the sim at a fixed 30 Hz and render
// with interpolation. Between runs the village screen (§11) is up and the sim is paused.
// URL options: ?seed=123  ?hero=farmer|beekeeper|chef (override the save)
//              ?lang=de (one of i18n's LOCALES; overrides the saved pick and the browser's language)
//              ?quality=high|mid|low (pin the picture level; otherwise it drops by itself on slow devices)
//              The dev server pins high, so the art is judged at full quality; ?quality=auto there
//              brings back the automatic drop.

import { DT, ENEMIES, HEROES, TRAIN, WALL } from './sim/config';
import { trainRange } from './sim/combat';
import { World } from './sim/world';
import type { HeroKind } from './sim/types';
import { animateStage, chuffs, createStage, heroPortrait, kickTrain, paintFence, placeTrain, setHero, shakeCamera, shotCurve, toScreen } from './view/scene';
import { chimney, showEvent, SKILL_GLOW, trainAt } from './view/juice';
import { Guide } from './view/guide';
import { holdRing } from './view/holdring';
import { animateHero } from './view/models';
import { Units } from './view/units';
import { Hud } from './view/hud';
import { Input } from './view/input';
import { Sound } from './view/audio';
import { Village, type VillageTab } from './view/village';
import { Quality } from './view/quality';
import { Ambience } from './view/ambience';
import { Threats } from './view/threats';
import { Analytics, getPlatform, type Platform, type RewardedPlacement } from './platform';
import { Funnel, funnelReport } from './platform/funnel';
import { canDouble, finishRun, hasClaim, nextLevel, rollDaily, useDouble, runCrystals, worldOptions, type RunMode, type Save } from './meta/progress';
import { LEVELS } from './sim/levels';
import { loadSave, writeSave } from './meta/store';
import { detectLocale, isLocale, loadLocale, setLocale, setOverlay, t, type Locale } from './i18n';
import { SCIFI_COPY } from './i18n/scifi';
import { hasAchievement } from './meta/achievements';
import { hideLoading } from './loading';

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
/** The run on screen: a level, endless or the daily challenge; whether it was booked into the save
 * and what it paid; its ad rewards. */
let run: { mode: RunMode; booked: boolean; earned: number; doubled: boolean } = { mode: 0, booked: false, earned: 0, doubled: false };
/** An ad is open (ours, or the host paused us): the sim and the sound wait. */
let adOpen = false;
let hostPaused = false;
/** The player opened the pause menu: the sim waits, the sound plays on. */
let userPaused = false;
const sound = new Sound();
const MUTE_KEY = 'mute';
/** How close to the fence (world units) bugs come while the guide holds them (§12.2). */
const GUIDE_NEAR = 3;
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
  odo = 0;
  lastAngle = null;
  village.hide();
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
    if (!canDouble(save)) return;
    if ((await rewarded('double')) && !run.booked) {
      run.doubled = true;
      useDouble(save);
      persist();
    }
  },
  mute: () => toggleMute(),
});

/** The player's mute, kept in the platform's storage (key 'mute'). */
function toggleMute(): void {
  const muted = sound.toggleMute();
  hud.setMuted(muted);
  void platform.storage.set(MUTE_KEY, muted ? '1' : '0');
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
  onMute: () => toggleMute(),
  muted: () => sound.muted,
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
  screen: () => (!world || !save || adOpen || hostPaused || userPaused ? null : village.open ? 'village' : world.over ? 'result' : 'battle'),
  villageTab: () => village.current,
  hudButton: (name) => hud.button(name),
  toScreen: (x, y, z) => toScreen(stage, x, y, z),
  board: () => stage.board?.area ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight },
  setText: (text, title) => hud.setHint(text, title ?? null),
  persist: () => persist(),
  funnel,
});

const fx = units.fx;

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
    } else if (ev.t === 'over') funnel.step('first_death', { wave: world.wave, run_t: Math.round(world.time) });
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
      aim = Math.atan2(ev.tx - ev.x, ev.tz - ev.z);
      // A shot during the last one rises from the pose it is in (shotCurve's rise is linear), not from rest.
      shotAt = clock - 0.12 * SHOT_TIME * shotCurve((clock - shotAt) / SHOT_TIME);
    }
    if ((ev.t === 'fire' && ev.kind === 'hero') || ev.t === 'reverse' || ev.t === 'buy' || ev.t === 'cast' || ev.t === 'over' || ev.t === 'revive') kickTrain(stage, ev.t, clock);
    showEvent(ev, stage, fx, hud, world);
  }
  world.events.length = 0;
}

let clock = 0;
/** Wheel turns so far, from the distance driven. */
let odo = 0;
let lastAngle: number | null = null;
/** The hero's last shot: the world yaw towards its target and when, on the view clock. */
let aim = 0;
let shotAt = -99;
/** The hero's yaw on its seat, turning towards the target while it shoots and back ahead after. */
let facing = 0;
/** How far the hero's arms are raised to aim (0..1), eased in while it shoots and down after. */
let aimed = 0;
/** How long a shot rocks the hero (shotCurve), and how long after the last it keeps facing that way. */
const SHOT_TIME = 0.22;
const AIM_HOLD = 1.4;

/** Per-frame view state that is not an event: the train, fence damage, hero pose, skill effects. */
function ambient(dt: number, alpha: number): void {
  clock += dt;
  const tr = world.train;
  const angle = tr.prev + (tr.angle - tr.prev) * alpha;
  const lastOdo = odo;
  if (lastAngle !== null) odo += (Math.abs(angle - lastAngle) * TRAIN.radius) / 0.17;
  lastAngle = angle;
  placeTrain(stage, angle, tr.dir, trainRange(world), odo, clock);
  // The reach ring tells a range change in a run; over the village it only crossed the route.
  if (village.open) stage.reach.visible = false;
  // A soft steam puff from the chimney on each chuff (twice a wheel turn, ~3 a second at base
  // speed) that swells as it rises; capped so a long frame doesn't dump a cloud.
  const beats = world.over ? 0 : Math.min(2, chuffs(lastOdo, odo));
  for (let i = 0; i < beats; i++) {
    const c = chimney(stage);
    fx.puff(c.x, 1.3, c.z, 0xf2f4f8, { size: 0.36, grow: 2.6, life: 1.1, rise: 1.4, opacity: 1 });
  }
  const at = trainAt(stage);
  // A mended post: gold sparkles and white glints rise from it, wood chips hop off.
  // The bugs at the fence (combat.ts: d <= 0) eat it where they stand, each at its own rate.
  const biters = world.enemies.filter((e) => e.d <= 0).map((e) => ({ x: e.x, z: e.z, rate: ENEMIES[e.kind].wallDps }));
  for (const m of paintFence(stage, world.wallHp / world.wallMax, biters)) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      fx.emit(m.x + Math.cos(a) * 0.3, 0.3 + Math.random() * 0.6, m.z + Math.sin(a) * 0.3, 0, 1.4 + Math.random(), 0, i % 2 ? 0xffffff : 0xffe066, 0.07, 0.7, 0, false);
      fx.emit(m.x, 0.5, m.z, Math.cos(a) * 1.6, 2 + Math.random() * 1.5, Math.sin(a) * 1.6, 0xd9a05b, 0.06, 0.5, 9);
    }
  }
  animateStage(stage, clock);
  ambience.update(dt, clock, world, quality.level);
  holdRing(stage, world.holdAt !== null && !world.over, WALL + GUIDE_NEAR, dt, clock);
  shakeCamera(stage, dt);
  const hero = stage.hero.children[0];
  const casting = world.hero.buffT > 0;
  if (hero) {
    // Turn to face the target (quickly, by the short way round), and ahead again once it stops shooting.
    const want = clock - shotAt < AIM_HOLD ? aim - stage.train.rotation.y : 0;
    const turn = Math.atan2(Math.sin(want - facing), Math.cos(want - facing));
    const f = facing + turn * (1 - Math.exp(-dt * 18));
    facing = Math.atan2(Math.sin(f), Math.cos(f));
    stage.hero.rotation.y = facing;
    aimed += ((clock - shotAt < AIM_HOLD ? 1 : 0) - aimed) * (1 - Math.exp(-dt * 14));
    animateHero(hero, clock, casting, shotCurve((clock - shotAt) / SHOT_TIME), aimed);
  }
  // Marine's overdrive: violet and white energy motes spiral up round the tank.
  if (casting && world.heroKind === 'farmer' && Math.random() < dt * 30) {
    const a = clock * 5 + Math.random() * 6;
    fx.emit(at.x + Math.cos(a) * 0.7, 0.6, at.z + Math.sin(a) * 0.7, -Math.sin(a) * 1.2, 2.4 + Math.random(), Math.cos(a) * 1.2, Math.random() < 0.6 ? SKILL_GLOW.farmer : 0xffffff, 0.06, 0.6, 0, false);
  }
  // Sparks crackle round the Engineer while its zap is out.
  if (casting && world.heroKind === 'beekeeper' && Math.random() < dt * 20) {
    const a = clock * 6 + Math.random() * 6;
    fx.emit(at.x + Math.cos(a) * 0.8, 1.5 + Math.random() * 0.4, at.z + Math.sin(a) * 0.8, -Math.sin(a) * 3, 0, Math.cos(a) * 3, 0x6fe8ff, 0.06, 0.3, 0, false);
  }
  // A full charge sparkles above the hero until the player casts.
  if (world.heroReady() && Math.random() < dt * 8) {
    fx.emit(at.x + (Math.random() - 0.5), 1.9, at.z + (Math.random() - 0.5), 0, 1.2, 0, 0x7ff0ff, 0.07, 0.7, 0, false);
  }
}

function drawHud(dt: number): void {
  if (world.over) {
    // Once booked the save has the stars and the run count, so the price would change: show what was paid.
    const c = run.booked ? run.earned : runCrystals(save, world.wave, run.mode, world.stars());
    hud.setResult({
      crystals: run.doubled ? c * 2 : c,
      doubled: run.doubled,
      canRevive: platform.rewardedSupported() && !world.revived && !world.won && !run.booked,
      canDouble: platform.rewardedSupported() && !run.doubled && !run.booked && canDouble(save),
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
  quality.sample(now - last);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const paused = village.open || adOpen || hostPaused || userPaused;
  if (paused || world.over) platform.gameplayStop();
  else platform.gameplayStart();
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
  units.sync(world, acc / DT, dt);
  ambient(dt, acc / DT);
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

// The board is whatever the HUD leaves free; refit the camera to it when the window turns.
const fitBoard = () => {
  stage.board = hud.board();
  stage.resize();
};
window.addEventListener('resize', fitBoard);
hud.onLayout(fitBoard);
fitBoard();
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => funnel.input(), true);

// The empty fort shows at once; the fight starts when the platform and the save are in.
const bootAt = performance.now();
units.warm(stage.warm, stage.render);
stage.render();
funnel.step('first_frame');

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
  await p.storage.preload(['save', 'lang', MUTE_KEY]);
  save = await loadSave(p.storage);
  sound.setMuted((await p.storage.get(MUTE_KEY)) === '1');
  hud.setMuted(sound.muted);
  sound.setHostAudio(p.audioEnabled());
  p.onAudio((on) => sound.setHostAudio(on));
  // Language: ?lang=, then the player's own pick, then the platform's (on Playgama that is
  // Bridge's platform.language only; the stub gives the browser's).
  const asked = params.get('lang') ?? (await p.storage.get('lang'));
  await useLocale(isLocale(asked) ? asked : detectLocale([p.language()]), false);
  // A first-timer goes straight into level 1-1 (§12); a returning player lands in the village.
  world = newWorld(run.mode);
  p.onPause((v) => (hostPaused = v));
  if (save.runs > 0) openVillage();
  requestAnimationFrame((now) => {
    frame(now);
    hideLoading();
    p.gameReady();
    analytics.track('load', { ms: Math.round(performance.now() - bootAt), page: Math.round(performance.now()), platform: p.id, runs: save.runs, best: save.best });
  });
  analytics.startHeartbeat(() => ({ q: quality.level, fps: Math.round(quality.fps) }));
});

// Dev handle: advance(sec) steps the sim and draws one frame, for a hidden tab where rAF sleeps.
if (import.meta.env.DEV) {
  const advance = (sec: number) => {
    // The guide steps with the sim, so its waits and holds play out as in a real run.
    for (let i = 0; i < Math.round(sec / DT); i++) {
      holdBugs();
      world.step();
      drainEvents();
      guide.update(DT);
    }
    drainEvents();
    units.sync(world, 1, 0.05);
    ambient(0.05, 1);
    threats.update(world.enemies, stage.camera, stage.board, 1, world.over || village.open);
    guide.update(0.05);
    drawHud(0.05);
    stage.render();
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
  /** The first-minute funnel from `window.__track` (stub platform), as a console table. */
  const funnelLog = () => {
    const rows = funnelReport(window.__track ?? []);
    console.table(rows);
    return rows;
  };
  Object.assign(window, { game: { world: () => world, stage, units, quality, advance, bot, save: () => save, village, guide, funnel: funnelLog } });
}
