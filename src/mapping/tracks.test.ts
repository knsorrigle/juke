import { describe, expect, it } from 'vitest'
import type { ClassStats } from '../analysis/classify.ts'
import type { FrameFeatures } from '../analysis/types.ts'
import { AEROSOL_FULL, AEROSOL_KNOBS, createAerosolState, stepAerosols } from './aerosols.ts'
import { CO2_BASE_MIDI, CO2_FULL, stepCo2 } from './co2.ts'
import {
  NIGHT_KNOBS,
  nightPhase,
  nightYear,
  stepNightLights,
} from './nightLights.ts'
import { OCEAN_COLS, OCEAN_KNOBS, OCEAN_ROWS, bandTemperature, stepOcean } from './ocean.ts'
import { smooth } from './scales.ts'
import type { MappingOutput } from './types.ts'

function features(extra: Partial<FrameFeatures> = {}): FrameFeatures {
  return {
    width: 160, height: 80, meanLuminance: 0, columnLuminance: [], rowLuminance: [], diff: 0,
    regionDiff: new Array(OCEAN_COLS * OCEAN_ROWS).fill(0), hueHistogram: [], dominantHues: [],
    brightSpots: [], centroid: null, signalMean: 0, risingPixels: [], classes: {}, grid: null,
    ...extra,
  }
}
const stats = (amount: number, x = 0.5, y = 0.5, columns: number[] = new Array(16).fill(amount)): ClassStats => ({ amount, x, y, columns })

/** Run a step function over `seconds` of identical frames at 30 fps. */
function run<S>(step: (f: FrameFeatures, t: number, s: S) => { state: S; output: MappingOutput }, state: S, f: FrameFeatures, seconds: number, from = 0) {
  const outputs: MappingOutput[] = []
  for (let i = 0; i <= seconds * 30; i++) {
    const r = step(f, from + i / 30, state)
    state = r.state
    outputs.push(r.output)
  }
  return { state, outputs, last: outputs[outputs.length - 1] }
}

describe('smoothing', () => {
  it('closes about 63% of the gap in one time constant, whatever the frame rate', () => {
    let a = 0
    for (let i = 0; i < 15; i++) a = smooth(a, 1, 1 / 30, 0.5)
    let b = 0
    for (let i = 0; i < 30; i++) b = smooth(b, 1, 1 / 60, 0.5)
    expect(a).toBeCloseTo(0.632, 2)
    expect(b).toBeCloseTo(a, 3)
  })
})

describe('Aerosols rules', () => {
  const step = (f: FrameFeatures, t: number, s: ReturnType<typeof createAerosolState>) => stepAerosols(f, t, s, AEROSOL_KNOBS)
  const classes = (dustX: number) => ({
    carbon: stats(AEROSOL_FULL.carbon, 0.4, 0.6),
    dust: stats(AEROSOL_FULL.dust / 2, dustX, 0.4),
    salt: stats(AEROSOL_FULL.salt, 0.6, 0.7),
    sulfate: stats(0, 0.5, 0.5),
  })

  it('maps amount to level, horizontal centre to pan and vertical centre to register', () => {
    const { last } = run(step, createAerosolState(), features({ classes: classes(0.2) }), 4)
    expect(last.voices!.carbon.level).toBeCloseTo(1, 1)
    expect(last.voices!.dust.level).toBeCloseTo(0.5, 1)
    expect(last.voices!.dust.pan).toBeCloseTo(-0.6, 1)
    expect(last.voices!.carbon.pan!).toBeLessThan(0)
    const north = run(step, createAerosolState(), features({ classes: { ...classes(0.2), dust: stats(0.02, 0.5, 0.1) } }), 4).last
    expect(north.voices!.dust.midi!).toBeGreaterThan(last.voices!.dust.midi!)
  })

  it('moves the dust pan left as dust drifts west, smoothed over about half a second', () => {
    const east = run(step, createAerosolState(), features({ classes: classes(0.7) }), 3)
    const justAfter = step(features({ classes: classes(0.3) }), 3 + 2 / 30, east.state).output.voices!.dust.pan!
    const later = run(step, east.state, features({ classes: classes(0.3) }), 3, 3.1).last.voices!.dust.pan!
    expect(east.last.voices!.dust.pan!).toBeCloseTo(0.4, 1)
    expect(justAfter).toBeGreaterThan(0.2) // has not jumped
    expect(later).toBeCloseTo(-0.4, 1)
  })

  it('plays more bell notes when there is more sea salt, none for an absent type, within the cap', () => {
    const count = (salt: number) => run(step, createAerosolState(), features({ classes: { ...classes(0.5), salt: stats(salt) } }), 10).outputs.flatMap((o) => o.notes)
    const many = count(AEROSOL_FULL.salt)
    const few = count(AEROSOL_FULL.salt / 5)
    expect(many.length).toBeGreaterThan(few.length * 2)
    expect(many.every((n) => n.voice === 'salt')).toBe(true) // sulfate amount is zero
    expect(few.length).toBeGreaterThan(0)
    expect(new Set(many.map((n) => n.midi)).size).toBeGreaterThan(2) // a figure, not one repeated note
  })
})

