// Read what scripts/telemetry-pull.ts brought down, the way docs/telemetry/low-traffic-method.md says to:
// one player at a time, in order, not as an average. At twenty players a version an average is a number
// with nothing behind it; a trace says where a person stopped.
//
// Usage:
//   npx tsx scripts/telemetry-trace.ts                       every day on disk, one line per session
//   npx tsx scripts/telemetry-trace.ts 2026-11-24            one day
//   npx tsx scripts/telemetry-trace.ts --v 0.0.42            only that build
//   npx tsx scripts/telemetry-trace.ts --trace               every session's events, in order
//   npx tsx scripts/telemetry-trace.ts --sid ab12cd34ef5     one session's events
//   npx tsx scripts/telemetry-trace.ts --bots                keep the crawlers in
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Stored, WireEvent } from '../server/wire';

const DIR = 'telemetry-archive/self';

interface Session {
  sid: string;
  uid?: string;
  v: string;
  c?: string;
  /** Batch numbers that arrived, so a hole in them is visible. */
  batches: Set<number>;
  evs: WireEvent[];
}

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const has = (name: string) => args.includes(`--${name}`);
const onlyV = flag('v');
const onlySid = flag('sid');
const days = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

function load(): Session[] {
  if (!existsSync(DIR)) {
    console.error(`nothing in ${DIR} — run scripts/telemetry-pull.ts first`);
    process.exit(2);
  }
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.ndjson'))
    .filter((f) => !days.length || days.includes(f.slice(0, 10)))
    .sort();
  const by = new Map<string, Session>();
  for (const f of files) {
    for (const line of readFileSync(join(DIR, f), 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('{"error"')) continue;
      const b = JSON.parse(line) as Stored;
      let s = by.get(b.sid);
      if (!s) by.set(b.sid, (s = { sid: b.sid, v: b.v, batches: new Set(), evs: [] }));
      // The uid arrives with the second batch (the save is read after the page starts), and the
      // country with every one; take whichever batch carried them.
      if (b.uid) s.uid = b.uid;
      if (b.c) s.c = b.c;
      s.batches.add(b.n);
      s.evs.push(...b.evs);
    }
  }
  for (const s of by.values()) {
    // A batch that failed to send is kept and sent again, so the same event can arrive twice.
    const seen = new Set<string>();
    s.evs = s.evs
      .filter((e) => {
        // The boot entry has no counter and sends i = -1: tell those apart by their own clock.
        const k = e.i >= 0 ? `${e.i}` : `${e.e}@${e.t}`;
        return seen.has(k) ? false : (seen.add(k), true);
      })
      .sort((a, b) => a.i - b.i || a.s - b.s);
  }
  return [...by.values()];
}

const dur = (s: Session) => Math.max(0, ...s.evs.map((e) => e.s));
const names = (s: Session) => new Set(s.evs.map((e) => e.e));
const facts = (s: Session) => s.evs.find((e) => e.e === 'client')?.d ?? {};

/**
 * A session no person was behind. The rule is the one the 2026-11-23 read-up arrived at
 * (low-traffic-method.md): a headless browser now says so itself, and before that the tell was leaving
 * during boot in about a second, which no one decides to do.
 */
