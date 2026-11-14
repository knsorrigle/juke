import { create } from 'zustand'

export type PlayerStatus = 'loading' | 'ready' | 'playing' | 'paused' | 'error'

/** A snapshot of the analysis and audio state for the on-screen readout. */
export interface Readout {
  width: number
  height: number
  meanLuminance: number
  diff: number
  signalMean: number
  columnLuminance: number[]
  rowLuminance: number[]
  hueHistogram: number[]
  dominantHue: number | null
  centroid: { x: number; y: number } | null
  brightSpots: number
  risingPixels: number
  /** The most recent musical tick. */
  tickFlashCount: number
  tickClusters: number
  tickNotes: number
  padLevel: number
  analysisMs: number
  outputDb: number
  peakDb: number
  notesTotal: number
  exactFrames: boolean
}

export interface JukeboxState {
  status: PlayerStatus
  /** True once the audio engine has been started by a user gesture. */
  audioOn: boolean
  time: number
  duration: number
  dateText: string | null
  dateCorrected: boolean
  readout: Readout | null
  /** Latest message for the screen-reader live region. `id` changes every time. */
  announcement: { id: number; text: string }
  error: string | null
  patch(partial: Partial<JukeboxState>): void
  announce(text: string): void
}

export const useJukebox = create<JukeboxState>((set) => ({
  status: 'loading',
  audioOn: false,
  time: 0,
  duration: 0,
  dateText: null,
  dateCorrected: false,
  readout: null,
  announcement: { id: 0, text: '' },
  error: null,
  patch: (partial) => set(partial),
  announce: (text) => set((s) => ({ announcement: { id: s.announcement.id + 1, text } })),
}))
