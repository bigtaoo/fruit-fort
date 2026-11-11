import { describe, expect, it } from 'vitest';
import { LEVELS } from '../sim/levels';
import { World } from '../sim/world';
import { resultHead } from './hudtext';

describe('resultHead', () => {
  it('shows a lost level as how far it got of its waves, with the run numbers', () => {
    const w = new World({ level: LEVELS[0] });
    const html = resultHead(w);
    expect(html).toContain('splate lost');
    expect(html).toContain(`wave 1 / ${LEVELS[0].waves}`);
    expect(html).toContain('rstat');
  });

  it('shows a lost endless run without a total', () => {
    const html = resultHead(new World());
    expect(html).toContain('class="reach"');
    expect(html).toContain('Reached wave 1<');
  });

  it('shows a won level with three star slots, the earned ones lit', () => {
    const w = new World({ level: LEVELS[0] });
    Object.assign(w, { won: true });
    const html = resultHead(w);
    expect(html).not.toContain('lost');
    expect(html.match(/★/g)).toHaveLength(3);
    expect(html.match(/class="on"/g)?.length ?? 0).toBe(w.stars());
  });

  it('lists the wagons of the run in the order they were hooked on, with their levels, and none when there are none', () => {
    const w = new World({ level: LEVELS[0], wagons: true });
    expect(resultHead(w)).not.toContain('rwag');
    w.wg!.list.push({ kind: 'missile', lv: 2, t: 0.5 }, { kind: 'arc', lv: 1, t: 0.9 });
    const html = resultHead(w);
    expect(html).toContain('class="rwag"');
    expect(html.match(/<b>Lv\d<\/b>/g)).toEqual(['<b>Lv2</b>', '<b>Lv1</b>']);
    expect(html.indexOf('Missile rack')).toBeLessThan(html.indexOf('Arc coil'));
  });
});
