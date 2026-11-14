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
import type { Knobs, MappingOutput, NoteEvent, Ruleset } from './types.ts'

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
  /** Exponent of the count-to-level curve; below 1 lifts quiet passages a little. */
  padCurve: number
  /** The pad never drops below this while playing, so silence means "stopped". */
  padFloor: number
  /** Fraction of the gap to the target the pad closes per tick, rising and falling. */
  padAttack: number
  padRelease: number
  /** Seconds between the notes of one tick, largest cluster first. */
  strum: number
}

/**
 * Values measured on the real video at 160x80. A median tick holds about 25 to
 * 35 newly lit pixels (90th percentile 60 to 75, maximum about 140); averaged
 * over a couple of seconds the count swings from about 20 in quiet seasons to
 * about 55 in busy ones. The largest cluster is typically 5 pixels (90th
 * percentile 13), and 99.9% of lightning falls between 53 N and 46 S.
 */
export const LIGHTNING_DEFAULTS: LightningConfig = {
  clock: { bpm: 110, division: 4 },
  maxNotesPerTick: 3,
  minClusterSize: 1,
  rootMidi: 45, // A2
  octaves: 3,
  latSouth: -50,
  latNorth: 55,
  panWidth: 1,
  velocityMin: 0.25,
  clusterSizeFull: 14,
  flashCountFull: 110,
  padCurve: 0.8,
  padFloor: 0.08,
  padAttack: 0.2,
  padRelease: 0.08,
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
  return clamp((flashCount / config.flashCountFull) ** config.padCurve, 0, 1)
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
      output: { notes: [], voices: null, tick: null },
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
      voice: 'mallet',
      x: c.x,
      y: c.y,
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

  const hum = Math.max(config.padFloor, padLevel)

  return {
    state: { tick, pending: fresh, padLevel },
    output: {
      notes,
      voices: {
        hum: { level: hum, brightness: hum },
        rumble: { level: hum ** 1.5 },
      },
      info: {
        'New lightning this pulse': `${flashCount} pixels in ${clusters.length} clusters, ${notes.length} notes`,
        'Hum level': `${Math.round(hum * 100)}%`,
      },
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

export const LIGHTNING_KNOBS: Knobs = { maxNotes: 3, humDb: 0, panWidth: 1, tempo: 110, reverb: 0.3 }

/** The Lightning ruleset for a flat map with the given edges. */
export function createLightningRuleset(
  geo: GeoFrame,
  overrides: Partial<LightningConfig> = {},
): Ruleset<LightningState> {
  const base = { ...LIGHTNING_DEFAULTS, ...overrides }
  return {
    // Lightning is drawn in yellow: detect it by colour plus brightening.
    analysis: { signal: 'yellow', riseThreshold: 0.04, signalFloor: 0.05, spotThreshold: 0.15 },
    instruments: [
      { id: 'mallet', label: 'Lightning notes', kind: 'mallet', gain: 0.55, color: '#ffd43b' },
      { id: 'hum', label: 'Hum', kind: 'pad', gain: 0.32, midi: [45, 52, 57] },
      { id: 'rumble', label: 'Rumble', kind: 'rumble', gain: 0.8 },
    ],
    knobs: LIGHTNING_KNOBS,
    createState: createLightningState,
    step: (features, time, state, knobs) =>
      stepLightning(
        features,
        time,
        state,
        {
          ...base,
          maxNotesPerTick: Math.round(knobs.maxNotes),
          panWidth: knobs.panWidth,
          clock: { ...base.clock, bpm: knobs.tempo },
        },
        geo,
      ),
  }
}
