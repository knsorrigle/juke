import * as Tone from 'tone'
import { clamp, midiToFrequency } from '../mapping/scales.ts'
import type { InstrumentSpec, Knobs, NoteKind, VoiceTarget } from '../mapping/types.ts'

/** A note with its time already converted to the audio clock. */
export interface ScheduledNote {
  voice: string
  /** Audio-context time in seconds. */
  at: number
  midi: number
  pan: number
  velocity: number
  duration?: number
  glide?: number
}

const NOTE_KINDS: NoteKind[] = ['mallet', 'bell', 'pluck', 'low']
const POOL = 10
/** Every level change glides over at least this long, so nothing clicks. */
const RAMP = 0.25
const CROSSFADE = 0.9

type Disposable = { dispose(): unknown }
type NoteSynth = Tone.Synth | Tone.FMSynth

interface NoteInstrument {
  voices: { synth: NoteSynth; panner: Tone.Panner }[]
  next: number
  solo: Tone.Gain
}

interface SustainInstrument {
  spec: InstrumentSpec
  gain: Tone.Gain
  panner: Tone.Panner
  filter: Tone.Filter
  oscillators: (Tone.FatOscillator | Tone.Oscillator)[]
  solo: Tone.Gain
}

/** Everything one track plays, behind a single fader so tracks can crossfade. */
interface Rig {
  fader: Tone.Gain
  hum: Tone.Gain
  send: Tone.Gain
  notes: Map<string, NoteInstrument>
  sustains: Map<string, SustainInstrument>
  nodes: Disposable[]
}

function makeSynth(kind: NoteKind): NoteSynth {
  switch (kind) {
    case 'bell':
      return new Tone.FMSynth({
        harmonicity: 3.01,
        modulationIndex: 5,
        envelope: { attack: 0.002, decay: 1.1, sustain: 0, release: 0.9 },
        modulationEnvelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.3 },
        volume: -10,
      })
    case 'pluck':
      return new Tone.Synth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.002, decay: 0.16, sustain: 0, release: 0.08 },
        volume: -14,
      })
    case 'low':
      return new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.02, decay: 0.7, sustain: 0, release: 0.5 },
        volume: -4,
      })
    default:
      return new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.004, decay: 0.24, sustain: 0, release: 0.2 },
        volume: -6,
      })
  }
}

/** True on phones and tablets, where audio buffers need to be larger. */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false)
}

/** Lowest and highest filter cutoff (Hz) per sustained instrument kind. */
const FILTER_RANGE: Record<string, [number, number]> = {
  pad: [180, 2600],
  brass: [140, 1300],
  drone: [220, 3200],
  rumble: [140, 140],
  breath: [0, 0], // band-pass centre follows pitch instead
}

/**
 * The Tone.js sound engine. Nothing is created until `start()` is called from
 * a user gesture. Each track gets a rig of instruments built from its
 * ruleset; rigs share one master chain:
 *
 *   rig fader --+--> master -> compressor -> limiter -> out
 *   rig send ---+--> reverb -> master
 *
 * Sustained instruments also pass an "active" gate that fades them on pause.
 */
export class AudioEngine {
  private started = false
  private starting: Promise<void> | null = null
  private master: Tone.Gain | null = null
  private reverb: Tone.Reverb | null = null
  private meter: Tone.Meter | null = null
  private analyser: Tone.Analyser | null = null
  private rig: Rig | null = null
  private pending: { instruments: InstrumentSpec[]; knobs: Knobs } | null = null
  private active = false
  private soloId: string | null = null
  private peak = -Infinity
  private noteCount = 0
  private explore: {
    tone: Tone.Oscillator
    toneGain: Tone.Gain
    noiseGain: Tone.Gain
    panner: Tone.Panner
  } | null = null

  get isStarted(): boolean {
    return this.started
  }

  /** Create the audio graph. Must be called from a click or key press. */
  start(): Promise<void> {
    if (!this.starting) this.starting = this.build()
    return this.starting
  }