function bot(s: Session): boolean {
  if (facts(s).bot === true) return true;
  const left = s.evs.find((e) => e.e === 'boot_left');
  return !!left && left.s < 3 && !names(s).has('load') && left.d?.sdk !== true;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

const secs = (n: number) =>
  n >= 60 ? `${Math.floor(n / 60)}m${String(Math.round(n % 60)).padStart(2, '0')}` : `${n.toFixed(n < 10 ? 1 : 0)}s`;

/** The last `quit_*` is where the session ended; `boot_left` is where one ended before it began. */
function ending(s: Session): string {
  const quits = s.evs.filter((e) => e.e.startsWith('quit_'));
  const last = quits[quits.length - 1];
  if (last) {
    const d = last.d ?? {};
    const bits = [`wave ${d.wave ?? '?'}`, `fence ${d.fence ?? '?'}%`, `quiet ${d.quiet ?? '?'}s`];
    return `${last.e} (${bits.join(', ')})`;
  }
  const left = s.evs.find((e) => e.e === 'boot_left');
  if (left) return `boot_left (${left.d?.stage ?? '?'} ${left.d?.pct ?? '?'}%)`;
  return 'no word (lost its last batch, or still open)';
}

function machine(s: Session): string {
  const f = facts(s);
  const bits: string[] = [];
  if (s.c) bits.push(s.c);
  if (typeof f.w === 'number' && typeof f.h === 'number') bits.push(`${f.w}x${f.h}`);
  const gpu = s.evs.find((e) => e.e === 'load')?.d?.gpu;
  if (typeof gpu === 'string') bits.push(gpu.slice(0, 28));
  if (f.mobile === true) bits.push('mobile');
  if (typeof f.cores === 'number') bits.push(`${f.cores}c`);
  return bits.join(' ') || '?';
}

/** Batches are numbered from 0: a gap means a send that never arrived, and events with it. */
function lost(s: Session): number {
  const top = Math.max(...s.batches);
  return top + 1 - s.batches.size;
}

function line(s: Session): string {
  const who = s.uid ? `${s.uid}` : '(no save)';
  const gap = lost(s);
  return [
    s.sid.padEnd(12),
    s.v.padEnd(7),
    who.padEnd(12),
    secs(dur(s)).padStart(5),
    `${String(s.evs.length).padStart(4)} ev`,
    gap ? `-${gap} batch` : '       ',
    machine(s).padEnd(44).slice(0, 44),
    ending(s),
  ].join('  ');
}

function trace(s: Session): void {
  console.log(`\n=== ${s.sid}  ${s.v}  ${s.uid ?? '(no save)'}  ${machine(s)}`);
  for (const e of s.evs) {
    const d = e.d ? ` ${JSON.stringify(e.d)}` : '';
    console.log(`  ${secs(e.s).padStart(6)}  ${e.e}${d}`);
  }
}

/** Funnel steps in the order they actually happen, so adding one upstream needs no edit here. */
function funnel(all: Session[]): void {
  // Per step: when each session first reached it. A session counts once however many times it fired.
  const at = new Map<string, number[]>();
  for (const s of all) {
    const first = new Map<string, number>();
    for (const e of s.evs) {
      if (e.e.startsWith('funnel_') && !first.has(e.e)) first.set(e.e, e.s);
    }
    for (const [name, when] of first) at.set(name, [...(at.get(name) ?? []), when]);
  }
  if (!at.size) return;
  console.log(`
funnel (${all.length} sessions)`);
  // A funnel is monotone: fewer sessions reach each step than the one before it. Ordering by how many
  // got there is steady at twenty sessions, where ordering by median time is not — one phone that took
  // 14 s to draw its first frame is enough to put the first frame after the first tap.
  for (const [name, times] of [...at].sort((a, b) => b[1].length - a[1].length || median(a[1]) - median(b[1]))) {
    const pct = Math.round((times.length * 100) / all.length);
    console.log(`  ${name.replace('funnel_', '').padEnd(14)} ${String(times.length).padStart(3)}  ${String(pct).padStart(3)}%  median ${secs(median(times))}`);
  }
}

/** The value q of the way up the sorted list (q = 0.75: three quarters are at or below it). */
function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
}

const all = load();
if (!all.length) {
  console.log('no sessions in the days on disk');
  process.exit(0);
}

const bots = all.filter(bot);
let shown = has('bots') ? all : all.filter((s) => !bot(s));
if (onlyV) shown = shown.filter((s) => s.v === onlyV);
if (onlySid) shown = shown.filter((s) => s.sid === onlySid || s.uid === onlySid);
shown.sort((a, b) => a.v.localeCompare(b.v) || dur(a) - dur(b));

if (onlySid || has('trace')) {
  for (const s of shown) trace(s);
} else {
  console.log('sid           build    player        time  events   lost  machine                                       ended');
  for (const s of shown) console.log(line(s));
}

const byV = new Map<string, Session[]>();
for (const s of shown) byV.set(s.v, [...(byV.get(s.v) ?? []), s]);
console.log('');
for (const [v, ss] of [...byV].sort()) {
  const times = ss.map(dur);
  const played = ss.filter((s) => names(s).has('load')).length;
  const tapped = ss.filter((s) => names(s).has('funnel_first_tap')).length;
  const players = new Set(ss.map((s) => s.uid).filter(Boolean)).size;
  // `since` is the day the save was made. It is empty on a save from before we started writing it, and
  // on a save made today it equals today: either way, a save older than today means a player who came back.
  const returning = ss.filter((s) => {
    const since = s.evs.find((e) => e.e === 'player')?.d?.since;
    return typeof since === 'string' && since.length === 10 && since < new Date().toISOString().slice(0, 10);
  }).length;
  console.log(
    `${v}: ${ss.length} sessions, ${players} players, ${returning} came back from an earlier day, ` +
      `${played} reached a first frame, ${ss.length - tapped} never touched it, ` +
      `median ${secs(median(times))}, p75 ${secs(quantile(times, 0.75))}`,
  );
}
if (bots.length && !has('bots')) console.log(`(${bots.length} crawler session(s) left out; --bots keeps them)`);
funnel(shown);
