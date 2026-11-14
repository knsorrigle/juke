import { describe, expect, it } from 'vitest'
import type { FrameFeatures, RisingPixel } from '../analysis/types.ts'
import { isDiscontinuity, smoothOffset, tickDuration, tickIndexAt, tickTime } from './clock.ts'
import {
  FULL_GLOBE,
  latitudeToPosition,
  longitudeToPan,
  xToLongitude,
  yToLatitude,
} from './geo.ts'
import {
  LIGHTNING_DEFAULTS,
  LIGHTNING_KNOBS,
  clusterVelocity,
  createLightningRuleset,
  createLightningState,
  padTarget,
  stepLightning,
} from './lightning.ts'
import { MINOR_PENTATONIC, midiToFrequency, quantizeToScale, scaleNotes, scaleStep } from './scales.ts'

const W = 160
const H = 80
const CLOCK = { bpm: 110, division: 4 }
const TICK = tickDuration(CLOCK)

/** Synthetic features carrying only what the Lightning rules read. */
function features(risingPixels: RisingPixel[] = []): FrameFeatures {
  return {
    width: W,
    height: H,
    meanLuminance: 0,
    columnLuminance: [],
    rowLuminance: [],
    diff: 0,
    regionDiff: [],
    hueHistogram: [],
    dominantHues: [],
    brightSpots: [],
    centroid: null,
    signalMean: 0,
    risingPixels,
    classes: {},
    grid: null,
  }
}

/** A horizontal run of `size` newly lit pixels starting at (x, y). */
function blob(x: number, y: number, size = 1): RisingPixel[] {
  return Array.from({ length: size }, (_, i) => ({ px: x + i, py: y, rise: 0.2 }))
}

/** Feed pixels in one tick and return what the next tick plays. */
function playTick(pixels: RisingPixel[], config = LIGHTNING_DEFAULTS) {
  let state = createLightningState()
  state = stepLightning(features(pixels), 0.01, state, config, FULL_GLOBE).state
  return stepLightning(features(), TICK + 0.01, state, config, FULL_GLOBE)
}

describe('scales', () => {
  const notes = scaleNotes(45, MINOR_PENTATONIC, 3)

  it('builds three octaves of A minor pentatonic ending on the root', () => {
    expect(notes).toHaveLength(16)
    expect(notes[0]).toBe(45)
    expect(notes[15]).toBe(81)
    expect(notes.slice(0, 5)).toEqual([45, 48, 50, 52, 55])
  })

  it('quantises every position to a scale note, rising with position', () => {
    let last = -Infinity
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const n = quantizeToScale(p, notes)
      expect(notes).toContain(n)
      expect(n).toBeGreaterThanOrEqual(last)
      last = n
    }
  })

  it('clamps positions outside 0..1 and survives NaN', () => {
    expect(quantizeToScale(-3, notes)).toBe(45)
    expect(quantizeToScale(7, notes)).toBe(81)
    expect(quantizeToScale(Number.NaN, notes)).toBe(45)
  })

  it('steps around a register without leaving the scale', () => {
    expect(scaleStep(0, notes, 2)).toBe(50)
    expect(scaleStep(0, notes, -3)).toBe(45)
    expect(scaleStep(1, notes, 3)).toBe(81)
  })

  it('converts MIDI to frequency', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6)
    expect(midiToFrequency(57)).toBeCloseTo(220, 6)
  })
})

describe('geography', () => {
  it('maps x to longitude and y to latitude on a full-globe frame', () => {
    expect(xToLongitude(0, FULL_GLOBE)).toBe(-180)
    expect(xToLongitude(0.5, FULL_GLOBE)).toBe(0)
    expect(xToLongitude(1, FULL_GLOBE)).toBe(180)
    expect(yToLatitude(0, FULL_GLOBE)).toBe(90)
    expect(yToLatitude(0.5, FULL_GLOBE)).toBe(0)
    expect(yToLatitude(1, FULL_GLOBE)).toBe(-90)
  })

  it('pans west to the left and east to the right, never past the width', () => {
    expect(longitudeToPan(-90)).toBeLessThan(0)
    expect(longitudeToPan(0)).toBe(0)
    expect(longitudeToPan(90)).toBeGreaterThan(0)
    expect(longitudeToPan(-180)).toBeCloseTo(-0.9, 6)
    expect(longitudeToPan(9999)).toBeCloseTo(0.9, 6)
  })

  it('puts north at the top of the pitch range and clamps outside the band', () => {
    expect(latitudeToPosition(55, -50, 55)).toBe(1)
    expect(latitudeToPosition(-50, -50, 55)).toBe(0)
    expect(latitudeToPosition(80, -50, 55)).toBe(1)
    expect(latitudeToPosition(-80, -50, 55)).toBe(0)
    expect(latitudeToPosition(20, -50, 55)).toBeGreaterThan(latitudeToPosition(-20, -50, 55))
  })
})

