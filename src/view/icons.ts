// Icons for the DOM screens. The stat icons, the coin and the crystal are the sticker pictures
// from the UI art round (docs/art/ui_r1, src/assets/ui). The rest is inline SVG: one toon portrait
// per hero (the toys), the tab icons and the small glyphs (ad, sound), drawn like the 3D models:
// flat fill, one darker shade band, a white highlight and the same dark brown outline. No ids
// inside the SVGs, so any number of copies can share a page.

import type { HeroKind, StatKey } from '../sim/types';
import { SCIFI } from './theme';
import coinPng from '../assets/ui/coin.png';
import crystalPng from '../assets/ui/crystal.png';
import dmgPng from '../assets/ui/icon_dmg.png';
import spdPng from '../assets/ui/icon_spd.png';
import critPng from '../assets/ui/icon_crit.png';
import multiPng from '../assets/ui/icon_multi.png';
import rangePng from '../assets/ui/icon_range.png';
import movePng from '../assets/ui/icon_move.png';
import goldPng from '../assets/ui/icon_gold.png';
import wallPng from '../assets/ui/icon_wall.png';

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

const NAVY = '#0a1a33';

/** The sci-fi skin's icons: the same flat toon drawing, outlined in navy instead of brown. */
function sci(body: string): string {
  return `<svg class="ic" viewBox="0 0 64 64" aria-hidden="true" stroke="${NAVY}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
}

/**
 * Sci-fi: a trooper's head and shoulders (scifi.ts makeTrooper), a round helmet with a wide glowing
 * visor, a trim band and side pods, over armoured shoulders with a chest light.
 */
function trooper(armour: string, armourShade: string, helmet: string, helmetShade: string, visor: string, trim: string, extra = ''): string {
  return sci(
    `<path d="M8 64c0-11 10-17 24-17s24 6 24 17z" fill="${armour}"/><path d="M40 48c9 2 16 8 16 16H44c0-7-2-12-4-16z" fill="${armourShade}" stroke="none"/>`
    + `<rect x="24" y="52" width="16" height="9" rx="3" fill="#1a2232"/><circle cx="32" cy="56.5" r="2.4" fill="${trim}" stroke="none"/>`
    + extra
    + `<rect x="5" y="22" width="8" height="12" rx="3" fill="#5a6474"/><rect x="51" y="22" width="8" height="12" rx="3" fill="#5a6474"/>`
    + `<circle cx="32" cy="28" r="22" fill="${helmet}"/><path d="M52 20a22 22 0 0 1-30 28c16 2 31-12 30-28z" fill="${helmetShade}" stroke="none"/>`
    + `<path d="M12 18q20-9 40 0" fill="none" stroke="${trim}" stroke-width="3"/>`
    + `<path d="M13 26q19-6 38 0v8q-4 9-19 9t-19-9z" fill="${visor}"/>`
    + `<path d="M17 28q8-3 16-3" stroke="#fff" stroke-width="3" opacity=".85"/><path d="M42 36q4-1 6-4" stroke="#fff" stroke-width="2" opacity=".5"/>`
    + `<path d="M16 12q6-5 13-6" stroke="#fff" stroke-width="2.5" opacity=".8"/>`,
  );
}

const SCIFI_HERO: Record<HeroKind, string> = {
  // Marine: white armour, violet visor, cyan trim.
  farmer: trooper('#eef4fa', '#c4d2e0', '#f2f6fa', '#c8d6e4', '#7a4cff', '#3fdcff'),
  // Engineer: orange armour, white helmet, cyan visor, an antenna with an amber tip.
  beekeeper: trooper('#ff8a30', '#d86a18', '#f2f6fa', '#c8d6e4', '#30d8ff', '#ffc040',
    `<path d="M46 12l4-8" fill="none" stroke-width="2.5"/><circle cx="50.5" cy="4.5" r="3.5" fill="#ffc040"/>`),
  // Heavy: gunmetal armour, broad pads, red helmet, amber visor.
  chef: trooper('#5a6474', '#434b58', '#e2553a', '#b83e28', '#ffb030', '#ff7040',
    `<rect x="4" y="46" width="16" height="10" rx="3" fill="#6a7484"/><rect x="44" y="46" width="16" height="10" rx="3" fill="#6a7484"/>`),
};

export const HERO_ICON: Record<HeroKind, string> = SCIFI ? SCIFI_HERO : {
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

function img(src: string, cls: string): string {
  return `<img class="${cls}" src="${src}" alt="" draggable="false">`;
}

/** A small rocket pointing up, its base at (0, 0): white body, red nose, cyan exhaust. */
const ROCKET = `<path d="M-3 0l-2 7h10l-2-7z" fill="#5ff0ff"/><path d="M-5 0v-18c0-6 5-11 5-11s5 5 5 11v18z" fill="#eef4fa"/>`
  + `<path d="M-5-18c0-6 5-11 5-11s5 5 5 11z" fill="#ff5a4a"/><path d="M-5-6l-4 6h4zM5-6l4 6H5z" fill="#3fa8e0"/>`;

/** Sci-fi: the shield, a cyan badge with a pale core; the wall's icon on the card and in the top bar. */
export const SHIELD_ICON = sci(
  `<path d="M32 4l24 9v17c0 15-10 25-24 30C18 55 8 45 8 30V13z" fill="#2fd8ff"/>`
  + `<path d="M32 13l15 6v12c0 10-6 17-15 21C23 48 17 41 17 31V19z" fill="#bff6ff" stroke="none"/>`
  + `<path d="M24 22l8-3l8 3v6l-8 3l-8-3z" fill="none" stroke="#2fb8e8" stroke-width="2.5"/><path d="M14 16l9-3" stroke="#fff" opacity=".8"/>`,
);

const SCIFI_STAT: Record<StatKey, string> = {
  // Damage: a plasma shell flying up and right, a hot orange band and flare behind it.
  dmg: sci(
    `<g transform="rotate(45 32 32)"><path d="M23 52l-5 10l7-3l7 6l7-6l7 3l-5-10z" fill="#ffb02e"/>`
    + `<path d="M23 54V26c0-11 9-20 9-20s9 9 9 20v28z" fill="#e8eef5"/><path d="M36 10c3 4 5 10 5 16v28h-6V24c0-5-1-10-3-14z" fill="#b6c4d4" stroke="none"/>`
    + `<path d="M23 34h18v7H23z" fill="#ff7a2a"/><path d="M27 18c1-4 3-7 5-9" stroke="#fff" opacity=".9"/></g>`,
  ),
  // Fire rate: a yellow bolt with cyan speed streaks.
  spd: sci(
    `<path d="M4 24h12M2 34h12M6 44h10" stroke="#3fdcff" stroke-width="4"/><path d="M38 3L16 36h14l-6 25l28-35H37z" fill="#ffd23f"/>`
    + `<path d="M52 26L28 56l4-16h-2z" fill="#f0a020" stroke="none"/><path d="M33 9L22 26" stroke="#fff" opacity=".9"/>`,
  ),
  // Critical: a red targeting reticle round a hot centre.
  crit: sci(
    `<circle cx="32" cy="32" r="21" fill="rgba(255,90,74,0.18)" stroke="${NAVY}" stroke-width="9"/><circle cx="32" cy="32" r="21" fill="none" stroke="#ff4a4a" stroke-width="4"/>`
    + `<path d="M32 2v14M32 48v14M2 32h14M48 32h14" stroke="${NAVY}" stroke-width="8"/><path d="M32 4v11M32 49v11M4 32h11M49 32h11" stroke="#ff4a4a" stroke-width="3.5"/>`
    + `<circle cx="32" cy="32" r="6" fill="#ffd23f"/><path d="M18 22a17 17 0 0 1 8-6" stroke="#fff" opacity=".8"/>`,
  ),
  // Multishot: three rockets fanning out.
  multi: sci(
    `<g transform="translate(15 54) rotate(-30) scale(1.25)">${ROCKET}</g><g transform="translate(49 54) rotate(30) scale(1.25)">${ROCKET}</g><g transform="translate(32 55) scale(1.35)">${ROCKET}</g>`,
  ),
  // Range: a radar scope, rings and a green sweep with two blips.
  range: sci(
    `<circle cx="32" cy="32" r="27" fill="#133a6a"/><circle cx="32" cy="32" r="18" fill="none" stroke="#3fdcff" stroke-width="2" opacity=".7"/>`
    + `<circle cx="32" cy="32" r="9" fill="none" stroke="#3fdcff" stroke-width="2" opacity=".7"/>`
    + `<path d="M32 32L32 5A27 27 0 0 1 56 20z" fill="#6fffc8" opacity=".75" stroke="none"/><path d="M32 32L56 20" stroke="#bfffe8" stroke-width="2.5"/>`
    + `<circle cx="32" cy="32" r="3" fill="#bfffe8" stroke="none"/><circle cx="44" cy="15" r="3" fill="#ffd23f" stroke="none"/><circle cx="18" cy="44" r="2.5" fill="#ff5a4a" stroke="none"/>`,
  ),
  // Tank speed: the hover tank side on, a cyan glow under it, streaks behind.
  move: sci(
    `<ellipse cx="36" cy="50" rx="20" ry="4" fill="#5ff0ff" opacity=".8" stroke="none"/><path d="M2 30h10M4 40h8M6 22h6" stroke="#3fdcff" stroke-width="4"/>`
    + `<path d="M16 36h40l-5 10H20z" fill="#eef4fa"/><path d="M20 46l-4-10h40l-2 4H23z" fill="#c4d2e0" stroke="none"/><path d="M16 36h40l-5 10H20z" fill="none"/>`
    + `<path d="M24 36v-8c0-4 3-6 6-6h10c3 0 5 2 5 5v9z" fill="#eef4fa"/><path d="M45 27h15v5H45z" fill="#8a98a8"/>`
    + `<path d="M28 30h10" stroke="#3fdcff" stroke-width="3"/><path d="M22 40h28" stroke="#3fdcff" stroke-width="2.5"/>`,
  ),
  // Gold: a stack of gold credits, the top one with a hex mark.
  gold: sci(
    `<ellipse cx="32" cy="50" rx="22" ry="8" fill="#e0a020"/><path d="M10 42v8c0 4 10 8 22 8s22-4 22-8v-8z" fill="#e0a020"/>`
    + `<path d="M10 32v10c0 4 10 8 22 8s22-4 22-8V32z" fill="#f0b830"/><ellipse cx="32" cy="32" rx="22" ry="8" fill="#ffd84a"/>`
    + `<path d="M26 30l6-3l6 3l-6 3z" fill="#fff3b0" stroke="#c88a10" stroke-width="2"/><path d="M16 30q6-4 14-5" stroke="#fff" stroke-width="2.5" opacity=".9"/>`
    + `<path d="M46 8l2 5l5 2l-5 2l-2 5l-2-5l-5-2l5-2z" fill="#fff" stroke="none"/>`,
  ),
  wall: SHIELD_ICON,
};

/** One sticker per stat, on its button in the run and in the village's training tab (sci-fi: drawn). */
export const STAT_ICON: Record<StatKey, string> = SCIFI ? SCIFI_STAT : {
  dmg: img(dmgPng, 'ic'), spd: img(spdPng, 'ic'), crit: img(critPng, 'ic'), multi: img(multiPng, 'ic'),
  range: img(rangePng, 'ic'), move: img(movePng, 'ic'), gold: img(goldPng, 'ic'), wall: img(wallPng, 'ic'),
};

/** Tab icons that are not a hero portrait. */
const TOY_TRAIN_ICON = svg(
  `<path d="M8 22h22v24H8z" fill="#3b6ea8"/><path d="M30 30h22v16H30z" fill="#3b6ea8"/><path d="M5 18h28v6H5z" fill="#8a5a3a"/>`
  + `<path d="M40 18h8v12h-8z" fill="#5a3a2a"/><path d="M12 27h12v9H12z" fill="#bfe6ff"/><path d="M52 34l6 10H52z" fill="#ffd84a"/>`
  + `<circle cx="16" cy="50" r="6" fill="#d8402f"/><circle cx="34" cy="50" r="5" fill="#d8402f"/><circle cx="46" cy="50" r="5" fill="#d8402f"/>`,
);
const TOY_VILLAGE_ICON = svg(
  `<path d="M8 28h48v28H8z" fill="#e8762c"/><path d="M8 28h48l-4 30H12z" fill="#d05a1c" stroke="none" opacity=".35"/><path d="M8 28h48v28H8z" fill="none"/>`
  + `<path d="M6 18l50-4l2 12L8 30z" fill="#ff9a4c"/><path d="M28 40h8v8h-8z" fill="#ffd84a"/>`
  + `<circle cx="18" cy="11" r="6" fill="#5cbf5a"/><path d="M42 4l6 10H36z" fill="#6fd6ff"/>`,
);
const TOY_DAILY_ICON = svg(
  `<path d="M10 28h44v28H10z" fill="#e8762c"/><path d="M8 20h48v10H8z" fill="#ff9a4c"/>`
  + `<path d="M28 20h8v36h-8z" fill="#ffe066"/><path d="M32 20c-6-10-16-10-14-3c1 3 8 3 14 3zm0 0c6-10 16-10 14-3c-1 3-8 3-14 3z" fill="#ffe066"/>`,
);
const TOY_LEVEL_ICON = svg(
  `<path d="M16 8v50" stroke-width="5"/><path d="M18 10h32l-8 10l8 10H18z" fill="#d8402f"/>`
  + `<path d="M8 58h18" stroke-width="5"/><circle cx="34" cy="20" r="4" fill="#ffe066"/>`,
);
const TOY_ACH_ICON = svg(
  `<path d="M18 10h28v14c0 10-6 16-14 16s-14-6-14-16z" fill="#ffd84a"/><path d="M18 14H9c0 9 4 14 11 14M46 14h9c0 9-4 14-11 14" fill="none"/>`
  + `<path d="M28 40h8v8h-8z" fill="#e0a820"/><path d="M18 48h28v8H18z" fill="#8a5a3a"/><path d="M24 14v10" stroke="#fff" stroke-width="3"/>`,
);

/** Sci-fi tab icons, the same jobs drawn for the base: */
const SCIFI_TAB = {
  // Levels: a cyan waypoint marker standing on a small purple planet with a ring.
  level: sci(
    `<circle cx="32" cy="44" r="15" fill="#7a4cff"/><path d="M46 40a15 15 0 0 1-22 17c11 1 21-6 22-17z" fill="#5a30d0" stroke="none"/>`
    + `<path d="M8 47c4 5 44 1 48-8" fill="none" stroke="${NAVY}" stroke-width="7"/><path d="M8 47c4 5 44 1 48-8" fill="none" stroke="#ffc040" stroke-width="3"/>`
    + `<path d="M32 36c-9-9-13-14-13-20a13 13 0 0 1 26 0c0 6-4 11-13 20z" fill="#3fdcff"/><circle cx="32" cy="16" r="5" fill="#eaffff"/>`
    + `<path d="M23 12q2-4 6-6" stroke="#fff" stroke-width="2.5" opacity=".9"/>`,
  ),
  // Training: the hover tank with a green upgrade chevron over it.
  train: sci(
    `<ellipse cx="30" cy="56" rx="22" ry="4" fill="#5ff0ff" opacity=".8" stroke="none"/>`
    + `<path d="M6 42h46l-5 11H11z" fill="#eef4fa"/><path d="M11 53l-5-11h46l-2 4H14z" fill="#c4d2e0" stroke="none"/><path d="M6 42h46l-5 11H11z" fill="none"/>`
    + `<path d="M14 42v-9c0-4 3-6 6-6h12c3 0 6 2 6 6v9z" fill="#eef4fa"/><path d="M38 31h18v6H38z" fill="#8a98a8"/>`
    + `<path d="M19 35h12" stroke="#3fdcff" stroke-width="3"/><path d="M12 47h34" stroke="#3fdcff" stroke-width="2.5"/>`
    + `<path d="M44 4l13 13h-7v9h-12v-9h-7z" fill="#5ef08a"/><path d="M41 9l3-3" stroke="#fff" stroke-width="2.5" opacity=".9"/>`,
  ),
  // Workshop: a domed base with a lit door, an antenna and a light strip.
  village: sci(
    `<path d="M41 10V3" stroke-width="2.5"/><circle cx="41" cy="4" r="3" fill="#ffc040"/>`
    + `<path d="M6 56c0-20 12-34 26-34s26 14 26 34z" fill="#d8e2ec"/><path d="M44 27c8 6 13 16 14 29H44c1-12-1-22 0-29z" fill="#a8b8c8" stroke="none"/>`
    + `<path d="M6 56c0-20 12-34 26-34s26 14 26 34z" fill="none"/>`
    + `<path d="M12 40h40" stroke="#3fdcff" stroke-width="3"/><path d="M24 56V44a8 8 0 0 1 16 0v12z" fill="#1a2a44"/>`
    + `<path d="M27 56V45a5 5 0 0 1 10 0v11z" fill="#5ff0ff" stroke="none" opacity=".85"/><path d="M3 56h58" stroke-width="4"/>`
    + `<path d="M15 34q5-7 12-9" stroke="#fff" stroke-width="2.5" opacity=".9"/>`,
  ),
  // Daily: a gunmetal supply crate, glowing seams and a gold star on the lid.
  daily: sci(
    `<path d="M8 30h48v26H8z" fill="#5a6474"/><path d="M42 30h14v26H42z" fill="#434b58" stroke="none"/><path d="M8 30h48v26H8z" fill="none"/>`
    + `<path d="M6 20h52v10H6z" fill="#7a8494"/><path d="M14 30v26M50 30v26" stroke="#3fdcff" stroke-width="3"/>`
    + `<path d="M20 43h24" stroke="#3fdcff" stroke-width="3"/><path d="M6 25h52" stroke="#3fdcff" stroke-width="2.5" opacity=".7"/>`
    + `<path d="M32 3l4 8l9 1l-7 6l2 9l-8-5l-8 5l2-9l-7-6l9-1z" fill="#ffd23f"/><path d="M10 23h10" stroke="#fff" stroke-width="2.5" opacity=".8"/>`,
  ),
  // Achievements: a gold star medal on a cyan and violet ribbon.
  ach: sci(
    `<path d="M18 4h12l6 22H24z" fill="#3fdcff"/><path d="M46 4H34l-6 22h12z" fill="#7a4cff"/>`
    + `<circle cx="32" cy="40" r="19" fill="#ffc040"/><path d="M48 32a19 19 0 0 1-26 24c15 2 28-10 26-24z" fill="#e09a20" stroke="none"/>`
    + `<circle cx="32" cy="40" r="13" fill="none" stroke="#fff3b0" stroke-width="2.5"/>`
    + `<path d="M32 31l3 6l6 1l-4.5 4l1 6.5l-5.5-3l-5.5 3l1-6.5l-4.5-4l6-1z" fill="#fff3b0" stroke="#c88a10" stroke-width="2"/>`
    + `<path d="M19 33q3-7 10-9" stroke="#fff" stroke-width="2.5" opacity=".9"/>`,
  ),
  // Settings: the gear, steel with a cyan hub.
  gear: sci(
    `<path d="M28 6h8l2 8l6 3l7-4l6 6l-4 7l3 6l8 2v8l-8 2l-3 6l4 7l-6 6l-7-4l-6 3l-2 8h-8l-2-8l-6-3l-7 4l-6-6l4-7l-3-6l-8-2v-8l8-2l3-6l-4-7l6-6l7 4l6-3z" fill="#d7dee6"/>`
    + `<circle cx="32" cy="32" r="9" fill="#3fdcff"/>`,
  ),
};

/** Tab icons by theme. */
export const LEVEL_ICON = SCIFI ? SCIFI_TAB.level : TOY_LEVEL_ICON;
export const TRAIN_ICON = SCIFI ? SCIFI_TAB.train : TOY_TRAIN_ICON;
export const VILLAGE_ICON = SCIFI ? SCIFI_TAB.village : TOY_VILLAGE_ICON;
export const DAILY_ICON = SCIFI ? SCIFI_TAB.daily : TOY_DAILY_ICON;
export const ACH_ICON = SCIFI ? SCIFI_TAB.ach : TOY_ACH_ICON;
/** The settings gear (sci-fi: navy outline, cyan hub); null keeps the village's own. */
export const SCIFI_GEAR: string | null = SCIFI ? SCIFI_TAB.gear : null;

// --- Inline glyphs ----------------------------------------------------------------------------

const GEM = img(crystalPng, 'gl');
const COIN = img(coinPng, 'gl');
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
