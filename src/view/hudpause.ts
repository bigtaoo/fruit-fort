// The HUD's pause menu: the title on a plate, Resume, the settings rows (sound, language) and the
// way back to the toy box; the sim waits while it is up. Split from hud.ts.

import { isLocale, t } from '../i18n';
import { el } from './dom';
import { settingRows, type AudioSwitches } from './settings';
import type { HudActions } from './hud';

export class PauseMenu {
  private pmenu: HTMLElement;
  private pTitle: HTMLElement;
  private resumeBtn: HTMLButtonElement;
  private pRows: HTMLElement;
  private quitBtn: HTMLButtonElement;
  private switches: AudioSwitches = { music: true, sfx: true };

  /** `blocked`: the P key leaves the menu alone (the result card is up). */
  constructor(root: HTMLElement, private act: HudActions, blocked: () => boolean) {
    // Paused: the title on a plate over the top edge, Resume big, the settings rows (sound, language)
    // as on the map's settings panel, and the way back to the map small at the bottom.
    this.pmenu = el('div', 'pmenu hidden', root);
    const pcard = el('div', 'card spanel', this.pmenu);
    this.pTitle = el('b', 'splate', pcard);
    this.resumeBtn = el('button', 'again main', pcard);
    this.resumeBtn.onclick = () => this.set(false);
    this.pRows = el('div', 'prows', pcard);
    this.pRows.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (a === 'music' || a === 'sfx') act.sound(a);
    });
    this.pRows.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      if (isLocale(v)) act.language(v);
    });
    this.quitBtn = el('button', 'minor', pcard);
    this.quitBtn.onclick = () => {
      this.set(false);
      act.quit();
    };
    // A tap on the dimmed board round the card resumes too: a player back from another tab or a click
    // outside the game's frame (the away pause) wants the fight, not a menu.
    this.pmenu.addEventListener('click', (e) => {
      if (e.target === this.pmenu) this.set(false);
    });
    window.addEventListener('keydown', (e) => {
      if ((e.key !== 'p' && e.key !== 'P') || e.repeat || blocked()) return;
      this.set(this.pmenu.classList.contains('hidden'));
    });
  }

  /** Fixed labels in the current language. */
  relabel(): void {
    this.pTitle.textContent = t('hud.paused');
    this.resumeBtn.textContent = t('hud.resume');
    this.quitBtn.textContent = t('hud.village');
    this.setSound(this.switches);
  }

  /** The music and effects switches, as they now stand. */
  setSound(on: AudioSwitches): void {
    this.switches = on;
    this.pRows.innerHTML = settingRows(on);
  }

  /** Bring the menu up unasked (Hud.openPause); nothing if it is already up. Resume pulses. */
  open(): void {
    if (!this.pmenu.classList.contains('hidden')) return;
    this.set(true);
    this.resumeBtn.classList.add('gpulse');
  }

  /** Whether the menu offers the way back to the village (Hud.setQuit). */
  setQuit(on: boolean): void {
    this.quitBtn.style.display = on ? '' : 'none';
  }

  /** Open or close the menu; the sim waits while it is up. */
  set(on: boolean): void {
    if (on === !this.pmenu.classList.contains('hidden')) return;
    this.pmenu.classList.toggle('hidden', !on);
    this.resumeBtn.classList.remove('gpulse');
    this.act.pause(on);
    if (on) this.resumeBtn.focus();
  }
}
