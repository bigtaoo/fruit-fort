// Boot: build the stage, load the platform and the save, run the sim at a fixed 30 Hz and render
// with interpolation. Between runs the village screen (§11) is up and the sim is paused.
// URL options: ?seed=123  ?deck=strawberry,lemon,grape  ?hero=farmer|beekeeper|chef (override the save)
//              ?lang=de (one of i18n's LOCALES; overrides the saved pick and the browser's language)
//              ?quality=high|mid|low (pin the picture level; otherwise it drops by itself on slow devices)

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
import { Village } from './view/village';
import { Quality } from './view/quality';
import { Analytics, InterstitialPolicy, getPlatform, type Platform, type RewardedPlacement } from './platform';
import { Funnel, funnelReport, type HintId } from './platform/funnel';
import { canDouble, finishRun, hasClaim, rollDaily, useDouble, runCrystals, worldOptions, type Save } from './meta/progress';
import { loadSave, writeSave } from './meta/store';
import { detectLocale, isLocale, loadLocale, setLocale, t, type Locale } from './i18n';

const params = new URLSearchParams(location.search);
const deckParam = params.get('deck')?.split(',').filter((k): k is FruitKind => k in FRUITS);
const heroParam = params.get('hero') as HeroKind | null;
let seed = Number(params.get('seed')) || (Date.now() % 100000);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const stage = createStage(canvas);
const units = new Units(stage.scene, stage.camera);
const quality = new Quality(stage, units.fx, params.get('quality'));
let platform!: Platform;
let analytics!: Analytics;
let save!: Save;
let world!: World;
let speed = 1;
const ads = new InterstitialPolicy();
/** The run on screen: a daily challenge or not, whether it was booked into the save, and its ad rewards. */
let run = { challenge: false, booked: false, doubled: false };
/** An ad is open (ours, or the host paused us): the sim and the sound wait. */
let adOpen = false;
let hostPaused = false;
const sound = new Sound();
/** First-minute guide (§12), kept across restarts: once learned, never shown again this session. */
const guide = { summoned: false, merged: false, cast: false };
const GUIDE_SLOW = 0.2;
/** First-minute funnel, idle and quit telemetry (docs/platform.md). */
const funnel = new Funnel();
/** Crystals when the village last saw them: a drop in `onChange` is a purchase. */
let villageCrystals = 0;

function newWorld(challenge: boolean): World {
  const o = worldOptions(save, challenge);
  const w = new World({
    ...o,
    seed: o.seed ?? seed,
    deck: deckParam && deckParam.length === 3 ? deckParam : o.deck,
    hero: heroParam && heroParam in HEROES ? heroParam : o.hero,
  });
  setHero(stage, w.heroKind);
  return w;
}

function persist(): void {
  writeSave(platform.storage, save);
}

function startRun(challenge: boolean): void {
  if (rollDaily(save)) persist();
  seed++;
  units.reset();
  world = newWorld(challenge);
  run = { challenge, booked: false, doubled: false };
  lastWall = world.wallHp;
  village.hide();
  ads.runStarted();
  analytics.track('run_start', { challenge, hero: world.heroKind, runs: save.runs });
}

/** Put the finished run into the save: crystals (twice if doubled), records, task progress. */
function book(): void {
  if (!world.over || run.booked) return;
  run.booked = true;
  const earned = finishRun(save, { wave: world.wave, kills: world.kills, merges: world.merges, casts: world.casts, summons: world.summons }, run.challenge);
  if (run.doubled) save.crystals += earned;
  persist();
  ads.runEnded();
  analytics.track('run_end', { wave: world.wave, hero: world.heroKind, kills: world.kills, time: Math.round(world.time), revived: world.revived, doubled: run.doubled, challenge: run.challenge, crystals: earned * (run.doubled ? 2 : 1) });
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

function openVillage(): void {
  // The page may have stayed open past midnight: today's reward, tasks and challenge.
  if (rollDaily(save)) persist();
  funnel.step('village_open', { runs: save.runs });
  villageCrystals = save.crystals;
  village.show(hasClaim(save) ? 'daily' : undefined);
}

const hud = new Hud(document.getElementById('hud')!, {
  summon: () => world.summon(),
  upgrade: () => world.upgrade(),
  choose: (i) => world.choose(i),
  cast: () => world.cast(),
  speed: () => hud.setSpeed((speed = speed === 1 ? 2 : 1)),
  restart: () => void leave(() => startRun(run.challenge)),
  village: () => void leave(openVillage),
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
  onPlay: (challenge) => startRun(challenge),
  onClick: (ok) => sound.click(ok),
  onLanguage: (l) => void useLocale(l, true),
});

const input = new Input(canvas, stage.camera, units, hud, {
  world: () => world,
  onDrop: (from, to) => world.drop(from, to),
  onSell: (cell) => world.sell(cell),
  onCast: () => world.cast(),
}, stage.tiles);

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
    if (ev.t === 'summon') {
      guide.summoned = true;
      analytics.once('first_summon', { t: Math.round(world.time) });
      funnel.step('first_summon');
    } else if (ev.t === 'merge') {
      guide.merged = true;
      analytics.once('first_merge', { t: Math.round(world.time), time_to_first_merge: Math.round(performance.now() / 100) / 10 });
      funnel.step('first_merge');
    } else if (ev.t === 'cast') {
      guide.cast = true;
      funnel.step('first_cast', { hero: world.heroKind });
    } else if (ev.t === 'card') funnel.step('first_card', { id: ev.id });
    else if (ev.t === 'over') funnel.step('first_death', { wave: world.wave, run_t: Math.round(world.time) });
    if (ev.t === 'wave' && (ev.wave === 3 || ev.wave === 5 || ev.wave === 10)) funnel.step(`wave_${ev.wave}`, { run_t: Math.round(world.time) });
    else if (ev.t === 'wave' && ev.wave > 1) analytics.track('wave_cleared', { wave: ev.wave - 1, challenge: run.challenge });
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
        hud.flash(t(`hero.${world.heroKind}.cast`));
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
        hud.flash(t(ev.boss ? 'flash.boss' : 'flash.wave', { n: ev.wave }));
        if (ev.boss) stage.shake = 0.3;
        break;
      case 'unlock':
        hud.flash(t('flash.unlock'));
        fx.ring(cellX(ev.cell), cellZ(ev.cell), 1.6, 0xffffff, 0.6);
        fx.burst(cellX(ev.cell), cellZ(ev.cell), 0xc9a56a, { count: 20, speed: 2.5, up: 3, alt: 0x5aae44 });
        break;
      case 'card': if (ev.id === 'summonLevel') hud.flash(t('flash.summonLevel', { n: world.summonLevel })); break;
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

let lastWall = 0;
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
  if (world.over || village.open) {
    // Nothing.
  } else if (!guide.summoned) {
    text = t('guide.summon');
  } else if (!guide.merged) {
    const pair = mergePair();
    if (pair.length && input.targets.size === 0) {
      text = t('guide.merge');
      for (const c of pair) lit.add(c);
    } else if (!pair.length && world.canSummon()) {
      text = t('guide.more');
    }
  } else if (!guide.cast && world.heroReady()) {
    text = t(world.heroKind === 'chef' && world.emptyCells().length === 0 ? 'guide.chefFull' : 'guide.cast');
  }
  hud.setHint(text);
  trackGuide();
  return lit;
}

