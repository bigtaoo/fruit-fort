import type { TrackData } from './types';

/** No input for this long while a run is live counts as idle (one `idle` event per stretch). */
export const IDLE_S = 15;
/** Idle stretches reported per session at most, so an AFK tab cannot flood the log. */
export const IDLE_MAX = 5;
/** A frame gap longer than this (hidden tab, debugger) is not counted as idle time. */
const MAX_TICK_S = 0.25;

/**
 * The first-minute funnel in the order a new player should pass it. The first one not reached yet is
 * the `stuck` step reported with `idle` and `quit`.
 */
export const FUNNEL_STEPS = [
  'first_frame', 'first_tap', 'first_buy', 'first_reverse', 'first_cast', 'first_grab', 'wave_3', 'wave_5', 'wave_10',
] as const;
/** Steps outside the main path: they can come in any order, or never. */
export type SideStep = 'first_death' | 'village_open' | 'first_purchase';
export type FunnelStep = (typeof FUNNEL_STEPS)[number] | SideStep;
/** How a guide step's hand went away (§12.8): the player did it, pressed something else, or it stopped applying. */
export type GuideResult = 'done' | 'skipped' | 'left';

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
  private quitSent = false;

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

  /** Any pointer or key input: ends an idle stretch. */
  input(): void {
    this.idleFor = 0;
    this.idleOpen = false;
  }

  /**
   * Per frame. `live` is true while a run is playable (not over, no village, no ad, not paused);
   * idle time only counts then. Sends `idle` when it reaches IDLE_S without input.
   */
  tick(dt: number, live: boolean, ctx: { wave: number }): void {
    if (!live) return;
    this.idleFor += Math.min(dt, MAX_TICK_S);
    if (this.idleOpen || this.idleFor < IDLE_S || this.idleSent >= IDLE_MAX) return;
    this.idleOpen = true;
    this.idleSent++;
    this.emit(`idle_${this.stuck()}`, this.context(ctx.wave));
  }

  /** The page goes away mid-run (rage-quit signal). Once per session. */
  quit(ctx: { wave: number; runTime: number }): void {
    if (this.quitSent) return;
    this.quitSent = true;
    this.emit(`quit_${this.stuck()}`, { ...this.context(ctx.wave), run_t: Math.round(ctx.runTime) });
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
