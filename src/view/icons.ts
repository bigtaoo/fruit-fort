// Inline SVG icons for the DOM screens: one toon portrait per hero (the toys), plus the small
// glyphs (crystal, coin, ad, sound) that stand in for emoji in button labels. Drawn like the 3D
// models: flat fill, one darker shade band, a white highlight and the same dark brown outline.
// No ids inside the SVGs, so any number of copies can share a page.

import type { HeroKind, StatKey } from '../sim/types';

const INK = '#2b1d14';

function svg(body: string, cls = 'ic'): string {
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true" stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
}

/** Eyes with a glint, pink cheeks and a smile, centred on (x, y). */
function face(x: number, y: number, s = 1): string {
  const e = 5 * s;
  return `<g stroke="none"><ellipse cx="${x - e}" cy="${y}" rx="${2.6 * s}" ry="${3.2 * s}" fill="${INK}"/><ellipse cx="${x + e}" cy="${y}" rx="${2.6 * s}" ry="${3.2 * s}" fill="${INK}"/>`
    + `<circle cx="${x - e + 0.9 * s}" cy="${y - 1.2 * s}" r="${1 * s}" fill="#fff"/><circle cx="${x + e + 0.9 * s}" cy="${y - 1.2 * s}" r="${1 * s}" fill="#fff"/>`
    + `<ellipse cx="${x - e - 3 * s}" cy="${y + 4.5 * s}" rx="${2.6 * s}" ry="${1.6 * s}" fill="#f07a8a" opacity=".75"/><ellipse cx="${x + e + 3 * s}" cy="${y + 4.5 * s}" rx="${2.6 * s}" ry="${1.6 * s}" fill="#f07a8a" opacity=".75"/></g>`
    + `<path d="M${x - 2.5 * s} ${y + 4 * s} q${2.5 * s} ${2.6 * s} ${5 * s} 0" fill="none" stroke-width="${2 * s}"/>`;
}

