// Icons for the DOM screens. The coin and the crystal are pictures (src/assets/ui); the rest is
// inline SVG drawn like the 3D models: flat fill, one darker shade band, a white highlight and a
// navy outline. One trooper portrait per hero, a drawn icon per stat, the tab icons and the small
// glyphs (ad, sound). No ids inside the SVGs, so any number of copies can share a page.
// The picnic theme's sticker icons and toy portraits are in leftovers/.

import type { HeroKind, StatKey } from '../sim/types';
import coinPng from '../assets/ui/coin.png';
import crystalPng from '../assets/ui/crystal.png';

const NAVY = '#0a1a33';

function svg(body: string, cls = 'ic'): string {
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true" stroke="${NAVY}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
}

/** The hero's shoulders: gunmetal armour, pads in the helmet colour, a chest plate with a cyan light. */
function shoulders(shell: string, wide: boolean): string {
  const pad = wide ? 16 : 12;
  return `<path d="M8 64c0-11 10-17 24-17s24 6 24 17z" fill="#3a4352"/><path d="M40 48c9 2 16 8 16 16H44c0-7-2-12-4-16z" fill="#2a313d" stroke="none"/>`
    + `<rect x="${20 - pad}" y="46" width="${pad}" height="10" rx="4" fill="${shell}"/><rect x="44" y="46" width="${pad}" height="10" rx="4" fill="${shell}"/>`
    + `<rect x="24" y="52" width="16" height="9" rx="3" fill="${shell}"/><circle cx="32" cy="56.5" r="2.4" fill="#bff8ff" stroke="none"/>`;
}

/** An eye bar from (x1, y1) to (x2, y2), glowing. */
function eye(x1: number, y1: number, x2: number, y2: number, c: string, w = 5): string {
  return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${c}" stroke-width="${w + 3}" opacity=".35"/><path d="M${x1} ${y1}L${x2} ${y2}" stroke="${c}" stroke-width="${w}"/>`;
}

/**
 * One portrait per hero (troopers.ts): the village's hero tab, and the skill button and hero card
 * when the rendered portrait fails. Each head as on the model: dark glass face, glowing eyes.
 */
export const HERO_ICON: Record<HeroKind, string> = {
  // Marine: round orange helmet, two cyan eyes slanted up at the outside, ear pods.
  farmer: svg(
    shoulders('#ff8a30', false)
    + `<rect x="4" y="22" width="9" height="13" rx="4" fill="#3a4352"/><rect x="51" y="22" width="9" height="13" rx="4" fill="#3a4352"/>`
    + `<circle cx="32" cy="27" r="22" fill="#ff8a30"/><path d="M52 19a22 22 0 0 1-30 28c16 2 31-12 30-28z" fill="#d86a18" stroke="none"/>`
    + `<rect x="14" y="20" width="36" height="20" rx="10" fill="#0c1424"/>`
    + eye(19, 28, 27, 31, '#6ff0ff') + eye(37, 31, 45, 28, '#6ff0ff')
    + `<path d="M16 12q6-5 13-6" stroke="#fff" stroke-width="2.5" opacity=".8"/>`,
  ),
  // Engineer: an amber TV head, one cyan ring eye on a dark screen, an antenna with an orange tip.
  beekeeper: svg(
    shoulders('#f2b134', false)
    + `<path d="M44 10l4-7" fill="none" stroke-width="2.5"/><circle cx="48.5" cy="3.8" r="3.3" fill="#ff8a30"/>`
    + `<rect x="9" y="8" width="46" height="38" rx="11" fill="#f2b134"/><path d="M55 22v13c0 6-5 11-11 11H22c14-2 30-8 33-24z" fill="#c88a18" stroke="none"/>`
    + `<rect x="15" y="14" width="34" height="26" rx="7" fill="#0c1424"/>`
    + `<circle cx="32" cy="27" r="8" fill="none" stroke="#6ff0ff" stroke-width="2.5"/><circle cx="32" cy="27" r="4.5" fill="#6ff0ff" stroke="none"/>`
    + `<path d="M14 11q5-1 10-1" stroke="#fff" stroke-width="2.5" opacity=".8"/>`,
  ),
  // Heavy: a broad red-orange helmet, a brow over a slit, two amber eyes slanted down at the middle, big pads.
  chef: svg(
    shoulders('#e8622e', true)
    + `<rect x="8" y="9" width="48" height="38" rx="11" fill="#e8622e"/><path d="M56 24v12c0 6-5 11-11 11H22c14-2 31-8 34-23z" fill="#b8461c" stroke="none"/>`
    + `<rect x="13" y="25" width="38" height="11" rx="4" fill="#0c1424"/><rect x="6" y="18" width="52" height="8" rx="3" fill="#e8622e"/>`
    + eye(18, 29, 27, 32, '#ffc040', 4) + eye(37, 32, 46, 29, '#ffc040', 4)
    + `<rect x="24" y="39" width="16" height="6" rx="2" fill="#3a4352"/><circle cx="32" cy="13.5" r="2.8" fill="#6ff0ff" stroke="none"/>`
    + `<path d="M13 13q5-2 10-2" stroke="#fff" stroke-width="2.5" opacity=".8"/>`,
  ),
};


