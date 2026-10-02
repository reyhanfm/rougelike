/**
 * Chiptune music and sound effects, synthesized live with the Web Audio API (no audio files), in the spirit of the
 * PICO-8 look: pulse leads, triangle bass, noise drums.
 *
 * - `playMusic(track)` loops a song; asking for the track already playing keeps it going (rounds flow into each other).
 * - `sfx(name)` plays a one-shot effect; busy effects (hits, enemy shots) are rate-limited.
 * - Browsers only allow sound after a user gesture: the context is created on the first key, click or tap, and
 *   whatever was requested before that starts then.
 * - M (SELECT on a controller) cycles sound: all on -> music off -> all off. Saved in localStorage.
 */

// ---------------------------------------------------------------------------------------------------------------
// Songs. Every channel is a string of 16th-note steps, 16 per bar:
//   lead:  a note (c5, f#4) starts, '-' holds it, '.' is silence
//   bass/arp: chord degrees of the bar's chord: 1 root, 3 third, 5 fifth, 8 octave; '-' holds, '.' silence
//   drums: k kick, s snare, h hat, o open hat, '.' nothing (one bar, repeated)
// ---------------------------------------------------------------------------------------------------------------

export type Track = 'hub' | 'run' | 'boss' | 'special';

export interface Song {
  bpm: number;
  /** One chord per bar: root + optional 'm' (minor), e.g. 'Am', 'F#', 'C'. */
  chords: string[];
  lead: string;
  bass: string;
  arp?: string;
  drums: string;
  /** Lead waveform: pulse duty 0.125 / 0.25 / 0.5, or 'triangle'. */
  leadWave: number | 'triangle';
  leadVol: number;
}

export const SONGS: Record<Track, Song> = {
  // Hub and class picker: a calm, slightly wistful A-minor theme with a twinkling arpeggio.
  hub: {
    bpm: 96,
    chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'E', 'E'],
    lead: `
      e5 - - - - - d5 - c5 - - - b4 - a4 -
      c5 - - - - - - - a4 - - - . . . .
      g4 - - - e5 - - - d5 - c5 - d5 - e5 -
      d5 - - - - - - - . . . . b4 - d5 -
      e5 - - - a5 - - - g5 - e5 - d5 - c5 -
      d5 - - - c5 - a4 - c5 - - - f5 - - -
      e5 - - - - - d5 - b4 - - - g#4 - - -
      b4 - - - - - - - . . . . . . . .`,
    bass: '1 - - - . . 1 - 5 - - - . . 8 -',
    arp: '1 5 8 5 3 5 8 5 1 5 8 5 3 5 8 5',
    drums: 'k . . . h . . . k . k . h . . .',
    leadWave: 'triangle',
    leadVol: 0.5,
  },
  // A normal round: driving D minor, pumping octave bass, backbeat.
  run: {
    bpm: 140,
    chords: ['Dm', 'Dm', 'A#', 'C', 'Dm', 'Dm', 'A#', 'A'],
    lead: `
      d5 - a4 - d5 - e5 - f5 - - - e5 - d5 -
      c5 - - - a4 - - - . . a4 - c5 - d5 -
      f5 - - - d5 - - - a#4 - d5 - f5 - g5 -
      e5 - - - - - c5 - g4 - - - c5 - e5 -
      f5 - - - e5 - d5 - a5 - - - g5 - f5 -
      e5 - d5 - c5 - d5 - a4 - - - - - - -
      d5 - - - f5 - - - a#5 - - - a5 - g5 -
      a5 - - - - - - - c#5 - - - e5 - - -`,
    bass: '1 . 8 . 1 . 8 . 1 . 8 . 5 . 8 .',
    drums: 'k . h . s . h . k k h . s . h h',
    leadWave: 0.25,
    leadVol: 0.32,
  },
  // Boss every 5 rounds: fast E minor gallop with a climbing, menacing lead.
  boss: {
    bpm: 165,
    chords: ['Em', 'Em', 'C', 'C', 'Am', 'Am', 'B', 'B'],
    lead: `
      e5 - - - g5 - - - f#5 - e5 - d#5 - e5 -
      b4 - - - - - - - . . e5 - f#5 - g5 -
      a5 - - - g5 - - - e5 - - - c5 - e5 -
      g5 - - - - - - - f#5 - - - e5 - - -
      c6 - - - b5 - - - a5 - - - e5 - - -
      a5 - b5 - c6 - b5 - a5 - g5 - f#5 - e5 -
      d#5 - - - f#5 - - - b5 - - - a5 - - -
      f#5 - - - d#5 - - - b4 - c5 - d#5 - f#5 -`,
    bass: '1 1 8 1 1 8 1 1 8 1 1 8 1 . 5 .',
    drums: 'k . s . k k s . k . s . k k s s',
    leadWave: 0.5,
    leadVol: 0.24,
  },
  // Bonus bosses (Mahoraga, Leviathan, Godzilla, Kaguya): slow, heavy C minor doom with a tritone turn.
  special: {
    bpm: 112,
    chords: ['Cm', 'Cm', 'G#', 'G', 'Cm', 'Cm', 'F#', 'G'],
    lead: `
      c5 - - - - - - - d#5 - - - d5 - - -
      c5 - - - - - - - g4 - - - - - - -
      g#4 - - - c5 - - - d#5 - - - g5 - - -
      f5 - - - - - - - d5 - - - b4 - - -
      c6 - - - - - - - a#5 - - - g5 - - -
      g#5 - - - g5 - - - d#5 - - - c5 - - -
      c#5 - - - f#5 - - - a#5 - - - f#5 - - -
      g5 - - - - - - - b4 - - - d5 - f5 -`,
    bass: '1 - - - . . 1 - 1 - - - 8 - 5 -',
    arp: '1 . 3 . 5 . 3 . 1 . 3 . 5 . 8 .',
    drums: 'k . . . s . . k . k . . s . h h',
    leadWave: 0.125,
    leadVol: 0.3,
  },
};

