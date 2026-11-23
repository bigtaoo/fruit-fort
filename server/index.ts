// Our own telemetry collector: one Cloudflare Worker in front of one R2 bucket.
// Deploy: npx wrangler deploy -c wrangler/collect.jsonc   (config, bindings and secrets are documented there)
//
// Why this shape. The reading we actually do is the low-traffic method (docs/telemetry/low-traffic-method.md):
// twenty players a version, read one player's events in order. That is a `list` with a day's prefix and a
// local script, not a database — so the server's whole job is to take a batch, check it, and put it down
// where a day can be pulled back whole. No schema to migrate, no row limit to outgrow, nothing to keep
// running between requests.
//
// Endpoints
//   POST /c             a batch from the game (public; this address is in the build, so anyone can see it)
//   GET  /export?day=   a day's batches as NDJSON (bearer EXPORT_TOKEN)
//   GET  /days          which days hold data (bearer EXPORT_TOKEN)
//   GET  /              one line saying what this is
import { key, parseBatch, type Stored } from './wire';

export interface Env {
  /** The bucket every batch lands in. */
  RAW: R2Bucket;
  /** Optional rate limit, keyed per address, so one page cannot fill the bucket. */
  LIMIT?: RateLimit;
  /** Secret. Without it set, /export and /days answer 404 — no token, no door. */
  EXPORT_TOKEN?: string;
  /** Optional comma-separated host allowlist for POSTs (`crazygames.com,playgama.ai`). Empty: any. */
  ORIGINS?: string;
}

/** The game sends from a portal's page, cross-origin, and never reads the answer. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function text(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain;charset=utf-8', ...headers } });
}

/** `https://sub.crazygames.com` matches `crazygames.com`; nothing else does. */
function allowed(origin: string | null, list: string): boolean {
  if (!list.trim()) return true;
  let host: string;
  try {
    host = new URL(origin ?? '').hostname;
  } catch {
    // No Origin at all: a beacon from a page that is already gone can arrive without one.
    return !origin;
  }
  return list
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .some((h) => host === h || host.endsWith(`.${h}`));
}

function guarded(request: Request, env: Env): Response | null {
  if (!env.EXPORT_TOKEN) return text('not found\n', 404);
  const given = request.headers.get('authorization') ?? '';
  // The token is a secret of ours, not a user's: a plain compare is enough, and a miss looks like a 404
  // so the endpoint does not advertise itself.
  return given === `Bearer ${env.EXPORT_TOKEN}` ? null : text('not found\n', 404);
}

async function collect(request: Request, env: Env): Promise<Response> {
  if (!allowed(request.headers.get('origin'), env.ORIGINS ?? '')) return text('no\n', 403, CORS);
  if (env.LIMIT) {
    // Per address, and only as a loose filter: the binding counts per edge location, so a real flood
    // from many places still gets through. It is here to stop one page in a loop.
    const ip = request.headers.get('cf-connecting-ip') ?? 'none';
    const { success } = await env.LIMIT.limit({ key: ip });
    if (!success) return text('slow down\n', 429, CORS);
  }
  const body = await request.text();
  const parsed = parseBatch(body);
  if (!parsed.ok) return text(`${parsed.why}\n`, 400, CORS);
  const rt = Date.now();
  const stored: Stored = { ...parsed.batch, rt };
  const country = (request as { cf?: IncomingCf }).cf?.country;
  if (country) stored.c = country;
  await env.RAW.put(key(parsed.batch, rt), JSON.stringify(stored));
  // Nothing to say back: the client never reads it, and a body would only cost the beacon time.
  return new Response(null, { status: 204, headers: CORS });
}

/** Every object under a prefix, following R2's cursor to the end. */
async function keys(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const o of page.objects) out.push(o.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out.sort();
}

/**
 * A day, as one NDJSON line per batch — the same shape the pull script writes to disk and the trace
 * script reads. Streamed, because a busy day is tens of thousands of objects and a Worker holds no
 * more than its memory.
 */
function exportDay(env: Env, day: string): Response {
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  void (async () => {
    try {
      const all = await keys(env.RAW, `v1/${day}/`);
      // A few at a time: R2 is fast but one round trip per object would make a big day crawl, and
      // unbounded concurrency is how a Worker runs out of its subrequest budget.
      for (let i = 0; i < all.length; i += 20) {
        const chunk = await Promise.all(all.slice(i, i + 20).map((k) => env.RAW.get(k).then((o) => o?.text())));
        const lines = chunk.filter((t): t is string => !!t).map((t) => `${t.replace(/\n/g, ' ')}\n`);
        if (lines.length) await writer.write(encoder.encode(lines.join('')));
      }
    } catch (e) {
      // The status line is long gone; say it in the body so a truncated pull is not read as a short day.
      await writer.write(encoder.encode(`{"error":${JSON.stringify(String(e))}}\n`));
    } finally {
      await writer.close();
    }
  })();
  return new Response(stream.readable, { headers: { 'content-type': 'application/x-ndjson' } });
}

/** Which days have anything. */
async function days(env: Env): Promise<Response> {
  const seen = new Set<string>();
  for (const k of await keys(env.RAW, 'v1/')) seen.add(k.slice(3, 13));
  return text(`${[...seen].sort().join('\n')}\n`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'POST' && url.pathname === '/c') return collect(request, env);
    if (request.method === 'GET' && url.pathname === '/export') {
      const no = guarded(request, env);
      if (no) return no;
      const day = url.searchParams.get('day') ?? '';
      if (!DAY.test(day)) return text('day=YYYY-MM-DD\n', 400);
      return exportDay(env, day);
    }
    if (request.method === 'GET' && url.pathname === '/days') return guarded(request, env) ?? days(env);
    if (request.method === 'GET' && url.pathname === '/') return text('swarm-orbit telemetry collector\n');
    return text('not found\n', 404);
  },
};
