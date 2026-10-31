// Synthesised sound: every effect and the background loop are built from oscillators and noise
// with Web Audio, so there are no sound files to ship. The context starts on the first tap
// (browsers block audio before a user gesture); mute is remembered per browser.

import type { Shooter, SimEvent } from '../sim/types';

type Wave = OscillatorType;

const MUTE_KEY = 'fruitfort.mute';
/** Root of the pentatonic scale the music and chimes share (C5). */
const ROOT = 523.25;
const PENTA = [0, 2, 4, 7, 9];

function note(step: number): number {
  const oct = Math.floor(step / 5);
  const deg = ((step % 5) + 5) % 5;
  return ROOT * Math.pow(2, oct + PENTA[deg] / 12);
}

export class Sound {
  private ctx: AudioContext | null = null;
  /** Buys in a row climb the scale; a new wave starts it again. */
  private buyStep = 0;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private last = new Map<string, number>();
  private beat = 0;
  private nextBeat = 0;
  muted: boolean;

  constructor() {
    let m = false;
    try {
      m = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // Storage blocked: start unmuted.
    }
    this.muted = m;
    const start = () => this.start();
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
  }

  private start(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.16;
    this.music.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextBeat = ctx.currentTime + 0.1;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Not remembered; fine.
    }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  /** Silence everything while the host shows an ad; resume after. */
  hold(paused: boolean): void {
    if (!this.ctx) return;
    void (paused ? this.ctx.suspend() : this.ctx.resume());
  }

