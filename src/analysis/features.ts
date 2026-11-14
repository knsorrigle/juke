import { classifyPixels } from './classify.ts'
import { luminance, rgbToHsv, yellowness } from './color.ts'
import { type ColormapLut, type ColormapStops, buildLut, colormapGrid } from './colormap.ts'
import type {
  AnalysisOptions,
  AnalysisResult,
  FramePlanes,
  MaskRect,
  PixelFrame,
  RisingPixel,
  SignalChannel,
  Spot,
} from './types.ts'

export const DEFAULT_ANALYSIS: AnalysisOptions = {
  signal: 'luma',
  columns: 16,
  rows: 8,
  regionCols: 8,
  regionRows: 4,
  hueBins: 12,
  spotThreshold: 0.5,
  maxSpots: 16,
  minSpotDistance: 3,
  riseThreshold: 0.04,
  signalFloor: 0.05,
  lumaRiseMin: 0.004,
  masks: [],
  classes: [],
  colormap: null,
}

const lutCache = new WeakMap<ColormapStops, ColormapLut>()
function lutFor(stops: ColormapStops): ColormapLut {
  let lut = lutCache.get(stops)
  if (!lut) {
    lut = buildLut(stops)
    lutCache.set(stops, lut)
  }
  return lut
}

/** Pixels ignored when colouring the hue histogram: too grey or too dark to have a hue. */
const MIN_SATURATION = 0.2
const MIN_VALUE = 0.08

/** One byte per pixel: 1 where the pixel falls inside any mask rectangle. */
export function buildMask(width: number, height: number, masks: MaskRect[]): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (const m of masks) {
    const x0 = Math.max(0, Math.floor(m.x * width))
    const y0 = Math.max(0, Math.floor(m.y * height))
    const x1 = Math.min(width, Math.ceil((m.x + m.width) * width))
    const y1 = Math.min(height, Math.ceil((m.y + m.height) * height))
    for (let y = y0; y < y1; y++) mask.fill(1, y * width + x0, y * width + x1)
  }
  return mask
}

/** Luminance and signal planes of a frame. Masked pixels read as zero. */
export function computePlanes(
  frame: PixelFrame,
  signal: SignalChannel,
  mask?: Uint8Array,
): FramePlanes {
  const { data, width, height } = frame
  const n = width * height
  const luma = new Float32Array(n)
  const sig = signal === 'luma' ? luma : new Float32Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (mask && mask[i]) continue
    const r = data[p]
    const g = data[p + 1]
    const b = data[p + 2]
    luma[i] = luminance(r, g, b)
    if (signal === 'yellow') sig[i] = yellowness(r, g, b)
  }
  return { width, height, luma, signal: sig }
}

/** Mean of a plane overall, per vertical band and per horizontal band. */
export function bandMeans(
  plane: Float32Array,
  width: number,
  height: number,
  columns: number,
  rows: number,
): { mean: number; columns: number[]; rows: number[] } {
  const colSum = new Float64Array(columns)
  const colCount = new Uint32Array(columns)
  const rowSum = new Float64Array(rows)
  const rowCount = new Uint32Array(rows)
  let total = 0
  for (let y = 0; y < height; y++) {
    const rb = Math.min(rows - 1, Math.floor((y * rows) / height))
    for (let x = 0; x < width; x++) {
      const v = plane[y * width + x]
      const cb = Math.min(columns - 1, Math.floor((x * columns) / width))
      colSum[cb] += v
      colCount[cb]++
      rowSum[rb] += v
      rowCount[rb]++
      total += v
    }
  }
  return {
    mean: total / (width * height),
    columns: Array.from(colSum, (s, i) => (colCount[i] ? s / colCount[i] : 0)),
    rows: Array.from(rowSum, (s, i) => (rowCount[i] ? s / rowCount[i] : 0)),
  }
}

/** Mean absolute change between two planes, overall and per grid region. */
export function frameDifference(
  curr: Float32Array,
  prev: Float32Array | null,
  width: number,
  height: number,
  regionCols: number,
  regionRows: number,
): { overall: number; regions: number[] } {
  const regions = new Array<number>(regionCols * regionRows).fill(0)
  if (!prev || prev.length !== curr.length) return { overall: 0, regions }
  const counts = new Uint32Array(regions.length)
  let total = 0
  for (let y = 0; y < height; y++) {
    const ry = Math.min(regionRows - 1, Math.floor((y * regionRows) / height))
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const d = Math.abs(curr[i] - prev[i])
      const r = ry * regionCols + Math.min(regionCols - 1, Math.floor((x * regionCols) / width))
      regions[r] += d
      counts[r]++
      total += d
    }
  }
  for (let r = 0; r < regions.length; r++) regions[r] = counts[r] ? regions[r] / counts[r] : 0
  return { overall: total / (width * height), regions }
}

/**
 * Histogram of hue over the coloured pixels of a frame, each pixel weighted by
 * saturation x value. Normalised to sum to 1; all zeros if nothing is coloured.
 */
export function hueHistogram(frame: PixelFrame, bins: number, mask?: Uint8Array): number[] {
  const { data, width, height } = frame
  const hist = new Array<number>(bins).fill(0)
  let total = 0
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    if (mask && mask[i]) continue
    const { h, s, v } = rgbToHsv(data[p], data[p + 1], data[p + 2])
    if (s < MIN_SATURATION || v < MIN_VALUE) continue
    const w = s * v
    hist[Math.min(bins - 1, Math.floor((h / 360) * bins))] += w
    total += w
  }
  if (total > 0) for (let b = 0; b < bins; b++) hist[b] /= total
  return hist
}