export const HERO_ICON: Record<HeroKind, string> = {
  // Tin soldier: red tunic with white cross straps, black shako with a gold badge and red plume.
  farmer: svg(
    `<path d="M12 64c0-12 9-19 20-19s20 7 20 19z" fill="#d8402f"/><path d="M19 50l26 14M45 50L19 64" fill="none" stroke="#fff" stroke-width="4"/>`
    + `<circle cx="32" cy="57" r="2.2" fill="#ffd84a" stroke="none"/>`
    + `<circle cx="32" cy="35" r="14" fill="#f8d8bc"/><path d="M43 28a14 14 0 0 1-19 19c10 1 20-8 19-19z" fill="#e8b898" stroke="none"/>`
    + face(32, 37, 0.8)
    + `<path d="M20 28V10h24v18z" fill="#2b2b2b"/><path d="M17 28h30v4H17z" fill="#2b2b2b"/><path d="M20 12h24" stroke="#ffd84a" stroke-width="2"/>`
    + `<circle cx="32" cy="19" r="3.5" fill="#ffd84a"/><path d="M32 10c-3-4-1-8 3-8c3 1 2 6-3 8z" fill="#e84a3a"/>`,
  ),
  // Wind-up robot: silver box head, dark visor with glowing eyes, antenna bulb, gold key at the side.
  beekeeper: svg(
    `<path d="M14 64V50h36v14z" fill="#b8c4cc"/><circle cx="26" cy="57" r="2.5" fill="#ff5a5a" stroke="none"/><circle cx="33" cy="57" r="2.5" fill="#ffd84a" stroke="none"/><circle cx="40" cy="57" r="2.5" fill="#5ad0ff" stroke="none"/>`
    + `<path d="M50 30h6M56 24v12" fill="none" stroke="#e0a820" stroke-width="4"/>`
    + `<path d="M32 16V8" fill="none"/><circle cx="32" cy="7" r="3.5" fill="#ff5a5a"/>`
    + `<rect x="13" y="16" width="38" height="32" rx="6" fill="#d4dde2"/><path d="M51 22v20a6 6 0 0 1-6 6H19c14-2 30-10 32-26z" fill="#a8b4bc" stroke="none"/>`
    + `<rect x="18" y="24" width="28" height="13" rx="4" fill="#2b3440"/>`
    + `<g stroke="none" fill="#6fe8ff"><circle cx="25" cy="30.5" r="3.2"/><circle cx="39" cy="30.5" r="3.2"/></g>`
    + `<path d="M26 42h12" fill="none" stroke-width="2.5"/><path d="M17 20h8" stroke="#fff" stroke-width="2.5" opacity=".8"/>`,
  ),
  // Plush dino: round green head with a light snout, yellow back spikes.
  chef: svg(
    `<path d="M12 64c0-12 9-19 20-19s20 7 20 19z" fill="#5cbf5a"/><path d="M24 64c0-8 4-12 8-12s8 4 8 12z" fill="#d8f0a0" stroke="none"/>`
    + `<path d="M22 14l4-8l4 7M30 12l5-9l4 9M38 14l6-6l1 9" fill="#ffd84a"/>`
    + `<circle cx="32" cy="32" r="18" fill="#5cbf5a"/><path d="M48 24a18 18 0 0 1-25 25c14 1 27-11 25-25z" fill="#3e9a3e" stroke="none"/>`
    + `<ellipse cx="32" cy="40" rx="11" ry="7" fill="#d8f0a0"/><g fill="${INK}" stroke="none"><circle cx="28.5" cy="38" r="1.3"/><circle cx="35.5" cy="38" r="1.3"/></g>`
    + `<path d="M28 43q4 3 8 0" fill="none" stroke-width="2"/>`
    + `<g stroke="none"><ellipse cx="25" cy="28" rx="2.6" ry="3.2" fill="${INK}"/><ellipse cx="39" cy="28" rx="2.6" ry="3.2" fill="${INK}"/><circle cx="26" cy="27" r="1" fill="#fff"/><circle cx="40" cy="27" r="1" fill="#fff"/></g>`
    + `<path d="M19 26c1-5 4-8 8-9" fill="none" stroke="#fff" stroke-width="2.5" opacity=".7"/>`,
  ),
};

/** One picture per stat, on its button in the run and in the village's training tab. */
export const STAT_ICON: Record<StatKey, string> = {
  dmg: '💥', spd: '⚡', crit: '🎯', multi: '🔱', range: '📡', move: '🚂', gold: '💰', wall: '🧱',
};

/** Tab icons that are not a hero portrait. */
export const TRAIN_ICON = svg(
  `<path d="M8 22h22v24H8z" fill="#3b6ea8"/><path d="M30 30h22v16H30z" fill="#3b6ea8"/><path d="M5 18h28v6H5z" fill="#8a5a3a"/>`
  + `<path d="M40 18h8v12h-8z" fill="#5a3a2a"/><path d="M12 27h12v9H12z" fill="#bfe6ff"/><path d="M52 34l6 10H52z" fill="#ffd84a"/>`
  + `<circle cx="16" cy="50" r="6" fill="#d8402f"/><circle cx="34" cy="50" r="5" fill="#d8402f"/><circle cx="46" cy="50" r="5" fill="#d8402f"/>`,
);
export const VILLAGE_ICON = svg(
  `<path d="M8 28h48v28H8z" fill="#e8762c"/><path d="M8 28h48l-4 30H12z" fill="#d05a1c" stroke="none" opacity=".35"/><path d="M8 28h48v28H8z" fill="none"/>`
  + `<path d="M6 18l50-4l2 12L8 30z" fill="#ff9a4c"/><path d="M28 40h8v8h-8z" fill="#ffd84a"/>`
  + `<circle cx="18" cy="11" r="6" fill="#5cbf5a"/><path d="M42 4l6 10H36z" fill="#6fd6ff"/>`,
);
export const DAILY_ICON = svg(
  `<path d="M10 28h44v28H10z" fill="#e8762c"/><path d="M8 20h48v10H8z" fill="#ff9a4c"/>`
  + `<path d="M28 20h8v36h-8z" fill="#ffe066"/><path d="M32 20c-6-10-16-10-14-3c1 3 8 3 14 3zm0 0c6-10 16-10 14-3c-1 3-8 3-14 3z" fill="#ffe066"/>`,
);
export const LEVEL_ICON = svg(
  `<path d="M16 8v50" stroke-width="5"/><path d="M18 10h32l-8 10l8 10H18z" fill="#d8402f"/>`
  + `<path d="M8 58h18" stroke-width="5"/><circle cx="34" cy="20" r="4" fill="#ffe066"/>`,
);
export const ACH_ICON = svg(
  `<path d="M18 10h28v14c0 10-6 16-14 16s-14-6-14-16z" fill="#ffd84a"/><path d="M18 14H9c0 9 4 14 11 14M46 14h9c0 9-4 14-11 14" fill="none"/>`
  + `<path d="M28 40h8v8h-8z" fill="#e0a820"/><path d="M18 48h28v8H18z" fill="#8a5a3a"/><path d="M24 14v10" stroke="#fff" stroke-width="3"/>`,
);

