import type { TrackData } from './types';

/** Active play per sample (Playgama's performance_sample contract: about every 30 s). */
export const PERF_WINDOW_MS = 30_000;
/** A partial window shorter than this is dropped on a flush rather than sent: too few frames to mean much. */
export const PERF_MIN_MS = 10_000;
const OVER = [50, 100, 250, 500, 1000] as const;

/**
 * Playgama's `performance_sample`: frame times of active, visible play only, aggregated per ~30 s
 * window (docs/platform.md). Fed once a frame with that frame's length and whether the battle was
 * running; a frame counts only when this one and the one before were active, so the gap after a
 * pause, a menu, an ad or a hidden tab is never taken for a frozen frame.
 */
export class PerfSampler {
  private times: number[] = [];
  private active = 0;
  private startedAt = -1;
  private wasActive = false;
  /** Per-window counters the page bumps (errors, lost WebGL contexts, long tasks). */
  readonly counts = { js_error_count: 0, unhandled_rejection_count: 0, webgl_context_loss_count: 0, long_task_count: 0, long_task_total_ms: 0, long_task_max_ms: 0 };

  constructor(
    private readonly send: (data: TrackData) => void,
    private readonly version: string,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** One frame: its length in ms and whether play was active and visible through it. */
  frame(ms: number, active: boolean): void {
    if (active && this.wasActive) {
      if (this.startedAt < 0) this.startedAt = this.now() - ms;
      this.times.push(ms);
      this.active += ms;
      if (this.active >= PERF_WINDOW_MS) this.flush(0);
    }
    this.wasActive = active;
  }

  /** A long task the page saw during play (PerformanceObserver 'longtask'). */
  longTask(ms: number): void {
    if (!this.wasActive) return;
    this.counts.long_task_count++;
    this.counts.long_task_total_ms += ms;
    this.counts.long_task_max_ms = Math.max(this.counts.long_task_max_ms, ms);
  }

  /** Sends the window so far if it holds at least `min` ms of play (run end, tab hidden), and starts a new one. */
  flush(min = PERF_MIN_MS): void {
    if (this.times.length && this.active >= min) this.send(this.sample());
    if (this.active >= min || !this.times.length) this.reset();
  }

  private sample(): TrackData {
    const s = [...this.times].sort((a, b) => a - b);
    const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const data: TrackData = {
      target_fps: 60,
      window_ms: Math.round(this.now() - this.startedAt),
      active_ms: Math.round(this.active),
      frame_count: s.length,
      fps_avg: r1((s.length / this.active) * 1000),
      fps_p10: r1(1000 / at(0.9)),
      frame_time_p50_ms: r1(at(0.5)),
      frame_time_p95_ms: r1(at(0.95)),
      frame_time_p99_ms: r1(at(0.99)),
      frame_time_max_ms: r1(s[s.length - 1]),
      build_version: this.version,
    };
    for (const o of OVER) data[`frames_over_${o}ms`] = s.filter((t) => t > o).length;
    for (const [k, v] of Object.entries(this.counts)) data[k] = Math.round(v);
    return data;
  }

  private reset(): void {
    this.times = [];
    this.active = 0;
    this.startedAt = -1;
    for (const k of Object.keys(this.counts) as (keyof typeof this.counts)[]) this.counts[k] = 0;
  }
}
