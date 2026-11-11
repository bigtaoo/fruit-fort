import type { TrackData } from './types';

/** No input for this long while a run is live counts as idle (one `idle` event per stretch). */
export const IDLE_S = 15;
/** Idle stretches reported per session at most, so an AFK tab cannot flood the log. */
export const IDLE_MAX = 5;
/** Leaves reported per session at most (`quit_*`): a tab flipped back and forth cannot flood the log. */
export const QUIT_MAX = 5;
/** A frame gap longer than this (hidden tab, debugger) is not counted as idle time. */
const MAX_TICK_S = 0.25;
/** A frame gap longer than this (hidden tab, a debugger) is left out of the fps a leave reports. */
const MAX_FRAME_S = 1;

/**
 * The first-minute funnel in the order a new player should pass it. The first one not reached yet is
 * the `stuck` step reported with `idle` and `quit`.
 */
export const FUNNEL_STEPS = [
  'first_frame', 'first_tap', 'first_buy', 'first_reverse', 'first_cast', 'first_grab', 'wave_3', 'wave_5', 'wave_10',
] as const;
/** Steps outside the main path: they can come in any order, or never. */
export type SideStep = 'first_death' | 'village_open' | 'first_purchase' | 'first_offer';
export type FunnelStep = (typeof FUNNEL_STEPS)[number] | SideStep;
/**
 * How a guide step's hand went away (§12.8): the player did it, pressed something else, it stopped applying
 * (or timed out), or a higher step took the hand.
 */
export type GuideResult = 'done' | 'skipped' | 'left' | 'replaced';

/** Where the player was when the page went away: in a fight, on the result card, in the village, in an ad. */
export type LeaveAt = 'run' | 'over' | 'village' | 'ad';

type Sink = (event: string, data: TrackData) => void;

/**
 * First-minute telemetry (event list: docs/platform.md). Every step goes out once per session as
 * `funnel_<step> {s}` with `s` = seconds since page load; guide steps as `guide_<id>_shown {s, run, wait}`
 * and `guide_<id>_done|skipped|left {s}`;
 * plus `idle_<stuck>` and `quit_<stuck>`. The step is in the event id because Playgama's analytics
 * counts ids and may drop the data. Pure bookkeeping: the caller owns the clock and the sink, and
 * events before `connect` are queued (the first frame comes before the platform).
 */
export class Funnel {
  private readonly reached = new Set<string>();
  /** Guide events already sent (`<id>_<what>`): each once per session. */
  private readonly guideSent = new Set<string>();
  private queue: [string, TrackData][] = [];
  private sink: Sink | null = null;
  private idleFor = 0;
  private idleSent = 0;
  private idleOpen = false;
  private hintNow: string | null = null;
  private quits = 0;
  /** A leave was sent and no frame has run since (the hidden event and the pagehide after it are one leave). */
  private gone = false;
  /** Frames and their seconds since the first frame, read on the clock (not the game's capped dt). */
  private frames = 0;
  private frameS = 0;
  private lastFrame: number | null = null;
  /** Clock time of the last input (null before any). */
  private lastInput: number | null = null;

  constructor(private readonly now: () => number = () => performance.now() / 1000) {}

  connect(sink: Sink): void {
    this.sink = sink;
    for (const [e, d] of this.queue) sink(e, d);
    this.queue = [];
  }

  /** Seconds since load, one decimal. */
  private s(): number {
    return Math.round(this.now() * 10) / 10;
  }

  private emit(event: string, data: TrackData): void {
    if (this.sink) this.sink(event, data);
    else this.queue.push([event, data]);
  }

  has(step: FunnelStep): boolean {
    return this.reached.has(step);
  }

  /** Records `step` the first time; later calls are ignored. */
  step(step: FunnelStep, data?: TrackData): void {
    if (this.reached.has(step)) return;
    this.reached.add(step);
    this.emit(`funnel_${step}`, { s: this.s(), ...data });
  }

  /** The first main-path step not reached yet ('done' past wave 10). */
  stuck(): string {
    return FUNNEL_STEPS.find((s) => !this.reached.has(s)) ?? 'done';
  }

  /** A guide hand came up; `wait` is the seconds from the step becoming possible. */
  guideShown(id: string, data: { run: number; wait: number }): void {
    this.hintNow = id;
    this.guideOnce(id, 'shown', data);
  }

  /** The hand went away. */
  guideEnd(id: string, result: GuideResult): void {
    if (this.hintNow === id) this.hintNow = null;
    this.guideOnce(id, result);
  }