  private async build(): Promise<void> {
    // Phones crackle with the small default buffer. On touch devices, ask for a
    // playback-sized buffer: smoother sound for a little more latency.
    if (isTouchDevice()) Tone.setContext(new Tone.Context({ latencyHint: 'playback' }))
    await Tone.start()
    // Master chain: gentle compression, then a limiter so the output never clips.
    const limiter = new Tone.Limiter(-1).toDestination()
    const compressor = new Tone.Compressor({
      threshold: -20,
      ratio: 3,
      attack: 0.01,
      release: 0.25,
    }).connect(limiter)
    this.master = new Tone.Gain(0.9).connect(compressor)
    this.meter = new Tone.Meter({ smoothing: 0.5 })
    limiter.connect(this.meter)
    // Spectrum for the halo, read after the limiter. It only listens; the sound is unchanged.
    this.analyser = new Tone.Analyser({ type: 'fft', size: 1024, smoothing: 0.5 })
    limiter.connect(this.analyser)
    this.reverb = new Tone.Reverb({ decay: 3.2, preDelay: 0.02, wet: 1 }).connect(this.master)
    await this.reverb.ready
    this.started = true
    if (this.pending) this.loadTrack(this.pending.instruments, this.pending.knobs)
  }

  /**
   * The Explore voice: a gliding tone for a data value, soft pink noise for
   * places with no data (land, legends, date stamps), or silence. Pass null to
   * fade it out.
   */
  setExplore(target: { midi: number; pan: number; sound: 'tone' | 'noise' | 'silence' } | null): void {
    if (!this.started || !this.master) return
    if (!this.explore) {
      const panner = new Tone.Panner(0).connect(this.master)
      const toneGain = new Tone.Gain(0).connect(panner)
      const noiseGain = new Tone.Gain(0).connect(panner)
      const tone = new Tone.Oscillator({ type: 'triangle', frequency: 220, volume: -6 }).connect(toneGain).start()
      const noiseFilter = new Tone.Filter(900, 'lowpass').connect(noiseGain)
      new Tone.Noise('pink').connect(noiseFilter).start()
      this.explore = { tone, toneGain, noiseGain, panner }
    }
    const e = this.explore
    const sound = target?.sound ?? 'silence'
    e.toneGain.gain.rampTo(sound === 'tone' ? 0.32 : 0, 0.08)
    e.noiseGain.gain.rampTo(sound === 'noise' ? 0.1 : 0, 0.08)
    if (target) {
      e.tone.frequency.rampTo(midiToFrequency(target.midi), 0.08)
      e.panner.pan.rampTo(clamp(target.pan, -1, 1), 0.08)
    }
  }

  private testVoice: { synth: Tone.Synth; panner: Tone.Panner } | null = null

