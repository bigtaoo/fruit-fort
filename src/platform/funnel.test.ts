import { describe, expect, it } from 'vitest';
import { Funnel, IDLE_MAX, IDLE_S, funnelReport } from './funnel';
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
    funnel.step('first_merge');
    funnel.step('village_open');
    expect(funnel.stuck()).toBe('first_summon');
  });

  it('sends hint shown once and done only after shown', () => {
    const { funnel, sent } = setup();
    funnel.hintDone('merge');
    funnel.hint('summon');
    funnel.hint('summon');
    funnel.hint(null);
    funnel.hintDone('summon');
    funnel.hintDone('summon');
    expect(sent.map((e) => e.event)).toEqual(['hint_summon_shown', 'hint_summon_done']);
  });

  it('sends idle after 15 s without input during a run, once per stretch', () => {
    const { funnel, sent } = setup();
    funnel.step('first_frame');
    funnel.hint('summon');
    sent.length = 0;
    idleFor(funnel, IDLE_S - 1);
    expect(sent).toEqual([]);
    idleFor(funnel, 10);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ event: 'idle_first_tap', data: { wave: 2, stuck: 'first_tap', hint: 'summon' } });
    funnel.input();
    idleFor(funnel, IDLE_S);
    expect(sent).toHaveLength(2);
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

  it('sends quit once with wave, run time and stuck step', () => {
    const { funnel, sent, at } = setup();
    funnel.step('first_frame');
    at(42);
    funnel.quit({ wave: 3, runTime: 30.6 });
    funnel.quit({ wave: 3, runTime: 31 });
    expect(sent.filter((e) => e.event.startsWith('quit_'))).toEqual([
      { event: 'quit_first_tap', data: { s: 42, wave: 3, stuck: 'first_tap', run_t: 31 } },
    ]);
  });
});

describe('funnelReport', () => {
  it('lists funnel rows in order with gaps and extras', () => {
    const rows = funnelReport([
      { event: 'load', data: { ms: 300 }, at: 800 },
      { event: 'funnel_first_frame', data: { s: 0.5 }, at: 500 },
      { event: 'session_time', data: { s: 30 }, at: 30_000 },
      { event: 'hint_summon_shown', data: { s: 1 }, at: 1000 },
      { event: 'idle_first_tap', data: { s: 16, wave: 1, stuck: 'first_tap' }, at: 16_000 },
    ]);
    expect(rows).toEqual([
      { s: 0.8, dt: 0.8, event: 'load', extra: 'ms=300' },
      { s: 0.5, dt: -0.3, event: 'funnel_first_frame', extra: '' },
      { s: 1, dt: 0.5, event: 'hint_summon_shown', extra: '' },
      { s: 16, dt: 15, event: 'idle_first_tap', extra: 'wave=1 stuck=first_tap' },
    ]);
  });
});