describe('musical clock', () => {
  it('ticks 16th notes at 110 bpm', () => {
    expect(TICK).toBeCloseTo(0.13636, 4)
    expect(tickIndexAt(0, CLOCK)).toBe(0)
    expect(tickIndexAt(TICK - 0.001, CLOCK)).toBe(0)
    expect(tickIndexAt(TICK, CLOCK)).toBe(1)
    expect(tickIndexAt(10, CLOCK)).toBe(73)
    expect(tickTime(73, CLOCK)).toBeCloseTo(73 * TICK, 9)
  })

  it('is a pure function of video time, so seeking lands on the same grid', () => {
    expect(tickIndexAt(42.5, CLOCK)).toBe(tickIndexAt(42.5, CLOCK))
    expect(tickIndexAt(-1, CLOCK)).toBe(0)
  })
})

describe('seek and loop detection', () => {
  it('treats the next frame as continuous', () => {
    expect(isDiscontinuity(null, 0)).toBe(false)
    expect(isDiscontinuity(10, 10.033)).toBe(false)
    expect(isDiscontinuity(10, 10.4)).toBe(false) // a few dropped frames
    expect(isDiscontinuity(10, 10)).toBe(false) // the same frame sampled twice
  })

  it('flags a loop back to the start, a seek back and a seek forward', () => {
    expect(isDiscontinuity(100.05, 0.0)).toBe(true)
    expect(isDiscontinuity(30, 25)).toBe(true)
    expect(isDiscontinuity(30, 35)).toBe(true)
    expect(isDiscontinuity(30, 31)).toBe(true) // frames stopped arriving for a second
  })
})

describe('audio to video clock offset', () => {
  it('starts from the first sample and resyncs after a large jump', () => {
    expect(smoothOffset(null, 12.3)).toBe(12.3)
    expect(smoothOffset(12.3, 14.0)).toBe(14.0)
  })

  it('averages out refresh-rate jitter of about 16 ms', () => {
    let offset: number | null = null
    let worst = 0
    for (let i = 0; i < 300; i++) {
      // Frames alternately appear on time and one display refresh late.
      offset = smoothOffset(offset, 5 + (i % 2 ? 0.0167 : 0))
      if (i > 60) worst = Math.max(worst, Math.abs(offset - 5.00835))
    }
    expect(worst).toBeLessThan(0.001)
  })
})

