import { beforeEach, describe, expect, it } from 'vitest';
import worker, { type Env } from './index';

/** R2, as far as this Worker is concerned: a map with a cursor. */
class FakeBucket implements R2Bucket {
  readonly items = new Map<string, string>();
  /** How many keys one `list` answers with, so the cursor loop is actually walked. */
  page = 1000;
  failGet = false;

  async put(k: string, v: string): Promise<unknown> {
    this.items.set(k, v);
    return undefined;
  }

  async get(k: string): Promise<R2Body | null> {
    if (this.failGet) throw new Error('r2 is down');
    const v = this.items.get(k);
    return v === undefined ? null : { text: async () => v };
  }

  async list(o: { prefix?: string; cursor?: string; limit?: number } = {}): Promise<R2Objects> {
    const all = [...this.items.keys()].filter((k) => k.startsWith(o.prefix ?? '')).sort();
    const from = o.cursor ? all.indexOf(o.cursor) + 1 : 0;
    const take = all.slice(from, from + this.page);
    const truncated = from + take.length < all.length;
    return {
      objects: take.map((key) => ({ key, size: 1, uploaded: new Date() })),
      truncated,
      ...(truncated ? { cursor: take[take.length - 1] } : {}),
    };
  }
}

const batch = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ sid: 'ab12cd34ef5', v: '0.0.42', n: 0, t: 1, evs: [{ e: 'load', i: 0, s: 1, t: 1 }], ...over });

let bucket: FakeBucket;
let env: Env;

beforeEach(() => {
  bucket = new FakeBucket();
  env = { RAW: bucket };
});

const post = (body: string, headers: Record<string, string> = {}, cf?: IncomingCf) => {
  const r = new Request('https://sx.gamestao.com/c', { method: 'POST', body, headers });
  if (cf) Object.defineProperty(r, 'cf', { value: cf });
  return worker.fetch(r, env);
};

const get = (path: string, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(`https://sx.gamestao.com${path}`, { headers }), env);

describe('collect', () => {
  it('stores a batch and says nothing back', async () => {
    const res = await post(batch());
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(bucket.items.size).toBe(1);
    const [k] = [...bucket.items.keys()];
    expect(k).toMatch(/^v1\/\d{4}-\d{2}-\d{2}\/ab12cd34ef5\/0000-\d+\.json$/);
    const stored = JSON.parse(bucket.items.get(k)!) as { rt: number; c?: string; sid: string };
    expect(stored.sid).toBe('ab12cd34ef5');
    expect(stored.rt).toBeGreaterThan(0);
    expect(stored.c).toBeUndefined();
  });

  it('adds the country the edge saw, and never the address', async () => {
    const res = await post(batch(), { 'cf-connecting-ip': '203.0.113.9' }, { country: 'DE' });
    expect(res.status).toBe(204);
    const body = [...bucket.items.values()][0];
    expect(JSON.parse(body).c).toBe('DE');
    expect(body).not.toContain('203.0.113.9');
  });

  it('answers 400 on junk and stores nothing', async () => {
    const res = await post('not json at all');
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('not json');
    expect(bucket.items.size).toBe(0);
  });

  it('keeps the origin list when there is one', async () => {
    env.ORIGINS = 'crazygames.com, playgama.ai';
    expect((await post(batch(), { origin: 'https://www.crazygames.com' })).status).toBe(204);
    expect((await post(batch({ n: 1 }), { origin: 'https://playgama.ai' })).status).toBe(204);
    expect((await post(batch({ n: 2 }), { origin: 'https://crazygames.com.evil.test' })).status).toBe(403);
    // A beacon from a page that is already gone can arrive with no Origin at all: take it.
    expect((await post(batch({ n: 3 }))).status).toBe(204);
    expect(bucket.items.size).toBe(3);
  });

  it('turns a flood away at the rate limit', async () => {
    let asked = '';
    env.LIMIT = {
      limit: async ({ key }) => {
        asked = key;
        return { success: false };
      },
    };
    const res = await post(batch(), { 'cf-connecting-ip': '198.51.100.4' });
    expect(res.status).toBe(429);
    expect(asked).toBe('198.51.100.4');
    expect(bucket.items.size).toBe(0);
  });

  it('answers a preflight', async () => {
    const res = await worker.fetch(new Request('https://sx.gamestao.com/c', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('export', () => {
  beforeEach(async () => {
    await post(batch());
    await post(batch({ n: 1, sid: 'zz99yy88xx7' }));
  });

  it('stays shut without a token, and to a wrong one', async () => {
    expect((await get('/export?day=2026-11-24')).status).toBe(404);
    expect((await get('/days')).status).toBe(404);
    env.EXPORT_TOKEN = 'secret';
    expect((await get('/days', { authorization: 'Bearer wrong' })).status).toBe(404);
    expect((await get('/days', { authorization: 'secret' })).status).toBe(404);
  });

  it('gives a day as one line per batch', async () => {
    env.EXPORT_TOKEN = 'secret';
    const day = [...bucket.items.keys()][0].slice(3, 13);
    const res = await get(`/export?day=${day}`, { authorization: 'Bearer secret' });
    expect(res.headers.get('content-type')).toBe('application/x-ndjson');
    const lines = (await res.text()).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => JSON.parse(l).sid).sort()).toEqual(['ab12cd34ef5', 'zz99yy88xx7']);
  });

  it('wants a real day', async () => {
    env.EXPORT_TOKEN = 'secret';
    const res = await get('/export?day=yesterday', { authorization: 'Bearer secret' });
    expect(res.status).toBe(400);
  });

  it('walks R2 past one page', async () => {
    env.EXPORT_TOKEN = 'secret';
    bucket.page = 1;
    const day = [...bucket.items.keys()][0].slice(3, 13);
    const res = await get(`/export?day=${day}`, { authorization: 'Bearer secret' });
    expect((await res.text()).trim().split('\n')).toHaveLength(2);
  });

  it('says so in the body when the read breaks halfway', async () => {
    env.EXPORT_TOKEN = 'secret';
    bucket.failGet = true;
    const day = [...bucket.items.keys()][0].slice(3, 13);
    const res = await get(`/export?day=${day}`, { authorization: 'Bearer secret' });
    // The status line went out before the first read: a pull that only checks the status would read
    // a broken day as an empty one.
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"error"');
  });

  it('lists the days that hold anything', async () => {
    env.EXPORT_TOKEN = 'secret';
    const res = await get('/days', { authorization: 'Bearer secret' });
    expect((await res.text()).trim()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('the rest', () => {
  it('says what it is, and 404s everything else', async () => {
    expect(await (await get('/')).text()).toContain('swarm-orbit');
    expect((await get('/wat')).status).toBe(404);
    expect((await post(batch())).status).toBe(204);
    expect((await worker.fetch(new Request('https://sx.gamestao.com/c', { method: 'GET' }), env)).status).toBe(404);
  });
});