function img(src: string, cls: string): string {
  return `<img class="${cls}" src="${src}" alt="" draggable="false">`;
}

/** A small rocket pointing up, its base at (0, 0): white body, red nose, cyan exhaust. */
const ROCKET = `<path d="M-3 0l-2 7h10l-2-7z" fill="#5ff0ff"/><path d="M-5 0v-18c0-6 5-11 5-11s5 5 5 11v18z" fill="#eef4fa"/>`
  + `<path d="M-5-18c0-6 5-11 5-11s5 5 5 11z" fill="#ff5a4a"/><path d="M-5-6l-4 6h4zM5-6l4 6H5z" fill="#3fa8e0"/>`;

/** The shield, a cyan badge with a pale core; the wall's icon on the card and in the top bar. */
export const SHIELD_ICON = svg(
  `<path d="M32 4l24 9v17c0 15-10 25-24 30C18 55 8 45 8 30V13z" fill="#2fd8ff"/>`
  + `<path d="M32 13l15 6v12c0 10-6 17-15 21C23 48 17 41 17 31V19z" fill="#bff6ff" stroke="none"/>`
  + `<path d="M24 22l8-3l8 3v6l-8 3l-8-3z" fill="none" stroke="#2fb8e8" stroke-width="2.5"/><path d="M14 16l9-3" stroke="#fff" opacity=".8"/>`,
);

