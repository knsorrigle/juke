/** One moment of a track, measured from the video. */
export interface Moment {
  /** Video time in seconds. */
  time: number
  /** The measured amount (see the set's unit). */
  value: number
  /** When it is, in words: a date, a year or a time in the clip. */
  label: string
}

/** Moments from one track that can be compared with each other. */
export interface MomentSet {
  trackId: string
  /** Finishes "Which has more ...?" */
  question: string
  unit: string
  moments: Moment[]
}