describe('Ocean rules', () => {
  const step = (f: FrameFeatures, t: number, s: Parameters<typeof stepOcean>[2]) => stepOcean(f, t, s, OCEAN_KNOBS)
  const fresh = () => ({ time: null, tick: null, temps: [], motion: [] })
  // Warm at the equator rows (3, 4), cold at the poles; column 5 is all land.
  const values = Array.from({ length: OCEAN_ROWS * OCEAN_COLS }, (_, i) => {
    const row = Math.floor(i / OCEAN_COLS)
    return i % OCEAN_COLS === 5 ? null : 30 - Math.abs(row - 3.5) * 8
  })
  const grid = { cols: OCEAN_COLS, rows: OCEAN_ROWS, values, coverage: values.map((v) => (v === null ? 0 : 0.5)) }

  it('averages a band over its ocean cells only', () => {
    expect(bandTemperature([10, null, 30, 20], [1, 0, 1, 2], 0, 4)).toEqual({ temp: 20, coverage: 1 })
    expect(bandTemperature([null, null], [0, 0], 0, 2).temp).toBeNull()
  })

  it('gives warm bands higher notes than cold ones and silences bands with no ocean', () => {
    const { last } = run(step, fresh(), features({ grid }), 2)
    expect(last.voices!.band3.midi!).toBeGreaterThan(last.voices!.band0.midi!)
    expect(last.voices!.band4.midi!).toBeGreaterThan(last.voices!.band7.midi!)
    const land = { ...grid, values: values.map(() => null), coverage: values.map(() => 0) }
    expect(run(step, fresh(), features({ grid: land }), 1).last.voices!.band3.level).toBe(0)
  })

  it('opens a band filter when that band is moving', () => {
    const regionDiff = new Array(OCEAN_COLS * OCEAN_ROWS).fill(0).map((_, i) => (Math.floor(i / OCEAN_COLS) === 2 ? 0.03 : 0))
    const { last } = run(step, fresh(), features({ grid, regionDiff }), 2)
    expect(last.voices!.band2.brightness!).toBeGreaterThan(0.9)
    expect(last.voices!.band6.brightness!).toBeCloseTo(0.15, 2)
  })

  it('sweeps the scanner west to east in 8 s, panning its notes and skipping land', () => {
    const { outputs } = run(step, fresh(), features({ grid }), 7.9)
    expect(outputs[30].scanX).toBeCloseTo(0.125, 2)
    const notes = outputs.flatMap((o) => o.notes)
    expect(notes.length).toBeGreaterThan(45) // about 8 per second, minus land
    expect(notes[0].pan).toBeLessThan(-0.8)
    expect(notes[notes.length - 1].pan).toBeGreaterThan(0.8)
    // Column 5 (pan about -0.33) is land: no note lands there.
    expect(notes.some((n) => n.pan > -0.37 && n.pan < -0.26)).toBe(false)
  })
})