/** One icon per stat, on its button in the run and in the village's training tab. */
export const STAT_ICON: Record<StatKey, string> = {
  // Damage: a plasma shell flying up and right, a hot orange band and flare behind it.
  dmg: svg(
    `<g transform="rotate(45 32 32)"><path d="M23 52l-5 10l7-3l7 6l7-6l7 3l-5-10z" fill="#ffb02e"/>`
    + `<path d="M23 54V26c0-11 9-20 9-20s9 9 9 20v28z" fill="#e8eef5"/><path d="M36 10c3 4 5 10 5 16v28h-6V24c0-5-1-10-3-14z" fill="#b6c4d4" stroke="none"/>`
    + `<path d="M23 34h18v7H23z" fill="#ff7a2a"/><path d="M27 18c1-4 3-7 5-9" stroke="#fff" opacity=".9"/></g>`,
  ),
  // Fire rate: a yellow bolt with cyan speed streaks.
  spd: svg(
    `<path d="M4 24h12M2 34h12M6 44h10" stroke="#3fdcff" stroke-width="4"/><path d="M38 3L16 36h14l-6 25l28-35H37z" fill="#ffd23f"/>`
    + `<path d="M52 26L28 56l4-16h-2z" fill="#f0a020" stroke="none"/><path d="M33 9L22 26" stroke="#fff" opacity=".9"/>`,
  ),
  // Critical: a red targeting reticle round a hot centre.
  crit: svg(
    `<circle cx="32" cy="32" r="21" fill="rgba(255,90,74,0.18)" stroke="${NAVY}" stroke-width="9"/><circle cx="32" cy="32" r="21" fill="none" stroke="#ff4a4a" stroke-width="4"/>`
    + `<path d="M32 2v14M32 48v14M2 32h14M48 32h14" stroke="${NAVY}" stroke-width="8"/><path d="M32 4v11M32 49v11M4 32h11M49 32h11" stroke="#ff4a4a" stroke-width="3.5"/>`
    + `<circle cx="32" cy="32" r="6" fill="#ffd23f"/><path d="M18 22a17 17 0 0 1 8-6" stroke="#fff" opacity=".8"/>`,
  ),
  // Multishot: three rockets fanning out.
  multi: svg(
    `<g transform="translate(15 54) rotate(-30) scale(1.25)">${ROCKET}</g><g transform="translate(49 54) rotate(30) scale(1.25)">${ROCKET}</g><g transform="translate(32 55) scale(1.35)">${ROCKET}</g>`,
  ),
  // Range: a radar scope, rings and a green sweep with two blips.
  range: svg(
    `<circle cx="32" cy="32" r="27" fill="#133a6a"/><circle cx="32" cy="32" r="18" fill="none" stroke="#3fdcff" stroke-width="2" opacity=".7"/>`
    + `<circle cx="32" cy="32" r="9" fill="none" stroke="#3fdcff" stroke-width="2" opacity=".7"/>`
    + `<path d="M32 32L32 5A27 27 0 0 1 56 20z" fill="#6fffc8" opacity=".75" stroke="none"/><path d="M32 32L56 20" stroke="#bfffe8" stroke-width="2.5"/>`
    + `<circle cx="32" cy="32" r="3" fill="#bfffe8" stroke="none"/><circle cx="44" cy="15" r="3" fill="#ffd23f" stroke="none"/><circle cx="18" cy="44" r="2.5" fill="#ff5a4a" stroke="none"/>`,
  ),
  // Tank speed: the hover tank side on, a cyan glow under it, streaks behind.
  move: svg(
    `<ellipse cx="36" cy="50" rx="20" ry="4" fill="#5ff0ff" opacity=".8" stroke="none"/><path d="M2 30h10M4 40h8M6 22h6" stroke="#3fdcff" stroke-width="4"/>`
    + `<path d="M16 36h40l-5 10H20z" fill="#eef4fa"/><path d="M20 46l-4-10h40l-2 4H23z" fill="#c4d2e0" stroke="none"/><path d="M16 36h40l-5 10H20z" fill="none"/>`
    + `<path d="M24 36v-8c0-4 3-6 6-6h10c3 0 5 2 5 5v9z" fill="#eef4fa"/><path d="M45 27h15v5H45z" fill="#8a98a8"/>`
    + `<path d="M28 30h10" stroke="#3fdcff" stroke-width="3"/><path d="M22 40h28" stroke="#3fdcff" stroke-width="2.5"/>`,
  ),
  // Gold: a stack of gold credits, the top one with a hex mark.
  gold: svg(
    `<ellipse cx="32" cy="50" rx="22" ry="8" fill="#e0a020"/><path d="M10 42v8c0 4 10 8 22 8s22-4 22-8v-8z" fill="#e0a020"/>`
    + `<path d="M10 32v10c0 4 10 8 22 8s22-4 22-8V32z" fill="#f0b830"/><ellipse cx="32" cy="32" rx="22" ry="8" fill="#ffd84a"/>`
    + `<path d="M26 30l6-3l6 3l-6 3z" fill="#fff3b0" stroke="#c88a10" stroke-width="2"/><path d="M16 30q6-4 14-5" stroke="#fff" stroke-width="2.5" opacity=".9"/>`
    + `<path d="M46 8l2 5l5 2l-5 2l-2 5l-2-5l-5-2l5-2z" fill="#fff" stroke="none"/>`,
  ),
  wall: SHIELD_ICON,
};


