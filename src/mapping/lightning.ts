import { clusterPixels, type WeightedPixel } from '../analysis/clusters.ts'
import type { FrameFeatures } from '../analysis/types.ts'
import { type Clock, tickIndexAt, tickTime } from './clock.ts'
import {
  type GeoFrame,
  latitudeToPosition,
  longitudeToPan,
  xToLongitude,
  yToLatitude,
} from './geo.ts'
import { MINOR_PENTATONIC, clamp, quantizeToScale, scaleNotes } from './scales.ts'
import type { MappingOutput, NoteEvent, Ruleset } from './types.ts'

export interface LightningConfig {
  clock: Clock
  /** At most this many clusters are played on each tick. */
  maxNotesPerTick: number
  /** Clusters smaller than this many pixels are not played. */
  minClusterSize: number
  /** Lowest note (MIDI) and how many octaves of pentatonic sit above it. */
  rootMidi: number
  octaves: number
  /** Latitude band spread across the pitch range. Lightning outside it is clamped. */
  latSouth: number
  latNorth: number
  panWidth: number
  velocityMin: number
  /** Cluster size (pixels) that reaches full velocity. */
  clusterSizeFull: number
  /** Newly lit pixels in one tick that drive the pad to full level. */
  flashCountFull: number
  /** The pad never drops below this while playing, so silence means "stopped". */
  padFloor: number
  /** Fraction of the gap to the target the pad closes per tick, rising and falling. */
  padAttack: number
  padRelease: number
  /** Seconds between the notes of one tick, largest cluster first. */
  strum: number
}

/**
 * Values measured on the real video at 160x80: a median tick holds about 25
 * newly lit pixels in 10 clusters (90th percentile: 60 pixels), the largest
 * cluster is typically 5 pixels (90th percentile: 13), and 99.9% of lightning
 * falls between 53 N and 46 S.
 */
export const LIGHTNING_DEFAULTS: LightningConfig = {
  clock: { bpm: 110, division: 4 },
  maxNotesPerTick: 4,
  minClusterSize: 1,
  rootMidi: 45, // A2
  octaves: 3,
  latSouth: -50,
  latNorth: 55,
  panWidth: 0.9,
  velocityMin: 0.25,
  clusterSizeFull: 14,
  flashCountFull: 80,
  padFloor: 0.08,
  padAttack: 0.45,
  padRelease: 0.1,
  strum: 0.012,
}

export interface LightningState {
  /** Tick the pending pixels belong to; null before the first frame. */
  tick: number | null
  /** Newly lit pixels gathered since the last tick fired. */
  pending: WeightedPixel[]
  padLevel: number
}

export function createLightningState(): LightningState {
  return { tick: null, pending: [], padLevel: 0 }
}

/** Velocity for a cluster of `size` pixels: bigger storm, harder hit. */
export function clusterVelocity(size: number, config: LightningConfig): number {
  const amount = Math.min(1, size / config.clusterSizeFull) ** 0.6
  return clamp(config.velocityMin + (1 - config.velocityMin) * amount, config.velocityMin, 1)
}

/** Pad target for a tick that gathered `flashCount` newly lit pixels. */
export function padTarget(flashCount: number, config: LightningConfig): number {
  return clamp(Math.sqrt(flashCount / config.flashCountFull), 0, 1)
}

/**
 * One frame of the Lightning rules.
 *
 * Newly lit yellow pixels are gathered between ticks of the musical clock. When
 * a tick boundary is crossed they are grouped into clusters, the largest few
 * are played (longitude -> pan, latitude -> pitch with north high, size ->
 * velocity), and the total count sets the pad level.
 */
export function stepLightning(
  features: FrameFeatures,
  time: number,
  state: LightningState,
  config: LightningConfig,
  geo: GeoFrame,
): { state: LightningState; output: MappingOutput } {
  const fresh: WeightedPixel[] = features.risingPixels.map((p) => ({
    px: p.px,
    py: p.py,
    weight: p.rise,
  }))
  const tick = tickIndexAt(time, config.clock)

  if (state.tick === null || tick === state.tick) {
    return {
      state: { tick, pending: state.pending.concat(fresh), padLevel: state.padLevel },
      output: { notes: [], pad: null, tick: null },
    }
  }

  // A tick boundary was crossed. Everything gathered before this frame belongs to it;
  // this frame's own pixels appeared after the boundary and wait for the next tick.
  const clusters = clusterPixels(state.pending, features.width, features.height)
  const flashCount = clusters.reduce((sum, c) => sum + c.size, 0)
  const scale = scaleNotes(config.rootMidi, MINOR_PENTATONIC, config.octaves)
  const at = tickTime(tick, config.clock)

  const notes: NoteEvent[] = clusters
    .filter((c) => c.size >= config.minClusterSize)
    .slice(0, config.maxNotesPerTick)
    .map((c, i) => ({
      time: at + i * config.strum,
      midi: quantizeToScale(
        latitudeToPosition(yToLatitude(c.y, geo), config.latSouth, config.latNorth),
        scale,
      ),
      pan: longitudeToPan(xToLongitude(c.x, geo), config.panWidth),
      velocity: clusterVelocity(c.size, config),
    }))

  const target = padTarget(flashCount, config)
  const rate = target > state.padLevel ? config.padAttack : config.padRelease
  const padLevel = clamp(state.padLevel + (target - state.padLevel) * rate, 0, 1)

  return {
    state: { tick, pending: fresh, padLevel },
    output: {
      notes,
      pad: { level: Math.max(config.padFloor, padLevel) },
      tick: {
        index: tick,
        time: at,
        flashCount,
        clusterCount: clusters.length,
        notesPlayed: notes.length,
      },
    },
  }
}

/** The Lightning ruleset for a flat map with the given edges. */
export function createLightningRuleset(
  geo: GeoFrame,
  overrides: Partial<LightningConfig> = {},
): Ruleset<LightningState> {
  const config = { ...LIGHTNING_DEFAULTS, ...overrides }
  return {
    // Lightning is drawn in yellow: detect it by colour plus brightening.
    analysis: { signal: 'yellow', riseThreshold: 0.04, signalFloor: 0.05, spotThreshold: 0.15 },
    createState: createLightningState,
    step: (features, time, state) => stepLightning(features, time, state, config, geo),
  }
}
