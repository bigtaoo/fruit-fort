// Inline SVG icons for the DOM screens: one toon portrait per fruit and hero, plus the small
// glyphs (crystal, coin, ad, sound) that stand in for emoji in button labels. Drawn like the 3D
// models: flat fill, one darker shade band, a white highlight and the same dark brown outline.
// No ids inside the SVGs, so any number of copies can share a page.

import type { FruitKind, HeroKind } from '../sim/types';

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

export const FRUIT_ICON: Record<FruitKind, string> = {
  strawberry: svg(
    `<path d="M32 58C18 51 9 38 11 27c2-8 12-11 21-7c9-4 19-1 21 7c2 11-7 24-21 31z" fill="#e8384f"/>`
    + `<path d="M42 21c7 1 11 4 11 6c2 11-7 24-21 31c9-9 13-22 10-37z" fill="#b8243a" stroke="none"/>`
    + `<path d="M16 30c1-4 4-6 7-6" fill="none" stroke="#fff" stroke-width="3" opacity=".8"/>`
    + `<g fill="#ffe27a" stroke="none"><ellipse cx="18" cy="38" rx="1.4" ry="2"/><ellipse cx="46" cy="38" rx="1.4" ry="2"/><ellipse cx="24" cy="48" rx="1.4" ry="2"/><ellipse cx="40" cy="48" rx="1.4" ry="2"/><ellipse cx="32" cy="53" rx="1.4" ry="2"/><ellipse cx="44" cy="29" rx="1.4" ry="2"/></g>`
    + `<path d="M19 22l6-7l4 5l3-10l3 10l4-5l6 7l-9 2l-4 4l-4-4z" fill="#3d9a3a"/>`
    + face(32, 37, 1.3),
  ),
  coconut: svg(
    `<circle cx="32" cy="35" r="23" fill="#8a5a3b"/>`
    + `<path d="M48 19a23 23 0 0 1-30 34c14 2 30-12 30-34z" fill="#6a4029" stroke="none"/>`
    + `<g fill="none" stroke="#5a3520" stroke-width="2"><path d="M14 30l-3-2M16 22l-3-3M50 44l3 2M20 52l-2 3M46 51l2 3"/></g>`
    + `<path d="M17 28c2-6 6-9 11-10" fill="none" stroke="#c99a74" stroke-width="3"/>`
    + `<g fill="#3a2414" stroke="none"><circle cx="26" cy="17" r="2.4"/><circle cx="34" cy="15" r="2.4"/><circle cx="31" cy="21" r="2.2"/></g>`
    + face(32, 38, 1.3),
  ),
  watermelon: svg(
    `<circle cx="32" cy="34" r="24" fill="#3fa34d"/>`
    + `<g fill="#23702f" stroke="none"><path d="M32 10c-6 8-6 40 0 48c-2-10-2-38 0-48z"/><path d="M20 13c-8 9-8 33 0 42c-4-11-4-31 0-42z"/><path d="M44 13c8 9 8 33 0 42c4-11 4-31 0-42z"/></g>`
    + `<path d="M50 20a24 24 0 0 1-34 33c16 3 36-12 34-33z" fill="#2a7a35" stroke="none" opacity=".6"/>`
    + `<path d="M15 28c2-6 7-11 13-12" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/>`
    + `<circle cx="32" cy="34" r="24" fill="none"/>`
    + `<path d="M32 10c0-3 2-5 4-6" fill="none" stroke="#6b4a2a"/>`
    + face(32, 38, 1.3),
  ),
  grape: svg(
    `<path d="M32 12V6" fill="none" stroke="#6b4a2a"/><path d="M33 9c4-6 13-6 17-2c-5 5-12 6-17 2z" fill="#3d9a3a"/>`
    + `<g fill="#7b3fa0"><circle cx="21" cy="21" r="8"/><circle cx="43" cy="21" r="8"/><circle cx="16" cy="35" r="8"/><circle cx="48" cy="35" r="8"/><circle cx="24" cy="49" r="8"/><circle cx="40" cy="49" r="8"/><circle cx="32" cy="57" r="6"/><circle cx="32" cy="34" r="13"/></g>`
    + `<g fill="#fff" stroke="none" opacity=".75"><circle cx="18" cy="18" r="2"/><circle cx="40" cy="18" r="2"/><circle cx="13" cy="32" r="2"/><circle cx="26" cy="27" r="3"/></g>`
    + `<path d="M43 26a13 13 0 0 1-17 19c9-1 17-9 17-19z" fill="#5a2a7a" stroke="none"/>`
    + face(32, 35, 1.05),
  ),
  lemon: svg(
    `<path d="M8 36c-2-4 1-6 4-7c5-12 18-17 30-14c6 1 10 4 12 8c3 0 5 3 3 6c2 12-8 24-24 26c-11 1-21-6-23-14c-2-1-3-3-2-5z" fill="#f2d230"/>`
    + `<path d="M54 26c3 12-6 26-22 28c-8 1-15-2-19-7c14 5 33 0 41-21z" fill="#d4a812" stroke="none"/>`
    + `<path d="M18 28c3-5 8-8 14-9" fill="none" stroke="#fff" stroke-width="3" opacity=".8"/>`
    + `<path d="M44 14c3-4 8-5 11-4c-2 4-7 6-11 4z" fill="#3d9a3a"/>`
    + face(32, 37, 1.3),
  ),
};

