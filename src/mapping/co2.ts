import type { ColorClass } from '../analysis/classify.ts'
import type { FrameFeatures } from '../analysis/types.ts'
import { clamp, smooth } from './scales.ts'
import type { Knobs, MappingOutput, Ruleset } from './types.ts'

/** Orange and red on the legend: the high end of the CO2 scale. */
export const CO2_CLASSES: ColorClass[] = [{ id: 'hot', hue: [0, 40], sat: [0.5, 1], val: [0.35, 1] }]

/** Share of the frame in orange or red at which the drone is fully raised (measured peak average 0.64%). */
export const CO2_FULL = 0.007
/** The reference pitch (A2) and how far the main drone can rise above it, in semitones. */
export const CO2_BASE_MIDI = 45
export const CO2_RISE = 12
/** Seconds of averaging that separates the slow trend from the day/night pulse (one day is 0.8 s). */
const TREND = 1.6

export interface Co2State {
  time: number | null
  trend: number
}

export const CO2_KNOBS: Knobs = { maxNotes: 0, humDb: 0, panWidth: 0, tempo: 60, reverb: 0.3 }

/**
 * One frame of the CO2 rules. The camera orbits the globe, so position on
 * screen is not a place: nothing here uses x or y. Only how much orange and
 * red is in view matters. Its slow trend raises the main drone above a fixed
 * reference drone and opens its filter; its fast day/night pulse becomes a
 * tremolo.
 */
export function stepCo2(
  features: FrameFeatures,
  time: number,
  state: Co2State,
): { state: Co2State; output: MappingOutput } {
  const amount = features.classes.hot?.amount ?? 0
  const dt = state.time === null ? 0 : Math.max(0, time - state.time)
  const trend = state.time === null ? amount : smooth(state.trend, amount, dt, TREND)
  const lift = clamp(trend / CO2_FULL, 0, 1)
  // How far this instant sits above or below the trend: the day/night pulse.
  const pulse = trend > 1e-5 ? clamp(amount / trend, 0, 2.5) : 1
  const tremolo = clamp(0.55 + 0.45 * (pulse - 1), 0.15, 1)
  return {
    state: { time, trend },
    output: {
      notes: [],
      voices: {
        main: {
          level: (0.3 + 0.7 * lift) * tremolo,
          midi: CO2_BASE_MIDI + CO2_RISE * lift,
          brightness: lift,
          pan: 0,
        },
        reference: { level: 0.5, midi: CO2_BASE_MIDI, brightness: 0.15, pan: 0 },
      },
      info: {
        'Orange and red in view': `${(amount * 100).toFixed(2)}% now, ${(trend * 100).toFixed(2)}% trend`,
        'Drone above reference': `${(CO2_RISE * lift).toFixed(1)} semitones`,
      },
    },
  }
}

export function createCo2Ruleset(): Ruleset<Co2State> {
  return {
    analysis: { classes: CO2_CLASSES },
    instruments: [
      { id: 'main', label: 'CO2 drone', kind: 'drone', gain: 0.45, midi: [45, 52] },
      { id: 'reference', label: 'Reference drone', kind: 'drone', gain: 0.22, midi: [45] },
    ],
    knobs: CO2_KNOBS,
    createState: () => ({ time: null, trend: 0 }),
    step: (features, time, state) => stepCo2(features, time, state),
  }
}
