/**
 * A musical clock derived from video time, so the rhythm is locked to the
 * picture: the same moment of video always falls on the same tick.
 */
export interface Clock {
  bpm: number
  /** Ticks per beat: 4 gives 16th notes. */
  division: number
}

export function tickDuration(clock: Clock): number {
  return 60 / clock.bpm / clock.division
}

/** Index of the tick that contains `time` (seconds). */
export function tickIndexAt(time: number, clock: Clock): number {
  // The epsilon keeps times that land exactly on a boundary from rounding down.
  return Math.floor(Math.max(0, time) / tickDuration(clock) + 1e-9)
}

/** Video time (seconds) at which tick `index` starts. */
export function tickTime(index: number, clock: Clock): number {
  return index * tickDuration(clock)
}
