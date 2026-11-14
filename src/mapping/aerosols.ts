import type { ColorClass } from '../analysis/classify.ts'
import type { FrameFeatures } from '../analysis/types.ts'
import { tickIndexAt, tickTime } from './clock.ts'
import { MAJOR_PENTATONIC, clamp, quantizeToScale, scaleNotes, scaleStep, smooth } from './scales.ts'
import type { Knobs, MappingOutput, NoteEvent, Ruleset } from './types.ts'

export type AerosolType = 'carbon' | 'dust' | 'salt' | 'sulfate'
export const AEROSOL_TYPES: AerosolType[] = ['carbon', 'dust', 'salt', 'sulfate']

/**
 * The four legend colours as hue / saturation / value ranges, set from the
 * real video. White annotation text and grey land have almost no saturation,
 * so they fall outside every class.
 */
export const AEROSOL_CLASSES: ColorClass[] = [
  { id: 'sulfate', hue: [85, 150], sat: [0.35, 1], val: [0.25, 1] },
  { id: 'dust', hue: [255, 315], sat: [0.12, 1], val: [0.35, 1] },
  { id: 'carbon', hue: [345, 35], sat: [0.4, 1], val: [0.3, 1] },
  { id: 'salt', hue: [150, 235], sat: [0.06, 0.6], val: [0.3, 1] },
]

/** Share of the frame at which each type reaches full level (measured maxima plus headroom). */
export const AEROSOL_FULL: Record<AerosolType, number> = {
  carbon: 0.014,
  dust: 0.035,
  salt: 0.03,
  sulfate: 0.05,
}

/** Seconds over which amounts and positions are smoothed. */
const SMOOTH = 0.5
const BRASS_SCALE = scaleNotes(36, MAJOR_PENTATONIC, 1) // C2..C3
const BREATH_SCALE = scaleNotes(60, MAJOR_PENTATONIC, 2) // C4..C6
const BELL_SCALE = scaleNotes(72, MAJOR_PENTATONIC, 2) // C5..C7
const PLUCK_SCALE = scaleNotes(48, MAJOR_PENTATONIC, 2) // C3..C5
/** Scale steps added in turn around each type's register, so repeated notes form a small figure. */
const FIGURE = [0, 2, 1, -1, 0, 3, 1, -2]

interface Smoothed {
  level: number
  x: number
  y: number
}

export interface AerosolState {
  time: number | null
  tick: number | null
  types: Record<AerosolType, Smoothed>
  /** Note "debt" per plucked or struck type: a note fires each time it passes 1. */
  energy: { salt: number; sulfate: number }
}

export function createAerosolState(): AerosolState {
  const blank = (): Smoothed => ({ level: 0, x: 0.5, y: 0.5 })
  return {
    time: null,
    tick: null,
    types: { carbon: blank(), dust: blank(), salt: blank(), sulfate: blank() },
    energy: { salt: 0, sulfate: 0 },
  }
}

export const AEROSOL_KNOBS: Knobs = { maxNotes: 2, humDb: 0, panWidth: 1, tempo: 96, reverb: 0.35 }

/**
 * One frame of the Aerosols rules. Each aerosol type is its own instrument:
 * amount -> level (or note density), horizontal centre -> pan, vertical centre
 * -> register (north is high). Black carbon and dust are sustained; sea salt
 * (bells) and sulfate (plucks) play notes on a pulse, more often when there
 * is more of them.
 */
export function stepAerosols(
  features: FrameFeatures,
  time: number,
  state: AerosolState,
  knobs: Knobs,
): { state: AerosolState; output: MappingOutput } {
  const dt = state.time === null ? 0 : Math.max(0, time - state.time)
  const types = {} as Record<AerosolType, Smoothed>
  for (const id of AEROSOL_TYPES) {
    const stats = features.classes[id]
    const prev = state.types[id]
    const target = stats ? clamp(stats.amount / AEROSOL_FULL[id], 0, 1) : 0
    types[id] = {
      level: smooth(prev.level, target, dt, SMOOTH),
      // Position only means something while the type is present.
      x: stats && stats.amount > 0 ? smooth(prev.x, stats.x, dt, SMOOTH) : prev.x,
      y: stats && stats.amount > 0 ? smooth(prev.y, stats.y, dt, SMOOTH) : prev.y,
    }
  }
  const pan = (x: number) => clamp((x - 0.5) * 2 * knobs.panWidth, -1, 1)
  const north = (y: number) => 1 - y

  const clock = { bpm: knobs.tempo, division: 2 }
  const tick = tickIndexAt(time, clock)
  const notes: NoteEvent[] = []
  const energy = { ...state.energy }
  if (state.tick !== null && tick !== state.tick) {
    const at = tickTime(tick, clock)
    const fire = (id: 'salt' | 'sulfate', voice: string, scale: number[]) => {
      energy[id] += types[id].level * 1.4
      if (energy[id] < 1 || notes.length >= Math.round(knobs.maxNotes)) return
      energy[id] -= 1
      notes.push({
        voice,
        time: at + notes.length * 0.03,
        midi: scaleStep(north(types[id].y), scale, FIGURE[(tick + (id === 'salt' ? 3 : 0)) % FIGURE.length]),
        pan: pan(types[id].x),
        velocity: clamp(0.35 + 0.65 * types[id].level, 0, 1),
        duration: voice === 'salt' ? 0.4 : 0.1,
      })
    }
    fire('salt', 'salt', BELL_SCALE)
    fire('sulfate', 'sulfate', PLUCK_SCALE)
  }

  const pct = (id: AerosolType) =>
    `${Math.round(types[id].level * 100)}% level, ${Math.round(types[id].x * 100)}% across`
  return {
    state: { time, tick, types, energy },
    output: {
      notes,
      voices: {
        carbon: {
          level: types.carbon.level,
          pan: pan(types.carbon.x),
          midi: quantizeToScale(north(types.carbon.y), BRASS_SCALE),
          brightness: types.carbon.level,
        },
        dust: {
          level: types.dust.level,
          pan: pan(types.dust.x),
          midi: quantizeToScale(north(types.dust.y), BREATH_SCALE),
        },
      },
      info: {
        'Black carbon (brass)': pct('carbon'),
        'Dust (breath)': pct('dust'),
        'Sea salt (bells)': pct('salt'),
        'Sulfate (plucks)': pct('sulfate'),
      },
    },
  }
}

export function createAerosolRuleset(): Ruleset<AerosolState> {
  return {
    analysis: { classes: AEROSOL_CLASSES },
    instruments: [
      { id: 'carbon', label: 'Black carbon', kind: 'brass', gain: 0.5, midi: [36, 43] },
      { id: 'dust', label: 'Dust', kind: 'breath', gain: 0.9, midi: [72] },
      { id: 'salt', label: 'Sea salt', kind: 'bell', gain: 0.5 },
      { id: 'sulfate', label: 'Sulfate', kind: 'pluck', gain: 0.6 },
    ],
    knobs: AEROSOL_KNOBS,
    soloable: ['carbon', 'dust', 'salt', 'sulfate'],
    createState: createAerosolState,
    step: stepAerosols,
  }
}
