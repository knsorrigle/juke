import { describe, expect, it } from 'vitest'
import { describePlace } from './place.ts'
import { type CellPixels, probeAerosols, probeCo2, probeLightning, probeNightLights, probeOcean } from './probes.ts'

const fill = (rgb: [number, number, number], n = 25): CellPixels => Array.from({ length: n }, () => rgb)

describe('Explore probes', () => {
  it('lightning: yellow is lightning, grey is none', () => {
    expect(probeLightning(fill([250, 230, 0]), 0).value).toBeGreaterThan(0.9)
    expect(probeLightning(fill([60, 60, 60]), 0)).toEqual({ value: 0, text: 'No lightning here.' })
  })

  it('aerosols: names the dominant type', () => {
    expect(probeAerosols(fill([195, 160, 225]), 0).text).toMatch(/^Dust/)
    expect(probeAerosols(fill([80, 230, 60]), 0).text).toMatch(/^Sulfate/)
    expect(probeAerosols(fill([210, 90, 70]), 0).text).toMatch(/^Black carbon/)
    expect(probeAerosols(fill([90, 90, 90]), 0).value).toBe(0)
  })

  it('ocean: reads temperature from the legend colours; land is noise', () => {
    const warm = probeOcean(fill([247, 70, 25]), 0)
    const cold = probeOcean(fill([51, 102, 243]), 0)
    expect(warm.text).toMatch(/30|31|32/)
    expect(cold.text).toMatch(/about [0-2] degrees/)
    expect(warm.value!).toBeGreaterThan(cold.value!)
    expect(probeOcean(fill([90, 90, 90]), 0)).toMatchObject({ value: null, noData: 'noise' })
  })

  it('night lights: lights in the year series, growth or loss on the change map', () => {
    expect(probeNightLights(fill([220, 200, 90]), 3).value).toBeGreaterThan(0.5)
    expect(probeNightLights(fill([5, 5, 5]), 3).value).toBe(0)
    expect(probeNightLights(fill([150, 90, 220]), 12).text).toBe('More light than in 2012.')
    expect(probeNightLights(fill([230, 140, 60]), 12).text).toBe('Less light than in 2012.')
  })

  it('CO2: reads ppm from the legend; space is silent; pale is below about 425', () => {
    const red = probeCo2(fill([229, 40, 18]), 0)
    expect(red.text).toMatch(/45[0-9] parts/)
    expect(probeCo2(fill([0, 0, 0]), 0)).toMatchObject({ value: null, noData: 'silence' })
    expect(probeCo2(fill([150, 145, 135]), 0).text).toMatch(/Below about 425/)
  })
})

describe('place in words', () => {
  it('gives latitude and longitude only for measured geographic axes', () => {
    const geo = { x: true, y: true, lon: [-180, 180] as [number, number], lat: [90, -90] as [number, number] }
    expect(describePlace(0.25, 0.25, geo)).toBe('45 degrees north, 90 degrees west')
    expect(describePlace(0.5, 0.5, { x: false, y: false })).toBe('50% across, 50% down the screen')
    expect(describePlace(0.75, 0.5, { x: true, y: true, lon: [-180, 180] })).toBe('90 degrees east; 75% across, 50% down the screen')
  })
})
