import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../../audio/engine.ts'
import { useJukebox } from '../../store.ts'
import { frameLoop } from '../frameLoop.ts'
import { TRACK_ACCENTS } from '../theme/tokens.ts'
import { attackRelease, spectrumBands } from './spectrum.ts'

const BANDS = 48
/** How far the halo reaches beyond the video, in CSS pixels. */
export const HALO_REACH = 36

/**
 * The spectrum halo: FFT bars hugging the left and right edges of the video,
 * low frequencies at the bottom and high at the top, plus top and bottom edge
 * lines lit by the treble and the bass. Its glow follows the output level.
 * Driven only by the live audio; hidden from screen readers.
 */
export function Halo({ engine }: { engine: AudioEngine }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const trackId = useJukebox((s) => s.trackId)
  const highContrast = useJukebox((s) => s.highContrast)
  const accent = useRef('#ffd43b')
  useEffect(() => {
    accent.current = highContrast ? '#ffe600' : (TRACK_ACCENTS[trackId] ?? '#ffd43b')
  }, [trackId, highContrast])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const levels = new Array<number>(BANDS).fill(0)
    let glow = 0
    let width = 0
    let height = 0
    // Measure only on resize, never inside the draw loop.
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const draw = (_now: number, dt: number) => {
      const spec = engine.spectrum()
      const target = spec ? spectrumBands(spec.db, spec.sampleRate, BANDS) : null
      let total = 0
      for (let i = 0; i < BANDS; i++) {
        levels[i] = attackRelease(levels[i], target ? target[i] : 0, dt)
        total += levels[i]
      }
      const level = engine.level().db
      glow = attackRelease(glow, Number.isFinite(level) ? Math.max(0, Math.min(1, (level + 50) / 40)) : 0, dt, 0.05, 0.5)

      ctx.clearRect(0, 0, width, height)
      if (total < 0.01) return
      const r = HALO_REACH
      const innerH = height - 2 * r
      const barH = innerH / BANDS
      ctx.fillStyle = ctx.strokeStyle = ctx.shadowColor = accent.current
      ctx.shadowBlur = 4 + 14 * glow
      for (let i = 0; i < BANDS; i++) {
        const v = levels[i]
        if (v < 0.02) continue
        const y = r + innerH - (i + 1) * barH + 1
        const len = (r - 6) * v
        ctx.globalAlpha = 0.25 + 0.75 * v
        ctx.fillRect(r - 4 - len, y, len, Math.max(1, barH - 2)) // left, growing outward
        ctx.fillRect(width - r + 4, y, len, Math.max(1, barH - 2)) // right
      }
      // Bass lights the bottom edge, treble the top edge.
      const bass = levels.slice(0, 12).reduce((a, b) => a + b, 0) / 12
      const treble = levels.slice(-12).reduce((a, b) => a + b, 0) / 12
      ctx.lineWidth = 2
      ctx.globalAlpha = Math.min(1, bass * 1.4)
      ctx.beginPath()
      ctx.moveTo(r, height - r + 5)
      ctx.lineTo(width - r, height - r + 5)
      ctx.stroke()
      ctx.globalAlpha = Math.min(1, treble * 1.4)
      ctx.beginPath()
      ctx.moveTo(r, r - 5)
      ctx.lineTo(width - r, r - 5)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
    }
    const unsubscribe = frameLoop.subscribe(draw)
    return () => {
      unsubscribe()
      observer.disconnect()
    }
  }, [engine])

  return <canvas ref={ref} className="halo" aria-hidden="true" style={{ inset: -HALO_REACH }} />
}
