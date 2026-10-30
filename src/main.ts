// Boot: build the stage, load the platform and the save, run the sim at a fixed 30 Hz and render
// with interpolation. Between runs the village screen (§11) is up and the sim is paused.
// URL options: ?seed=123  ?hero=farmer|beekeeper|chef (override the save)
//              ?lang=de (one of i18n's LOCALES; overrides the saved pick and the browser's language)
//              ?quality=high|mid|low (pin the picture level; otherwise it drops by itself on slow devices)
//              The dev server pins high, so the art is judged at full quality; ?quality=auto there
//              brings back the automatic drop.

import { DT, ENEMIES, HEROES, TRAIN } from './sim/config';
import { trainRange } from './sim/combat';
import { World } from './sim/world';
import type { HeroKind } from './sim/types';
import { animateStage, chuffs, createStage, kickTrain, paintFence, placeTrain, setHero, shakeCamera } from './view/scene';
import { animateHero } from './view/models';
import { loadMeshes } from './view/meshes';
import { Units } from './view/units';
import { Hud } from './view/hud';
import { Input } from './view/input';
import { Sound } from './view/audio';
import { Village, type VillageTab } from './view/village';
import { Quality } from './view/quality';
import { Analytics, InterstitialPolicy, getPlatform, type Platform, type RewardedPlacement } from './platform';
import { Funnel, funnelReport, type HintId } from './platform/funnel';
import { canDouble, finishRun, hasClaim, nextLevel, rollDaily, useDouble, runCrystals, worldOptions, type RunMode, type Save } from './meta/progress';
import { LEVELS } from './sim/levels';
import { loadSave, writeSave } from './meta/store';
import { detectLocale, isLocale, loadLocale, setLocale, t, type Locale } from './i18n';
import { hasAchievement } from './meta/achievements';

const params = new URLSearchParams(location.search);
const heroParam = params.get('hero') as HeroKind | null;
let seed = Number(params.get('seed')) || (Date.now() % 100000);

const canvas = document.getElementById('game') as HTMLCanvasElement;
// The modelled characters are in before anything builds them; a failed file falls back to primitives.
await loadMeshes();
const stage = createStage(canvas);
const units = new Units(stage.scene, stage.camera);
units.onBite = (x, z) => stage.fence.bite(Math.atan2(z, x));
const pin = params.get('quality') ?? (import.meta.env.DEV ? 'high' : null);
const quality = new Quality(stage, units.fx, pin === 'auto' ? null : pin);
let platform!: Platform;
let analytics!: Analytics;
let save!: Save;
let world!: World;
let speed = 1;
const ads = new InterstitialPolicy();
/** The run on screen: a level, endless or the daily challenge; whether it was booked into the save
 * and what it paid; its ad rewards. */
let run: { mode: RunMode; booked: boolean; earned: number; doubled: boolean } = { mode: 0, booked: false, earned: 0, doubled: false };
/** An ad is open (ours, or the host paused us): the sim and the sound wait. */
let adOpen = false;
let hostPaused = false;
const sound = new Sound();
/** First-minute guide (§12), kept across restarts: once learned, never shown again this session. */
const guide = { bought: false, reversed: false, cast: false };
const GUIDE_SLOW = 0.2;
/** How close to the fence (world units) a bug comes before the pre-buy slow-down starts. */
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
  world = newWorld(mode);
  run = { mode, booked: false, earned: 0, doubled: false };
  lastWall = world.wallHp;
  odo = 0;
  lastAngle = null;
  village.hide();
  ads.runStarted();
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
  ads.runEnded();
  analytics.track('run_end', { wave: world.wave, hero: world.heroKind, kills: world.kills, time: Math.round(world.time), revived: world.revived, doubled: run.doubled, mode: run.mode, stars: world.stars(), crystals: earned * (run.doubled ? 2 : 1) });
}

/** Leave the result card: book the run, maybe an interstitial (§14 rules), then the next screen. */
async function leave(next: () => void): Promise<void> {
  // A double click lands twice before the card hides: the second must not start another run.
  if (adOpen || !world.over) return;
  book();
  if (ads.canShow()) {
    adOpen = true;
    await platform.showInterstitial();
    ads.adShown();
    adOpen = false;
  }
  next();
}

