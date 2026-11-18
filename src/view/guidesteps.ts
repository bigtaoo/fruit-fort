// The guide's step table (§12): what each step teaches, on which screen, when it is possible and
// where the hand points, in priority order, with the timings the steps are built from. Split from guide.ts.

import { STAT_KEYS } from '../sim/config';
import { LEVELS } from '../sim/levels';
import type { World } from '../sim/world';
import type { StatKey } from '../sim/types';
import { ALL_HEROES, type Save } from '../meta/progress';
import { endlessOpen, nextLevel } from '../meta/chapter';
import { hasClaim } from '../meta/daily';
import { heroPrice, trainPrice, villagePrice } from '../meta/shop';
import { hasAchievement } from '../meta/achievements';
import type { Funnel } from '../platform/funnel';
import { t } from '../i18n';
import type { Rect } from './frame';
import type { VillageTab } from './village';

export type GuideScreen = 'battle' | 'result' | 'village';

/** Seconds a step must be possible before the hand comes. */
export const SHOW_AFTER = 0.6;
/**
 * Until this many levels are cleared every idle hint comes after 3 s of quiet and keeps coming
 * (§12.6, owner 2026-11-05: before 1-5 is cleared no player waits more than 3 s for the next step).
 */
const EARLY = 5;
/** The quiet before an early idle hint; with SHOW_AFTER the hand is up 3 s after the last tap. */
const IDLE_EARLY = 3 - SHOW_AFTER;
/**
 * Unspent gold in an early fight: when it would buy the cheapest card this many times over, the hand
 * points at that card after RICH_AFTER seconds, taps or not (owner 2026-11-05: in the first five
 * levels a player sitting on gold should be shown where to spend it more often).
 */
const RICH = 2;
const RICH_AFTER = 1.5;
const TAU = Math.PI * 2;
/**
 * Level 1's opening show: the first bugs walk in and die to the tank, coins flying, before the guide holds
 * the rest for the first buy (2026-11-06: half the new players left in the first 10 s without a tap, while
 * the hold kept the field still with one bug in 10 s). The hold starts at this many kills or seconds.
 */
export const SHOW_KILLS = 4;
export const SHOW_TIME = 9;
/**
 * The skill hand stays up this long, then steps aside for COOL seconds (2026-11-06: it outranked the buy
 * hints and never went away for a player who did not cast, so from ~40 s into level 1 nothing pointed at
 * the cards again; most players who left around wave 5 had it up).
 */
export const CAST_TTL = 8;
export const CAST_COOL = 20;
/**
 * The bugs wait this many seconds of fight for the player and then walk on, hand still up
 * (2026-11-14): the hold froze the field for as long as the player did nothing, so a player who did
 * not find the card saw nothing at stake at all — 22% of the players who tapped were gone by 30 s
 * with the fence at 100. The step is not marked done or skipped: the hand stays, only the bugs stop
 * waiting for it. Counted in `holding()` over the seconds the bugs actually stood there, not from
 * the hand: the hand comes before `holdFrom` starts the hold, and a player who keeps tapping never
 * rests long enough to be shown one at all.
 */
export const HOLD_TTL = 12;

/** Where the hand points: a page element, a point in the world, or the board's middle (tap anywhere). */
// The hand only ever points at something a tap acts on: a button, or the board itself ('tap', which
// turns the train round). Nothing on the ground - see the `basket` step.
type Aim = { el: Element | null; last: boolean } | 'tap';

export interface Step {
  id: string;
  screen: GuideScreen;
  /** Bugs wait while this step is possible and not done; it can't be skipped. */
  hold?: boolean;
  /** The hold starts only once this is true (the hand shows before it). */
  holdFrom?(): boolean;
  /** An idle hint: comes after this many seconds without input, is never saved as done. */
  idle?: number;
  /** An idle hint that comes back however often it went unanswered. */
  nag?: boolean;
  /**
   * An idle hint that comes even while the player keeps tapping (turning the tank round), once its
   * `when` has held this many seconds: no quiet and no rest after a tap are needed. A function says
   * so only some of the time (null: wait for the quiet like any other idle hint).
   */
  eager?: number | (() => number | null);
  /** The hand goes away after this many seconds up, unanswered, and the step waits `cool` seconds. */
  ttl?: number;
  cool?: number;
  /** i18n key of the line above the buttons (first five minutes only). */
  text?: Parameters<typeof t>[0];
  when(): boolean;
  aim(): Aim | null;
  /** A click on a button like this teaches the step, hand or not (the player found it alone). */
  learns?(b: HTMLElement): boolean;
}

