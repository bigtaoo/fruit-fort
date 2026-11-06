import { describe, expect, it } from 'vitest';
import { PERF_WINDOW_MS, PerfSampler } from './perf';
import type { TrackData } from './types';

function setup() {
  let t = 0;
  const sent: TrackData[] = [];
  const perf = new PerfSampler((d) => sent.push(d), '1.2.3', () => t);
  const run = (n: number, ms: number, active = true) => {
    for (let i = 0; i < n; i++) {
      t += ms;
      perf.frame(ms, active);
    }
  };
  return { perf, sent, run };
}

describe('PerfSampler', () => {
  it('sends one sample per 30 s of active play', () => {
    const { sent, run } = setup();
    run(1, 16, true); // the first active frame only arms the sampler
    run(1700, 16);
    expect(sent).toHaveLength(0);
    run(200, 16);
    expect(sent).toHaveLength(1);
    const s = sent[0];
    expect(s.frame_count).toBe(Math.ceil(PERF_WINDOW_MS / 16));
    expect(s.fps_avg).toBe(62.5);
    expect(s.frame_time_p50_ms).toBe(16);
    expect(s.frames_over_50ms).toBe(0);
    expect(s.build_version).toBe('1.2.3');
    expect(s.target_fps).toBe(60);
  });

  it('never counts the gap after a pause or hidden time', () => {
    const { perf, sent, run } = setup();
    run(1, 16);
    run(600, 16);
    run(1, 16, false);
    run(1, 5000, true); // the frame that resumes play spans the pause
    run(600, 16);
    perf.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].frame_time_max_ms).toBe(16);
    expect(sent[0].frame_count).toBe(1200);
  });

  it('counts hitches and the slow tail', () => {
    const { perf, sent, run } = setup();
    run(1, 16);
    run(800, 16);
    run(90, 33);
    run(5, 120);
    run(1, 600);
    perf.flush();
    const s = sent[0];
    expect(s.frames_over_50ms).toBe(6);
    expect(s.frames_over_100ms).toBe(6);
    expect(s.frames_over_500ms).toBe(1);
    expect(s.frame_time_max_ms).toBe(600);
    expect(s.frame_time_p95_ms).toBe(33);
    expect(s.fps_p10).toBe(30.3);
  });

  it('keeps a short window for later rather than sending it', () => {
    const { perf, sent, run } = setup();
    run(1, 16);
    run(300, 16);
    perf.flush();
    expect(sent).toHaveLength(0);
    run(400, 16);
    perf.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].frame_count).toBe(700);
  });

  it('counts long tasks and errors per window', () => {
    const { perf, sent, run } = setup();
    run(1, 16);
    perf.longTask(80);
    perf.longTask(120);
    perf.counts.js_error_count++;
    run(1000, 16);
    perf.flush();
    run(1000, 16);
    perf.flush();
    expect(sent[0]).toMatchObject({ long_task_count: 2, long_task_total_ms: 200, long_task_max_ms: 120, js_error_count: 1 });
    expect(sent[1]).toMatchObject({ long_task_count: 0, js_error_count: 0 });
  });
  it('sends where the game stood, and where it stood at the longest task', () => {
    const { perf, sent, run } = setup();
    let wave = 3;
    perf.context = () => ({ mode: 'endless', wave });
    run(2, 16);
    perf.longTask(80);
    wave = 7;
    perf.longTask(400);
    wave = 9;
    perf.longTask(60);
    run(1900, 16);
    expect(sent[0]).toMatchObject({ mode: 'endless', wave: 9, long_task_wave: 7, long_task_max_ms: 400 });
    run(1900, 16);
    expect(sent[1].long_task_wave).toBeUndefined();
  });
});
