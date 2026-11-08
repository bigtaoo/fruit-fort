import { describe, expect, it } from 'vitest';
import { Funnel, IDLE_MAX, IDLE_S, QUIT_MAX, funnelReport } from './funnel';
import type { TrackData } from './types';

function setup() {
  let t = 0;
  const sent: { event: string; data: TrackData }[] = [];
  const funnel = new Funnel(() => t);
  funnel.connect((event, data) => sent.push({ event, data }));
  return { funnel, sent, at: (s: number) => (t = s) };
}

const idleFor = (f: Funnel, sec: number) => {
  for (let i = 0; i < sec * 4; i++) f.tick(0.25, true, { wave: 2 });
};

describe('Funnel', () => {
  it('sends each step once with seconds since load', () => {
    const { funnel, sent, at } = setup();
    at(1.234);
    funnel.step('first_frame');
    at(4);
    funnel.step('first_frame');
    funnel.step('first_tap', { cell: 4 });
    expect(sent).toEqual([
      { event: 'funnel_first_frame', data: { s: 1.2 } },
      { event: 'funnel_first_tap', data: { s: 4, cell: 4 } },
    ]);
  });

  it('queues events until connected', () => {
    const f = new Funnel(() => 0.5);
    f.step('first_frame');
    const sent: string[] = [];
    f.connect((e) => sent.push(e));
    f.step('first_tap');
    expect(sent).toEqual(['funnel_first_frame', 'funnel_first_tap']);
  });

  it('reports the first unreached main step as stuck', () => {
    const { funnel } = setup();
    expect(funnel.stuck()).toBe('first_frame');
    funnel.step('first_frame');
    funnel.step('first_tap');
    funnel.step('first_reverse');
    funnel.step('village_open');
    expect(funnel.stuck()).toBe('first_buy');
  });

  it('sends each guide step event once, with the wait on shown', () => {
    const { funnel, sent } = setup();
    funnel.guideShown('buy', { run: 0, wait: 0.6 });
    funnel.guideEnd('buy', 'left');
    funnel.guideShown('buy', { run: 0, wait: 0.6 });
    funnel.guideEnd('buy', 'done');
    funnel.guideEnd('buy', 'done');
    expect(sent.map((e) => e.event)).toEqual(['guide_buy_shown', 'guide_buy_left', 'guide_buy_done']);
    expect(sent[0].data).toMatchObject({ run: 0, wait: 0.6 });
  });

  it('sends idle after 15 s without input during a run, once per stretch', () => {
    const { funnel, sent } = setup();
    funnel.step('first_frame');
    funnel.guideShown('buy', { run: 0, wait: 0.6 });
    sent.length = 0;
    idleFor(funnel, IDLE_S - 1);
    expect(sent).toEqual([]);
    idleFor(funnel, 10);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ event: 'idle_first_tap', data: { wave: 2, stuck: 'first_tap', hint: 'buy' } });
    funnel.input();
    idleFor(funnel, IDLE_S);
    expect(sent.filter((e) => e.event.startsWith('idle_'))).toHaveLength(2);
  });

  it('counts any input as the first tap, once the game shows', () => {
    const { funnel, sent, at } = setup();
    funnel.input();
    expect(funnel.has('first_tap')).toBe(false);
    at(3);
    funnel.step('first_frame');
    at(7.5);
    funnel.input();
    funnel.input();
    expect(sent.filter((e) => e.event === 'funnel_first_tap')).toEqual([{ event: 'funnel_first_tap', data: { s: 7.5 } }]);
  });

  it('does not count paused time or long frame gaps as idle', () => {
    const { funnel, sent } = setup();
    for (let i = 0; i < 100; i++) funnel.tick(1, false, { wave: 1 });
    funnel.tick(60, true, { wave: 1 });
    expect(sent).toEqual([]);
  });

  it('caps idle reports per session', () => {
    const { funnel, sent } = setup();
    for (let i = 0; i < IDLE_MAX + 3; i++) {
      idleFor(funnel, IDLE_S);
      funnel.input();
    }
    expect(sent.filter((e) => e.event.startsWith('idle_'))).toHaveLength(IDLE_MAX);
  });

  it('sends quit on each leave with where, when and how many', () => {
    const { funnel, sent, at } = setup();
    funnel.quit({ at: 'run', wave: 1, runTime: 0, q: 0 });
    funnel.step('first_frame');
    at(42);
    funnel.quit({ at: 'run', wave: 3, runTime: 30.6, q: 0 });
    // The pagehide after the hidden event, with no frame between: the same leave.
    funnel.quit({ at: 'run', wave: 3, runTime: 31, q: 0 });
    funnel.tick(0.016, false, { wave: 3 });
    at(80);
    funnel.quit({ at: 'village', wave: 3, runTime: 31, q: 2 });
    expect(sent.filter((e) => e.event.startsWith('quit_'))).toEqual([
      { event: 'quit_first_tap', data: { s: 42, wave: 3, stuck: 'first_tap', at: 'run', run_t: 31, n: 1, q: 0 } },
      { event: 'quit_first_tap', data: { s: 80, wave: 3, stuck: 'first_tap', at: 'village', run_t: 31, n: 2, q: 2 } },
    ]);
  });

  it('says on a leave how smooth it ran since the first frame, on the clock, without hidden-tab gaps', () => {
    const { funnel, sent, at } = setup();
    // Frames before the game shows don't count.
    for (let i = 0; i < 5; i++) (at(i * 0.01), funnel.tick(0.01, true, { wave: 0 }));
    at(1);
    funnel.step('first_frame');
    expect(funnel.fps()).toBeNull();
    // 3 fps: 300 ms frames, though the game's own dt is capped at 0.1.
    for (let i = 0; i <= 9; i++) (at(1 + i / 3), funnel.tick(0.1, true, { wave: 1 }));
    // A 20 s hidden-tab gap, then 4 frames of 100 ms: the gap is left out.
    for (let i = 0; i <= 4; i++) (at(24 + i / 10), funnel.tick(0.1, true, { wave: 1 }));
    funnel.quit({ at: 'run', wave: 1, runTime: 5, q: 5 });
    // 13 frames over 3.4 s.
    expect(sent.find((e) => e.event.startsWith('quit_'))?.data).toMatchObject({ q: 5, fps: 3.8 });
  });

  it('caps quit reports per session', () => {
    const { funnel, sent } = setup();
    funnel.step('first_frame');
    for (let i = 0; i < QUIT_MAX + 3; i++) {
      funnel.quit({ at: 'over', wave: 2, runTime: 10, q: 0 });
      funnel.tick(0.016, false, { wave: 2 });
    }
    expect(sent.filter((e) => e.event.startsWith('quit_'))).toHaveLength(QUIT_MAX);
  });
});

describe('funnelReport', () => {
  it('lists funnel rows in order with gaps and extras', () => {
    const rows = funnelReport([
      { event: 'load', data: { ms: 300 }, at: 800 },
      { event: 'funnel_first_frame', data: { s: 0.5 }, at: 500 },
      { event: 'session_time', data: { s: 30 }, at: 30_000 },
      { event: 'guide_buy_shown', data: { s: 1 }, at: 1000 },
      { event: 'idle_first_tap', data: { s: 16, wave: 1, stuck: 'first_tap' }, at: 16_000 },
    ]);
    expect(rows).toEqual([
      { s: 0.8, dt: 0.8, event: 'load', extra: 'ms=300' },
      { s: 0.5, dt: -0.3, event: 'funnel_first_frame', extra: '' },
      { s: 1, dt: 0.5, event: 'guide_buy_shown', extra: '' },
      { s: 16, dt: 15, event: 'idle_first_tap', extra: 'wave=1 stuck=first_tap' },
    ]);
  });
});