export interface GuideHost {
  world(): World;
  save(): Save;
  /** The screen up now; null while nothing may be pointed at (loading, an ad, the pause menu). */
  screen(): GuideScreen | null;
  villageTab(): VillageTab;
  /** A HUD button: `stat:<key>`, `skill`, `speed`, `village`, `train`. */
  hudButton(name: string): HTMLElement | null;
  /** A world point on the page, in CSS pixels. */
  toScreen(x: number, y: number, z: number): { x: number; y: number };
  /** The playfield on the page. */
  board(): Rect;
  /** The guide's line; `title` goes above it (the bugs wait, while they do). */
  setText(text: string | null, title?: string | null): void;
  /** The save's guide list changed. */
  persist(): void;
  funnel: Funnel;
}

/** The nearest bug is in the back half of the ring, as seen from the tank's way of travel. */
export function bugBehind(w: World): boolean {
  let near = null;
  for (const e of w.enemies) if (e.hp > 0 && (!near || e.d < near.d)) near = e;
  if (!near) return false;
  const arc = ((((Math.atan2(near.z, near.x) - w.train.angle) * w.train.dir) % TAU) + TAU) % TAU;
  return arc > Math.PI;
}

/** Stats that kill bugs; a hint points at these first, as the cheapest card (gold, move) does not hold the fence. */
const FIGHT: StatKey[] = ['dmg', 'spd', 'crit', 'heavy', 'splash'];

/**
 * The stat to point at: `first` if it can be bought, else the cheapest fighting stat that can, else
 * the cheapest of any. A player who only buys what the hand shows wins level 1 this way (§12.8).
 */
function cheapest(w: World, first?: StatKey): StatKey | null {
  if (first && w.canBuy(first)) return first;
  let best: StatKey | null = null;
  for (const pool of [FIGHT, STAT_KEYS]) {
    for (const k of pool) if (w.canBuy(k) && (!best || w.statCost(k) < w.statCost(best))) best = k;
    if (best) return best;
  }
  return null;
}

/** Gold enough for the cheapest card RICH times over (each buy raises the price, so roughly). */
function rich(w: World): boolean {
  const k = cheapest(w);
  return k !== null && w.gold >= RICH * w.statCost(k);
}