/** The strongest hue bins, strongest first, as the bin's centre angle. */
export function dominantHues(hist: number[], count = 3): { hue: number; weight: number }[] {
  const binSize = 360 / hist.length
  return hist
    .map((weight, i) => ({ hue: (i + 0.5) * binSize, weight }))
    .filter((h) => h.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)
}

/**
 * The brightest local peaks of a plane: pixels at or above `threshold` that are
 * the largest in their 3x3 neighbourhood, strongest first, kept at least
 * `minDistance` pixels apart.
 */
export function findBrightSpots(
  plane: Float32Array,
  width: number,
  height: number,
  threshold: number,
  maxSpots: number,
  minDistance: number,
): Spot[] {
  const peaks: { x: number; y: number; v: number }[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = plane[y * width + x]
      if (v < threshold || v <= 0) continue
      let isPeak = true
      for (let dy = -1; dy <= 1 && isPeak; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue
          const nv = plane[ny * width + nx]
          // Ties go to the earlier pixel in scan order, so a flat patch yields one peak.
          if (nv > v || (nv === v && (dy < 0 || (dy === 0 && dx < 0)))) {
            isPeak = false
            break
          }
        }
      }
      if (isPeak) peaks.push({ x, y, v })
    }
  }
  peaks.sort((a, b) => b.v - a.v)
  const kept: { x: number; y: number; v: number }[] = []
  const minSq = minDistance * minDistance
  for (const p of peaks) {
    if (kept.length >= maxSpots) break
    if (kept.every((k) => (k.x - p.x) ** 2 + (k.y - p.y) ** 2 >= minSq)) kept.push(p)
  }
  return kept.map((p) => ({
    x: (p.x + 0.5) / width,
    y: (p.y + 0.5) / height,
    strength: Math.min(1, p.v),
  }))
}

/**
 * Pixels that newly lit up: the signal (colour) rose by `riseThreshold`, it now
 * reaches `signalFloor`, and the pixel also got brighter. Requiring all three
 * means a brightening cloud (no colour) and a steady dot (no change) are both
 * ignored.
 */
export function findRisingPixels(
  curr: FramePlanes,
  prev: FramePlanes | null,
  riseThreshold: number,
  signalFloor: number,
  lumaRiseMin: number,
): RisingPixel[] {
  if (!prev || prev.width !== curr.width || prev.height !== curr.height) return []
  const out: RisingPixel[] = []
  const { width, height } = curr
  for (let i = 0; i < width * height; i++) {
    const s = curr.signal[i]
    if (s < signalFloor) continue
    const rise = s - prev.signal[i]
    if (rise < riseThreshold) continue
    if (curr.luma[i] - prev.luma[i] < lumaRiseMin) continue
    out.push({ px: i % width, py: Math.floor(i / width), rise: Math.min(1, rise) })
  }
  return out
}

/** Centre of mass of a plane, in 0..1 coordinates, or null if it is all zero. */
export function centroidOf(
  plane: Float32Array,
  width: number,
  height: number,
): { x: number; y: number } | null {
  let sum = 0
  let sx = 0
  let sy = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = plane[y * width + x]
      sum += v
      sx += v * (x + 0.5)
      sy += v * (y + 0.5)
    }
  }
  if (sum <= 1e-9) return null
  return { x: sx / sum / width, y: sy / sum / height }
}

/**
 * Extract every feature from one frame. Pure: the only memory is `prev`, the
 * planes returned from the previous call (pass null after a seek or a cut).
 */
export function analyzeFrame(
  frame: PixelFrame,
  prev: FramePlanes | null,
  options: Partial<AnalysisOptions> = {},
): AnalysisResult {
  const o = { ...DEFAULT_ANALYSIS, ...options }
  const { width, height } = frame
  const mask = o.masks.length ? buildMask(width, height, o.masks) : undefined
  const planes = computePlanes(frame, o.signal, mask)
  const comparable = prev && prev.width === width && prev.height === height ? prev : null

  const bands = bandMeans(planes.luma, width, height, o.columns, o.rows)
  const diff = frameDifference(
    planes.luma,
    comparable ? comparable.luma : null,
    width,
    height,
    o.regionCols,
    o.regionRows,
  )
  const hist = hueHistogram(frame, o.hueBins, mask)
  let signalSum = 0
  for (let i = 0; i < planes.signal.length; i++) signalSum += planes.signal[i]

  return {
    planes,
    features: {
      width,
      height,
      meanLuminance: bands.mean,
      columnLuminance: bands.columns,
      rowLuminance: bands.rows,
      diff: diff.overall,
      regionDiff: diff.regions,
      hueHistogram: hist,
      dominantHues: dominantHues(hist),
      brightSpots: findBrightSpots(
        planes.signal,
        width,
        height,
        o.spotThreshold,
        o.maxSpots,
        o.minSpotDistance,
      ),
      centroid: centroidOf(planes.luma, width, height),
      signalMean: signalSum / planes.signal.length,
      risingPixels: findRisingPixels(
        planes,
        comparable,
        o.riseThreshold,
        o.signalFloor,
        o.lumaRiseMin,
      ),
      classes: o.classes.length ? classifyPixels(frame, o.classes, o.columns, mask) : {},
      grid: o.colormap ? colormapGrid(frame, o.colormap, lutFor(o.colormap.stops), mask) : null,
    },
  }
}
