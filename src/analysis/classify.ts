import { rgbToHsv } from './color.ts'
import type { PixelFrame } from './types.ts'

/**
 * A colour to look for, as ranges of hue (degrees), saturation and value
 * (0..1). A hue range whose first number is larger than its second wraps
 * through 360, e.g. [345, 30] for reds.
 */
export interface ColorClass {
  id: string
  hue: [number, number]
  sat: [number, number]
  val: [number, number]
}

export interface ClassStats {
  /** Share of the frame covered, weighted by brightness, 0..1. */
  amount: number
  /** Brightness-weighted centre, 0..1 from the top-left (0.5 if absent). */
  x: number
  y: number
  /** The same share per vertical band, left to right. */
  columns: number[]
}

export function matchesClass(h: number, s: number, v: number, c: ColorClass): boolean {
  if (s < c.sat[0] || s > c.sat[1] || v < c.val[0] || v > c.val[1]) return false
  return c.hue[0] <= c.hue[1] ? h >= c.hue[0] && h <= c.hue[1] : h >= c.hue[0] || h <= c.hue[1]
}

/** Sort every pixel into the first class it matches and summarise each class. */
export function classifyPixels(
  frame: PixelFrame,
  classes: ColorClass[],
  columns: number,
  mask?: Uint8Array,
): Record<string, ClassStats> {
  const { data, width, height } = frame
  const sums = classes.map(() => ({ w: 0, x: 0, y: 0, cols: new Float64Array(columns) }))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (mask && mask[i]) continue
      const p = i * 4
      const { h, s, v } = rgbToHsv(data[p], data[p + 1], data[p + 2])
      for (let c = 0; c < classes.length; c++) {
        if (!matchesClass(h, s, v, classes[c])) continue
        const sum = sums[c]
        sum.w += v
        sum.x += v * (x + 0.5)
        sum.y += v * (y + 0.5)
        sum.cols[Math.min(columns - 1, Math.floor((x * columns) / width))] += v
        break
      }
    }
  }
  const perColumn = (width * height) / columns
  const out: Record<string, ClassStats> = {}
  classes.forEach((c, i) => {
    const s = sums[i]
    out[c.id] = {
      amount: s.w / (width * height),
      x: s.w > 0 ? s.x / s.w / width : 0.5,
      y: s.w > 0 ? s.y / s.w / height : 0.5,
      columns: Array.from(s.cols, (v) => v / perColumn),
    }
  })
  return out
}