/** The step table, in priority order; exported for the node tests. */
export function guideSteps(h: GuideHost): Step[] {
  const w = () => h.world();
  const s = () => h.save();
  const q = (sel: string) => document.querySelector(`#village ${sel}`);
  /** A village item: its page first when another page is open, then the item. Rewards opens from
   *  home, so from another page the way there is the home tab. */
  const onTab = (tab: VillageTab, sel: string): Aim => (h.villageTab() === tab ? { el: q(sel), last: true } : { el: q(`[data-a=tab][data-v=${tab}]`) ?? q('[data-a=tab][data-v=levels]'), last: false });
  const hud = (name: string): Aim => ({ el: h.hudButton(name), last: true });
  const card = (k: StatKey | null): Aim | null => (k ? hud(`stat:${k}`) : null);
  const data = (a: string, v?: string) => (b: HTMLElement) => b.dataset.a === a && (v === undefined || b.dataset.v === v);
  const happening = (kind: 'bug' | 'basket') => () => w().happenings.now?.kind === kind;
  const can = (p: number | null) => p !== null && s().crystals >= p;
  /** The first EARLY levels are not all cleared yet. */
  const rookie = () => nextLevel(s()) < EARLY;
  /** In a level (not endless or the challenge) while still a rookie. */
  const early = () => w().level !== null && rookie();
  /** Playing one of the SAFE levels (1-1..1-7), even on a replay after they are cleared. */
  const onSafe = () => !!w().level?.safe;
  // There is no start button: a tap on an open route node or Endless plays it (Village.press), so the
  // play steps point at the one lit gold, the level to play next.
  const play = { aim: (): Aim => onTab('levels', '.node.cur, .sbtn.cur'), learns: data('sel') };
  const lockedHero = () => ALL_HEROES.find((k) => !s().heroes[k] && can(heroPrice(s(), k)));
  // Once a bug was behind the tank, turning round stays the step for that run: the tank keeps
  // driving round, and the nearest bug would flick between behind and ahead.
  let turnRun: World | null = null;
  const turnNow = () => {
    if (turnRun !== w() && s().guide.includes('buy') && bugBehind(w())) turnRun = w();
    return turnRun === w();
  };
  return [
    // Level 1 (§12.2): buy, then turn round; the bugs wait for both.
    { id: 'buy', screen: 'battle', hold: true, holdFrom: () => w().kills >= SHOW_KILLS || w().time >= SHOW_TIME, text: 'guide.buy', when: () => cheapest(w(), 'dmg') !== null, aim: () => card(cheapest(w(), 'dmg')) },
    { id: 'reverse', screen: 'battle', hold: true, text: 'guide.reverse', when: turnNow, aim: () => 'tap' },
    // No hand on a pickup (2026-11-15, the owner): the only input in a fight is a tap, and a tap turns
    // the train round, so a hand on the crate taught "tap the thing to take it" - which is false, and
    // drives the train away from a crate that is ahead. A line instead, true whichever way it lies.
    { id: 'basket', screen: 'battle', text: 'guide.grab', when: happening('basket'), aim: () => null },
    { id: 'cast', screen: 'battle', text: 'guide.cast', ttl: CAST_TTL, cool: CAST_COOL, when: () => w().heroReady(), aim: () => hud('skill') },
    // Level 2 (§12.4).
    { id: 'goldbug', screen: 'battle', text: 'guide.grab', when: happening('bug'), aim: () => null },
    { id: 'multi', screen: 'battle', when: () => s().runs >= 1 && w().canBuy('multi'), aim: () => card('multi') },
    // Level 3: the speed button, while nothing is near yet.
    { id: 'speed', screen: 'battle', when: () => s().runs >= 2 && w().time > 2 && w().time < 20 && !w().enemies.some((e) => e.d < 6), aim: () => hud('speed') },
    // The result card: a first win goes to the village (and so to visit ①), a first loss to training.
    { id: 'win', screen: 'result', when: () => w().won, aim: () => hud('village') },
    { id: 'lose', screen: 'result', when: () => !w().won && w().level !== null, aim: () => hud('train') },
    // Visit ① (§12.3).
    { id: 'v_train', screen: 'village', when: () => s().runs >= 1 && can(trainPrice(s(), 'dmg')), aim: () => onTab('train', '[data-a=buyTrain][data-v=dmg]'), learns: data('buyTrain') },
    { id: 'v_daily', screen: 'village', when: () => s().runs >= 1 && !s().daily.claimed, aim: () => onTab('rewards', '[data-a=daily]'), learns: data('daily') },
    { id: 'play1', screen: 'village', when: () => s().runs >= 1, ...play },
    // Visit ② (§12.5).
    { id: 'v_hero', screen: 'village', when: () => s().runs >= 2 && can(heroPrice(s(), s().hero)), aim: () => onTab('hero', `[data-a=buyHero][data-v=${s().hero}]`), learns: data('buyHero') },
    { id: 'v_wall', screen: 'village', when: () => s().runs >= 2 && can(villagePrice(s(), 'wall')), aim: () => onTab('train', '[data-a=buyVillage][data-v=wall]'), learns: data('buyVillage', 'wall') },
    { id: 'v_route', screen: 'village', when: () => s().runs >= 2 && nextLevel(s()) < LEVELS.length, aim: () => onTab('levels', '.node.cur'), learns: data('sel') },
    { id: 'play2', screen: 'village', when: () => s().runs >= 2, ...play },
    // Later (§12.6): each feature once, the first time it can be used.
    { id: 'l_ach', screen: 'village', when: () => hasAchievement(s()), aim: () => onTab('rewards', '[data-a=ach]:not([disabled])'), learns: data('ach') },
    { id: 'l_task', screen: 'village', when: () => s().daily.tasks.some((k) => !k.claimed && k.progress >= k.goal), aim: () => onTab('rewards', '[data-a=task]:not([disabled])'), learns: data('task') },
    { id: 'l_hero', screen: 'village', when: () => !!lockedHero(), aim: () => onTab('hero', `[data-a=buyHero][data-v=${lockedHero()}]`), learns: (b) => data('buyHero')(b) && !!b.dataset.v && !s().heroes[b.dataset.v as never] },
    { id: 'l_pick', screen: 'village', when: () => ALL_HEROES.some((k) => k !== s().hero && s().heroes[k] > 0) && s().hero === 'farmer', aim: () => onTab('hero', '[data-a=hero]:not([disabled])'), learns: data('hero') },
    { id: 'l_piggy', screen: 'village', when: () => can(villagePrice(s(), 'gold')), aim: () => onTab('train', '[data-a=buyVillage][data-v=gold]'), learns: data('buyVillage', 'gold') },
    { id: 'l_endless', screen: 'village', when: () => endlessOpen(s()), aim: () => onTab('levels', '.vside [data-v=endless]'), learns: data('sel', 'endless') },
    { id: 'l_challenge', screen: 'village', when: () => endlessOpen(s()) && s().guide.includes('l_endless'), aim: () => onTab('rewards', '[data-a=play][data-v=challenge]'), learns: data('play', 'challenge') },
    // Idle hints: until 1-5 is cleared a charged skill left unused, gold left unspent, a result card
    // or the village left sitting, after IDLE_EARLY of quiet and however often they went unanswered,
    // so the first fights never sit idle; after that a longer one for gold in a fight, and from the
    // fourth run one in the village.
    // One buy hand, not two (2026-11-14): `idle_rich` and `idle_buy1` pointed at the same card from
    // two rows of the table, so the richer one kept taking the hand off the other - 82 `_replaced`
    // against 72 `_done` in the live data, churn the player sees as a hand that flickers. Now one
    // step, eager (1.5 s, no quiet, no rest) only while the gold is piling up, which is the owner's
    // 2026-11-05 rule, and the normal 3 s of quiet otherwise. It sits below `idle_cast`, which the
    // rich hand used to outrank: that one is up 8 s at a time and then steps aside for 20 (CAST_TTL,
    // CAST_COOL), so the buy hand still has most of the fight, and the skill gets taught at all.
    { id: 'idle_cast', screen: 'battle', idle: IDLE_EARLY, nag: true, ttl: CAST_TTL, cool: CAST_COOL, when: () => early() && s().guide.includes('cast') && w().heroReady(), aim: () => hud('skill') },
    { id: 'idle_buy1', screen: 'battle', idle: IDLE_EARLY, nag: true, eager: () => (rich(w()) ? RICH_AFTER : null), when: () => (early() || onSafe()) && s().guide.includes('buy') && cheapest(w()) !== null, aim: () => card(cheapest(w())) },
    // A gold bug or basket while no card is in reach (2026-11-09): each is taught once, and a player
    // who follows the hand spends down every few seconds, so the onboarding probe sat 4-5 s at level 1's
    // second minute with a gold bug on the track and no hand.
    { id: 'idle_pick', screen: 'battle', idle: IDLE_EARLY, nag: true, text: 'guide.grab', when: () => early() && w().happenings.now !== null, aim: () => null },
    { id: 'idle_buy', screen: 'battle', idle: 10, when: () => !early() && cheapest(w()) !== null, aim: () => card(cheapest(w())) },
    { id: 'idle_next', screen: 'result', idle: IDLE_EARLY, nag: true, when: () => rookie() && w().level !== null, aim: () => hud(w().won ? 'village' : 'train') },
    { id: 'idle_play1', screen: 'village', idle: IDLE_EARLY, nag: true, when: () => rookie() && s().runs >= 1, ...play },
    // Rewards left unclaimed (2026-11-15, the owner's screenshot): `l_ach` and `l_task` teach claiming
    // once and are then never shown again, and `idle_play` steps aside while anything is claimable, so a
    // player sitting on the rewards page with a claim waiting had no hand at all. This takes that place.
    { id: 'idle_claim', screen: 'village', idle: 20, nag: true, when: () => !rookie() && (hasClaim(s()) || hasAchievement(s())), aim: () => onTab('rewards', '.claim') },
    { id: 'idle_play', screen: 'village', idle: 20, when: () => !rookie() && s().runs >= 3 && !hasClaim(s()), ...play },
  ];
}