/** Tab icons that are not a hero portrait. */
const TAB = {
  // Levels: a cyan waypoint marker standing on a small purple planet with a ring.
  level: svg(
    `<circle cx="32" cy="44" r="15" fill="#7a4cff"/><path d="M46 40a15 15 0 0 1-22 17c11 1 21-6 22-17z" fill="#5a30d0" stroke="none"/>`
    + `<path d="M8 47c4 5 44 1 48-8" fill="none" stroke="${NAVY}" stroke-width="7"/><path d="M8 47c4 5 44 1 48-8" fill="none" stroke="#ffc040" stroke-width="3"/>`
    + `<path d="M32 36c-9-9-13-14-13-20a13 13 0 0 1 26 0c0 6-4 11-13 20z" fill="#3fdcff"/><circle cx="32" cy="16" r="5" fill="#eaffff"/>`
    + `<path d="M23 12q2-4 6-6" stroke="#fff" stroke-width="2.5" opacity=".9"/>`,
  ),
  // Training: the hover tank with a green upgrade chevron over it.
  train: svg(
    `<ellipse cx="30" cy="56" rx="22" ry="4" fill="#5ff0ff" opacity=".8" stroke="none"/>`
    + `<path d="M6 42h46l-5 11H11z" fill="#eef4fa"/><path d="M11 53l-5-11h46l-2 4H14z" fill="#c4d2e0" stroke="none"/><path d="M6 42h46l-5 11H11z" fill="none"/>`
    + `<path d="M14 42v-9c0-4 3-6 6-6h12c3 0 6 2 6 6v9z" fill="#eef4fa"/><path d="M38 31h18v6H38z" fill="#8a98a8"/>`
    + `<path d="M19 35h12" stroke="#3fdcff" stroke-width="3"/><path d="M12 47h34" stroke="#3fdcff" stroke-width="2.5"/>`
    + `<path d="M44 4l13 13h-7v9h-12v-9h-7z" fill="#5ef08a"/><path d="M41 9l3-3" stroke="#fff" stroke-width="2.5" opacity=".9"/>`,
  ),
  // Workshop: a domed base with a lit door, an antenna and a light strip.
  village: svg(
    `<path d="M41 10V3" stroke-width="2.5"/><circle cx="41" cy="4" r="3" fill="#ffc040"/>`
    + `<path d="M6 56c0-20 12-34 26-34s26 14 26 34z" fill="#d8e2ec"/><path d="M44 27c8 6 13 16 14 29H44c1-12-1-22 0-29z" fill="#a8b8c8" stroke="none"/>`
    + `<path d="M6 56c0-20 12-34 26-34s26 14 26 34z" fill="none"/>`
    + `<path d="M12 40h40" stroke="#3fdcff" stroke-width="3"/><path d="M24 56V44a8 8 0 0 1 16 0v12z" fill="#1a2a44"/>`
    + `<path d="M27 56V45a5 5 0 0 1 10 0v11z" fill="#5ff0ff" stroke="none" opacity=".85"/><path d="M3 56h58" stroke-width="4"/>`
    + `<path d="M15 34q5-7 12-9" stroke="#fff" stroke-width="2.5" opacity=".9"/>`,
  ),
  // Daily: a gunmetal supply crate, glowing seams and a gold star on the lid.
  daily: svg(
    `<path d="M8 30h48v26H8z" fill="#5a6474"/><path d="M42 30h14v26H42z" fill="#434b58" stroke="none"/><path d="M8 30h48v26H8z" fill="none"/>`
    + `<path d="M6 20h52v10H6z" fill="#7a8494"/><path d="M14 30v26M50 30v26" stroke="#3fdcff" stroke-width="3"/>`
    + `<path d="M20 43h24" stroke="#3fdcff" stroke-width="3"/><path d="M6 25h52" stroke="#3fdcff" stroke-width="2.5" opacity=".7"/>`
    + `<path d="M32 3l4 8l9 1l-7 6l2 9l-8-5l-8 5l2-9l-7-6l9-1z" fill="#ffd23f"/><path d="M10 23h10" stroke="#fff" stroke-width="2.5" opacity=".8"/>`,
  ),
  // Achievements: a gold star medal on a cyan and violet ribbon.
  ach: svg(
    `<path d="M18 4h12l6 22H24z" fill="#3fdcff"/><path d="M46 4H34l-6 22h12z" fill="#7a4cff"/>`
    + `<circle cx="32" cy="40" r="19" fill="#ffc040"/><path d="M48 32a19 19 0 0 1-26 24c15 2 28-10 26-24z" fill="#e09a20" stroke="none"/>`
    + `<circle cx="32" cy="40" r="13" fill="none" stroke="#fff3b0" stroke-width="2.5"/>`
    + `<path d="M32 31l3 6l6 1l-4.5 4l1 6.5l-5.5-3l-5.5 3l1-6.5l-4.5-4l6-1z" fill="#fff3b0" stroke="#c88a10" stroke-width="2"/>`
    + `<path d="M19 33q3-7 10-9" stroke="#fff" stroke-width="2.5" opacity=".9"/>`,
  ),
  // Settings: the gear, steel with a cyan hub.
  gear: svg(
    `<path d="M28 6h8l2 8l6 3l7-4l6 6l-4 7l3 6l8 2v8l-8 2l-3 6l4 7l-6 6l-7-4l-6 3l-2 8h-8l-2-8l-6-3l-7 4l-6-6l4-7l-3-6l-8-2v-8l8-2l3-6l-4-7l6-6l7 4l6-3z" fill="#d7dee6"/>`
    + `<circle cx="32" cy="32" r="9" fill="#3fdcff"/>`,
  ),
};

