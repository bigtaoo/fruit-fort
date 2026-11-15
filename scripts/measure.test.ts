import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every number in docs/design comes out of a script in here, so a script that measures the wrong
 * player is worse than no script: it answers, confidently, about somebody who does not exist.
 *
 * scripts/ladder.ts did exactly that until 2026-11-15. It built its worlds by hand - `hero`, `meta`
 * and the level - which quietly left out the hero's level, the village upgrades and the wagons that
 * `worldOptions` hands a real save. Weeks of ladder numbers, and the level table written from them,
 * were measured on a player nobody plays. It surfaced only because scripts/need.ts disagreed with it
 * at 2-4 (six losses against clears), and that was luck, not method. This is the method: one way to
 * build the world a player plays, and a test that no script quietly grows a second one.
 */
const SRC = new URL('.', import.meta.url);

/** The `new World({ ... })` option texts in a file, braces balanced, so a call may span lines. */
function worldCalls(src: string): string[] {
  const out: string[] = [];
  for (let at = src.indexOf('new World('); at >= 0; at = src.indexOf('new World(', at + 1)) {
    let depth = 0;
    for (let i = at + 'new World'.length; i < src.length; i++) {
      if ('({['.includes(src[i])) depth++;
      else if (')}]'.includes(src[i]) && --depth === 0) {
        out.push(src.slice(at, i + 1));
        break;
      }
    }
  }
  return out;
}

describe('the scripts measure the player who plays', () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  it('finds the scripts and their World calls', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.flatMap((f) => worldCalls(readFileSync(new URL(f, SRC), 'utf8'))).length).toBeGreaterThan(10);
    // The extractor really does balance, rather than stopping at the first brace it meets.
    expect(worldCalls('new World({ a: { b: 1 }, c: [2] });')).toEqual(['new World({ a: { b: 1 }, c: [2] })']);
  });

  it('builds a world that carries a save through worldOptions, never by hand', () => {
    for (const f of files) {
      for (const call of worldCalls(readFileSync(new URL(f, SRC), 'utf8'))) {
        // A script may ask a question that has no save in it - what endless does at wave 40 with this
        // hero and this seed - and those calls pass nothing a save would own. The moment one names a
        // level, a training level or a village upgrade, it is answering for a real player and has to
        // ask `worldOptions` who that player is.
        const owned = /\blevel\b|\bmeta\b|statLv|heroLv|wagon/.test(call);
        expect([f, owned && !call.includes('worldOptions')]).toEqual([f, false]);
      }
    }
  });
});
