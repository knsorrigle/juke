/** Semitone steps of the minor pentatonic scale. Any mix of its notes sounds consonant. */
export const MINOR_PENTATONIC = [0, 3, 5, 7, 10]

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Every note of a scale from `rootMidi` up through `octaves` octaves, ending on the root. */
export function scaleNotes(rootMidi: number, intervals: number[], octaves: number): number[] {
  const notes: number[] = []
  for (let o = 0; o < octaves; o++) {
    for (const i of intervals) notes.push(rootMidi + 12 * o + i)
  }
  notes.push(rootMidi + 12 * octaves)
  return notes
}

/** Pick the scale note for a position 0..1 (0 = lowest note, 1 = highest). Clamped. */
export function quantizeToScale(position: number, notes: number[]): number {
  const p = clamp(Number.isFinite(position) ? position : 0, 0, 1)
  return notes[Math.min(notes.length - 1, Math.floor(p * notes.length))]
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

/** Semitone steps of the major pentatonic scale. */
export const MAJOR_PENTATONIC = [0, 2, 4, 7, 9]

/**
 * Move `previous` towards `target` with a time constant of `tau` seconds,
 * given that `dt` seconds have passed. Frame-rate independent smoothing.
 */
export function smooth(previous: number, target: number, dt: number, tau: number): number {
  if (!(dt > 0) || tau <= 0) return target
  return previous + (target - previous) * (1 - Math.exp(-dt / tau))
}

/**
 * Like quantizeToScale, then moved `steps` scale degrees up or down, staying
 * inside the scale. Used to add a little melodic movement around a register.
 */
export function scaleStep(position: number, notes: number[], steps: number): number {
  const p = clamp(Number.isFinite(position) ? position : 0, 0, 1)
  const base = Math.min(notes.length - 1, Math.floor(p * notes.length))
  return notes[clamp(base + steps, 0, notes.length - 1)]
}
