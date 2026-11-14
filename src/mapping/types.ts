import type { AnalysisOptions, FrameFeatures } from '../analysis/types.ts'

/** One short note on a note instrument. */
export interface NoteEvent {
  /** Id of the instrument that plays it. */
  voice: string
  /** Video time, in seconds, at which the note belongs. */
  time: number
  /** MIDI note number, already quantised to the track's scale. */
  midi: number
  /** Stereo position, -1 (left) to 1 (right). */
  pan: number
  /** Loudness, 0..1. */
  velocity: number
  /** Seconds the note is held before release. */
  duration?: number
  /** Semitones the pitch slides over the note (positive rises, negative falls). */
  glide?: number
}

/** Target for a sustained instrument. Omitted fields stay where they are. */
export interface VoiceTarget {
  /** 0..1. */
  level: number
  pan?: number
  /** Pitch as a MIDI note number (may be fractional). */
  midi?: number
  /** 0..1: how open the instrument's filter is. */
  brightness?: number
}

/** What one musical tick contained, for the on-screen readout. */
export interface TickSummary {
  index: number
  time: number
  flashCount: number
  clusterCount: number
  notesPlayed: number
}

export interface MappingOutput {
  notes: NoteEvent[]
  /** Targets by instrument id; null when nothing should change. */
  voices: Record<string, VoiceTarget> | null
  tick?: TickSummary | null
  /** Short label -> value lines for the on-screen readout. */
  info?: Record<string, string>
  /** Horizontal position (0..1) of a scanner beam to draw over the video. */
  scanX?: number | null
  /** A message for the screen-reader live region (use sparingly). */
  announce?: string
}

/** The by-ear tuning controls every track exposes. */
export interface Knobs {
  /** Most notes played per pulse. */
  maxNotes: number
  /** Level of the sustained instruments, in dB relative to the default. */
  humDb: number
  /** Stereo spread, 0 (mono) to 1 (hard left and right). */
  panWidth: number
  /** Pulse tempo in beats per minute. */
  tempo: number
  /** Amount of reverb, 0..1. */
  reverb: number
}

export type NoteKind = 'mallet' | 'bell' | 'pluck' | 'low'
export type SustainKind = 'pad' | 'brass' | 'breath' | 'rumble' | 'drone'

export interface InstrumentSpec {
  id: string
  /** Name shown to and spoken for the listener. */
  label: string
  kind: NoteKind | SustainKind
  /** Base gain, 0..1. */
  gain: number
  /** Starting pitches (MIDI) for sustained instruments. */
  midi?: number[]
}

/**
 * A track's sonification rules: which features to extract, which instruments
 * it plays, and a pure step function from features to audio events. All
 * memory lives in `state`.
 */
export interface Ruleset<S = unknown> {
  analysis: Partial<AnalysisOptions>
  instruments: InstrumentSpec[]
  knobs: Knobs
  /** Instruments that keys 1-4 can solo, in key order. */
  soloable?: string[]
  createState(): S
  step(
    features: FrameFeatures,
    time: number,
    state: S,
    knobs: Knobs,
  ): { state: S; output: MappingOutput }
}