const NOTE_INDEX: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** 'c#5' -> MIDI number (c4 = 60). */
export function midi(note: string): number {
  const m = /^([a-g])(#?)(\d)$/.exec(note);
  if (!m) throw new Error(`bad note ${note}`);
  return 12 * (Number(m[3]) + 1) + NOTE_INDEX[m[1]] + (m[2] ? 1 : 0);
}

/** 'F#m' -> [root pitch class, minor]. */
export function chord(name: string): [number, boolean] {
  const m = /^([A-G])(#?)(m?)$/.exec(name);
  if (!m) throw new Error(`bad chord ${name}`);
  return [NOTE_INDEX[m[1].toLowerCase()] + (m[2] ? 1 : 0), !!m[3]];
}

export const steps = (s: string): string[] => s.trim().split(/\s+/);

const DEGREES: Record<string, (minor: boolean) => number> = { 1: () => 0, 3: (minor) => (minor ? 3 : 4), 5: () => 7, 8: () => 12 };

/** How many steps a note at `i` lasts (itself plus the '-' after it). */
function length(tokens: string[], i: number): number {
  let n = 1;
  while (tokens[(i + n) % tokens.length] === '-' && n < tokens.length) n++;
  return n;
}

const freq = (m: number) => 440 * 2 ** ((m - 69) / 12);

// ---------------------------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------------------------

type Mode = 'all' | 'sfx' | 'off';
const MODES: Mode[] = ['all', 'sfx', 'off'];
const STORE = 'pedang-jiwa-audio';

let ctx: AudioContext | undefined;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let noiseBuf: AudioBuffer;
const pulses = new Map<number, PeriodicWave>();

let mode: Mode = loadMode();
let wanted: Track | undefined;
let ducked = false;

function loadMode(): Mode {
  try {
    const m = localStorage.getItem(STORE) as Mode | null;
    return m && MODES.includes(m) ? m : 'all';
  } catch {
    return 'all';
  }
}

export function soundMode(): Mode {
  return mode;
}

/** Label for menus: SUARA: ON / MUSIK OFF / OFF. */
export function soundLabel(): string {
  return mode === 'all' ? 'SUARA ON' : mode === 'sfx' ? 'MUSIK OFF' : 'SUARA OFF';
}

/** M / SELECT: all on -> music off -> all off. */
export function toggleSound(): string {
  mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  try {
    localStorage.setItem(STORE, mode);
  } catch {
    // private mode: the choice just lasts this session
  }
  applyLevels();
  if (mode !== 'all') stopSong();
  else if (wanted) startSong(wanted);
  sfx('move');
  return soundLabel();
}

function applyLevels(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.setTargetAtTime(mode === 'all' ? (ducked ? 0.12 : 0.4) : 0, t, 0.05);
  sfxBus.gain.setTargetAtTime(mode === 'off' ? 0 : 0.7, t, 0.02);
}

/** Creates/resumes the audio context; call from a user gesture (key, click, tap, pad button). */
export function unlockAudio(): void {
  if (typeof AudioContext === 'undefined') return;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(comp);
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.gain.value = sfxBus.gain.value = 0;
    musicBus.connect(master);
    sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    applyLevels();
    if (wanted && mode === 'all') startSong(wanted);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
}

/** A pulse wave with the given duty cycle (the NES/PICO-8 "square" family). */
function pulse(duty: number): PeriodicWave {
  let w = pulses.get(duty);
  if (!w) {
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    w = ctx!.createPeriodicWave(real, imag);
    pulses.set(duty, w);
  }
  return w;
}

type Wave = OscillatorType | number;

interface ToneOpts {
  wave?: Wave;
  /** End frequency for a slide (exponential). */
  to?: number;
  vol?: number;
  attack?: number;
  /** Seconds held at full volume before the release. */
  hold?: number;
  delay?: number;
  bus?: GainNode;
  detune?: number;
}

/** One oscillator note with a short attack and an exponential release. */
function tone(f: number, dur: number, o: ToneOpts = {}): void {
  if (!ctx) return;
  const t = ctx.currentTime + (o.delay ?? 0);
  playTone(t, f, dur, o);
}

function playTone(t: number, f: number, dur: number, o: ToneOpts): void {
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  const w = o.wave ?? 'square';
  if (typeof w === 'number') osc.setPeriodicWave(pulse(w));
  else osc.type = w;
  osc.frequency.setValueAtTime(f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const vol = o.vol ?? 0.3;
  const attack = o.attack ?? 0.004;
  // Full volume until the release starts; never past the note's end (ramps must stay in order).
  const hold = Math.max(0, Math.min(o.hold ?? dur * 0.3, dur - attack - 0.01));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(o.bus ?? sfxBus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

interface NoiseOpts {
  filter?: BiquadFilterType;
  /** Filter frequency, optionally sliding to `to`. */
  freq?: number;
  to?: number;
  q?: number;
  vol?: number;
  delay?: number;
  bus?: GainNode;
}

/** A burst of filtered white noise (hits, whooshes, explosions, drums). */
function noise(dur: number, o: NoiseOpts = {}): void {
  if (!ctx) return;
  playNoise(ctx.currentTime + (o.delay ?? 0), dur, o);
}

function playNoise(t: number, dur: number, o: NoiseOpts): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = o.filter ?? 'lowpass';
  filter.frequency.setValueAtTime(o.freq ?? 4000, t);
  if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  filter.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src
    .connect(filter)
    .connect(g)
    .connect(o.bus ?? sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

/** Quick note run, e.g. a pickup jingle. */
function arpeggio(notes: string[], stepS: number, o: ToneOpts = {}): void {
  notes.forEach((n, i) => tone(freq(midi(n)), stepS * 1.6, { ...o, delay: (o.delay ?? 0) + i * stepS }));
}

// ---------------------------------------------------------------------------------------------------------------
// Music sequencer: a look-ahead scheduler (setInterval + AudioContext time) so timing never drifts with the frame rate.
// ---------------------------------------------------------------------------------------------------------------

interface Playing {
  track: Track;
  song: Song;
  lead: string[];
  bass: string[];
  arp?: string[];
  drums: string[];
  bus: GainNode;
  step: number;
  next: number;
  timer: ReturnType<typeof setInterval>;
}

let playing: Playing | undefined;

/** Loops `track`; a no-op when it is already playing. */
export function playMusic(track: Track): void {
  wanted = track;
  if (playing?.track === track || !ctx || mode !== 'all') return;
  startSong(track);
}

export function stopMusic(): void {
  wanted = undefined;
  stopSong();
}

/** Lowers the music (pause menu). */
export function duckMusic(on: boolean): void {
  ducked = on;
  applyLevels();
}

function stopSong(): void {
  if (!playing || !ctx) return;
  const p = playing;
  playing = undefined;
  clearInterval(p.timer);
  p.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  setTimeout(() => p.bus.disconnect(), 600);
}

function startSong(track: Track): void {
  if (!ctx) return;
  stopSong();
  const song = SONGS[track];
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(musicBus);
  const p: Playing = {
    track,
    song,
    lead: steps(song.lead),
    bass: steps(song.bass),
    arp: song.arp ? steps(song.arp) : undefined,
    drums: steps(song.drums),
    bus,
    step: 0,
    next: ctx.currentTime + 0.1,
    timer: 0 as unknown as ReturnType<typeof setInterval>,
  };
  p.timer = setInterval(() => schedule(p), 25);
  playing = p;
  schedule(p);
}

function schedule(p: Playing): void {
  if (!ctx || playing !== p) return;
  const stepS = 60 / p.song.bpm / 4;
  // After a suspended tab the clock jumps; restart from now instead of firing a backlog.
  if (p.next < ctx.currentTime - 0.2) p.next = ctx.currentTime + 0.05;
  while (p.next < ctx.currentTime + 0.12) {
    playStep(p, p.step, p.next, stepS);
    p.step = (p.step + 1) % p.lead.length;
    p.next += stepS;
  }
}

function playStep(p: Playing, i: number, t: number, stepS: number): void {
  const s = p.song;
  const bar = Math.floor(i / 16) % s.chords.length;
  const [root, minor] = chord(s.chords[bar]);
  const inBar = i % 16;

  const lead = p.lead[i];
  if (lead !== '-' && lead !== '.') {
    const n = length(p.lead, i);
    playTone(t, freq(midi(lead)), n * stepS * 0.95, { wave: s.leadWave, vol: s.leadVol, hold: n * stepS * 0.6, bus: p.bus });
    // A soft echo one 8th later gives the lead some space.
    playTone(t + stepS * 2, freq(midi(lead)), n * stepS * 0.8, { wave: s.leadWave, vol: s.leadVol * 0.25, bus: p.bus });
  }

  const bass = p.bass[inBar];
  if (DEGREES[bass]) {
    const n = length(p.bass, inBar);
    const m = 36 + root + DEGREES[bass](minor);
    playTone(t, freq(m), n * stepS * 0.9, { wave: 'triangle', vol: 0.55, hold: n * stepS * 0.7, bus: p.bus });
  }

  const arp = p.arp?.[inBar];
  if (arp && DEGREES[arp]) {
    playTone(t, freq(60 + root + DEGREES[arp](minor)), stepS * 0.9, { wave: 0.125, vol: 0.08, hold: 0, bus: p.bus });
  }

  const d = p.drums[inBar];
  if (d === 'k') {
    playTone(t, 150, 0.14, { wave: 'sine', to: 40, vol: 0.9, hold: 0.02, bus: p.bus });
  } else if (d === 's') {
    playNoise(t, 0.13, { filter: 'bandpass', freq: 1800, q: 0.8, vol: 0.45, bus: p.bus });
    playTone(t, 190, 0.06, { wave: 'triangle', to: 120, vol: 0.3, hold: 0, bus: p.bus });
  } else if (d === 'h' || d === 'o') {
    playNoise(t, d === 'o' ? 0.15 : 0.035, { filter: 'highpass', freq: 7000, vol: 0.16, bus: p.bus });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------------------------------------------

export type Sfx =
  | 'move'
  | 'confirm'
  | 'back'
  | 'deny'
  | 'buy'
  | 'pause'
  | 'jump'
  | 'swing'
  | 'heavy'
  | 'shoot'
  | 'dash'
  | 'skill'
  | 'fusion'
  | 'ult'
  | 'hurt'
  | 'block'
  | 'hit'
  | 'crit'
  | 'kill'
  | 'bossKill'
  | 'explode'
  | 'enemyShot'
  | 'coin'
  | 'clear'
  | 'reward'
  | 'set'
  | 'portal'
  | 'revive'
  | 'boss'
  | 'gameover';

/** Minimum ms between two plays of the same effect (busy ones would otherwise stack into noise). */
const MIN_GAP: Partial<Record<Sfx, number>> = { hit: 45, crit: 60, kill: 50, enemyShot: 90, explode: 60, coin: 60, swing: 40, shoot: 40 };
const lastPlayed = new Map<Sfx, number>();

const EFFECTS: Record<Sfx, () => void> = {
  // Menus
  move: () => tone(880, 0.04, { wave: 0.25, vol: 0.15, hold: 0 }),
  confirm: () => arpeggio(['e5', 'b5'], 0.06, { wave: 0.25, vol: 0.2 }),
  back: () => arpeggio(['b5', 'e5'], 0.06, { wave: 0.25, vol: 0.18 }),
  deny: () => tone(110, 0.16, { wave: 'sawtooth', vol: 0.2, hold: 0.1 }),
  buy: () => arpeggio(['c6', 'g6', 'c7'], 0.045, { wave: 0.5, vol: 0.14 }),
  pause: () => arpeggio(['a5', 'e5'], 0.05, { wave: 0.25, vol: 0.15 }),
  // Player
  jump: () => tone(260, 0.12, { wave: 0.25, to: 640, vol: 0.16, hold: 0 }),
  swing: () => noise(0.08, { filter: 'bandpass', freq: 3200, to: 900, q: 1.5, vol: 0.32 }),
  heavy: () => {
    noise(0.16, { filter: 'bandpass', freq: 1800, to: 300, q: 1.2, vol: 0.45 });
    tone(140, 0.14, { wave: 'triangle', to: 60, vol: 0.4 });
  },
  shoot: () => tone(1100, 0.08, { wave: 0.25, to: 320, vol: 0.12, hold: 0 }),
  dash: () => noise(0.18, { filter: 'bandpass', freq: 600, to: 4500, q: 2, vol: 0.35 }),
  skill: () => {
    tone(330, 0.25, { wave: 0.25, to: 990, vol: 0.18 });
    arpeggio(['e5', 'g#5', 'b5', 'e6'], 0.035, { wave: 0.125, vol: 0.12, delay: 0.05 });
  },
  fusion: () => {
    tone(220, 0.5, { wave: 'sawtooth', to: 880, vol: 0.14, detune: -12 });
    tone(220, 0.5, { wave: 'sawtooth', to: 880, vol: 0.14, detune: 12 });
    noise(0.5, { filter: 'bandpass', freq: 400, to: 6000, q: 3, vol: 0.2 });
  },
  ult: () => {
    tone(110, 0.9, { wave: 'sawtooth', to: 880, vol: 0.16, hold: 0.6 });
    noise(0.9, { filter: 'lowpass', freq: 300, to: 8000, vol: 0.22 });
    arpeggio(['a4', 'c#5', 'e5', 'a5', 'c#6', 'e6'], 0.07, { wave: 0.25, vol: 0.14, delay: 0.35 });
  },
  hurt: () => {
    tone(420, 0.2, { wave: 'sawtooth', to: 110, vol: 0.25 });
    noise(0.1, { filter: 'lowpass', freq: 2000, vol: 0.3 });
  },
  block: () => {
    tone(1600, 0.18, { wave: 'triangle', vol: 0.25, hold: 0 });
    tone(2400, 0.12, { wave: 'triangle', vol: 0.12, hold: 0 });
  },
  // Combat
  hit: () => {
    noise(0.05, { filter: 'bandpass', freq: 2500, q: 1, vol: 0.28 });
    tone(220, 0.06, { wave: 0.5, to: 90, vol: 0.14, hold: 0 });
  },
  crit: () => {
    noise(0.07, { filter: 'highpass', freq: 3000, vol: 0.3 });
    tone(1200, 0.1, { wave: 0.25, to: 300, vol: 0.18, hold: 0 });
  },
  kill: () => {
    noise(0.22, { filter: 'lowpass', freq: 3000, to: 200, vol: 0.38 });
    tone(500, 0.18, { wave: 0.5, to: 80, vol: 0.16 });
  },
  bossKill: () => {
    noise(1.4, { filter: 'lowpass', freq: 2500, to: 60, vol: 0.6 });
    tone(90, 1.2, { wave: 'sine', to: 30, vol: 0.6, hold: 0.3 });
    arpeggio(['c5', 'e5', 'g5', 'c6', 'e6', 'g6', 'c7'], 0.06, { wave: 0.25, vol: 0.12, delay: 0.5 });
  },
  explode: () => {
    noise(0.4, { filter: 'lowpass', freq: 1800, to: 80, vol: 0.45 });
    tone(80, 0.3, { wave: 'sine', to: 35, vol: 0.4 });
  },
  enemyShot: () => tone(600, 0.07, { wave: 0.125, to: 300, vol: 0.06, hold: 0 }),
  coin: () => arpeggio(['b5', 'e6'], 0.05, { wave: 0.5, vol: 0.12 }),
  // Round flow
  clear: () => arpeggio(['c5', 'e5', 'g5', 'c6', 'g5', 'c6'], 0.08, { wave: 0.25, vol: 0.18 }),
  reward: () => arpeggio(['g5', 'c6', 'e6'], 0.06, { wave: 0.25, vol: 0.16 }),
  set: () => arpeggio(['c6', 'e6', 'g6', 'c7', 'e7'], 0.045, { wave: 0.125, vol: 0.14 }),
  portal: () => {
    tone(200, 0.8, { wave: 'sine', to: 800, vol: 0.18, hold: 0.4 });
    noise(0.8, { filter: 'bandpass', freq: 300, to: 3000, q: 4, vol: 0.12 });
  },
  revive: () => arpeggio(['c5', 'g5', 'c6', 'e6', 'g6', 'c7'], 0.07, { wave: 'triangle', vol: 0.3 }),
  boss: () => {
    noise(1.2, { filter: 'lowpass', freq: 150, to: 600, vol: 0.5 });
    tone(55, 1, { wave: 'sawtooth', vol: 0.25, hold: 0.5 });
    arpeggio(['e4', 'a#3'], 0.3, { wave: 0.5, vol: 0.2, delay: 0.5 });
  },
  gameover: () => {
    arpeggio(['g4', 'd#4', 'c4', 'g3'], 0.22, { wave: 'triangle', vol: 0.4 });
    tone(196, 1.2, { wave: 0.5, to: 49, vol: 0.12, delay: 0.9 });
  },
};

export function sfx(name: Sfx): void {
  if (!ctx || mode === 'off' || ctx.state !== 'running') return;
  const now = performance.now();
  const gap = MIN_GAP[name];
  if (gap && now - (lastPlayed.get(name) ?? -Infinity) < gap) return;
  lastPlayed.set(name, now);
  EFFECTS[name]();
}

// ---------------------------------------------------------------------------------------------------------------

/** Unlocks on the first gesture and silences the game while its tab is hidden. */
export function mountAudio(): void {
  const unlock = () => unlockAudio();
  for (const type of ['keydown', 'pointerdown', 'touchend']) window.addEventListener(type, unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => undefined);
    else ctx.resume().catch(() => undefined);
  });
}
