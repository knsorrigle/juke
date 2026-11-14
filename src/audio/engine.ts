import * as Tone from 'tone'
import { clamp, midiToFrequency } from '../mapping/scales.ts'

/** A note with its time already converted to the audio clock. */
export interface ScheduledNote {
  /** Audio-context time in seconds. */
  at: number
  midi: number
  pan: number
  velocity: number
}

const VOICE_COUNT = 16
/** Pad chord: A2, E3, A3, an open fifth that fits every note of A minor pentatonic. */
const PAD_NOTES = [45, 52, 57]
const PAD_GAIN_MAX = 0.2
const RUMBLE_GAIN_MAX = 0.5
const PAD_FILTER_MIN = 220
const PAD_FILTER_MAX = 1500
/** Every level change glides over at least this long, so nothing clicks. */
const RAMP = 0.25

interface Voice {
  synth: Tone.Synth
  panner: Tone.Panner
}

/**
 * The Tone.js sound engine. Nothing is created until `start()` is called from
 * a user gesture. Signal path:
 *
 *   mallet voices -> panners -> hits bus --+--> master -> compressor -> limiter -> out
 *   pad oscillators -> filter -> pad gain -+        (reverb is a send from hits and pad)
 *   brown noise -> lowpass -> rumble gain -+
 *
 * Pad and rumble pass through an "active" gate that fades them out on pause.
 */
export class AudioEngine {
  private started = false
  private starting: Promise<void> | null = null
  private voices: Voice[] = []
  private nextVoice = 0
  private padGain: Tone.Gain | null = null
  private padFilter: Tone.Filter | null = null
  private rumbleGain: Tone.Gain | null = null
  private activeGate: Tone.Gain | null = null
  private meter: Tone.Meter | null = null
  private nodes: { dispose(): unknown }[] = []
  private peak = -Infinity
  private noteCount = 0

  get isStarted(): boolean {
    return this.started
  }

  /** Create the audio graph. Must be called from a click or key press. */
  start(): Promise<void> {
    if (!this.starting) this.starting = this.build()
    return this.starting
  }

  private async build(): Promise<void> {
    await Tone.start()
    const keep = <T extends { dispose(): unknown }>(node: T): T => {
      this.nodes.push(node)
      return node
    }

    // Master chain: gentle compression, then a limiter so the output never clips.
    const limiter = keep(new Tone.Limiter(-1)).toDestination()
    const compressor = keep(
      new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.01, release: 0.25 }),
    ).connect(limiter)
    const master = keep(new Tone.Gain(0.9)).connect(compressor)
    this.meter = keep(new Tone.Meter({ smoothing: 0.5 }))
    limiter.connect(this.meter)

    const reverb = keep(new Tone.Reverb({ decay: 3.2, preDelay: 0.02, wet: 1 })).connect(master)
    await reverb.ready

    // Percussive mallet voices, one panner each so every hit has its own position.
    const hits = keep(new Tone.Gain(0.55)).connect(master)
    const hitSend = keep(new Tone.Gain(0.3)).connect(reverb)
    hits.connect(hitSend)
    for (let i = 0; i < VOICE_COUNT; i++) {
      const panner = keep(new Tone.Panner(0)).connect(hits)
      const synth = keep(
        new Tone.Synth({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.004, decay: 0.24, sustain: 0, release: 0.2 },
          volume: -6,
        }),
      ).connect(panner)
      this.voices.push({ synth, panner })
    }

    // Pad and rumble sit behind a gate that closes when the video is not playing.
    this.activeGate = keep(new Tone.Gain(0)).connect(master)
    const padSend = keep(new Tone.Gain(0.25)).connect(reverb)
    this.activeGate.connect(padSend)

    this.padGain = keep(new Tone.Gain(0)).connect(this.activeGate)
    this.padFilter = keep(
      new Tone.Filter({ type: 'lowpass', frequency: PAD_FILTER_MIN, Q: 0.6, rolloff: -24 }),
    ).connect(this.padGain)
    for (const midi of PAD_NOTES) {
      keep(
        new Tone.FatOscillator({
          type: 'sawtooth',
          frequency: midiToFrequency(midi),
          spread: 22,
          count: 3,
          volume: -10,
        }),
      )
        .connect(this.padFilter)
        .start()
    }

    this.rumbleGain = keep(new Tone.Gain(0)).connect(this.activeGate)
    const rumbleFilter = keep(
      new Tone.Filter({ type: 'lowpass', frequency: 140, Q: 0.4, rolloff: -24 }),
    ).connect(this.rumbleGain)
    keep(new Tone.Noise('brown')).connect(rumbleFilter).start()

    this.started = true
  }

  /** Current time on the audio clock, in seconds. */
  currentTime(): number {
    return Tone.immediate()
  }

  /** Schedule percussive notes. Times in the past are played immediately. */
  playNotes(notes: ScheduledNote[]): void {
    if (!this.started) return
    const now = Tone.immediate()
    for (const note of notes) {
      const voice = this.voices[this.nextVoice]
      this.nextVoice = (this.nextVoice + 1) % this.voices.length
      const at = Math.max(now + 0.005, note.at)
      // Glide the panner into place just before the hit rather than jumping it.
      voice.panner.pan.rampTo(clamp(note.pan, -1, 1), 0.01, Math.max(now, at - 0.012))
      voice.synth.triggerAttackRelease(
        midiToFrequency(note.midi),
        0.1,
        at,
        clamp(note.velocity, 0, 1),
      )
      this.noteCount++
    }
  }

  /** Set the pad and rumble level, 0..1. Glides; never jumps. */
  setPad(level: number): void {
    if (!this.padGain || !this.padFilter || !this.rumbleGain) return
    const l = clamp(level, 0, 1)
    this.padGain.gain.rampTo(l * PAD_GAIN_MAX, RAMP)
    this.padFilter.frequency.rampTo(PAD_FILTER_MIN + l * (PAD_FILTER_MAX - PAD_FILTER_MIN), RAMP)
    this.rumbleGain.gain.rampTo(l ** 1.5 * RUMBLE_GAIN_MAX, RAMP)
  }

  /** Open or close the gate on the sustained sounds (close on pause, seek, stall). */
  setActive(active: boolean): void {
    this.activeGate?.gain.rampTo(active ? 1 : 0, active ? 0.15 : RAMP)
  }

  /** Output level after the limiter, in dBFS, and the highest level seen so far. */
  level(): { db: number; peakDb: number; notes: number } {
    const value = this.meter?.getValue()
    const db = typeof value === 'number' ? value : -Infinity
    if (db > this.peak) this.peak = db
    return { db, peakDb: this.peak, notes: this.noteCount }
  }

  dispose(): void {
    for (const node of this.nodes) node.dispose()
    this.nodes = []
    this.voices = []
    this.started = false
    this.starting = null
  }
}