describe('Lightning rules', () => {
  it('stays silent between ticks while it gathers pixels', () => {
    let state = createLightningState()
    for (const t of [0.0, 0.033, 0.066, 0.1]) {
      const r = stepLightning(features(blob(10, 10, 3)), t, state, LIGHTNING_DEFAULTS, FULL_GLOBE)
      expect(r.output.notes).toEqual([])
      expect(r.output.tick).toBeNull()
      expect(r.output.voices).toBeNull()
      state = r.state
    }
    expect(state.pending).toHaveLength(12)
  })

  it('plays on the tick boundary, timed to the tick rather than the frame', () => {
    const { output, state } = playTick(blob(40, 30, 4))
    expect(output.tick).toMatchObject({ index: 1, flashCount: 4, clusterCount: 1, notesPlayed: 1 })
    expect(output.notes).toHaveLength(1)
    expect(output.notes[0].time).toBeCloseTo(TICK, 9)
    expect(state.pending).toEqual([])
  })

  it('holds pixels from the boundary frame for the following tick', () => {
    let state = createLightningState()
    state = stepLightning(features(), 0.01, state, LIGHTNING_DEFAULTS, FULL_GLOBE).state
    const crossing = stepLightning(
      features(blob(40, 30, 2)),
      TICK + 0.01,
      state,
      LIGHTNING_DEFAULTS,
      FULL_GLOBE,
    )
    expect(crossing.output.notes).toEqual([])
    expect(crossing.state.pending).toHaveLength(2)
    const next = stepLightning(
      features(),
      2 * TICK + 0.01,
      crossing.state,
      LIGHTNING_DEFAULTS,
      FULL_GLOBE,
    )
    expect(next.output.notes).toHaveLength(1)
  })

  it('caps the notes per tick at the largest clusters, largest first', () => {
    const pixels = [
      ...blob(10, 10, 2),
      ...blob(30, 20, 6),
      ...blob(60, 30, 1),
      ...blob(90, 40, 9),
      ...blob(120, 50, 4),
      ...blob(140, 60, 3),
    ]
    const { output } = playTick(pixels)
    expect(output.tick?.clusterCount).toBe(6)
    expect(output.tick?.flashCount).toBe(25)
    expect(output.notes).toHaveLength(3)
    const velocities = output.notes.map((n) => n.velocity)
    expect(velocities).toEqual([...velocities].sort((a, b) => b - a))
    // Notes are strummed a few milliseconds apart, in that order.
    expect(output.notes[1].time - output.notes[0].time).toBeCloseTo(0.012, 6)
  })

  it('maps longitude to pan: west left, east right, within range', () => {
    const { output } = playTick([...blob(8, 40, 3), ...blob(150, 40, 2)])
    const [west, east] = [...output.notes].sort((a, b) => a.pan - b.pan)
    expect(west.pan).toBeLessThan(-0.6)
    expect(east.pan).toBeGreaterThan(0.6)
    for (const n of output.notes) expect(Math.abs(n.pan)).toBeLessThanOrEqual(1)
  })

  it('maps latitude to pitch with north high, always on the pentatonic scale', () => {
    const { output } = playTick([...blob(80, 18, 3), ...blob(80, 40, 2), ...blob(80, 60, 1)])
    const byPitch = output.notes.map((n) => n.midi)
    // Clusters are ordered by size: north (3 px), equator (2 px), south (1 px).
    expect(byPitch[0]).toBeGreaterThan(byPitch[1])
    expect(byPitch[1]).toBeGreaterThan(byPitch[2])
    const scale = scaleNotes(45, MINOR_PENTATONIC, 3)
    for (const midi of byPitch) expect(scale).toContain(midi)
  })

  it('clamps pitch for lightning beyond the latitude band', () => {
    const { output } = playTick([...blob(80, 0, 2), ...blob(80, 79, 1)])
    expect(output.notes[0].midi).toBe(81)
    expect(output.notes[1].midi).toBe(45)
  })

  it('maps cluster size to velocity within bounds', () => {
    expect(clusterVelocity(1, LIGHTNING_DEFAULTS)).toBeGreaterThanOrEqual(0.25)
    expect(clusterVelocity(5, LIGHTNING_DEFAULTS)).toBeGreaterThan(
      clusterVelocity(1, LIGHTNING_DEFAULTS),
    )
    expect(clusterVelocity(14, LIGHTNING_DEFAULTS)).toBeCloseTo(1, 6)
    expect(clusterVelocity(500, LIGHTNING_DEFAULTS)).toBe(1)
  })

  it('raises the pad with the flash count even when notes are capped', () => {
    const quiet = playTick(blob(10, 10, 2))
    const busy = playTick(Array.from({ length: 8 }, (_, i) => blob(5, 5 + i * 8, 10)).flat())
    expect(busy.output.notes).toHaveLength(3)
    expect(busy.output.voices!.hum.level).toBeGreaterThan(quiet.output.voices!.hum.level)
    expect(padTarget(LIGHTNING_DEFAULTS.flashCountFull, LIGHTNING_DEFAULTS)).toBe(1)
    expect(padTarget(0, LIGHTNING_DEFAULTS)).toBe(0)
    expect(padTarget(100000, LIGHTNING_DEFAULTS)).toBe(1)
  })

  it('lets the pad swell over busy ticks, fade slowly and never drop below its floor', () => {
    let state = createLightningState()
    let time = 0.01
    const step = (pixels: RisingPixel[]) => {
      const r = stepLightning(features(pixels), time, state, LIGHTNING_DEFAULTS, FULL_GLOBE)
      state = r.state
      time += TICK
      return r.output.voices?.hum.level
    }
    const busy = () => blob(0, 0, 100)
    step(busy())
    const levels: number[] = []
    for (let i = 0; i < 12; i++) levels.push(step(busy())!)
    expect(levels).toEqual([...levels].sort((a, b) => a - b)) // keeps rising
    expect(levels[0]).toBeLessThan(0.3) // not instantly
    expect(levels[11]).toBeGreaterThan(0.75)
    expect(levels[11]).toBeLessThanOrEqual(1)
    step([]) // this tick still plays what the last busy frame gathered
    const afterOneQuiet = step([])!
    expect(afterOneQuiet).toBeGreaterThan(levels[11] * 0.85) // one quiet tick barely dents it
    for (let i = 0; i < 200; i++) step([])
    expect(step([])).toBe(LIGHTNING_DEFAULTS.padFloor)
  })

  it('fires once after a gap of several ticks', () => {
    let state = createLightningState()
    state = stepLightning(features(blob(5, 5, 2)), 0.01, state, LIGHTNING_DEFAULTS, FULL_GLOBE).state
    const r = stepLightning(features(), 5 * TICK + 0.01, state, LIGHTNING_DEFAULTS, FULL_GLOBE)
    expect(r.output.notes).toHaveLength(1)
    expect(r.output.tick?.index).toBe(5)
  })

  it('exposes yellow-plus-brightening detection through the ruleset', () => {
    const ruleset = createLightningRuleset(FULL_GLOBE)
    expect(ruleset.analysis.signal).toBe('yellow')
    const first = ruleset.step(features(blob(1, 1, 1)), 0, ruleset.createState(), LIGHTNING_KNOBS)
    expect(first.output.notes).toEqual([])
  })
})
