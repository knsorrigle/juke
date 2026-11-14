import { describe, expect, it } from 'vitest'
import type { FrameFeatures } from '../analysis/types.ts'
import { co2 } from '../tracks/co2.ts'
import { lightning } from '../tracks/lightning.ts'
import { describeFrame } from './describe.ts'

const f = (cols: number[], rows: number[]): FrameFeatures => ({
  width: 160, height: 80, meanLuminance: 0.1, columnLuminance: cols, rowLuminance: rows, diff: 0.004,
  regionDiff: [], hueHistogram: [], dominantHues: [{ hue: 45, weight: 1 }], brightSpots: [], centroid: null,
  signalMean: 0, risingPixels: [], classes: {}, grid: null,
})

describe('describe frame', () => {
  const east = f([0, 0, 0, 0, 0.1, 0.1, 0.5, 0.5, 0.6], [0.4, 0.4, 0.1, 0.1, 0, 0])
  it('uses compass words on a flat map and includes the date and track numbers', () => {
    const text = describeFrame(lightning, east, '1 Mar 2017', { 'Hum level': '40%' }, false)
    expect(text).toBe('1 Mar 2017. Hum level: 40%. Brightest towards the north and the east.')
  })
  it('uses screen words on the turning globe', () => {
    const text = describeFrame(co2, east, null, {}, true)
    expect(text).toContain('Brightest towards the top and the right.')
    expect(text).toContain('screen positions, not places')
    expect(text).toContain('Changing slowly')
  })
})
