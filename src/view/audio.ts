// Sound from compressed files (src/assets/audio, CC0, sources in docs/audio.md). The context starts on the first
// tap (browsers block audio before a user gesture); the effects are decoded into buffers then, and the music is a
// looping <audio> element streamed through the same mixer. The player's mute is kept by main.ts in the platform's
// storage; the host can silence us too (Bridge isAudioEnabled), and a hidden tab or an open ad suspends everything.

import type { SimEvent } from '../sim/types';

const FILES = import.meta.glob('../assets/audio/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

function url(name: string): string | undefined {
  return FILES[`../assets/audio/${name}.mp3`];
}

/** Mean loudness of each file in dB (ffmpeg volumedetect), so every effect is played at about the same level. */
const LOUD: Record<string, number> = {
  fire0: -19, fire1: -19, fire2: -19, hit0: -18, hit1: -18, hit2: -18, crit: -21.7, kill: -26.8, bosskill: -14.2,
  boom: -15.5, strike: -13.2, crunch: -16.8, buy: -15.3, reverse: -21.2, happen: -14.9, grab: -17, cast: -12,
  bite0: -23, bite1: -23, bite2: -23, wave: -13.1, bosswave: -13.2, trick: -16.4, over: -11.1, win: -11.2,
  revive: -15.2, click: -13.4, fail: -15,
};

/** How loud each effect sits in the mix, before the loudness correction: busy sounds low, rare ones up front. */
const MIX: Record<string, number> = {
  fire: 0.3, hit: 0.28, crit: 0.5, kill: 0.45, bosskill: 0.9, boom: 0.7, strike: 0.85, crunch: 0.18, buy: 0.6,
  reverse: 0.55, happen: 0.6, grab: 0.65, cast: 0.6, bite: 0.35, wave: 0.6, bosswave: 0.8, trick: 0.5, over: 0.8,
  win: 0.85, revive: 0.75, click: 0.45, fail: 0.5,
};

/** Buys in a row climb a pentatonic scale (semitones above the file's own pitch). */
const CLIMB = [0, 2, 4, 7, 9, 12, 14, 16];

const MUSIC_VOL = 0.32;

export class Sound {
  private ctx: AudioContext | null = null;
  private buyStep = 0;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private track: HTMLAudioElement | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private last = new Map<string, number>();
  private musicLevel = -1;
  /** The player's own mute. */
  muted = false;
  /** The host allows sound (Bridge `platform.isAudioEnabled`). */
  private hostAudio = true;
  private held = false;

  constructor() {
    const start = () => this.start();
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    // Silent while the tab is hidden, whatever the platform reports.
    document.addEventListener('visibilitychange', () => this.applyHold());
  }

  /** Nothing plays: muted by the player or by the host. */
  private get silent(): boolean {
    return this.muted || !this.hostAudio;
  }

  private get stopped(): boolean {
    return this.held || document.hidden;
  }

  private applyGain(): void {
    if (this.ctx) this.master.gain.setTargetAtTime(this.silent ? 0 : 0.9, this.ctx.currentTime, 0.05);
    this.applyTrack();
  }

  private applyHold(): void {
    if (!this.ctx) return;
    if (this.stopped && this.ctx.state === 'running') void this.ctx.suspend();
    else if (!this.stopped && this.ctx.state === 'suspended') void this.ctx.resume();
    this.applyTrack();
  }

  /** The music element runs only while it can be heard, so it doesn't stream into a suspended or muted mixer. */
  private applyTrack(): void {
    const el = this.track;
    if (!el) return;
    if (this.stopped || this.silent) el.pause();
    else if (el.paused) el.play().catch(() => {});
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  /** The host's audio switch (Bridge AUDIO_STATE_CHANGED). */
  setHostAudio(enabled: boolean): void {
    this.hostAudio = enabled;
    this.applyGain();
  }

  private start(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.silent ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    for (const name of Object.keys(LOUD)) void this.load(name);
    const src = url('music');
    if (src) {
      const el = new Audio(src);
      el.loop = true;
      el.preload = 'auto';
      ctx.createMediaElementSource(el).connect(this.music);
      this.track = el;
    }
    this.applyHold();
  }

  private async load(name: string): Promise<void> {
    const src = url(name);
    if (!src || !this.ctx) return;
    try {
      const data = await (await fetch(src)).arrayBuffer();
      this.buffers.set(name, await this.ctx.decodeAudioData(data));
    } catch (err) {
      console.warn('[audio] could not load', name, err);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Silence everything while an ad is open or the host paused us; resume after. Called every frame. */
  hold(paused: boolean): void {
    if (paused === this.held) return;
    this.held = paused;
    this.applyHold();
  }

  /** Skip a sound played less than `gap` seconds ago, so a volley doesn't become a roar. */
  private gate(key: string, gap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(key) ?? -1) < gap) return false;
    this.last.set(key, now);
    return true;
  }

  /**
   * Play file `name` (or one of `name0..name{variants-1}`), mixed as `mix`, `semis` semitones up or down,
   * with a little random pitch so repeats don't sound stamped. Silently skipped until it has loaded.
   */
  private fx(name: string, opts: { variants?: number; semis?: number; jitter?: number; vol?: number; delay?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || this.silent) return;
    const file = opts.variants ? name + Math.floor(Math.random() * opts.variants) : name;
    const buf = this.buffers.get(file);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const jitter = opts.jitter ?? 0.06;
    src.playbackRate.value = Math.pow(2, (opts.semis ?? 0) / 12) * (1 + (Math.random() - 0.5) * jitter);
    const g = ctx.createGain();
    // Bring every file to about -18 dB, then place it in the mix.
    g.gain.value = Math.pow(10, (-18 - (LOUD[file] ?? -18)) / 20) * (MIX[name] ?? 0.5) * (opts.vol ?? 1);
    src.connect(g).connect(this.sfx);
    src.start(ctx.currentTime + (opts.delay ?? 0));
  }

  play(ev: SimEvent): void {
    if (!this.ctx || this.silent) return;
    switch (ev.t) {
      case 'buy':
        this.fx('buy', { semis: CLIMB[Math.min(this.buyStep++, CLIMB.length - 1)], jitter: 0 });
        break;
      case 'reverse': this.fx('reverse'); break;
      case 'happen': this.fx('happen', { jitter: 0 }); break;
      case 'grab': this.fx('grab', { jitter: 0 }); break;
      case 'fire':
        if (ev.kind === 'hero' && this.gate('fire', 0.09)) this.fx('fire', { variants: 3, jitter: 0.12 });
        break;
      case 'hit':
        if (!this.gate('hit', 0.07)) break;
        if (ev.crit) this.fx('crit', { jitter: 0.1 });
        else this.fx('hit', { variants: 3, jitter: 0.15 });
        break;
      case 'kill':
        if (ev.kind === 'boss') this.fx('bosskill', { jitter: 0 });
        else if (this.gate('kill', 0.05)) this.fx('kill', { jitter: 0.2 });
        break;
      case 'cast': this.fx('cast'); break;
      case 'bite':
        if (this.gate('bite', 0.12)) this.fx('bite', { variants: 3, jitter: 0.15 });
        break;
      case 'juice': this.fx('strike', { jitter: 0 }); break;
      case 'wave':
        if (ev.boss) {
          this.fx('boom', { jitter: 0, semis: -3 });
          this.fx('bosswave', { jitter: 0, delay: 0.15 });
        } else {
          this.buyStep = 0;
          this.fx('wave', { jitter: 0 });
        }
        break;
      case 'trick': this.fx('trick'); break;
      case 'revive': this.fx('revive', { jitter: 0 }); break;
      case 'over': this.fx('over', { jitter: 0 }); break;
      case 'win': this.fx('win', { jitter: 0 }); break;
    }
  }

  /** Dull crunches while something chews the fence. */
  chew(): void {
    if (!this.ctx || this.silent || !this.gate('chew', 0.22)) return;
    this.fx('crunch', { jitter: 0.3, semis: 4 });
  }

  /** UI click for buttons that don't produce a sim event (or fail). */
  click(ok = true): void {
    this.fx(ok ? 'click' : 'fail', { jitter: 0 });
  }

  /**
   * Background loop, called every frame: full during the fight, a little louder from wave 10 (`intense`),
   * and quieter (not stopped) in the village and on the result card (`calm`).
   */
  tickMusic(intense: boolean, calm: boolean): void {
    if (!this.ctx) return;
    const level = calm ? 0.45 : intense ? 1.15 : 1;
    if (level === this.musicLevel) return;
    this.musicLevel = level;
    this.music.gain.setTargetAtTime(MUSIC_VOL * level, this.ctx.currentTime, 0.6);
  }
}
