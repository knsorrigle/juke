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
/** The dust edge jumps about 10 degrees from frame to frame, so it is smoothed more slowly. */
const EDGE_SMOOTH = 1.5
/** Map bands for the dust edge: 32 bands of 11.25 degrees. */
export const AEROSOL_COLUMNS = 32
/**
 * Share of a map band (brightness-weighted) at which the band counts as dusty.
 * Measured on the real video at 3%: the edge starts near 42 W, reaches about
 * 67 W by 18 s and holds to about 30 s, then pulls back to about 20 W by the
 * end. Lower shares catch thin haze that is already far west at the start, so
 * the push across the Atlantic barely shows; higher ones jump between bands.
 */
export const DUST_EDGE_SHARE = 0.03
const BRASS_SCALE = scaleNotes(36, MAJOR_PENTATONIC, 1) // C2..C3
const BREATH_SCALE = scaleNotes(60, MAJOR_PENTATONIC, 2) // C4..C6
const BELL_SCALE = scaleNotes(72, MAJOR_PENTATONIC, 2) // C5..C7
const PLUCK_SCALE = scaleNotes(48, MAJOR_PENTATONIC, 2) // C3..C5
/**
 * The western edge of a plume, 0..1 across the map: the left side of the
 * westernmost band holding at least `share`, moved further west by how close
 * the band beyond it comes to that share, so the edge glides between bands.
 * Null when no band reaches the share.
 */
export function westEdge(columns: number[], share = DUST_EDGE_SHARE): number | null {
  const n = columns.length
  for (let k = 0; k < n; k++) {
    if (columns[k] < share) continue
    const beyond = k > 0 ? Math.min(1, columns[k - 1] / share) : 0
    return (k - beyond) / n
  }
  return null
}

/** A map position 0..1 as longitude in words (the aerosols map spans 180 W to 180 E). */
function longitude(x: number): string {
  const lon = Math.round(-180 + 360 * x)
  return `${Math.abs(lon)} degrees ${lon >= 0 ? 'east' : 'west'}`
}

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
  /** The dust plume's western edge, 0..1 across the map; null until first seen. */
  dustEdge: number | null
  /** Note "debt" per plucked or struck type: a note fires each time it passes 1. */
  energy: { salt: number; sulfate: number }
}

export function createAerosolState(): AerosolState {
  const blank = (): Smoothed => ({ level: 0, x: 0.5, y: 0.5 })
  return {
    time: null,
    tick: null,
    types: { carbon: blank(), dust: blank(), salt: blank(), sulfate: blank() },
    dustEdge: null,
    energy: { salt: 0, sulfate: 0 },
  }
}

export const AEROSOL_KNOBS: Knobs = { maxNotes: 2, humDb: 0, panWidth: 1, tempo: 96, reverb: 0.35 }

/**
 * One frame of the Aerosols rules. Each aerosol type is its own instrument:
 * amount -> level (or note density), horizontal centre -> pan, vertical centre
 * -> register (north is high). Dust pans by its plume's western edge instead
 * of its centre: the Sahara and Arabia hold the centre near 10 to 30 E all
 * clip, while the edge crossing the Atlantic is what moves. Black carbon and dust are sustained; sea salt
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
  const seenEdge = features.classes.dust ? westEdge(features.classes.dust.columns) : null
  const dustEdge =
    seenEdge === null
      ? state.dustEdge
      : state.dustEdge === null
        ? seenEdge
        : smooth(state.dustEdge, seenEdge, dt, EDGE_SMOOTH)
  const dustX = dustEdge ?? types.dust.x
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
        x: types[id].x,
        y: types[id].y,
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
    state: { time, tick, types, dustEdge, energy },
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
          pan: pan(dustX),
          midi: quantizeToScale(north(types.dust.y), BREATH_SCALE),
        },
      },
      info: {
        'Black carbon (brass)': pct('carbon'),
        'Dust (breath)': `${Math.round(types.dust.level * 100)}% level, west edge ${longitude(dustX)}`,
        'Sea salt (bells)': pct('salt'),
        'Sulfate (plucks)': pct('sulfate'),
      },
    },
  }
}

export function createAerosolRuleset(): Ruleset<AerosolState> {
  return {
    analysis: { classes: AEROSOL_CLASSES, columns: AEROSOL_COLUMNS },
    instruments: [
      { id: 'carbon', label: 'Black carbon', kind: 'brass', gain: 0.5, midi: [36, 43], color: '#d4624a' },
      { id: 'dust', label: 'Dust', kind: 'breath', gain: 0.9, midi: [72], color: '#c49be0' },
      { id: 'salt', label: 'Sea salt', kind: 'bell', gain: 0.5, color: '#8aaeaa' },
      { id: 'sulfate', label: 'Sulfate', kind: 'pluck', gain: 0.6, color: '#55e03b' },
    ],
    knobs: AEROSOL_KNOBS,
    soloable: ['carbon', 'dust', 'salt', 'sulfate'],
    createState: createAerosolState,
    step: stepAerosols,
  }
}
