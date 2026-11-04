// Onboarding probe (§12.8): a fresh save plays the first minutes in headless Chrome, and a bot does
// what the guide's hand shows, a moment after it shows, and nothing else ("follow"); a second run
// also plays the greedy bot between hands ("play"), so it wins and sees the win path. Prints every
// hand, every hold and every stretch with something to do but no hand.
// Fails when the follow bot loses level 1. REACT=3 makes it answer each hand 3 s late (default 0.8).
// Usage: npm run onboard -- [minutes] [WxH]   (needs Chrome or Edge; CHROME=path to pick one)

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const minutes = Number(process.argv[2] ?? 5);
const [width, height] = (process.argv[3] ?? '375x812').split('x').map(Number);
/** Seconds the follow bot takes to do what a hand shows (REACT=3 for a slow player). */
const react = Number(process.env.REACT ?? 0.8);
/**
 * A gap with something to do and no hand longer than this fails, in level 1 (§12.8): the level-1
 * idle hint's 4 s of quiet plus the guide's 0.6 s show delay, and a little slack.
 */
const GAP_LIMIT = 5;
/** A hold may go without a hand for the guide's rest after a tap plus its show delay, no more. */
const HOLD_BARE_LIMIT = 2.8;

const CHROMES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter((p): p is string => !!p);

/** Just enough of the DevTools protocol: send a command, wait for its answer. */
class Cdp {
  private id = 0;
  private waiting = new Map<number, (r: { result?: unknown; error?: { message: string } }) => void>();
  private constructor(private ws: WebSocket) {
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data));
      this.waiting.get(msg.id)?.(msg);
      this.waiting.delete(msg.id);
    };
  }
  static async open(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise((ok, fail) => {
      ws.onopen = ok;
      ws.onerror = fail;
    });
    return new Cdp(ws);
  }
  send<T = unknown>(method: string, params: object = {}): Promise<T> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fail) => this.waiting.set(id, (r) => (r.error ? fail(new Error(`${method}: ${r.error.message}`)) : ok(r.result as T))));
  }
  /** Evaluate an expression in the page, awaiting a promise, and return its value. */
  async eval<T>(expr: string): Promise<T> {
    const r = await this.send<{ result: { value: T }; exceptionDetails?: { exception?: { description?: string }; text: string } }>('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  close(): void {
    this.ws.close();
  }
}

/** One probe tick, as the page reports it. */
interface Tick {
  t: number;
  run: number;
  level: number | null;
  screen: string | null;
  hand: string | null;
  hold: boolean;
  /** Fence left, in percent. */
  wall: number;
  /** What could be done in a fight right now (a card, the skill, a basket or gold bug). */
  doable: string[];
}
interface HandLog {
  id: string;
  shown: number;
  wait: number;
  end?: number;
  result?: string;
}
interface Result {
  ticks: Tick[];
  hands: HandLog[];
  acts: { t: number; id: string; how: string }[];
}

/**
 * The bot, run inside the page. rAF is switched off (see main), so only this clock moves the game:
 * a fight steps with `game.advance`, the result card and the village with the guide alone.
 */