// --- Inline glyphs ----------------------------------------------------------------------------

const GEM = svg(
  `<path d="M20 8h24l14 16L32 58L6 24z" fill="#6fd6ff"/><path d="M6 24h52M20 8l-4 16l16 34l16-34l-4-16" fill="none" stroke-width="2.5"/>`
  + `<path d="M32 58L48 24h10z" fill="#2fa6d8" stroke="none"/><path d="M14 22l6-10" stroke="#fff" stroke-width="3"/>`,
  'gl',
);
const COIN = svg(
  `<circle cx="32" cy="32" r="25" fill="#f2c230"/><circle cx="32" cy="32" r="17" fill="#ffd84a" stroke="#c99a10" stroke-width="3"/>`
  + `<path d="M50 18a25 25 0 0 1-34 34c14 4 36-10 34-34z" fill="#d49a10" stroke="none"/>`
  + `<path d="M29 23v18M35 23v18" stroke="#c99a10" stroke-width="3"/><path d="M14 26c2-5 5-9 10-11" fill="none" stroke="#fff" stroke-width="3"/>`
  + `<circle cx="32" cy="32" r="25" fill="none"/>`,
  'gl',
);
const AD = svg(
  `<rect x="6" y="14" width="52" height="38" rx="9" fill="#ffe066"/><path d="M27 24v18l15-9z" fill="#e8762c" stroke-width="2.5"/>`,
  'gl',
);
const DOT = '<i class="dot"></i>';
export const SOUND_ON = svg(
  `<path d="M8 26h10l14-12v36L18 38H8z" fill="#fff"/><path d="M40 24c4 4 4 12 0 16M46 18c8 8 8 20 0 28" fill="none" stroke="#fff" stroke-width="4"/>`,
  'gl snd',
);
export const SOUND_OFF = svg(
  `<path d="M8 26h10l14-12v36L18 38H8z" fill="#fff"/><path d="M40 24l14 16M54 24L40 40" fill="none" stroke="#fff" stroke-width="4"/>`,
  'gl snd',
);

const GLYPH: Record<string, string> = { '💎': GEM, '🪙': COIN, '📺': AD, '🔴': DOT };
const GLYPH_RE = /(💎|🪙|📺|🔴)(\d*)/gu;

/** Swap the emoji glyphs in an HTML string for their inline SVGs; a price stays on one line. */
export function glyphs(html: string): string {
  return html.replace(GLYPH_RE, (_, g: string, n: string) => (n ? `<span class="amt">${GLYPH[g]}${n}</span>` : GLYPH[g]));
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

/** Same for an element whose text was set with textContent; does nothing once it is painted. */
export function paintGlyphs(el: HTMLElement): void {
  const text = el.textContent ?? '';
  GLYPH_RE.lastIndex = 0;
  if (el.childElementCount || !GLYPH_RE.test(text)) return;
  el.innerHTML = glyphs(text.replace(/[&<>]/g, (c) => ESC[c]));
}
