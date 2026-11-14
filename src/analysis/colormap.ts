import type { PixelFrame } from './types.ts'

/** A legend colour scale: [data value, red, green, blue] stops in order. */
export type ColormapStops = [number, number, number, number][]

export interface ColormapOptions {
  stops: ColormapStops
  /** Grid the frame is summarised on. */
  cols: number
  rows: number
  /** Pixels greyer or darker than this carry no data (land, background). */
  satMin: number
  valMin: number
}

export interface ValueGrid {
  cols: number
  rows: number
  /** Mean data value per cell, row-major; null where no pixel carried data. */
  values: (number | null)[]
  /** Share of each cell's pixels that carried data, 0..1. */
  coverage: number[]
}

type Lab = [number, number, number]

/** sRGB (0..255) to CIE LAB (D65). */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const R = lin(r)
  const G = lin(g)
  const B = lin(b)
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047)
  const Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B)
  const Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883)
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]
}

/** Scale a colour so its brightest channel is 255: compares hue, not brightness. */
function fullBrightness(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b, 1)
  return [(r * 255) / max, (g * 255) / max, (b * 255) / max]
}

export interface ColormapLut {
  values: number[]
  labs: Lab[]
}

/** Interpolate the stops into a fine lookup table in LAB space. */
export function buildLut(stops: ColormapStops, steps = 96): ColormapLut {
  const values: number[] = []
  const labs: Lab[] = []
  const lo = stops[0][0]
  const hi = stops[stops.length - 1][0]
  for (let i = 0; i < steps; i++) {
    const value = lo + ((hi - lo) * i) / (steps - 1)
    let k = 0
    while (k < stops.length - 2 && value > stops[k + 1][0]) k++
    const a = stops[k]
    const b = stops[k + 1]
    const t = (value - a[0]) / (b[0] - a[0] || 1)
    const rgb = fullBrightness(
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
      a[3] + (b[3] - a[3]) * t,
    )
    values.push(value)
    labs.push(rgbToLab(...rgb))
  }
  return { values, labs }
}

/** The data value whose legend colour is nearest (in LAB) to this pixel's colour. */
export function estimateValue(r: number, g: number, b: number, lut: ColormapLut): number {
  const [L, A, B] = rgbToLab(...fullBrightness(r, g, b))
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < lut.labs.length; i++) {
    const lab = lut.labs[i]
    const d = (L - lab[0]) ** 2 + (A - lab[1]) ** 2 + (B - lab[2]) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return lut.values[best]
}

/** Estimate the data value of every coloured pixel and average it on a grid. */
export function colormapGrid(
  frame: PixelFrame,
  options: ColormapOptions,
  lut: ColormapLut,
  mask?: Uint8Array,
): ValueGrid {
  const { data, width, height } = frame
  const { cols, rows } = options
  const sum = new Float64Array(cols * rows)
  const hits = new Uint32Array(cols * rows)
  const total = new Uint32Array(cols * rows)
  for (let y = 0; y < height; y++) {
    const gy = Math.min(rows - 1, Math.floor((y * rows) / height))
    for (let x = 0; x < width; x++) {
      const cell = gy * cols + Math.min(cols - 1, Math.floor((x * cols) / width))
      total[cell]++
      const i = y * width + x
      if (mask && mask[i]) continue
      const p = i * 4
      const r = data[p]
      const g = data[p + 1]
      const b = data[p + 2]
      const max = Math.max(r, g, b)
      if (max / 255 < options.valMin) continue
      if ((max - Math.min(r, g, b)) / max < options.satMin) continue
      sum[cell] += estimateValue(r, g, b, lut)
      hits[cell]++
    }
  }
  return {
    cols,
    rows,
    values: Array.from(sum, (s, i) => (hits[i] ? s / hits[i] : null)),
    coverage: Array.from(hits, (h, i) => (total[i] ? h / total[i] : 0)),
  }
}