async function drive(seconds: number, play: boolean, react: number): Promise<Result> {
  const STEP = 0.2;
  const g = (window as any).game;
  const guide = g.guide;
  const host = guide.h;
  const ticks: Tick[] = [];
  const hands: HandLog[] = [];
  const acts: { t: number; id: string; how: string }[] = [];
  let t = 0;
  const shown = host.funnel.guideShown.bind(host.funnel);
  const ended = host.funnel.guideEnd.bind(host.funnel);
  host.funnel.guideShown = (id: string, d: { wait: number }) => {
    hands.push({ id, shown: t, wait: d.wait });
    shown(id, d);
  };
  host.funnel.guideEnd = (id: string, result: string) => {
    const h = [...hands].reverse().find((x) => x.id === id && x.end === undefined);
    if (h) Object.assign(h, { end: t, result });
    ended(id, result);
  };
  const bot = '/src/sim/bot.ts';
  const { botAct } = await import(/* @vite-ignore */ bot);
  const levels = '/src/sim/levels.ts';
  const { LEVELS } = await import(/* @vite-ignore */ levels);
  const press = (target: EventTarget, x = 0, y = 0) => {
    for (const type of ['pointerdown', 'pointerup']) target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y }));
  };
  const TAU = Math.PI * 2;
  let acted = -1;
  let lastBot = 0;
  while (t < seconds) {
    const w = g.world();
    const screen = host.screen();
    const now = guide.now;
    // Do what the hand shows, once per hand, a moment after it came.
    if (now && now !== acted && guide.time - now.at >= react) {
      const aim = now.step.aim();
      let how = '';
      if (aim === 'tap') {
        press(document.querySelector('canvas')!);
        how = 'tap';
      } else if (aim && 'el' in aim && aim.el) {
        press(window);
        (aim.el as HTMLElement).click();
        how = (aim.el as HTMLElement).dataset.a ?? aim.el.className;
      } else if (aim && 'x' in aim) {
        // A pickup on the track: turn round if it is nearer the other way.
        const ahead = ((((Math.atan2(aim.z, aim.x) - w.train.angle) * w.train.dir) % TAU) + TAU) % TAU;
        if (ahead > Math.PI) press(document.querySelector('canvas')!);
        how = ahead > Math.PI ? 'turn' : 'wait';
      }
      acts.push({ t, id: now.step.id, how });
      // A tab press leaves the hand up on the item: act again on the same step then.
      acted = aim && typeof aim === 'object' && 'el' in aim && !aim.last ? -1 : now;
      if (acted === -1) now.at = guide.time;
    }
    if (screen === 'battle') {
      if (play && !now && t - lastBot >= 0.5) {
        botAct(w);
        lastBot = t;
      }
      g.advance(STEP);
    } else {
      g.advance(0);
      guide.update(STEP - 0.05);
    }
    t += STEP;
    const doable: string[] = [];
    const nw = g.world();
    if (host.screen() === 'battle') {
      for (const k of Object.keys(nw.lv)) if (nw.canBuy(k)) doable.push(k);
      if (nw.heroReady()) doable.push('skill');
      if (nw.happening) doable.push(nw.happening.kind);
    }
    ticks.push({ t, run: host.save().runs, level: nw.level ? LEVELS.indexOf(nw.level) : null, screen: host.screen(), hand: guide.now?.step.id ?? null, hold: nw.holdAt !== null, wall: Math.round((nw.wallHp / nw.wallMax) * 100), doable });
    // Let promises (ads on the stub platform, saving) settle between ticks.
    await new Promise((r) => setTimeout(r, 0));
  }
  return { ticks, hands, acts };
}

/** Stretches of ticks that pass `test`, as [from, to] in seconds. */
function spans(ticks: Tick[], test: (k: Tick) => boolean): { from: number; to: number; ticks: Tick[] }[] {
  const out: { from: number; to: number; ticks: Tick[] }[] = [];
  let cur: Tick[] = [];
  for (const k of [...ticks, null]) {
    if (k && test(k)) cur.push(k);
    else if (cur.length) {
      out.push({ from: cur[0].t - 0.2, to: cur[cur.length - 1].t, ticks: cur });
      cur = [];
    }
  }
  return out;
}

const f1 = (x: number) => x.toFixed(1).padStart(5);

