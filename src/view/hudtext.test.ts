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
});
