import { matchesClass } from '../analysis/classify.ts'
import { rgbToHsv, yellowness } from '../analysis/color.ts'
import { type ColormapLut, type ColormapStops, buildLut, estimateValue } from '../analysis/colormap.ts'
import { AEROSOL_CLASSES } from '../mapping/aerosols.ts'
import { NIGHT_CLASSES, nightPhase } from '../mapping/nightLights.ts'
import { SST_MAX, SST_STOPS } from '../mapping/ocean.ts'

/** The pixels under the Explore cursor, as [r, g, b] triples (0..255). */
export type CellPixels = [number, number, number][]

/**
 * What the Explore cursor is over.
 * - `value` 0..1 sets the tone's pitch; null means no data here.
 * - `noData` says how to sound "no data": soft noise (land, a legend, a date
 *   stamp) or silence (empty space around a globe).
 */
export interface ProbeResult {
  value: number | null
  /** Plain words, spoken by the I key and shown on screen. */
  text: string
  noData?: 'noise' | 'silence'
}

export type Probe = (pixels: CellPixels, time: number) => ProbeResult

const share = (n: number, total: number) => (total ? n / total : 0)
const amountWord = (v: number) => (v > 0.66 ? 'thick' : v > 0.33 ? 'moderate' : 'thin')

/** Lightning: the brightest yellow in the cell. */
export const probeLightning: Probe = (pixels) => {
  const peak = Math.max(0, ...pixels.map(([r, g, b]) => yellowness(r, g, b)))
  const value = Math.min(1, peak / 0.6)
  if (value < 0.08) return { value: 0, text: 'No lightning here.' }
  return { value, text: value > 0.6 ? 'Bright lightning here.' : 'Some lightning here.' }
}

/** Aerosols: which type covers most of the cell, and how much of it. */
export const probeAerosols: Probe = (pixels) => {
  const counts = new Map<string, number>()
  for (const [r, g, b] of pixels) {
    const { h, s, v } = rgbToHsv(r, g, b)
    const c = AEROSOL_CLASSES.find((k) => matchesClass(h, s, v, k))
    if (c) counts.set(c.id, (counts.get(c.id) ?? 0) + v)
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]
  if (!best) return { value: 0, text: 'Clear air, or land with no aerosol.' }
  const names: Record<string, string> = { carbon: 'Black carbon smoke', dust: 'Dust', salt: 'Sea salt', sulfate: 'Sulfate' }
  const value = Math.min(1, share(best[1], pixels.length) * 1.6)
  return { value, text: `${names[best[0]]}, ${amountWord(value)}.` }
}

const sstLut = buildLut(SST_STOPS)

/** Ocean: sea surface temperature read back through the legend. Grey land is no data. */
export const probeOcean: Probe = (pixels) => {
  const temps: number[] = []
  for (const [r, g, b] of pixels) {
    const max = Math.max(r, g, b)
    if (max < 31 || (max - Math.min(r, g, b)) / max < 0.3) continue
    temps.push(estimateValue(r, g, b, sstLut))
  }
  if (temps.length < pixels.length * 0.2) return { value: null, text: 'Land.', noData: 'noise' }
  const t = temps.reduce((a, b) => a + b, 0) / temps.length
  return { value: t / SST_MAX, text: `Water about ${Math.round(t)} degrees Celsius.` }
}

/** Night Lights: city lights in the year series; growth or loss on the change map. */
export const probeNightLights: Probe = (pixels, time) => {
  const count = (id: string) => {
    const c = NIGHT_CLASSES.find((k) => k.id === id)!
    return pixels.reduce((n, [r, g, b]) => {
      const { h, s, v } = rgbToHsv(r, g, b)
      return n + (matchesClass(h, s, v, c) ? v : 0)
    }, 0)
  }
  if (nightPhase(time) === 'change') {
    const grew = share(count('purple'), pixels.length)
    const faded = share(count('orange'), pixels.length)
    if (grew + faded < 0.01) return { value: 0.5, text: 'No change in lighting here.' }
    const value = Math.max(0, Math.min(1, 0.5 + (grew - faded) * 3))
    return { value, text: grew >= faded ? 'More light than in 2012.' : 'Less light than in 2012.' }
  }
  const lit = Math.min(1, share(count('lights'), pixels.length) * 4)
  if (lit < 0.03) return { value: 0, text: 'Dark: no city lights here.' }
  return { value: lit, text: lit > 0.5 ? 'Bright city lights.' : 'Some lights.' }
}

/** CO2 colour bar from 425 to 458 ppm, sampled from NASA's colour-bar image. */
const CO2_STOPS: ColormapStops = [
  [425, 217, 192, 133],
  [430, 230, 177, 82],
  [435, 232, 121, 44],
  [440, 224, 104, 38],
  [450, 227, 76, 28],
  [458, 229, 40, 18],
]
const co2Lut: ColormapLut = buildLut(CO2_STOPS)

/** CO2: concentration read back through the legend. Black space is silent. */
export const probeCo2: Probe = (pixels) => {
  const ppm: number[] = []
  let dark = 0
  for (const [r, g, b] of pixels) {
    const max = Math.max(r, g, b)
    if (max < 12) {
      dark++
      continue
    }
    if ((max - Math.min(r, g, b)) / max >= 0.35 && max > 90) ppm.push(estimateValue(r, g, b, co2Lut))
  }
  if (dark > pixels.length * 0.8) return { value: null, text: 'Space, off the globe.', noData: 'silence' }
  if (ppm.length < pixels.length * 0.15) return { value: 0.05, text: 'Below about 425 parts per million.' }
  const v = ppm.reduce((a, b) => a + b, 0) / ppm.length
  return { value: (v - 415) / 45, text: `About ${Math.round(v)} parts per million.` }
}

export const PROBES: Record<string, Probe> = {
  lightning: probeLightning,
  aerosols: probeAerosols,
  'sea-surface-currents': probeOcean,
  'night-lights': probeNightLights,
  co2: probeCo2,
}
