import { describe, expect, it } from 'vitest'
import { luminance, rgbToHsv, yellowness } from './color.ts'
import {
  analyzeFrame,
  bandMeans,
  buildMask,
  centroidOf,
  computePlanes,
  dominantHues,
  findBrightSpots,
  frameDifference,
  hueHistogram,
} from './features.ts'
import { BLACK, GREY, WHITE, YELLOW, paintRect, solidFrame } from './testFrames.ts'

const W = 160
const H = 80

describe('colour helpers', () => {
  it('luminance runs from 0 for black to 1 for white, weighted towards green', () => {
    expect(luminance(0, 0, 0)).toBe(0)
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 6)
    expect(luminance(0, 255, 0)).toBeGreaterThan(luminance(255, 0, 0))
    expect(luminance(255, 0, 0)).toBeGreaterThan(luminance(0, 0, 255))
  })

  it('yellowness is high for yellow and zero for grey, white and blue', () => {
    expect(yellowness(255, 230, 0)).toBeCloseTo(230 / 255, 6)
    expect(yellowness(128, 128, 128)).toBe(0)
    expect(yellowness(255, 255, 255)).toBe(0)
    expect(yellowness(20, 40, 200)).toBe(0)
  })

  it('rgbToHsv gives the expected hue for primaries', () => {
    expect(rgbToHsv(255, 0, 0).h).toBeCloseTo(0)
    expect(rgbToHsv(0, 255, 0).h).toBeCloseTo(120)
    expect(rgbToHsv(0, 0, 255).h).toBeCloseTo(240)
    expect(rgbToHsv(255, 255, 0).h).toBeCloseTo(60)
    expect(rgbToHsv(90, 90, 90).s).toBe(0)
  })
})

describe('mean luminance and bands', () => {
  it('a uniform frame has equal bands and the same overall mean', () => {
    const { features } = analyzeFrame(solidFrame(W, H, [128, 128, 128]), null)
    expect(features.meanLuminance).toBeCloseTo(128 / 255, 4)
    expect(features.columnLuminance).toHaveLength(16)
    expect(features.rowLuminance).toHaveLength(8)
    for (const c of features.columnLuminance) expect(c).toBeCloseTo(128 / 255, 4)
    for (const r of features.rowLuminance) expect(r).toBeCloseTo(128 / 255, 4)
  })

  it('a white left half lights the left 8 column bands only', () => {
    const frame = paintRect(solidFrame(W, H, BLACK), 0, 0, W / 2, H, WHITE)
    const { features } = analyzeFrame(frame, null)
    expect(features.meanLuminance).toBeCloseTo(0.5, 4)
    expect(features.columnLuminance.slice(0, 8).every((v) => v > 0.99)).toBe(true)
    expect(features.columnLuminance.slice(8).every((v) => v < 0.01)).toBe(true)
    for (const r of features.rowLuminance) expect(r).toBeCloseTo(0.5, 4)
  })

  it('a white top quarter lights the top 2 row bands only', () => {
    const frame = paintRect(solidFrame(W, H, BLACK), 0, 0, W, H / 4, WHITE)
    const { features } = analyzeFrame(frame, null)
    expect(features.rowLuminance.slice(0, 2).every((v) => v > 0.99)).toBe(true)
    expect(features.rowLuminance.slice(2).every((v) => v < 0.01)).toBe(true)
  })

  it('bandMeans handles sizes that do not divide evenly', () => {
    const plane = new Float32Array(10 * 6).fill(0.25)
    const bands = bandMeans(plane, 10, 6, 16, 8)
    expect(bands.mean).toBeCloseTo(0.25, 6)
    // More bands than pixels: empty bands report 0 rather than NaN.
    expect(bands.columns.every((v) => Number.isFinite(v))).toBe(true)
  })
})

describe('frame difference', () => {
  it('is zero with no previous frame and for identical frames', () => {
    const a = analyzeFrame(solidFrame(W, H, GREY), null)
    expect(a.features.diff).toBe(0)
    const b = analyzeFrame(solidFrame(W, H, GREY), a.planes)
    expect(b.features.diff).toBe(0)
    expect(b.features.regionDiff.every((v) => v === 0)).toBe(true)
  })

  it('reports change overall and only in the region that changed', () => {
    const first = analyzeFrame(solidFrame(W, H, BLACK), null)
    // Region grid is 8 x 4, so each region is 20 x 20 px. Light up region (col 6, row 1).
    const frame = paintRect(solidFrame(W, H, BLACK), 120, 20, 20, 20, WHITE)
    const { features } = analyzeFrame(frame, first.planes)
    expect(features.regionDiff).toHaveLength(32)
    expect(features.regionDiff[1 * 8 + 6]).toBeCloseTo(1, 4)
    const others = features.regionDiff.filter((_, i) => i !== 1 * 8 + 6)
    expect(others.every((v) => v === 0)).toBe(true)
    expect(features.diff).toBeCloseTo(1 / 32, 4)
  })

  it('ignores a previous frame of a different size', () => {
    const d = frameDifference(new Float32Array(8), new Float32Array(4), 4, 2, 2, 1)
    expect(d.overall).toBe(0)
  })
})

