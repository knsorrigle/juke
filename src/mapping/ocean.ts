import type { ColormapStops } from '../analysis/colormap.ts'
import type { FrameFeatures } from '../analysis/types.ts'
import { tickIndexAt, tickTime } from './clock.ts'
import { MAJOR_PENTATONIC, clamp, quantizeToScale, scaleNotes, smooth } from './scales.ts'
import type { InstrumentSpec, Knobs, MappingOutput, NoteEvent, Ruleset } from './types.ts'

/**
 * The legend's colour scale, sampled from NASA's colour-bar image every
 * 1.45 C from 0 C (blue) to 32 C (red).
 */
const BAR: [number, number, number][] = [
  [51, 102, 243], [50, 125, 227], [50, 146, 211], [50, 166, 195], [51, 184, 178], [52, 203, 162],
  [54, 221, 147], [56, 236, 131], [58, 250, 116], [60, 255, 101], [64, 255, 86], [79, 255, 71],
  [107, 255, 57], [143, 255, 46], [182, 255, 38], [219, 255, 34], [246, 255, 33], [251, 242, 32],
  [250, 209, 30], [249, 168, 28], [248, 122, 26], [247, 70, 25], [247, 0, 24],
]
export const SST_MAX = 32
export const SST_STOPS: ColormapStops = BAR.map((c, i) => [(i * SST_MAX) / (BAR.length - 1), ...c])

export const OCEAN_COLS = 16
export const OCEAN_ROWS = 8
/** Seconds for the scanner beam to cross the map, west to east. */
export const SCAN_PERIOD = 8
/** Frame difference in a band that counts as fully "sparkling". */
const MOTION_FULL = 0.008
const PAD_SCALE = scaleNotes(36, MAJOR_PENTATONIC, 3) // C2..C5: 2 C per step
const ARP_SCALE = scaleNotes(48, MAJOR_PENTATONIC, 3)

export interface OceanState {
  time: number | null
  tick: number | null
  temps: (number | null)[]
  motion: number[]
}

export const OCEAN_KNOBS: Knobs = { maxNotes: 1, humDb: 0, panWidth: 1, tempo: 120, reverb: 0.4 }

/** Mean temperature and ocean coverage of one latitude band of the grid. */
export function bandTemperature(
  values: (number | null)[],
  coverage: number[],
  row: number,
  cols: number,
): { temp: number | null; coverage: number } {
  let sum = 0
  let weight = 0
  for (let c = 0; c < cols; c++) {
    const v = values[row * cols + c]
    const w = coverage[row * cols + c]
    if (v === null) continue
    sum += v * w
    weight += w
  }
  return { temp: weight > 0 ? sum / weight : null, coverage: weight / cols }
}

/**
 * One frame of the Ocean rules. Eight latitude bands each hold a soft pad:
 * warmer water is a higher note, and motion in the band opens its filter.
 * A scanner beam sweeps west to east and plays the temperatures of the column
 * under it as a gentle arpeggio, panned to the beam's longitude. Grey land
 * carries no temperature and is silent.
 */
export function stepOcean(
  features: FrameFeatures,
  time: number,
  state: OceanState,
  knobs: Knobs,
): { state: OceanState; output: MappingOutput } {
  const grid = features.grid
  const dt = state.time === null ? 0 : Math.max(0, time - state.time)
  const temps: (number | null)[] = []
  const motion: number[] = []
  const voices: MappingOutput['voices'] = {}
  for (let row = 0; row < OCEAN_ROWS; row++) {
    const band = grid
      ? bandTemperature(grid.values, grid.coverage, row, grid.cols)
      : { temp: null, coverage: 0 }
    let moved = 0
    for (let c = 0; c < OCEAN_COLS; c++) moved += features.regionDiff[row * OCEAN_COLS + c] ?? 0
    const prevTemp = state.temps[row] ?? null
    temps[row] =
      band.temp === null ? prevTemp : prevTemp === null ? band.temp : smooth(prevTemp, band.temp, dt, 0.5)
    motion[row] = smooth(state.motion[row] ?? 0, clamp(moved / OCEAN_COLS / MOTION_FULL, 0, 1), dt, 0.3)
    const temp = temps[row]
    voices[`band${row}`] = {
      level: temp === null ? 0 : clamp(band.coverage * 2.5, 0, 1),
      midi: quantizeToScale((temp ?? 0) / SST_MAX, PAD_SCALE),
      brightness: 0.15 + 0.85 * motion[row],
      pan: 0,
    }
  }

  const scanX = (((time % SCAN_PERIOD) + SCAN_PERIOD) % SCAN_PERIOD) / SCAN_PERIOD
  const clock = { bpm: knobs.tempo, division: 4 }
  const tick = tickIndexAt(time, clock)
  const notes: NoteEvent[] = []
  if (grid && state.tick !== null && tick !== state.tick) {
    const col = Math.min(OCEAN_COLS - 1, Math.floor(scanX * OCEAN_COLS))
    // Step down the column north to south, one or two bands per tick.
    const perTick = Math.max(0, Math.min(2, Math.round(knobs.maxNotes)))
    const first = (tick * perTick) % OCEAN_ROWS
    for (let i = 0; i < perTick; i++) {
      const row = (first + i) % OCEAN_ROWS
      const value = grid.values[row * grid.cols + col]
      if (value === null || grid.coverage[row * grid.cols + col] < 0.05) continue // land
      notes.push({
        voice: 'arp',
        x: scanX,
        y: (row + 0.5) / OCEAN_ROWS,
        time: tickTime(tick, clock) + i * 0.04,
        midi: quantizeToScale(value / SST_MAX, ARP_SCALE),
        pan: clamp((scanX - 0.5) * 2 * knobs.panWidth, -1, 1),
        velocity: 0.45,
        duration: 0.15,
      })
    }
  }

  const show = (row: number) => (temps[row] === null ? 'land' : `${temps[row]!.toFixed(0)} C`)
  return {
    state: { time, tick, temps, motion },
    output: {
      notes,
      voices,
      scanX,
      info: {
        'Temperature by band, north to south': temps.map((_, r) => show(r)).join(', '),
        'Scanner': `${Math.round(scanX * 360 - 180)} degrees longitude`,
      },
    },
  }
}

export function createOceanRuleset(): Ruleset<OceanState> {
  const bands: InstrumentSpec[] = Array.from({ length: OCEAN_ROWS }, (_, row) => ({
    id: `band${row}`,
    label: `Latitude band ${row + 1}`,
    kind: 'pad',
    gain: 0.12,
    midi: [48],
  }))
  return {
    analysis: {
      colormap: { stops: SST_STOPS, cols: OCEAN_COLS, rows: OCEAN_ROWS, satMin: 0.3, valMin: 0.12 },
      regionCols: OCEAN_COLS,
      regionRows: OCEAN_ROWS,
    },
    instruments: [...bands, { id: 'arp', label: 'Scanner', kind: 'mallet', gain: 0.5, color: '#ffffff' }],
    knobs: OCEAN_KNOBS,
    createState: () => ({ time: null, tick: null, temps: [], motion: [] }),
    step: stepOcean,
  }
}