describe('Night Lights rules', () => {
  const step = (f: FrameFeatures, t: number, s: Parameters<typeof stepNightLights>[2]) => stepNightLights(f, t, s, NIGHT_KNOBS)
  const fresh = () => ({ time: null, tick: null, fullness: 0 })

  it('knows the year and the part of the video from the timecode', () => {
    expect(nightYear(0)).toBe(2012)
    expect(nightYear(0.6)).toBe(2013)
    expect(nightYear(4.5)).toBe(2019)
    expect(nightYear(8)).toBe(2023)
    expect([nightPhase(3), nightPhase(9.5), nightPhase(15), nightPhase(21)]).toEqual(['years', 'between', 'change', 'between'])
  })

  it('fills the chord and adds sparkle where the lights are, in the year series', () => {
    const columns = new Array(16).fill(0); columns[12] = 0.004 // all light in the east
    const dim = run(step, fresh(), features({ classes: { lights: stats(0.0003, 0.5, 0.5, columns) } }), 4)
    const bright = run(step, fresh(), features({ classes: { lights: stats(0.0009, 0.5, 0.5, columns) } }), 4)
    expect(bright.last.voices!.chord.level).toBeGreaterThan(dim.last.voices!.chord.level)
    const notes = bright.outputs.flatMap((o) => o.notes)
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.every((n) => n.voice === 'sparkle' && n.pan > 0.4 && n.pan < 0.7)).toBe(true)
  })

  it('plays rising bells for purple and falling low tones for orange, by place, in the change map', () => {
    const purple = new Array(16).fill(0); purple[13] = 0.002 // growth in the east
    const orange = new Array(16).fill(0); orange[7] = 0.002 // loss near the middle
    const f = features({ classes: { purple: stats(0.0003, 0.8, 0.3, purple), orange: stats(0.0002, 0.5, 0.3, orange), lights: stats(0) } })
    const notes = run(step, fresh(), f, 8, 10).outputs.flatMap((o) => o.notes)
    const rise = notes.filter((n) => n.voice === 'rise')
    const fall = notes.filter((n) => n.voice === 'fall')
    expect(rise.length).toBeGreaterThan(0)
    expect(fall.length).toBeGreaterThan(0)
    expect(rise.every((n) => n.glide! > 0 && n.pan > 0.5)).toBe(true)
    expect(fall.every((n) => n.glide! < 0 && Math.abs(n.pan) < 0.2)).toBe(true)
    expect(notes.some((n) => n.voice === 'sparkle')).toBe(false)
  })
})

describe('CO2 rules', () => {
  const fresh = () => ({ time: null, trend: 0 })
  const hot = (amount: number) => features({ classes: { hot: stats(amount, 0.9, 0.1) } })

  it('raises the main drone above the fixed reference as orange and red fill the view', () => {
    const none = run(stepCo2, fresh(), hot(0), 5).last
    const full = run(stepCo2, fresh(), hot(CO2_FULL), 5).last
    expect(none.voices!.main.midi).toBeCloseTo(CO2_BASE_MIDI, 3)
    expect(full.voices!.main.midi).toBeCloseTo(CO2_BASE_MIDI + 12, 1)
    expect(full.voices!.main.brightness!).toBeGreaterThan(none.voices!.main.brightness!)
    expect(full.voices!.reference.midi).toBe(CO2_BASE_MIDI)
    expect(none.voices!.reference.midi).toBe(CO2_BASE_MIDI)
  })

  it('never uses position: pan stays centred wherever the colour is', () => {
    const { outputs } = run(stepCo2, fresh(), hot(CO2_FULL / 2), 2)
    expect(outputs.every((o) => o.voices!.main.pan === 0 && o.notes.length === 0)).toBe(true)
  })

  it('turns the day/night pulse into tremolo', () => {
    let state = fresh() as Parameters<typeof stepCo2>[2]
    const levels: number[] = []
    for (let i = 0; i < 300; i++) {
      // 0.8 s period: bright for a quarter of each "day".
      const r = stepCo2(hot((i % 24) < 6 ? 0.012 : 0.001), i / 30, state)
      state = r.state
      if (i > 150) levels.push(r.output.voices!.main.level)
    }
    expect(Math.max(...levels)).toBeGreaterThan(Math.min(...levels) * 2.5)
  })
})