  private guideOnce(id: string, what: string, data?: TrackData): void {
    const key = `${id}_${what}`;
    if (this.guideSent.has(key)) return;
    this.guideSent.add(key);
    this.emit(`guide_${key}`, { s: this.s(), ...data });
  }

  /**
   * Any pointer or key input, anywhere on the page: ends an idle stretch, and once the game shows, the first
   * one is `first_tap` (before 0.0.19 only a press on the canvas counted, so a player who went straight for a
   * stat card read as never having tapped).
   */
  input(): void {
    if (this.reached.has('first_frame')) this.step('first_tap');
    this.lastInput = this.now();
    this.idleFor = 0;
    this.idleOpen = false;
  }

  /**
   * Per frame. `live` is true while a run is playable (not over, no village, no ad, not paused);
   * idle time only counts then. Sends `idle` when it reaches IDLE_S without input.
   */
  tick(dt: number, live: boolean, ctx: { wave: number }): void {
    this.gone = false;
    this.countFrame();
    if (!live) return;
    this.idleFor += Math.min(dt, MAX_TICK_S);
    if (this.idleOpen || this.idleFor < IDLE_S || this.idleSent >= IDLE_MAX) return;
    this.idleOpen = true;
    this.idleSent++;
    this.emit(`idle_${this.stuck()}`, this.context(ctx.wave));
  }

  /** Counts a shown frame on the funnel's clock, from the first frame on. */
  private countFrame(): void {
    if (!this.reached.has('first_frame')) return;
    const t = this.now();
    const gap = this.lastFrame === null ? null : t - this.lastFrame;
    this.lastFrame = t;
    if (gap === null || gap > MAX_FRAME_S) return;
    this.frames++;
    this.frameS += gap;
  }

  /** Average fps since the first frame, one decimal; null before any frame was timed. */
  fps(): number | null {
    return this.frameS > 0 ? Math.round((this.frames / this.frameS) * 10) / 10 : null;
  }

  /**
   * The page goes hidden or closes, once the game shows: when (`s`) and where (`at`, the wave, the run's
   * time), on every leave up to QUIT_MAX (`n` counts them), so a session's last `quit_*` is where it ended.
   * Also how smooth it ran: `fps` since the first frame and the quality level `q` (from 0.0.19, since the
   * fps samples come every 30 s and a player who left sooner had none). Before 0.0.19 it went out once,
   * and only mid-fight. From 0.0.21 also what the screen showed (`scene`, from main.ts: fence %, bugs, gold,
   * a card in reach, kills, buys) and `quiet`, the seconds since the last input (or since load, if none), so
   * a leave reads as overrun, bored or lost instead of only where it happened.
   */
  quit(ctx: { at: LeaveAt; wave: number; runTime: number; q: number; scene?: TrackData }): void {
    if (this.gone || this.quits >= QUIT_MAX || !this.reached.has('first_frame')) return;
    this.gone = true;
    this.quits++;
    const fps = this.fps();
    this.emit(`quit_${this.stuck()}`, {
      ...this.context(ctx.wave), at: ctx.at, run_t: Math.round(ctx.runTime), n: this.quits, q: ctx.q, ...(fps === null ? {} : { fps }),
      quiet: Math.round(this.now() - (this.lastInput ?? 0)), ...ctx.scene,
    });
  }

  private context(wave: number): TrackData {
    const d: TrackData = { s: this.s(), wave, stuck: this.stuck() };
    if (this.hintNow) d.hint = this.hintNow;
    return d;
  }
}

export interface FunnelRow {
  s: number;
  /** Seconds since the previous row. */
  dt: number;
  event: string;
  /** The event's other data, `k=v` pairs. */
  extra: string;
}

const FUNNEL_EVENT = /^(load|first_buy|run_start|run_end|funnel_|guide_|idle_|quit_)/;

/** The funnel as rows, in order, from the stub's `window.__track` log (dev helper `game.funnel()`). */
export function funnelReport(log: { event: string; data?: TrackData; at: number }[]): FunnelRow[] {
  const rows: FunnelRow[] = [];
  let prev = 0;
  for (const r of log) {
    if (!FUNNEL_EVENT.test(r.event)) continue;
    const { s: logged, ...rest } = r.data ?? {};
    const s = typeof logged === 'number' ? logged : Math.round(r.at / 100) / 10;
    const extra = Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(' ');
    rows.push({ s, dt: Math.round((s - prev) * 10) / 10, event: r.event, extra });
    prev = s;
  }
  return rows;
}
