import { useEffect, useRef } from 'react'
import { frameLoop } from './frameLoop.ts'
import { type Ripple, ripples } from './ripples.ts'

const POOL = 64
const LIFE_MS = 1500

interface Live extends Ripple {
  born: number
}

/**
 * Draws an expanding ring on the video where each note comes from. With
 * reduced motion, a still dot fades out instead. Decorative for sighted
 * viewers, so it is hidden from screen readers; the sound carries the data.
 */
export function RippleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const live: Live[] = []
    let width = 0
    let height = 0
    let stop: (() => void) | null = null
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
    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height)
      for (let i = live.length - 1; i >= 0; i--) {
        const r = live[i]
        const age = (now - r.born) / LIFE_MS
        if (age >= 1) {
          live.splice(i, 1)
          continue
        }
        ctx.globalAlpha = (1 - age) * (0.35 + 0.65 * r.velocity)
        ctx.strokeStyle = ctx.fillStyle = r.color
        ctx.beginPath()
        if (reduced.matches) {
          ctx.arc(r.x * width, r.y * height, 3, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.lineWidth = 1.5
          ctx.arc(r.x * width, r.y * height, 3 + age * (12 + 22 * r.velocity), 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      // Leave the shared loop when there is nothing left to draw.
      if (!live.length && stop) {
        stop()
        stop = null
      }
    }
    const unsubscribe = ripples.subscribe((r) => {
      if (live.length >= POOL) live.shift()
      live.push({ ...r, born: performance.now() })
      if (!stop) stop = frameLoop.subscribe(draw)
    })
    return () => {
      unsubscribe()
      stop?.()
      observer.disconnect()
    }
  }, [])
  return <canvas ref={ref} className="ripples" aria-hidden="true" />
}
