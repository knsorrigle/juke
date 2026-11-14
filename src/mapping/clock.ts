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

/**
 * True if video time did not simply move on to the next frame: it went
 * backwards (a loop or a seek back) or jumped ahead by more than `maxGap`
 * seconds (a seek forward, or frames stopped arriving for a while).
 */
export function isDiscontinuity(lastTime: number | null, time: number, maxGap = 0.5): boolean {
  if (lastTime === null) return false
  return time < lastTime - 0.001 || time - lastTime > maxGap
}
