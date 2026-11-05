// The settings rows the map's settings panel and the battle's pause menu share (after Potion
// Siege's panels): a tile a setting, a round icon on the left that glows green while it is on, the
// name, and the control on the right: an on/off switch for the music and for the effects, a pill
// picker for the language. Taps come back through the page's own listeners: the switch rows are
// buttons with data-a="music" / data-a="sfx", the picker a <select class="lang">.

import { LOCALES, getLocale, localeName, t } from '../i18n';
import { GLOBE_ICON, MUSIC_OFF, MUSIC_ON, SOUND_OFF, SOUND_ON } from './icons';

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

/** The music row, the effects row and the language row. */
export function settingRows(on: AudioSwitches): string {
  const lang = `<select class="lang" aria-label="${t('lang.label')}">${LOCALES.map((l) => `<option value="${l}" ${l === getLocale() ? 'selected' : ''}>${localeName(l)}</option>`).join('')}</select>`;
  return switchRow('music', t('village.music'), on.music, on.music ? MUSIC_ON : MUSIC_OFF)
    + switchRow('sfx', t('village.sfx'), on.sfx, on.sfx ? SOUND_ON : SOUND_OFF)
    + `<label class="setrow"><span class="sico">${GLOBE_ICON}</span><span class="sname">${t('lang.label')}</span>${lang}</label>`;
}
