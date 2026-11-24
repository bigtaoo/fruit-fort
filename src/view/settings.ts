// The settings rows the map's settings panel and the battle's pause menu share (after Potion
// Siege's panels): a tile a setting, a round icon on the left that glows green while it is on, the
// name, and the control on the right: an on/off switch for the music and for the effects, a pill
// picker for the language. Taps come back through the page's own listeners: the switch rows are
// buttons with data-a="music" / data-a="sfx", the picker a <select class="lang">.

import { LOCALES, getLocale, localeName, t } from '../i18n';
import { DOC_ICON, GLOBE_ICON, MUSIC_OFF, MUSIC_ON, SOUND_OFF, SOUND_ON } from './icons';

/** What the switch rows show: true while that sound plays. */
export interface AudioSwitches {
  music: boolean;
  sfx: boolean;
}

/** The on/off switch: a green track with the knob right, or a dark one with it left. */
const toggle = (on: boolean) => `<span class="tgl ${on ? 'on' : ''}" aria-hidden="true"></span>`;

function switchRow(a: string, name: string, on: boolean, icon: string): string {
  return `<button class="setrow" data-a="${a}" role="switch" aria-checked="${on}" aria-label="${name}">`
    + `<span class="sico ${on ? 'on' : ''}">${icon}</span><span class="sname">${name}</span>${toggle(on)}</button>`;
}

/**
 * Where the privacy policy lives. It is our own page, not the portal's: the game runs on several
 * portals and each has its own policy for what *it* does (the ads above all), while this one covers
 * what the game itself sends to `sx.gamestao.com`. CrazyGames' QA checklist asks for the mention
 * in-game, and a player who wants to know what we collect should not have to leave the page to find
 * it. Opened in a new tab, so a fight in progress is not thrown away.
 */
const PRIVACY_URL = 'https://swarmorbit.gamestao.com/privacy.html';

/** The music row, the effects row, the language row and the privacy policy. */
export function settingRows(on: AudioSwitches): string {
  const lang = `<select class="lang" aria-label="${t('lang.label')}">${LOCALES.map((l) => `<option value="${l}" ${l === getLocale() ? 'selected' : ''}>${localeName(l)}</option>`).join('')}</select>`;
  return switchRow('music', t('village.music'), on.music, on.music ? MUSIC_ON : MUSIC_OFF)
    + switchRow('sfx', t('village.sfx'), on.sfx, on.sfx ? SOUND_ON : SOUND_OFF)
    + `<label class="setrow"><span class="sico">${GLOBE_ICON}</span><span class="sname">${t('lang.label')}</span>${lang}</label>`
    + `<a class="setrow" href="${PRIVACY_URL}" target="_blank" rel="noopener noreferrer">`
    + `<span class="sico">${DOC_ICON}</span><span class="sname">${t('village.privacy')}</span><span class="sgo" aria-hidden="true">↗</span></a>`;
}