/** The guide hint guideStep shows (same branches), as a funnel id, and which hint goals are met. */
function trackGuide(): void {
  let id: HintId | null = null;
  if (world.over) {
    // Nothing.
  } else if (!guide.summoned) id = 'summon';
  else if (!guide.merged) {
    const pair = mergePair().length > 0;
    if (pair) funnel.hintDone('summon_more');
    if (pair && input.targets.size === 0) id = 'merge';
    else if (!pair && world.canSummon()) id = 'summon_more';
  } else if (!guide.cast && world.heroReady()) id = 'cast';
  funnel.hint(id);
  if (guide.summoned) funnel.hintDone('summon');
  if (guide.merged) {
    funnel.hintDone('merge');
    funnel.hintDone('summon_more');
  }
  if (guide.cast) funnel.hintDone('cast');
}

function drawHud(dt: number): void {
  if (world.over) {
    const c = runCrystals(save, world.wave);
    hud.setResult({
      crystals: run.doubled ? c * 2 : c,
      doubled: run.doubled,
      canRevive: !world.revived && !run.booked,
      canDouble: !run.doubled && !run.booked && canDouble(save),
      claim: hasClaim(save),
      busy: adOpen,
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
  // Until the first summon the fight runs at 0.2x, so the player can look around (§12).
  funnel.tick(dt, !paused && !world.over, { wave: world.wave });
  if (!paused) acc += dt * speed * (guide.summoned ? 1 : GUIDE_SLOW);
  while (acc >= DT) {
    world.step();
    acc -= DT;
  }
  drainEvents();
  units.sync(world, acc / DT, dt);
  ambient(dt);
  paintTiles(stage, world.unlocked, guideStep(), input.hover);
  if (world.enemies.some((e) => e.d === 0)) sound.chew();
  sound.tickMusic(world.wave >= 10, world.over || village.open);
  drawHud(dt);
  stage.renderer.render(stage.scene, stage.camera);
  requestAnimationFrame(frame);
}

// A run ended but the player closes the tab on the result card: still pay it out.
window.addEventListener('pagehide', () => {
  if (world && !world.over && !village.open) funnel.quit({ wave: world.wave, runTime: world.time });
  if (world) book();
});
canvas.addEventListener('pointerdown', () => funnel.step('first_tap'));
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => funnel.input(), true);

// The empty fort shows at once; the fight starts when the platform and the save are in.
const bootAt = performance.now();
stage.renderer.render(stage.scene, stage.camera);
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
  world = newWorld(false);
  lastWall = world.wallHp;
  p.onPause((v) => (hostPaused = v));
  // A first-timer goes straight into the fight (§12); a returning player lands in the village.
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
    input.targets.clear();
    drainEvents();
    units.sync(world, 1, 0.05);
    ambient(0.05);
    paintTiles(stage, world.unlocked, guideStep());
    drawHud(0.05);
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
  /** The first-minute funnel from `window.__track` (stub platform), as a console table. */
  const funnelLog = () => {
    const rows = funnelReport(window.__track ?? []);
    console.table(rows);
    return rows;
  };
  Object.assign(window, { game: { world: () => world, stage, quality, advance, bot, save: () => save, village, funnel: funnelLog } });
}
