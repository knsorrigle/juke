import { describe, expect, it } from 'vitest'
import { graticuleTicks } from './graticuleTicks.ts'

describe('graticule ticks', () => {
  it('ticks every 30 degrees inside the edges, positioned by fraction', () => {
    const lon = graticuleTicks(-180, 180)
    expect(lon.map((t) => t.deg)).toEqual([-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150])
    expect(lon[5].at).toBeCloseTo(0.5, 6)
  })

  it('handles a top-to-bottom latitude range', () => {
    const lat = graticuleTicks(90, -90)
    expect(lat.map((t) => t.deg)).toEqual([-60, -30, 0, 30, 60])
    expect(lat.find((t) => t.deg === 60)!.at).toBeCloseTo(1 / 6, 6)
  })
})