export const LEVEL_ICON = TAB.level;
/**
 * The wave badge: a red-orange swarm bug seen from above (legs, a glowing back and two feelers), so
 * the counter beside it reads as "bugs incoming" at a glance rather than a level marker.
 */
export const WAVE_ICON = svg(
  `<path d="M20 30L7 24M20 38L5 40M22 46L10 56M44 30l13-6M44 38l15 2M42 46l12 10" stroke-width="4"/>`
  + `<path d="M26 12l-6-8M38 12l6-8" stroke-width="3.5"/>`
  + `<ellipse cx="32" cy="16" rx="9" ry="7" fill="#ff5a3c"/>`
  + `<ellipse cx="32" cy="38" rx="15" ry="19" fill="#ff7a3c"/><path d="M44 28c4 10 1 22-10 28c11-1 17-12 13-25z" fill="#d84a20" stroke="none"/>`
  + `<ellipse cx="32" cy="38" rx="15" ry="19" fill="none"/><path d="M32 22v34" stroke-width="2.5"/>`
  + `<circle cx="27" cy="15" r="2.4" fill="#ffe14a" stroke="none"/><circle cx="37" cy="15" r="2.4" fill="#ffe14a" stroke="none"/>`
  + `<path d="M24 28q2-5 6-6" stroke="#fff" stroke-width="2.5" opacity=".85"/>`,
);
export const TRAIN_ICON = TAB.train;
export const VILLAGE_ICON = TAB.village;
export const DAILY_ICON = TAB.daily;
export const ACH_ICON = TAB.ach;
export const GEAR_ICON = TAB.gear;

// --- Inline glyphs ----------------------------------------------------------------------------

const GEM = img(crystalPng, 'gl');
const COIN = img(coinPng, 'gl');
const AD = svg(
  `<rect x="6" y="14" width="52" height="38" rx="9" fill="#ffe066"/><path d="M27 24v18l15-9z" fill="#e8762c" stroke-width="2.5"/>`,
  'gl',
);
const DOT = '<i class="dot"></i>';
/** A padlock for locked levels and modes: steel shackle over a gold body with a keyhole. */
export const LOCK_ICON = svg(
  `<path d="M20 30V21a12 12 0 0 1 24 0v9" fill="none" stroke="${NAVY}" stroke-width="10"/><path d="M20 30V21a12 12 0 0 1 24 0v9" fill="none" stroke="#b9c6d8" stroke-width="5"/>`
  + `<rect x="12" y="28" width="40" height="30" rx="6" fill="#ffc940"/><path d="M12 48h40v4a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6z" fill="#e0962a" stroke="none"/>`
  + `<path d="M17 34h12" stroke="#fff" stroke-width="3" opacity=".8"/><circle cx="32" cy="41" r="4.5" fill="${NAVY}" stroke="none"/><path d="M32 43v7" stroke="${NAVY}" stroke-width="4"/>`,
  'gl lock',
);
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

/**
 * The guide's pointing hand (§12): a yellow glove, index finger up with its tip at (16, 4), the
 * other fingers curled into a fist with a thumb at the side, and a dark cuff with an orange line.
 * Yellow because nothing else on the blue screen is that bright and warm; white and cyan melted into the HUD.
 */
export const HAND_ICON = svg(
  `<ellipse cx="10" cy="43" rx="6" ry="8.5" transform="rotate(-32 10 43)" fill="#ffd84a"/>` +
    `<path d="M10 44V10a6 6 0 0 1 12 0v17a5.5 5.5 0 0 1 11 1a5.5 5.5 0 0 1 11 1a5 5 0 0 1 10 3v13c0 7-6 11-13 11H24c-9 0-14-5-14-12z" fill="#ffd84a"/>` +
    `<path d="M54 36v9c0 7-6 11-13 11H31c10-2 16-8 17-20z" fill="#f0a020" stroke="none"/>` +
    `<path d="M33 29v6M44 30v6" fill="none" stroke-width="2.5"/>` +
    `<path d="M14.5 10v11" stroke="#fff6c8" stroke-width="2.5"/>` +
    `<rect x="20" y="53" width="31" height="9" rx="3" fill="#1d3150"/><path d="M24 57.5h23" stroke="#ff6a2a" stroke-width="3"/>`,
  'hand',
);