/** Print one run's report; returns the failures. */
function report(name: string, r: Result, follow: boolean): string[] {
  const fails: string[] = [];
  console.log(`\n== ${name} ==`);
  console.log(`hands (shown at, waited before showing, answered at, how)${follow ? `, answered ${react}s after showing` : ''}:`);
  for (const h of r.hands) {
    const act = r.acts.find((a) => a.id === h.id && a.t >= h.shown);
    console.log(`  ${f1(h.shown)}s  ${h.id.padEnd(10)} wait ${h.wait.toFixed(1)}s  ${h.end === undefined ? 'still up' : `${h.result} at ${h.end.toFixed(1)}s`}${act ? `  (${act.how})` : ''}`);
  }
  console.log('holds (bugs waiting at the ring):');
  for (const s of spans(r.ticks, (k) => k.hold)) {
    const bare = s.ticks.filter((k) => !k.hand).length * 0.2;
    const bad = bare > HOLD_BARE_LIMIT;
    if (bad) fails.push(`${name}: hold at ${s.from.toFixed(1)}s went ${bare.toFixed(1)}s without a hand`);
    console.log(`  ${f1(s.from)}s  ${(s.to - s.from).toFixed(1)}s long, ${bare.toFixed(1)}s of it without a hand${bad ? '  << FAIL' : ''}`);
  }
  console.log(`gaps (in a fight, something to do, no hand, longer than ${GAP_LIMIT}s):`);
  let any = false;
  // Only a run that waits for the hand has gaps to judge: the greedy bot does things unprompted.
  for (const s of follow ? spans(r.ticks, (k) => k.screen === 'battle' && !k.hand && !k.hold && k.doable.length > 0) : []) {
    const long = s.to - s.from;
    if (long <= GAP_LIMIT) continue;
    any = true;
    const first = s.ticks[0];
    const what = [...new Set(s.ticks.flatMap((k) => k.doable))].join(' ');
    // From level 4 an idle hint covers a quiet fight after 10 s: a longer gap there is by design.
    const bad = first.level !== null && first.level < 3;
    if (bad) fails.push(`${name}: level ${first.level! + 1} gap of ${long.toFixed(1)}s at ${s.from.toFixed(1)}s (${what})`);
    console.log(`  ${f1(s.from)}s  ${long.toFixed(1)}s  run ${first.run + 1}  could: ${what}${bad ? '  << FAIL' : ''}`);
  }
  if (!follow) console.log('  (not judged: the bot plays on its own)');
  else if (!any) console.log('  none');
  // Doing only what the hand shows must win level 1 (§12.8).
  const end = r.ticks.findIndex((k) => k.run === 0 && k.screen === 'result');
  const lastFight = r.ticks[end > 0 ? end - 1 : r.ticks.length - 1];
  const won = r.hands.some((h) => h.id === 'win');
  if (follow && end >= 0 && !won) fails.push(`${name}: lost level 1 at ${r.ticks[end].t.toFixed(0)}s`);
  console.log(`level 1: ${end < 0 ? `not over in ${minutes} min` : `${won ? 'won' : 'lost'} at ${r.ticks[end].t.toFixed(0)}s`}, fence ${lastFight?.wall ?? '?'}% left${follow && end >= 0 && !won ? '  << FAIL' : ''}`);
  const screens = spans(r.ticks, () => true)[0]?.ticks ?? [];
  let prev = '';
  const path: string[] = [];
  for (const k of screens) {
    const s = `${k.screen}${k.screen === 'battle' && k.level !== null ? ` L${k.level + 1}` : ''}`;
    if (s !== prev) path.push(`${s}@${k.t.toFixed(0)}s`);
    prev = s;
  }
  console.log(`path: ${path.join(' > ')}`);
  return fails;
}

async function main(): Promise<void> {
  const chrome = CHROMES.find((p) => existsSync(p));
  if (!chrome) throw new Error('no Chrome or Edge found; set CHROME to its path');
  const server = await createServer({ server: { port: 5199, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const url = server.resolvedUrls!.local[0];
  const fails: string[] = [];
  try {
    for (const play of [false, true]) {
      const profile = mkdtempSync(join(tmpdir(), 'onboard-'));
      const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
      try {
        let ws = '';
        for (let i = 0; i < 100 && !ws; i++) {
          await new Promise((r) => setTimeout(r, 100));
          try {
            // Chrome picks a free port (a fixed one may be forwarded to a phone) and writes it here.
            const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\s/)[0];
            const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
            ws = list.find((p) => p.type === 'page')?.webSocketDebuggerUrl ?? '';
          } catch {
            // Not up yet.
          }
        }
        if (!ws) throw new Error('Chrome did not open a page');
        const cdp = await Cdp.open(ws);
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < height });
        // No frame loop: the probe's clock is the only one, so a slow software GPU can't skew it.
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.requestAnimationFrame = () => 0;' });
        const nav = await cdp.send<{ errorText?: string }>('Page.navigate', { url: `${url}?lang=en` });
        if (nav.errorText) throw new Error(`${url}: ${nav.errorText}`);
        let up = false;
        for (let i = 0; i < 600 && !up; i++) {
          up = await cdp.eval<boolean>('!!(window.game && game.world() && game.guide.h.screen())').catch(() => false);
          if (!up) await new Promise((r) => setTimeout(r, 100));
        }
        if (!up) throw new Error(`the game did not start: ${await cdp.eval<string>('document.title + " | " + location.href + " | " + typeof window.game').catch(String)}`);
        const name = play ? 'play (greedy bot between hands)' : 'follow (only what the hand shows)';
        // tsx keeps function names with a `__name` helper the page doesn't have.
        const r = await cdp.eval<Result>(`(() => { const __name = (f) => f; return (${drive.toString()})(${minutes * 60}, ${play}, ${react}); })()`);
        fails.push(...report(name, r, !play));
        cdp.close();
      } finally {
        proc.kill();
        await new Promise((r) => setTimeout(r, 300));
        rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
      }
    }
  } finally {
    await server.close();
  }
  console.log(fails.length ? `\n${fails.length} failure(s):\n  ${fails.join('\n  ')}` : '\nall within targets');
  process.exitCode = fails.length ? 1 : 0;
}

void main();
