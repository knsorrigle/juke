import { describe, expect, it } from 'vitest'
import { co2DateAt, describeCo2 } from './co2.ts'
import { tracks } from './index.ts'
import { describeNightLights } from './nightLights.ts'

describe('track registry', () => {
  it('gives every track a legend, alt text and a runner', () => {
    expect(tracks.map((t) => t.id)).toEqual(['lightning', 'aerosols', 'sea-surface-currents', 'night-lights', 'co2'])
    for (const t of tracks) {
      expect(t.legend.length).toBeGreaterThan(0)
      expect(t.altText.length).toBeGreaterThan(50)
      expect(t.createRunner().instruments.length).toBeGreaterThan(0)
    }
  })

  it('marks the globe track as non-geographic', () => {
    const co2 = tracks.find((t) => t.id === 'co2')!
    expect(co2.projection).toBe('globe')
    expect(co2.geographic).toEqual({ x: false, y: false })
    expect(tracks.filter((t) => t.id !== 'co2').every((t) => t.geographic.x && t.geographic.y)).toBe(true)
  })
})

describe('CO2 date from the timecode', () => {
  it('matches the stamp on the first, 31st, 601st and last frames', () => {
    expect(co2DateAt(0).toISOString()).toBe('2020-01-14T22:00:00.000Z')
    expect(co2DateAt(30 / 30).toISOString()).toBe('2020-01-16T04:00:00.000Z')
    expect(co2DateAt(600 / 30).toISOString()).toBe('2020-02-08T22:00:00.000Z')
    expect(co2DateAt(1175 / 30).toISOString()).toBe('2020-03-03T21:00:00.000Z')
    expect(describeCo2(600 / 30).text).toBe('8 Feb 2020, 22:00')
  })
})

describe('Night Lights parts from the timecode', () => {
  it('names the year, then the change map, then the return to 2012', () => {
    expect(describeNightLights(0.2).text).toBe('2012')
    expect(describeNightLights(3).text).toBe('2017') // label changes at 2.87 s
    expect(describeNightLights(8).text).toBe('2023')
    expect(describeNightLights(12)).toMatchObject({ key: 'change', urgent: true })
    expect(describeNightLights(21).text).toBe('2012')
  })
})
