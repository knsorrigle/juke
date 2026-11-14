import { describe, expect, it } from 'vitest'
import { classifyPixels, matchesClass } from './classify.ts'
import { buildLut, colormapGrid, estimateValue, rgbToLab } from './colormap.ts'
import { analyzeFrame } from './features.ts'
import { GREY, WHITE, paintRect, solidFrame } from './testFrames.ts'

const GREEN = { id: 'green', hue: [90, 150] as [number, number], sat: [0.3, 1] as [number, number], val: [0.2, 1] as [number, number] }
const RED = { id: 'red', hue: [345, 30] as [number, number], sat: [0.4, 1] as [number, number], val: [0.2, 1] as [number, number] }

describe('colour classes', () => {
  it('matches hue ranges, including ones that wrap through 360', () => {
    expect(matchesClass(120, 0.8, 0.8, GREEN)).toBe(true)
    expect(matchesClass(200, 0.8, 0.8, GREEN)).toBe(false)
    expect(matchesClass(350, 0.8, 0.8, RED)).toBe(true)
    expect(matchesClass(10, 0.8, 0.8, RED)).toBe(true)
    expect(matchesClass(10, 0.1, 0.8, RED)).toBe(false)
  })

  it('reports amount, centre and per-column share of each class', () => {
    const frame = solidFrame(160, 80, GREY)
    paintRect(frame, 0, 0, 40, 80, [0, 255, 0]) // left quarter green
    paintRect(frame, 120, 60, 40, 20, [255, 0, 0]) // bottom-right red
    const c = classifyPixels(frame, [GREEN, RED], 16)
    expect(c.green.amount).toBeCloseTo(0.25, 3)
    expect(c.green.x).toBeCloseTo(0.125, 3)
    expect(c.green.y).toBeCloseTo(0.5, 3)
    expect(c.green.columns.slice(0, 4).every((v) => v > 0.99)).toBe(true)
    expect(c.green.columns.slice(4).every((v) => v === 0)).toBe(true)
    expect(c.red.x).toBeCloseTo(0.875, 3)
    expect(c.red.y).toBeCloseTo(0.875, 3)
  })

  it('ignores white text and grey land, and reports an absent class as centred', () => {
    const frame = paintRect(solidFrame(160, 80, GREY), 10, 10, 30, 6, WHITE)
    const c = classifyPixels(frame, [GREEN, RED], 16)
    expect(c.green).toMatchObject({ amount: 0, x: 0.5, y: 0.5 })
    expect(c.red.amount).toBe(0)
  })

  it('respects masks through analyzeFrame', () => {
    const frame = paintRect(solidFrame(160, 80, GREY), 120, 60, 40, 20, [0, 255, 0])
    const masks = [{ x: 0.7, y: 0.7, width: 0.3, height: 0.3 }]
    expect(analyzeFrame(frame, null, { classes: [GREEN] }).features.classes.green.amount).toBeGreaterThan(0)
    expect(analyzeFrame(frame, null, { classes: [GREEN], masks }).features.classes.green.amount).toBe(0)
  })
})

describe('colour scale inversion', () => {
  const stops: [number, number, number, number][] = [
    [0, 0, 0, 255],
    [10, 0, 255, 0],
    [20, 255, 255, 0],
    [30, 255, 0, 0],
  ]
  const lut = buildLut(stops)

  it('converts to LAB sensibly', () => {
    expect(rgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 0)
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 3)
  })

  it('recovers the value of a legend colour, at any brightness', () => {
    expect(estimateValue(0, 0, 255, lut)).toBeCloseTo(0, 0)
    expect(estimateValue(0, 255, 0, lut)).toBeCloseTo(10, 0)
    expect(estimateValue(255, 0, 0, lut)).toBeCloseTo(30, 0)
    expect(estimateValue(120, 120, 0, lut)).toBeCloseTo(20, 0) // dim yellow
    expect(estimateValue(255, 128, 0, lut)).toBeGreaterThan(22)
  })

  it('averages values on a grid and leaves grey cells empty', () => {
    const frame = solidFrame(160, 80, GREY)
    paintRect(frame, 0, 0, 80, 40, [255, 0, 0]) // top-left quadrant hot
    paintRect(frame, 80, 40, 80, 40, [0, 0, 255]) // bottom-right cold
    const grid = colormapGrid(frame, { stops, cols: 2, rows: 2, satMin: 0.3, valMin: 0.15 }, lut)
    expect(grid.values[0]).toBeCloseTo(30, 0)
    expect(grid.values[1]).toBeNull()
    expect(grid.values[2]).toBeNull()
    expect(grid.values[3]).toBeCloseTo(0, 0)
    expect(grid.coverage).toEqual([1, 0, 0, 1])
  })
})
