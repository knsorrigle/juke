import type { AnalysisOptions, FrameFeatures } from '../analysis/types.ts'

/** One percussive note. */
export interface NoteEvent {
  /** Video time, in seconds, at which the note belongs. */
  time: number
  /** MIDI note number, already quantised to the track's scale. */
  midi: number
  /** Stereo position, -1 (left) to 1 (right). */
  pan: number
  /** Loudness, 0..1. */
  velocity: number
}

/** Target for the sustained pad and rumble underneath the notes. */
export interface PadTarget {
  /** 0..1. */
  level: number
}

/** What one musical tick contained, for the on-screen readout. */
export interface TickSummary {
  index: number
  /** Video time of the tick, in seconds. */
  time: number
  /** Newly lit pixels gathered since the previous tick. */
  flashCount: number
  clusterCount: number
  notesPlayed: number
}

export interface MappingOutput {
  notes: NoteEvent[]
  /** Null when the pad should stay where it is. */
  pad: PadTarget | null
  /** Set on frames where a tick fired. */
  tick: TickSummary | null
}

/**
 * A track's sonification rules: which features to extract, and a pure step
 * function from features to audio events. All memory lives in `state`.
 */
export interface Ruleset<S = unknown> {
  analysis: Partial<AnalysisOptions>
  createState(): S
  step(features: FrameFeatures, time: number, state: S): { state: S; output: MappingOutput }
}