/** Chibi head and shoulders in the outfit colour; the hat says which job. */
function hero(outfit: string, hat: string, extra = ''): string {
  return svg(
    `<path d="M12 64c0-12 9-19 20-19s20 7 20 19z" fill="${outfit}"/>`
    + extra
    + `<circle cx="32" cy="34" r="15" fill="#f5c99b"/>`
    + `<path d="M44 26a15 15 0 0 1-21 21c11 1 22-8 21-21z" fill="#e0a87a" stroke="none"/>`
    + face(32, 35, 0.85)
    + hat,
  );
}

export const HERO_ICON: Record<HeroKind, string> = {
  farmer: hero(
    '#3a6fd8',
    `<ellipse cx="32" cy="24" rx="25" ry="6" fill="#e8c547"/><path d="M20 23c0-10 5-15 12-15s12 5 12 15z" fill="#e8c547"/>`
      + `<path d="M20.5 19h23v4h-23z" fill="#c0392b" stroke="none"/><path d="M36 11c3 1 5 4 6 8" fill="none" stroke="#fff3b0" stroke-width="2.5"/>`,
    `<path d="M24 64v-14M40 64v-14" fill="none" stroke="#2a4f9a" stroke-width="5"/><circle cx="24" cy="54" r="2" fill="#ffe066" stroke="none"/><circle cx="40" cy="54" r="2" fill="#ffe066" stroke="none"/>`,
  ),
  beekeeper: hero(
    '#e8b020',
    `<path d="M15 28c0-10 7-18 17-18s17 8 17 18z" fill="#fff8e0"/><ellipse cx="32" cy="28" rx="20" ry="4" fill="#fff8e0"/>`
      + `<path d="M13 29c0 9 2 15 5 18M51 29c0 9-2 15-5 18" fill="none" stroke-width="2" opacity=".5"/>`
      + `<g transform="translate(50 12)"><ellipse cx="0" cy="0" rx="6" ry="4.5" fill="#ffd23a" stroke-width="2"/><path d="M-1-4v8M3-3v6" stroke-width="2"/><ellipse cx="-2" cy="-6" rx="3" ry="2.5" fill="#e8f4ff" stroke-width="1.5"/></g>`,
    `<path d="M13 58h38" stroke="${INK}" stroke-width="5" opacity=".85"/>`,
  ),
  chef: hero(
    '#f4f4f4',
    `<path d="M21 24v-7h22v7z" fill="#fff"/><path d="M19 17c-5-1-6-9 0-10c1-5 8-6 11-3c3-4 11-3 12 2c6 0 7 9 1 11z" fill="#fff"/>`
      + `<path d="M28 9c-1 2-1 5 0 7M37 9c1 2 1 5 0 7" fill="none" stroke-width="2" opacity=".4"/>`,
    `<path d="M24 49c4 4 12 4 16 0l4 4c-6 6-18 6-24 0z" fill="#d8402f"/><circle cx="32" cy="58" r="1.8" fill="${INK}" stroke="none"/>`,
  ),
};

/** Tab icons that are not a fruit or hero portrait. */
export const VILLAGE_ICON = svg(
  `<path d="M10 30L32 12l22 18" fill="#5a3a2a"/><path d="M15 28v26h34V28L32 15z" fill="#c0392b"/>`
  + `<path d="M27 54V40h10v14z" fill="#f4f0e0"/><path d="M8 32L32 12l24 20" fill="none" stroke-width="5"/><path d="M8 32L32 12l24 20" fill="none" stroke="#7a4a32" stroke-width="2"/>`,
);
export const DAILY_ICON = svg(
  `<path d="M10 28h44v28H10z" fill="#e8762c"/><path d="M8 20h48v10H8z" fill="#ff9a4c"/>`
  + `<path d="M28 20h8v36h-8z" fill="#ffe066"/><path d="M32 20c-6-10-16-10-14-3c1 3 8 3 14 3zm0 0c6-10 16-10 14-3c-1 3-8 3-14 3z" fill="#ffe066"/>`,
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