  /**
   * An Ear Test tone: a plain sine at a fixed loudness, so only pitch differs
   * between the two clips. `pan` -1 is the left ear, 1 the right.
   */
  playTestTone(midi: number, pan: number, delay: number, duration: number): void {
    if (!this.started || !this.master) return
    if (!this.testVoice) {
      const panner = new Tone.Panner(0).connect(this.master)
      const synth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.03, decay: 0, sustain: 1, release: 0.08 },
        volume: -8,
      }).connect(panner)
      this.testVoice = { synth, panner }
    }
    const at = Tone.immediate() + delay
    this.testVoice.panner.pan.setValueAtTime(clamp(pan, -1, 1), at - 0.01)
    this.testVoice.synth.triggerAttackRelease(midiToFrequency(midi), duration, at, 0.8)
  }

  /** Swap to a track's instruments, crossfading from whatever was playing. */
  loadTrack(instruments: InstrumentSpec[], knobs: Knobs): void {
    this.pending = { instruments, knobs }
    if (!this.started || !this.master || !this.reverb) return
    const old = this.rig
    if (old) {
      old.fader.gain.rampTo(0, CROSSFADE)
      old.send.gain.rampTo(0, CROSSFADE)
      setTimeout(() => old.nodes.forEach((n) => n.dispose()), (CROSSFADE + 3.5) * 1000)
    }
    this.soloId = null
    this.rig = this.buildRig(instruments)
    this.setKnobs(knobs)
    this.rig.fader.gain.rampTo(1, CROSSFADE)
    this.rig.hum.gain.rampTo(this.active ? 1 : 0, RAMP)
  }

  private buildRig(instruments: InstrumentSpec[]): Rig {
    const nodes: Disposable[] = []
    const keep = <T extends Disposable>(node: T): T => {
      nodes.push(node)
      return node
    }
    const fader = keep(new Tone.Gain(0)).connect(this.master!)
    const send = keep(new Tone.Gain(0)).connect(this.reverb!)
    fader.connect(send)
    const hum = keep(new Tone.Gain(0)).connect(fader)
    const rig: Rig = { fader, hum, send, notes: new Map(), sustains: new Map(), nodes }

    for (const spec of instruments) {
      const solo = keep(new Tone.Gain(1))
      if ((NOTE_KINDS as string[]).includes(spec.kind)) {
        const bus = keep(new Tone.Gain(spec.gain)).connect(solo)
        solo.connect(fader)
        // Plucks get a low-pass so the sawtooth is not harsh.
        const input =
          spec.kind === 'pluck' ? keep(new Tone.Filter(2200, 'lowpass')).connect(bus) : bus
        const voices = Array.from({ length: POOL }, () => {
          const panner = keep(new Tone.Panner(0)).connect(input)
          const synth = keep(makeSynth(spec.kind as NoteKind)).connect(panner)
          return { synth, panner }
        })
        rig.notes.set(spec.id, { voices, next: 0, solo })
        continue
      }

      solo.connect(hum)
      const panner = keep(new Tone.Panner(0)).connect(solo)
      const gain = keep(new Tone.Gain(0)).connect(panner)
      const range = FILTER_RANGE[spec.kind]
      const midi = spec.midi ?? [48]
      const filter = keep(
        spec.kind === 'breath'
          ? new Tone.Filter({ type: 'bandpass', frequency: midiToFrequency(midi[0]), Q: 5 })
          : new Tone.Filter({ type: 'lowpass', frequency: range[0], Q: 0.6, rolloff: -24 }),
      ).connect(gain)
      const oscillators: SustainInstrument['oscillators'] = []
      if (spec.kind === 'breath' || spec.kind === 'rumble') {
        keep(new Tone.Noise(spec.kind === 'breath' ? 'pink' : 'brown'))
          .connect(filter)
          .start()
      } else {
        for (const m of midi) {
          const osc =
            spec.kind === 'drone'
              ? new Tone.Oscillator({ type: 'triangle', frequency: midiToFrequency(m), volume: -8 })
              : new Tone.FatOscillator({
                  type: 'sawtooth',
                  frequency: midiToFrequency(m),
                  spread: spec.kind === 'brass' ? 12 : 22,
                  count: 3,
                  volume: -10,
                })
          oscillators.push(keep(osc).connect(filter).start())
        }
      }
      rig.sustains.set(spec.id, { spec, gain, panner, filter, oscillators, solo })
    }
    return rig
  }

  /** Current time on the audio clock, in seconds. */
  currentTime(): number {
    return Tone.immediate()
  }

  /** Schedule notes. Times in the past are played immediately. */
  playNotes(notes: ScheduledNote[]): void {
    if (!this.rig) return
    const now = Tone.immediate()
    for (const note of notes) {
      const inst = this.rig.notes.get(note.voice)
      if (!inst) continue
      const voice = inst.voices[inst.next]
      inst.next = (inst.next + 1) % inst.voices.length
      const at = Math.max(now + 0.005, note.at)
      const duration = note.duration ?? 0.1
      const frequency = midiToFrequency(note.midi)
      // Glide the panner into place just before the hit rather than jumping it.
      voice.panner.pan.rampTo(clamp(note.pan, -1, 1), 0.01, Math.max(now, at - 0.012))
      voice.synth.triggerAttackRelease(frequency, duration, at, clamp(note.velocity, 0, 1))
      if (note.glide) {
        voice.synth.frequency.exponentialRampTo(
          frequency * 2 ** (note.glide / 12),
          duration + 0.5,
          at + 0.01,
        )
      }
      this.noteCount++
    }
  }

  /** Move sustained instruments towards new targets. Glides; never jumps. */
  setVoices(targets: Record<string, VoiceTarget>): void {
    if (!this.rig) return
    for (const [id, target] of Object.entries(targets)) {
      const inst = this.rig.sustains.get(id)
      if (!inst) continue
      inst.gain.gain.rampTo(clamp(target.level, 0, 1) * inst.spec.gain, RAMP)
      if (target.pan !== undefined) inst.panner.pan.rampTo(clamp(target.pan, -1, 1), RAMP)
      if (target.midi !== undefined) {
        const base = inst.spec.midi?.[0] ?? target.midi
        if (inst.spec.kind === 'breath') {
          inst.filter.frequency.rampTo(midiToFrequency(target.midi), RAMP)
        }
        inst.oscillators.forEach((osc, i) => {
          const offset = (inst.spec.midi?.[i] ?? base) - base
          osc.frequency.rampTo(midiToFrequency(target.midi! + offset), RAMP)
        })
      }
      if (target.brightness !== undefined && inst.spec.kind !== 'breath') {
        const [lo, hi] = FILTER_RANGE[inst.spec.kind]
        // Exponential sweep: equal steps of brightness sound like equal steps.
        inst.filter.frequency.rampTo(lo * (hi / lo) ** clamp(target.brightness, 0, 1), RAMP)
      }
    }
  }

  /** Fade every sustained instrument to silence (after a seek, loop or pause). */
  silenceSustains(): void {
    this.rig?.sustains.forEach((inst) => inst.gain.gain.rampTo(0, RAMP))
  }

  /** Apply the by-ear knobs that live in the engine: hum level and reverb. */
  setKnobs(knobs: Knobs): void {
    if (!this.rig) return
    const humGain = 10 ** (knobs.humDb / 20)
    this.rig.sustains.forEach((inst) => inst.solo.gain.rampTo(this.soloGain(inst.spec.id) * humGain, RAMP))
    this.rig.send.gain.rampTo(clamp(knobs.reverb, 0, 1), RAMP)
    this.humGain = humGain
  }
  private humGain = 1

  private soloGain(id: string): number {
    return this.soloId === null || this.soloId === id ? 1 : 0
  }

  /** Solo one instrument (mute the rest), or pass null to hear everything. */
  setSolo(id: string | null): void {
    this.soloId = id
    if (!this.rig) return
    this.rig.notes.forEach((inst, key) => inst.solo.gain.rampTo(this.soloGain(key), RAMP))
    this.rig.sustains.forEach((inst, key) =>
      inst.solo.gain.rampTo(this.soloGain(key) * this.humGain, RAMP),
    )
  }

  /** Open or close the gate on the sustained sounds (close on pause, seek, stall). */
  setActive(active: boolean): void {
    this.active = active
    this.rig?.hum.gain.rampTo(active ? 1 : 0, active ? 0.15 : RAMP)
  }

  private cue: { thump: Tone.MembraneSynth; crackle: Tone.NoiseSynth } | null = null
  private intro: { gain: Tone.Gain; nodes: Disposable[] } | null = null

  /**
   * Needle drop: a soft low thump and a short burst of vinyl crackle, played
   * when a record is chosen. A cue only; it carries no data.
   */
  needleDrop(): void {
    if (!this.started || !this.master) return
    if (!this.cue) {
      const thump = new Tone.MembraneSynth({
        pitchDecay: 0.04,
        octaves: 3,
        envelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.1 },
        volume: -10,
      }).connect(this.master)
      const filter = new Tone.Filter(2600, 'bandpass').connect(this.master)
      const crackle = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.05 },
        volume: -22,
      }).connect(filter)
      this.cue = { thump, crackle }
    }
    const at = Tone.immediate() + 0.02
    this.cue.thump.triggerAttackRelease('A1', 0.15, at, 0.6)
    this.cue.crackle.triggerAttackRelease(0.3, at + 0.01, 0.5)
  }

  /**
   * The intro: a low drone that swells for `rise` seconds and fades over
   * `fall` seconds. Returns when it ends; `introLevel` reads its real gain.
   */
  startIntro(rise = 2.4, fall = 1.8): number {
    if (!this.started || !this.master) return 0
    this.stopIntro()
    const gain = new Tone.Gain(0).connect(this.master)
    const filter = new Tone.Filter(320, 'lowpass').connect(gain)
    const oscs = [33, 45, 52].map((m) =>
      new Tone.FatOscillator({ type: 'sawtooth', frequency: midiToFrequency(m), spread: 18, count: 3, volume: -12 })
        .connect(filter)
        .start(),
    )
    const now = Tone.immediate()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.5, now + rise)
    gain.gain.linearRampToValueAtTime(0, now + rise + fall)
    this.intro = { gain, nodes: [gain, filter, ...oscs] }
    return rise + fall
  }

  /** The intro drone's current gain, 0..1 of its peak; 0 when there is none. */
  introLevel(): number {
    return this.intro ? Math.min(1, this.intro.gain.gain.value / 0.5) : 0
  }

  stopIntro(): void {
    if (!this.intro) return
    const { gain, nodes } = this.intro
    this.intro = null
    gain.gain.cancelScheduledValues(Tone.immediate())
    gain.gain.rampTo(0, 0.2)
    setTimeout(() => nodes.forEach((n) => n.dispose()), 400)
  }

  /** The output spectrum in decibels per bin, and the sample rate; null before sound starts. */
  spectrum(): { db: Float32Array; sampleRate: number } | null {
    if (!this.analyser) return null
    const value = this.analyser.getValue()
    return { db: value instanceof Float32Array ? value : value[0], sampleRate: this.analyser.context.sampleRate }
  }

  /** Output level after the limiter, in dBFS, and the highest level seen so far. */
  level(): { db: number; peakDb: number; notes: number } {
    const value = this.meter?.getValue()
    const db = typeof value === 'number' ? value : -Infinity
    if (db > this.peak) this.peak = db
    return { db, peakDb: this.peak, notes: this.noteCount }
  }
}
