import { create } from 'zustand'
import type { Difficulty } from './eartest/questions.ts'
import type { Knobs } from './mapping/types.ts'

export type Mode = 'play' | 'explore' | 'eartest'

export interface EarTestView {
  phase: 'setup' | 'asking' | 'revealed' | 'done'
  difficulty: Difficulty
  index: number
  total: number
  score: number
  /** The question, with no hint of the answer. */
  prompt: string
  /** Shown and spoken after answering. */
  reveal: string
  best: Partial<Record<Difficulty, number>>
}

export type PlayerStatus = 'loading' | 'ready' | 'playing' | 'paused' | 'error'

/** A snapshot of the analysis and audio state for the on-screen readout. */
export interface Readout {
  width: number
  height: number
  meanLuminance: number
  diff: number
  columnLuminance: number[]
  rowLuminance: number[]
  hueHistogram: number[]
  dominantHue: number | null
  centroid: { x: number; y: number } | null
  /** Track-specific lines from the rules, e.g. "Dust (breath): 60% level". */
  info: Record<string, string>
  analysisMs: number
  outputDb: number
  peakDb: number
  notesTotal: number
  exactFrames: boolean
}

export interface JukeboxState {
  trackId: string
  status: PlayerStatus
  /** True once the audio engine has been started by a user gesture. */
  audioOn: boolean
  time: number
  duration: number
  dateText: string | null
  dateCorrected: boolean
  readout: Readout | null
  /** Horizontal position (0..1) of the scanner beam, or null when there is none. */
  scanX: number | null
  mode: Mode
  /** Explore cursor, in cells of the explore grid. */
  cursor: { col: number; row: number; cols: number; rows: number }
  /** What the Explore cursor is over, in words. */
  probeText: string
  earTest: EarTestView
  /** The intro overlay is showing; page shortcuts wait until it closes. */
  introOpen: boolean
  /** Counts needle drops, so the shelf can animate the stylus in time with the sound. */
  dropId: number
  /** A short visible caption for a sound cue (needle drop, intro drone), with when it started. */
  cue: { text: string; at: number } | null
  /** High contrast theme on (C key). */
  highContrast: boolean
  /** What is sounding right now, for the visible caption bar. */
  sounding: string
  /** Instrument heard alone, or null for all. */
  solo: string | null
  /** By-ear tuning per track id. */
  knobs: Record<string, Knobs>
  /** Latest message for the screen-reader live region. `id` changes every time. */
  announcement: { id: number; text: string }
  error: string | null
  patch(partial: Partial<JukeboxState>): void
  announce(text: string): void
  setKnob(trackId: string, key: keyof Knobs, value: number): void
}

export const useJukebox = create<JukeboxState>((set) => ({
  trackId: 'lightning',
  status: 'loading',
  audioOn: false,
  time: 0,
  duration: 0,
  dateText: null,
  dateCorrected: false,
  readout: null,
  scanX: null,
  solo: null,
  mode: 'play',
  cursor: { col: 32, row: 16, cols: 64, rows: 32 },
  probeText: '',
  highContrast: false,
  introOpen: false,
  dropId: 0,
  cue: null,
  earTest: { phase: 'setup', difficulty: 'easy', index: 0, total: 0, score: 0, prompt: '', reveal: '', best: {} },
  sounding: '',
  knobs: {},
  announcement: { id: 0, text: '' },
  error: null,
  patch: (partial) => set(partial),
  announce: (text) => set((s) => ({ announcement: { id: s.announcement.id + 1, text } })),
  setKnob: (trackId, key, value) =>
    set((s) => ({ knobs: { ...s.knobs, [trackId]: { ...s.knobs[trackId], [key]: value } } })),
}))
