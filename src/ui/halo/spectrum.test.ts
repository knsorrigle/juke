import { describe, expect, it } from 'vitest'
import { attackRelease, spectrumBands } from './spectrum.ts'

describe('spectrum bands', () => {
  // 1024 bins at 48 kHz: 23.4 Hz per bin.
  const silent = () => new Float32Array(1024).fill(-140)

  it('is all zeros for silence and has 48 log bands by default', () => {
    const bands = spectrumBands(silent(), 48000)
    expect(bands).toHaveLength(48)
    expect(bands.every((b) => b === 0)).toBe(true)
  })

  it('puts a low tone in a low band and a high tone in a high band', () => {
    const fft = silent()
    fft[Math.round(110 / 23.4375)] = -30 // A2
    fft[Math.round(4000 / 23.4375)] = -30
    const bands = spectrumBands(fft, 48000)
    const lit = bands.map((b, i) => (b > 0.5 ? i : -1)).filter((i) => i >= 0)
    expect(lit[0]).toBeLessThan(8)
    expect(lit[lit.length - 1]).toBeGreaterThan(36)
  })

  it('clamps loud bins to 1', () => {
    const fft = silent().fill(0)
    expect(spectrumBands(fft, 48000).every((b) => b === 1)).toBe(true)
  })

  it('rises fast and falls slowly', () => {
    expect(attackRelease(0, 1, 0.05)).toBeGreaterThan(0.8)
    expect(attackRelease(1, 0, 0.05)).toBeGreaterThan(0.8)
  })
})
