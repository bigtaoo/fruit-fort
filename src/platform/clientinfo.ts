// What machine this is (docs/telemetry/self-hosted.md §2.4). On Playgama the backend filled in OS, window
// size and country for us; our own collector gets none of that, so the game sends it once per session as
// `client`. Device capability only — no personal data, no free text, and the referrer is cut to its origin
// (a query string can carry anything). The server resolves the country from the IP and must not store the IP.
//
// Two of these earn their place beyond "which machines do we run badly on":
//   webdriver  2026-11-23: five of six boot-left events were one headless client leaving at ~1.1 s. A flag
//              that says so beats inferring it from the timings every time we read.
//   vis        a page that starts hidden (a prerender, a background tab) explains sessions that look like
//              they loaded for a minute and left without a frame.

type Facts = Record<string, number | string | boolean>;

interface Net {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

interface UaData {
  platform?: string;
  mobile?: boolean;
  brands?: { brand: string; version: string }[];
}

/** `matchMedia` without throwing in a test DOM that has none. */
function media(q: string): boolean {
  try {
    return window.matchMedia?.(q).matches ?? false;
  } catch {
    return false;
  }
}

/** Where the player came from, origin only: the path and query can carry anything. */
function referrerOrigin(): string {
  try {
    return document.referrer ? new URL(document.referrer).origin.slice(0, 80) : '';
  } catch {
    return '';
  }
}

/**
 * Everything about this browser and screen worth a row, flat, as one `client` event's data. Reads defensively:
 * every field here is optional in some browser, and this runs during boot.
 */
export function clientFacts(): Facts {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: Net; userAgentData?: UaData };
  const net = n.connection ?? {};
  const ua = n.userAgentData;
  const mem = (performance as Performance & { memory?: { jsHeapSizeLimit?: number } }).memory;
  const out: Facts = {
    ua: n.userAgent.slice(0, 180),
    langs: (n.languages ?? [n.language]).slice(0, 4).join(',').slice(0, 40),
    sw: screen.width,
    sh: screen.height,
    saw: screen.availWidth,
    sah: screen.availHeight,
    depth: screen.colorDepth,
    dpr: Math.round(devicePixelRatio * 100) / 100,
    iw: innerWidth,
    ih: innerHeight,
    touch: n.maxTouchPoints ?? 0,
    hc: n.hardwareConcurrency ?? 0,
    tzoff: -new Date().getTimezoneOffset(),
    vis: document.visibilityState,
    dark: media('(prefers-color-scheme: dark)'),
    slow: media('(prefers-reduced-motion: reduce)'),
    host: location.hostname.slice(0, 60),
    ref: referrerOrigin(),
    bot: n.webdriver === true,
  };
  if (ua?.platform) out.os = ua.platform.slice(0, 20);
  if (ua?.mobile !== undefined) out.mobile = ua.mobile;
  if (ua?.brands?.length) out.brands = ua.brands.map((b) => `${b.brand} ${b.version}`).join(',').slice(0, 120);
  if (n.deviceMemory) out.mem = n.deviceMemory;
  if (mem?.jsHeapSizeLimit) out.heap = Math.round(mem.jsHeapSizeLimit / 1048576);
  if (net.effectiveType) out.net = net.effectiveType;
  if (typeof net.downlink === 'number') out.down = net.downlink;
  if (typeof net.rtt === 'number') out.rtt = net.rtt;
  if (net.saveData) out.save_data = true;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) out.tz = tz.slice(0, 40);
  } catch {
    // No Intl data: the offset above is enough to place the session in a day.
  }
  return out;
}
