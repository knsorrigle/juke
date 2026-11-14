import type { ColorClass } from '../analysis/classify.ts'
import type { FrameFeatures } from '../analysis/types.ts'
import { tickIndexAt, tickTime } from './clock.ts'
import { MAJOR_PENTATONIC, clamp, quantizeToScale, scaleNotes, smooth } from './scales.ts'
import type { Knobs, MappingOutput, NoteEvent, Ruleset } from './types.ts'

/**
 * Video times (seconds) at which the on-frame year label changes, measured
 * from the label's pixels: 2012 until the first, then one year per entry.
 */
export const YEAR_CHANGES = [0.5, 1.1, 1.7, 2.3, 2.87, 3.47, 4.07, 4.63, 5.23, 5.83, 6.43]
/** The year series ends and the change map takes over between these times. */
export const YEAR_PHASE_END = 9.4
export const CHANGE_PHASE_START = 9.7
export const CHANGE_PHASE_END = 20.4

export type NightPhase = 'years' | 'change' | 'between'

export function nightPhase(time: number): NightPhase {
  if (time < YEAR_PHASE_END) return 'years'
  if (time >= CHANGE_PHASE_START && time < CHANGE_PHASE_END) return 'change'
  return 'between'
}

/** The year shown on the frame at a video time during the year series. */
export function nightYear(time: number): number {
  return 2012 + YEAR_CHANGES.filter((t) => time >= t).length
}

export const NIGHT_CLASSES: ColorClass[] = [
  { id: 'purple', hue: [240, 300], sat: [0.25, 1], val: [0.12, 1] },
  { id: 'orange', hue: [10, 45], sat: [0.35, 1], val: [0.12, 1] },
  { id: 'lights', hue: [45, 75], sat: [0.2, 1], val: [0.15, 1] },
]

/** Share of the frame lit at the analysis size: 0.05% in 2012, 0.09% in 2023. */
const LIGHTS_FULL = 0.001
/** Seconds for the scanner to cross the map. */
export const NIGHT_SCAN = 4
const COLUMNS = 16
const SPARKLE_SCALE = scaleNotes(72, MAJOR_PENTATONIC, 2)
const RISE_SCALE = scaleNotes(67, MAJOR_PENTATONIC, 1)
const FALL_SCALE = scaleNotes(43, MAJOR_PENTATONIC, 1)

export interface NightState {
  time: number | null
  tick: number | null
  fullness: number
}

export const NIGHT_KNOBS: Knobs = { maxNotes: 3, humDb: 0, panWidth: 1, tempo: 120, reverb: 0.45 }

/**
 * One frame of the Night Lights rules, which depend on the part of the video.
 *
 * Year series: the total of lit pixels sets how full and bright the chord is.
 * A scanner sweeps west to east; brighter longitudes get more bell notes.
 *
 * Change map: under the scanner, purple (new lights) plays a rising bell and
 * orange (lights out) a falling low tone, each as loud as that colour is
 * there. White (no change) is silent.
 */
export function stepNightLights(
  features: FrameFeatures,
  time: number,
  state: NightState,
  knobs: Knobs,
): { state: NightState; output: MappingOutput } {
  const phase = nightPhase(time)
  const dt = state.time === null ? 0 : Math.max(0, time - state.time)
  const lights = features.classes.lights
  const purple = features.classes.purple
  const orange = features.classes.orange
  const target = phase === 'years' && lights ? clamp(lights.amount / LIGHTS_FULL, 0, 1) : 0
  const fullness = state.time === null ? target : smooth(state.fullness, target, dt, 0.4)

  const scanX = (((time % NIGHT_SCAN) + NIGHT_SCAN) % NIGHT_SCAN) / NIGHT_SCAN
  const col = Math.min(COLUMNS - 1, Math.floor(scanX * COLUMNS))
  const pan = clamp((scanX - 0.5) * 2 * knobs.panWidth, -1, 1)
  const clock = { bpm: knobs.tempo, division: 4 }
  const tick = tickIndexAt(time, clock)
  const notes: NoteEvent[] = []
  const max = Math.round(knobs.maxNotes)
  let balance = ''

  if (state.tick !== null && tick !== state.tick && phase !== 'between') {
    const at = tickTime(tick, clock)
    if (phase === 'years' && lights) {
      const top = Math.max(1e-6, ...lights.columns)
      const share = lights.columns[col] / top
      const count = Math.round(share * max)
      for (let i = 0; i < count; i++) {
        notes.push({
          voice: 'sparkle',
          x: scanX,
          y: lights.y,
          time: at + i * 0.03,
          midi: quantizeToScale((i + (tick % 3)) / (max + 2), SPARKLE_SCALE),
          pan,
          velocity: clamp(0.3 + 0.6 * share, 0, 1),
          duration: 0.25,
        })
      }
    } else if (phase === 'change' && purple && orange) {
      const top = Math.max(1e-6, ...purple.columns, ...orange.columns)
      const grew = purple.columns[col] / top
      const faded = orange.columns[col] / top
      if (grew > 0.08 && max > 0) {
        notes.push({
          voice: 'rise',
          x: scanX,
          y: purple.y,
          time: at,
          midi: quantizeToScale(grew, RISE_SCALE),
          pan,
          velocity: clamp(0.3 + 0.7 * grew, 0, 1),
          duration: 0.35,
          glide: 7,
        })
      }
      if (faded > 0.08 && max > 1) {
        notes.push({
          voice: 'fall',
          x: scanX,
          y: orange.y,
          time: at + 0.04,
          midi: quantizeToScale(1 - faded, FALL_SCALE),
          pan,
          velocity: clamp(0.3 + 0.7 * faded, 0, 1),
          duration: 0.4,
          glide: -7,
        })
      }
    }
  }
  if (phase === 'change' && purple && orange) {
    const total = purple.amount + orange.amount
    balance = total > 0 ? `${Math.round((purple.amount / total) * 100)}% new lights, ${Math.round((orange.amount / total) * 100)}% lights out` : 'none'
  }

  return {
    state: { time, tick, fullness },
    output: {
      notes,
      voices: {
        chord: {
          level: phase === 'years' ? 0.25 + 0.75 * fullness : phase === 'change' ? 0.2 : 0.1,
          brightness: phase === 'years' ? fullness : 0.2,
        },
      },
      scanX: phase === 'between' ? null : scanX,
      info:
        phase === 'years'
          ? { Year: String(nightYear(time)), 'Lights (chord fullness)': `${Math.round(fullness * 100)}%` }
          : phase === 'change'
            ? { Part: 'Change from 2012 to 2023', 'Whole map': balance }
            : { Part: 'Between parts' },
    },
  }
}

export function createNightLightsRuleset(): Ruleset<NightState> {
  return {
    analysis: { classes: NIGHT_CLASSES },
    instruments: [
      { id: 'chord', label: 'Lights chord', kind: 'pad', gain: 0.3, midi: [48, 55, 60, 64] },
      { id: 'sparkle', label: 'City sparkle', kind: 'bell', gain: 0.4, color: '#fff2b0' },
      { id: 'rise', label: 'New lights', kind: 'bell', gain: 0.6, color: '#a070e0' },
      { id: 'fall', label: 'Lights out', kind: 'low', gain: 0.7, color: '#e09040' },
    ],
    knobs: NIGHT_KNOBS,
    createState: () => ({ time: null, tick: null, fullness: 0 }),
    step: stepNightLights,
  }
}
