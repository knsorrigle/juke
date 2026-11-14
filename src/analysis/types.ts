import type { ClassStats, ColorClass } from './classify.ts'
import type { ColormapOptions, ValueGrid } from './colormap.ts'

/** Raw RGBA pixels, the shape of a canvas ImageData. */
export interface PixelFrame {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

/**
 * Which per-pixel quantity bright spots and newly lit pixels are measured on.
 * - `luma`: plain brightness.
 * - `yellow`: how far red and green both exceed blue. Grey, white and blue
 *   pixels score zero, so the base map and clouds are ignored.
 */
export type SignalChannel = 'luma' | 'yellow'

/** A rectangle in frame coordinates, each value 0..1 from the top-left. */
export interface MaskRect {
  x: number
  y: number
  width: number
  height: number
}

/** A point of interest. x and y are 0..1 from the top-left; strength is 0..1. */
export interface Spot {
  x: number
  y: number
  strength: number
}

/** A pixel that newly lit up, in analysis-pixel coordinates. */
export interface RisingPixel {
  px: number
  py: number
  /** How much the signal rose since the previous frame, 0..1. */
  rise: number
}

export interface AnalysisOptions {
  signal: SignalChannel
  /** Vertical bands for luminance per column. */
  columns: number
  /** Horizontal bands for luminance per row. */
  rows: number
  /** Grid used for per-region frame difference. */
  regionCols: number
  regionRows: number
  hueBins: number
  /** Signal value (0..1) a pixel must reach to count as a bright spot. */
  spotThreshold: number
  maxSpots: number
  /** Minimum spacing between reported bright spots, in analysis pixels. */
  minSpotDistance: number
  /** A newly lit pixel's signal must rise by at least this much (0..1). */
  riseThreshold: number
  /** ...and must end up at least this strong, so the colour is really there. */
  signalFloor: number
  /** ...and its luminance must rise by at least this much: it got brighter. */
  lumaRiseMin: number
  /** Parts of the frame to ignore, such as date stamps and legends. */
  masks: MaskRect[]
  /** Legend colours to sort pixels into (empty = skip). */
  classes: ColorClass[]
  /** A legend colour scale to read data values from (null = skip). */
  colormap: ColormapOptions | null
}

/** Per-pixel planes kept from one frame so the next can be compared with it. */
export interface FramePlanes {
  width: number
  height: number
  luma: Float32Array
  signal: Float32Array
}

export interface FrameFeatures {
  width: number
  height: number
  /** Mean luminance, 0..1. */
  meanLuminance: number
  /** Mean luminance per vertical band, left to right. */
  columnLuminance: number[]
  /** Mean luminance per horizontal band, top to bottom. */
  rowLuminance: number[]
  /** Mean absolute luminance change since the previous frame, 0..1. */
  diff: number
  /** The same change per region, row-major, regionCols x regionRows. */
  regionDiff: number[]
  /** Share of coloured pixels per hue bin; sums to 1, or all zeros if grey. */
  hueHistogram: number[]
  /** Strongest hue bins, as the bin's centre angle in degrees. */
  dominantHues: { hue: number; weight: number }[]
  /** Brightest local peaks of the signal channel in this frame. */
  brightSpots: Spot[]
  /** Centre of mass of luminance, or null for a black frame. */
  centroid: { x: number; y: number } | null
  /** Mean of the signal channel, 0..1. */
  signalMean: number
  /** Pixels that newly lit up since the previous frame. */
  risingPixels: RisingPixel[]
  /** Amount and position of each legend colour, by class id. */
  classes: Record<string, ClassStats>
  /** Data values read back through the legend colour scale, on a grid. */
  grid: ValueGrid | null
}

export interface AnalysisResult {
  features: FrameFeatures
  /** Pass these back in as `prev` when analysing the next frame. */
  planes: FramePlanes
}