async function rewarded(placement: RewardedPlacement): Promise<boolean> {
  if (adOpen) return false;
  adOpen = true;
  const ok = await platform.showRewarded(placement);
  adOpen = false;
  ads.adShown();
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
  restart: () => void leave(() => startRun(run.mode)),
  village: () => void leave(() => openVillage()),
  // A won level goes on to the first one not cleared (the one after, unless an earlier one is still open).
  next: () => void leave(() => (nextLevel(save) < LEVELS.length ? startRun(nextLevel(save)) : openVillage())),
  train: () => void leave(() => openVillage('train')),
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
  mute: () => hud.setMuted(sound.toggleMute()),
});
hud.setMuted(sound.muted);

const village = new Village(() => save, {
  onChange: () => {
    if (save.crystals < villageCrystals) funnel.step('first_purchase', { spent: villageCrystals - save.crystals });
    villageCrystals = save.crystals;
    persist();
  },
  onPlay: (mode) => startRun(mode),
  onClick: (ok) => sound.click(ok),
  onLanguage: (l) => void useLocale(l, true),
});

new Input(canvas, {
  world: () => world,
  onReverse: () => {
    if (!village.open && !adOpen) world.reverse();
  },
});

const fx = units.fx;
/** Where the train is drawn this frame (the hero rides it). */
const trainAt = () => stage.train.position;
/** The chimney top, for steam. */
function chimney(): { x: number; z: number } {
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
  hero: [0xfff1a8, 0xffffff],
};

