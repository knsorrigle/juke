import type { MaskRect } from '../analysis/types.ts'
import type { RulesetRunner } from '../mapping/runner.ts'

/**
 * How the Earth is drawn in the video.
 * - `equirectangular`: a flat map where x is longitude and y is latitude.
 * - `globe`: a rendered sphere, usually with a moving camera; a pixel's
 *   position says nothing fixed about where on Earth it is.
 */
export type Projection = 'equirectangular' | 'globe'

export interface Geographic {
  /** True if horizontal position in the frame means longitude. */
  x: boolean
  /** True if vertical position in the frame means latitude. */
  y: boolean
  /** Longitude at the left and right edges, once measured. */
  lon?: [number, number]
  /** Latitude at the top and bottom edges, once measured. */
  lat?: [number, number]
}

/** A text file with one date per frame of the original video. */
export interface TimeLabels {
  src: string
  /** Frame rate of the video the labels were written for. */
  sourceFps: number
  /** Years to display differently from the file, e.g. to fix a typo. */
  yearCorrections: { from: number; to: number }[]
}

export interface Track {
  id: string
  title: string
  videoSrc: string
  credit: string
  sourceUrl: string
  /** One or two sentences on what the visualization shows. */
  description: string
  /** What a sighted viewer sees, for people who cannot see the video. */
  altText: string
  projection: Projection
  geographic: Geographic
  /** Parts of the frame to keep out of the analysis: date stamps, legends. */
  masks: MaskRect[]
  /** Plain-language lines explaining what each sound means. */
  legend: string[]
  timeLabels: TimeLabels | null
  /** Caveats about this track's configuration that later work should know. */
  notes?: string
  /** Null until this track's sonification rules are written. */
  createRunner: (() => RulesetRunner) | null
}