  /** Skip a sound played less than `gap` seconds ago, so a volley doesn't become a roar. */
  private gate(key: string, gap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(key) ?? -1) < gap) return false;
    this.last.set(key, now);
    return true;
  }

  /** One enveloped oscillator, optionally sliding from f0 to f1. */
  private tone(f0: number, f1: number, dur: number, type: Wave, vol: number, delay = 0, out: GainNode = this.sfx): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** A burst of filtered noise: thuds, splats, swooshes. */
  private hiss(freq: number, dur: number, vol: number, q = 1, delay = 0, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private fire(kind: Shooter): void {
    if (!this.gate('fire:' + kind, 0.09)) return;
    const j = 1 + (Math.random() - 0.5) * 0.1;
    switch (kind) {
      case 'strawberry': this.tone(900 * j, 1400 * j, 0.06, 'triangle', 0.08); break;
      case 'coconut': this.tone(260 * j, 140 * j, 0.12, 'sine', 0.2); break;
      case 'watermelon': this.tone(420 * j, 220 * j, 0.1, 'triangle', 0.12); break;
      case 'grape': this.tone(700 * j, 1000 * j, 0.07, 'sine', 0.08); break;
      case 'lemon': this.tone(1100 * j, 700 * j, 0.08, 'square', 0.03); break;
      case 'hero': this.tone(600 * j, 1200 * j, 0.09, 'triangle', 0.07); break;
    }
  }

  private hit(kind: Shooter, crit: boolean): void {
    if (!this.gate('hit:' + kind, 0.07)) return;
    if (crit) {
      this.hiss(900, 0.12, 0.22, 0.8);
      this.tone(1400, 1900, 0.07, 'square', 0.04);
    } else {
      this.hiss(2200 + Math.random() * 600, 0.05, 0.12, 2);
    }
  }

  play(ev: SimEvent): void {
    if (!this.ctx || this.muted) return;
    switch (ev.t) {
      case 'buy': {
        const k = Math.min(this.buyStep++, 7);
        this.tone(note(k), note(k + 4), 0.14, 'triangle', 0.16);
        this.tone(note(k + 7), note(k + 7), 0.16, 'sine', 0.1, 0.06);
        break;
      }
      case 'reverse':
        // A short double toot of the train whistle.
        this.tone(740, 740, 0.08, 'square', 0.05);
        this.tone(588, 588, 0.12, 'square', 0.05, 0.1);
        break;
      case 'happen':
        this.tone(1200, 1600, 0.08, 'sine', 0.08);
        this.tone(1600, 2000, 0.1, 'sine', 0.08, 0.1);
        break;
      case 'grab':
        [0, 4, 7, 12].forEach((k, i) => this.tone(note(k + 5), note(k + 5), 0.12, 'square', 0.04, i * 0.05));
        break;
      case 'fire': this.fire(ev.kind); break;
      case 'hit': this.hit(ev.kind, ev.crit); break;
      case 'kill':
        if (ev.kind === 'boss') {
          this.tone(200, 40, 0.8, 'sawtooth', 0.25);
          this.hiss(300, 0.8, 0.4, 0.5, 0, 'lowpass');
          [0, 2, 4, 5].forEach((k, i) => this.tone(note(k), note(k), 0.3, 'triangle', 0.2, 0.3 + i * 0.1));
        } else if (this.gate('kill', 0.05)) {
          this.hiss(700, 0.1, 0.25, 1.5);
          this.tone(1560 + Math.random() * 100, 2090, 0.09, 'square', 0.035, 0.05);
        }
        break;
      case 'cast':
        this.hiss(1200, 0.5, 0.25, 0.5, 0, 'highpass');
        [0, 2, 4, 5].forEach((k, i) => this.tone(note(k + 2), note(k + 2), 0.35, 'triangle', 0.16, i * 0.07));
        break;
      case 'bite':
        if (this.gate('bite', 0.12)) this.tone(220, 260, 0.15, 'sawtooth', 0.05);
        break;
      case 'juice':
        this.hiss(600, 0.6, 0.4, 0.6, 0, 'lowpass');
        this.tone(300, 900, 0.35, 'sine', 0.2);
        this.tone(120, 50, 0.5, 'sine', 0.35, 0.3);
        break;
      case 'wave':
        if (ev.boss) {
          for (let i = 0; i < 3; i++) this.tone(110, 70, 0.35, 'sine', 0.4, i * 0.3);
          this.tone(220, 207, 0.9, 'sawtooth', 0.08, 0.1);
        } else {
          this.buyStep = 0;
          this.tone(note(-5), note(-5), 0.18, 'square', 0.06);
          this.tone(note(-3), note(-3), 0.3, 'square', 0.06, 0.15);
        }
        break;
      case 'trick': this.hiss(3000, 0.4, 0.12, 3); break;
      case 'over':
        [4, 3, 2, 0].forEach((k, i) => this.tone(note(k - 5), note(k - 5) * 0.97, 0.4, 'triangle', 0.18, i * 0.25));
        this.hiss(400, 0.7, 0.4, 0.5, 0, 'lowpass');
        break;
    }
  }

  /** Wood knocks while something chews the fence. */
  chew(): void {
    if (!this.ctx || this.muted || !this.gate('chew', 0.22)) return;
    this.tone(320 + Math.random() * 60, 180, 0.05, 'square', 0.04);
  }

  /** UI click for buttons that don't produce a sim event (or fail). */
  click(ok = true): void {
    if (!this.ctx || this.muted) return;
    if (ok) this.tone(660, 880, 0.05, 'triangle', 0.1);
    else this.tone(200, 150, 0.1, 'square', 0.05);
  }

  /** Background loop: a gentle pentatonic walk over a bass every half beat. Calm before wave 10, busier after. */
  tickMusic(intense: boolean, over: boolean): void {
    if (!this.ctx || this.muted || over) return;
    const ctx = this.ctx;
    const step = intense ? 0.2 : 0.25;
    // Schedule a little ahead; skip forward if the tab slept.
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05;
    while (this.nextBeat < ctx.currentTime + 0.3) {
      const b = this.beat++;
      const delay = this.nextBeat - ctx.currentTime;
      const bar = Math.floor(b / 8) % 4;
      const chord = [0, 3, 1, 4][bar];
      if (b % 4 === 0) this.tone(note(chord - 10), note(chord - 10), step * 3.5, 'triangle', 0.5, delay, this.music);
      // A melody note on most half-beats, picked from the chord so it never clashes.
      const k = (b * 7 + bar * 3) % 11;
      if (k < (intense ? 8 : 6)) this.tone(note(chord + [0, 2, 4, 5, 2, 4, 7, 5][b % 8] - 5), note(chord + [0, 2, 4, 5, 2, 4, 7, 5][b % 8] - 5), step * 1.6, 'sine', 0.35, delay, this.music);
      if (intense && b % 2 === 1) this.hiss(6000, 0.04, 0.15, 1, delay, 'highpass');
      this.nextBeat += step;
    }
  }
}