function drainEvents(): void {
  for (const ev of world.events) {
    sound.play(ev);
    if (ev.t === 'buy') {
      guide.bought = true;
      analytics.once('first_buy', { t: Math.round(world.time), stat: ev.stat });
      funnel.step('first_buy', { stat: ev.stat });
    } else if (ev.t === 'reverse') {
      guide.reversed = true;
      analytics.once('first_reverse', { t: Math.round(world.time) });
      funnel.step('first_reverse');
    } else if (ev.t === 'cast') {
      guide.cast = true;
      funnel.step('first_cast', { hero: world.heroKind });
    } else if (ev.t === 'over') funnel.step('first_death', { wave: world.wave, run_t: Math.round(world.time) });
    else if (ev.t === 'happen') analytics.track('happening_shown', { kind: ev.kind, wave: world.wave });
    else if (ev.t === 'grab') {
      analytics.track('happening_grabbed', { kind: ev.kind, wave: world.wave });
      funnel.step('first_grab', { kind: ev.kind });
    }
    else if (ev.t === 'escape') analytics.track('happening_missed', { kind: ev.kind, wave: world.wave });
    if (ev.t === 'wave' && (ev.wave === 3 || ev.wave === 5 || ev.wave === 10)) funnel.step(`wave_${ev.wave}`, { run_t: Math.round(world.time) });
    else if (ev.t === 'wave' && ev.wave > 1) analytics.track('wave_cleared', { wave: ev.wave - 1, mode: run.mode });
    // The engine reacts: a jolt per shot, a lurch on reversing, a hop for a buy or the skill.
    if ((ev.t === 'fire' && ev.kind === 'hero') || ev.t === 'reverse' || ev.t === 'buy' || ev.t === 'cast' || ev.t === 'over' || ev.t === 'revive') kickTrain(stage, ev.t, clock);
    switch (ev.t) {
      case 'happen': hud.flash(t(`flash.${ev.kind}`)); break;
      case 'buy': {
        const p = trainAt();
        fx.ring(p.x, p.z, 1.2, 0xffe066, 0.4);
        fx.burst(p.x, p.z, 0xffe066, { count: 10, speed: 2, up: 4, size: 0.07, alt: 0xffffff, y: 1 });
        break;
      }
      case 'reverse': {
        const c = chimney();
        fx.burst(c.x, c.z, 0xffffff, { count: 8, speed: 1.2, up: 2.5, size: 0.12, y: 1.2, life: 0.6 });
        break;
      }
      case 'grab': {
        fx.ring(ev.x, ev.z, 1.4, 0xffe066, 0.5);
        fx.burst(ev.x, ev.z, 0xffd84a, { count: 20, speed: 3, up: 5, size: 0.09, alt: 0xffffff, y: 0.5 });
        if (ev.gold > 0) fx.text(ev.x, 2, ev.z, `+${ev.gold}`);
        if (ev.stat) hud.flash(t('flash.stat', { name: t(`stat.${ev.stat}.name`) }));
        break;
      }
      case 'fire':
        // Muzzle flash: a quick pale pop and a few sparks.
        fx.emit(ev.x, 1.3, ev.z, 0, 0, 0, 0xfff6c8, 0.24, 0.09, 0);
        fx.burst(ev.x, ev.z, 0xfff1a8, { count: 5, speed: 1.6, up: 1.5, size: 0.07, y: 1.3, life: 0.25 });
        break;
      case 'hit': {
        const [c, alt] = HIT_COLORS[ev.kind];
        if (ev.crit) {
          fx.ring(ev.x, ev.z, 0.8, 0xffe066, 0.3);
          fx.burst(ev.x, ev.z, 0xffe066, { count: 10, speed: 2.5, up: 3, size: 0.08, alt: 0xffffff, life: 0.45 });
        } else fx.burst(ev.x, ev.z, c, { count: 4, speed: 1.8, up: 2.5, size: 0.06, alt, life: 0.45 });
        break;
      }
      case 'kill': {
        const color = ENEMIES[ev.kind].color;
        fx.burst(ev.x, ev.z, color, { count: ev.kind === 'boss' ? 60 : 14, speed: ev.kind === 'boss' ? 5 : 2.5, up: 4, size: ev.kind === 'boss' ? 0.16 : 0.09, alt: 0x9ad07e, life: 0.7 });
        fx.text(ev.x, 1.8, ev.z, `+${ev.gold}`);
        if (ev.kind === 'boss') stage.shake = 0.5;
        break;
      }
      case 'trick':
        fx.ring(ev.x, ev.z, 1.6, ENEMIES.locust.color, 0.6);
        fx.burst(ev.x, ev.z, ENEMIES.locust.color, { count: 14, speed: 3, up: 3 });
        break;
      case 'cast': {
        hud.flash(t(`hero.${world.heroKind}.cast`));
        const p = trainAt();
        fx.ring(p.x, p.z, 4, HEROES[world.heroKind].color, 0.6);
        break;
      }
      case 'bite': {
        const p = trainAt();
        fx.stream(p.x, 1.4, p.z, ev.x, 0.5, ev.z, 0x6fe8ff, 3, 0.3, 0.06);
        fx.burst(ev.x, ev.z, 0x6fe8ff, { count: 5, speed: 1.5, up: 2, size: 0.05, alt: 0xffffff });
        break;
      }
      case 'juice': {
        const p = trainAt();
        fx.ring(p.x, p.z, 1.6, 0x5cbf5a, 0.5);
        fx.ring(0, 0, 14, 0x5cbf5a, 0.7);
        for (const e of world.enemies) fx.burst(e.x, e.z, 0x7fe07a, { count: 6, speed: 2, up: 3, size: 0.09, alt: 0xffffff });
        stage.shake = 0.35;
        break;
      }
      case 'wave':
        hud.flash(t(ev.boss ? 'flash.boss' : 'flash.wave', { n: ev.wave }));
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
  world.events.length = 0;
}

const CONFETTI = [0xffd84a, 0xff6fae, 0x7fc8ff, 0x7fe07a];
let lastWall = 0;
let clock = 0;
/** Wheel turns so far, from the distance driven. */
let odo = 0;
let lastAngle: number | null = null;

/** Per-frame view state that is not an event: the train, fence damage, hero pose, skill effects. */
function ambient(dt: number, alpha: number): void {
  clock += dt;
  const tr = world.train;
  const angle = tr.prev + (tr.angle - tr.prev) * alpha;
  const lastOdo = odo;
  if (lastAngle !== null) odo += (Math.abs(angle - lastAngle) * TRAIN.radius) / 0.17;
  lastAngle = angle;
  placeTrain(stage, angle, tr.dir, trainRange(world), odo, clock);
  // Steam puffs from the chimney on each chuff (twice a wheel turn, ~3 a second at base speed), two
  // at a time to keep the plume as thick as it was; capped so a long frame doesn't dump a cloud.
  const beats = world.over ? 0 : Math.min(2, chuffs(lastOdo, odo));
  for (let i = 0; i < beats * 2; i++) {
    const c = chimney();
    fx.emit(c.x, 1.2, c.z, (Math.random() - 0.5) * 0.4, 1.2 + i * 0.25, (Math.random() - 0.5) * 0.4, 0xf4f4f4, 0.12, 0.8, -0.5, false);
  }
  const at = trainAt();
  if (world.wallHp < lastWall - 0.5) stage.shake = Math.max(stage.shake, 0.04);
  lastWall = world.wallHp;
  paintFence(stage, world.wallHp / world.wallMax);
  animateStage(stage, clock);
  shakeCamera(stage, dt);
  const hero = stage.hero.children[0];
  const casting = world.hero.buffT > 0;
  if (hero) animateHero(hero, clock, casting);
  // Tin soldier's bugle: confetti falling on the train while the skill runs.
  if (casting && world.heroKind === 'farmer' && Math.random() < dt * 30) {
    fx.emit(at.x + (Math.random() - 0.5) * 1.4, 3, at.z + (Math.random() - 0.5) * 1.4, 0, -4, 0, CONFETTI[Math.floor(Math.random() * CONFETTI.length)], 0.07, 0.6, 6);
  }
  // Sparks crackle round the robot while its zap is out.
  if (casting && world.heroKind === 'beekeeper' && Math.random() < dt * 20) {
    const a = clock * 6 + Math.random() * 6;
    fx.emit(at.x + Math.cos(a) * 0.8, 1.5 + Math.random() * 0.4, at.z + Math.sin(a) * 0.8, -Math.sin(a) * 3, 0, Math.cos(a) * 3, 0x6fe8ff, 0.06, 0.3, 0, false);
  }
  // A full charge sparkles above the hero until the player casts.
  if (world.heroReady() && Math.random() < dt * 8) {
    fx.emit(at.x + (Math.random() - 0.5), 1.9, at.z + (Math.random() - 0.5), 0, 1.2, 0, 0xfff27a, 0.07, 0.7, 0, false);
  }
}

/** The guide line's hint for now (same id for text and funnel): buy, then turn, then cast. */
function guideHint(): HintId | null {
  if (world.over || village.open) return null;
  if (!guide.bought) return 'buy';
  // Turning round only makes sense once something is coming.
  if (!guide.reversed && world.enemies.length > 0 && world.time > 6) return 'reverse';
  if (!guide.cast && world.heroReady()) return 'cast';
  return null;
}

/** One line of guidance above the buttons. No popups, input never blocked. */
function guideStep(): void {
  const id = guideHint();
  hud.setHint(id ? t(`guide.${id}`) : null);
  funnel.hint(id);
  if (guide.bought) funnel.hintDone('buy');
  if (guide.reversed) funnel.hintDone('reverse');
  if (guide.cast) funnel.hintDone('cast');
}

function drawHud(dt: number): void {
  if (world.over) {
    // Once booked the save has the stars and the run count, so the price would change: show what was paid.
    const c = run.booked ? run.earned : runCrystals(save, world.wave, run.mode, world.stars());
    hud.setResult({
      crystals: run.doubled ? c * 2 : c,
      doubled: run.doubled,
      canRevive: !world.revived && !world.won && !run.booked,
      canDouble: !run.doubled && !run.booked && canDouble(save),
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
  const paused = village.open || adOpen || hostPaused;
  if (paused || world.over) platform.gameplayStop();
  else platform.gameplayStart();
  sound.hold(adOpen || hostPaused);
  // Until the first buy the fight runs at 0.2x once a bug nears the fence, so the player can look
  // around; the walk in before that runs at full speed (§12).
  funnel.tick(dt, !paused && !world.over, { wave: world.wave });
  const slow = !guide.bought && world.enemies.some((e) => e.d < GUIDE_NEAR);
  if (!paused) acc += dt * speed * (slow ? GUIDE_SLOW : 1);
  while (acc >= DT) {
    world.step();
    acc -= DT;
  }
  drainEvents();
  units.sync(world, acc / DT, dt);
  ambient(dt, acc / DT);
  guideStep();
  if (world.enemies.some((e) => e.d === 0)) sound.chew();
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
  save = await loadSave(p.storage);
  // Language: ?lang=, then the player's own pick, then the portal's and the browser's.
  const asked = params.get('lang') ?? (await p.storage.get('lang'));
  await useLocale(isLocale(asked) ? asked : detectLocale([p.language(), ...navigator.languages]), false);
  // A first-timer goes straight into level 1-1 (§12); a returning player lands in the village.
  world = newWorld(run.mode);
  lastWall = world.wallHp;
  p.onPause((v) => (hostPaused = v));
  if (save.runs > 0) openVillage();
  else ads.runStarted();
  requestAnimationFrame(frame);
  p.gameReady();
  analytics.track('load', { ms: Math.round(performance.now() - bootAt), platform: p.id, runs: save.runs, best: save.best });
  analytics.startHeartbeat();
});

// Dev handle: advance(sec) steps the sim and draws one frame, for a hidden tab where rAF sleeps.
if (import.meta.env.DEV) {
  const advance = (sec: number) => {
    for (let i = 0; i < Math.round(sec / DT); i++) world.step();
    drainEvents();
    units.sync(world, 1, 0.05);
    ambient(0.05, 1);
    guideStep();
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
  Object.assign(window, { game: { world: () => world, stage, quality, advance, bot, save: () => save, village, funnel: funnelLog } });
}