describe('hue histogram', () => {
  it('puts a red frame in the first bin and a green frame in the 120 degree bin', () => {
    const red = hueHistogram(solidFrame(8, 8, [255, 0, 0]), 12)
    expect(red[0]).toBeCloseTo(1, 6)
    const green = hueHistogram(solidFrame(8, 8, [0, 255, 0]), 12)
    expect(green[4]).toBeCloseTo(1, 6)
  })

  it('is all zeros for a grey frame, with no dominant hue', () => {
    const hist = hueHistogram(solidFrame(8, 8, [90, 90, 90]), 12)
    expect(hist.every((v) => v === 0)).toBe(true)
    expect(dominantHues(hist)).toEqual([])
  })

  it('ranks dominant hues by area', () => {
    // Three quarters blue, one quarter yellow.
    const frame = paintRect(solidFrame(W, H, [0, 0, 255]), 0, 0, W / 4, H, [255, 255, 0])
    const { features } = analyzeFrame(frame, null)
    expect(features.dominantHues[0].hue).toBe(255) // centre of the 240-270 bin
    expect(features.dominantHues[1].hue).toBe(75) // centre of the 60-90 bin
    expect(features.dominantHues[0].weight).toBeCloseTo(0.75, 2)
    expect(features.hueHistogram.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
  })
})

describe('bright spots', () => {
  it('finds a single dot at the right place', () => {
    const frame = paintRect(solidFrame(W, H, BLACK), 40, 20, 1, 1, WHITE)
    const { features } = analyzeFrame(frame, null)
    expect(features.brightSpots).toHaveLength(1)
    expect(features.brightSpots[0].x).toBeCloseTo(40.5 / W, 6)
    expect(features.brightSpots[0].y).toBeCloseTo(20.5 / H, 6)
    expect(features.brightSpots[0].strength).toBeCloseTo(1, 4)
  })

  it('reports a flat bright patch once, not once per pixel', () => {
    const frame = paintRect(solidFrame(W, H, BLACK), 60, 30, 3, 3, WHITE)
    expect(analyzeFrame(frame, null).features.brightSpots).toHaveLength(1)
  })

  it('orders spots strongest first and respects the cap', () => {
    const frame = solidFrame(W, H, BLACK)
    paintRect(frame, 10, 10, 1, 1, [150, 150, 150])
    paintRect(frame, 50, 10, 1, 1, WHITE)
    paintRect(frame, 90, 10, 1, 1, [200, 200, 200])
    const all = analyzeFrame(frame, null).features.brightSpots
    expect(all.map((s) => Math.round(s.x * W - 0.5))).toEqual([50, 90, 10])
    const capped = analyzeFrame(frame, null, { maxSpots: 2 }).features.brightSpots
    expect(capped).toHaveLength(2)
  })

  it('ignores pixels below the threshold and keeps spots apart', () => {
    const plane = new Float32Array(20 * 10)
    plane[5 * 20 + 5] = 0.9
    plane[5 * 20 + 7] = 0.8 // 2 px away: suppressed by minDistance 3
    plane[2 * 20 + 15] = 0.3 // below threshold
    const spots = findBrightSpots(plane, 20, 10, 0.5, 16, 3)
    expect(spots).toHaveLength(1)
    expect(spots[0].strength).toBeCloseTo(0.9, 6)
  })

  it('on the yellow channel sees a yellow dot but not a white one', () => {
    const frame = solidFrame(W, H, GREY)
    paintRect(frame, 30, 30, 2, 2, WHITE)
    paintRect(frame, 100, 50, 2, 2, YELLOW)
    const spots = analyzeFrame(frame, null, { signal: 'yellow' }).features.brightSpots
    expect(spots).toHaveLength(1)
    expect(spots[0].x).toBeGreaterThan(0.6)
  })
})

describe('brightness centroid', () => {
  it('is null for a black frame', () => {
    expect(analyzeFrame(solidFrame(W, H, BLACK), null).features.centroid).toBeNull()
  })

  it('sits in the middle of a uniform frame and follows a bright patch', () => {
    const mid = analyzeFrame(solidFrame(W, H, GREY), null).features.centroid!
    expect(mid.x).toBeCloseTo(0.5, 6)
    expect(mid.y).toBeCloseTo(0.5, 6)
    const frame = paintRect(solidFrame(W, H, BLACK), 0, 0, W / 2, H, WHITE)
    const left = analyzeFrame(frame, null).features.centroid!
    expect(left.x).toBeCloseTo(0.25, 4)
    expect(left.y).toBeCloseTo(0.5, 4)
  })

  it('centroidOf weights by value', () => {
    const plane = new Float32Array([0, 0, 0, 1]) // 4 x 1, all weight in the last pixel
    expect(centroidOf(plane, 4, 1)).toEqual({ x: 3.5 / 4, y: 0.5 })
  })
})

describe('newly lit pixels (colour plus brightening)', () => {
  const yellowOpts = { signal: 'yellow' as const }

  it('reports a yellow dot that appears, at its pixel position', () => {
    const before = analyzeFrame(solidFrame(W, H, GREY), null, yellowOpts)
    const frame = paintRect(solidFrame(W, H, GREY), 70, 35, 2, 1, YELLOW)
    const { features } = analyzeFrame(frame, before.planes, yellowOpts)
    expect(features.risingPixels.map((p) => [p.px, p.py])).toEqual([
      [70, 35],
      [71, 35],
    ])
    expect(features.risingPixels[0].rise).toBeGreaterThan(0.5)
  })

  it('reports nothing on the first frame or after a reset', () => {
    const frame = paintRect(solidFrame(W, H, GREY), 70, 35, 2, 1, YELLOW)
    expect(analyzeFrame(frame, null, yellowOpts).features.risingPixels).toEqual([])
  })

  it('ignores a yellow dot that was already there', () => {
    const frame = () => paintRect(solidFrame(W, H, GREY), 70, 35, 2, 1, YELLOW)
    const before = analyzeFrame(frame(), null, yellowOpts)
    expect(analyzeFrame(frame(), before.planes, yellowOpts).features.risingPixels).toEqual([])
  })

  it('ignores a white patch that brightens: brightness without the colour', () => {
    const before = analyzeFrame(solidFrame(W, H, GREY), null, yellowOpts)
    const frame = paintRect(solidFrame(W, H, GREY), 20, 20, 10, 10, WHITE)
    const { features } = analyzeFrame(frame, before.planes, yellowOpts)
    expect(features.diff).toBeGreaterThan(0)
    expect(features.risingPixels).toEqual([])
  })

  it('ignores a pixel that turns yellower while getting darker', () => {
    // White -> dim yellow: yellowness rises, luminance falls.
    const before = analyzeFrame(solidFrame(W, H, WHITE), null, yellowOpts)
    const frame = paintRect(solidFrame(W, H, WHITE), 10, 10, 1, 1, [120, 110, 0])
    expect(analyzeFrame(frame, before.planes, yellowOpts).features.risingPixels).toEqual([])
  })

  it('ignores a faint rise below the threshold', () => {
    const before = analyzeFrame(solidFrame(W, H, GREY), null, yellowOpts)
    const frame = paintRect(solidFrame(W, H, GREY), 10, 10, 1, 1, [46, 46, 40])
    expect(analyzeFrame(frame, before.planes, yellowOpts).features.risingPixels).toEqual([])
  })
})

describe('masks', () => {
  it('buildMask marks only the pixels inside the rectangles', () => {
    const mask = buildMask(10, 10, [{ x: 0.5, y: 0.5, width: 0.5, height: 0.5 }])
    expect(mask.reduce((a, b) => a + b, 0)).toBe(25)
    expect(mask[5 * 10 + 5]).toBe(1)
    expect(mask[4 * 10 + 5]).toBe(0)
  })

  it('masked pixels read as black in every feature', () => {
    // A bright date stamp in the bottom-right corner.
    const frame = paintRect(solidFrame(W, H, BLACK), 130, 70, 28, 6, WHITE)
    const masks = [{ x: 0.8, y: 0.85, width: 0.2, height: 0.15 }]
    const unmasked = analyzeFrame(frame, null).features
    expect(unmasked.brightSpots.length).toBeGreaterThan(0)
    const { features } = analyzeFrame(frame, null, { masks })
    expect(features.meanLuminance).toBe(0)
    expect(features.brightSpots).toEqual([])
    expect(features.centroid).toBeNull()
  })

  it('computePlanes zeroes masked pixels on the signal plane too', () => {
    const mask = buildMask(4, 1, [{ x: 0, y: 0, width: 0.5, height: 1 }])
    const planes = computePlanes(solidFrame(4, 1, YELLOW), 'yellow', mask)
    expect(Array.from(planes.signal.slice(0, 2))).toEqual([0, 0])
    expect(planes.signal[2]).toBeGreaterThan(0.8)
  })
})
