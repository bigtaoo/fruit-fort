import { describe, expect, it } from 'vitest';
import { bootErrorFields, bootErrorKind, hasWebgl2 } from './bootfail';

describe('bootErrorKind', () => {
  it('reads a chunk that did not arrive as fetch, in each browser', () => {
    for (const msg of [
      'Failed to fetch dynamically imported module: https://x/assets/main-abc.js',
      'error loading dynamically imported module: https://x/assets/main-abc.js',
      'Importing a module script failed.',
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource.',
    ]) expect(bootErrorKind(new TypeError(msg), true)).toBe('fetch');
  });

  it('reads a missing WebGL2 as webgl, by message or by the browser lacking it', () => {
    expect(bootErrorKind(new Error('Error creating WebGL context.'), true)).toBe('webgl');
    expect(bootErrorKind(new TypeError("Cannot read properties of null (reading 'getExtension')"), false)).toBe('webgl');
  });

  it('puts a fetch failure before a missing WebGL2', () => {
    expect(bootErrorKind(new TypeError('Failed to fetch'), false)).toBe('fetch');
  });

  it('calls anything else other', () => {
    expect(bootErrorKind(new RangeError('Invalid array length'), true)).toBe('other');
    expect(bootErrorKind(null, true)).toBe('other');
  });
});

describe('bootErrorFields', () => {
  it('gives the kind, the type and a capped message', () => {
    const f = bootErrorFields(new TypeError(`Failed to fetch dynamically imported module: ${'x'.repeat(200)}`));
    expect(f.kind).toBe('fetch');
    expect(f.name).toBe('TypeError');
    expect(f.msg).toHaveLength(120);
  });

  it('names what was thrown when it is not an Error', () => {
    expect(bootErrorFields('boom')).toEqual({ kind: 'other', name: 'string', msg: 'boom' });
    expect(bootErrorFields(undefined, false)).toEqual({ kind: 'webgl', name: 'undefined', msg: 'undefined' });
  });
});

describe('hasWebgl2', () => {
  it('says no when there is no document to make a canvas in', () => {
    expect(hasWebgl2()).toBe(false);
  });
});
