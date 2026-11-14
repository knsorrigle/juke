/**
 * The page's single requestAnimationFrame loop. Canvas overlays subscribe to
 * it instead of running their own, and it measures frames per second for the
 * ?debug panel. It stops itself when nothing is subscribed.
 */
type Draw = (now: number, dt: number) => void

const draws = new Set<Draw>()
let handle = 0
let last = 0
let fps = 0
let frames = 0
let windowStart = 0

function tick(now: number) {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60
  last = now
  frames++
  if (now - windowStart >= 500) {
    fps = (frames * 1000) / (now - windowStart)
    frames = 0
    windowStart = now
  }
  draws.forEach((d) => d(now, dt))
  handle = draws.size ? requestAnimationFrame(tick) : 0
  if (!handle) last = 0
}

export const frameLoop = {
  subscribe(draw: Draw): () => void {
    draws.add(draw)
    if (!handle) {
      windowStart = performance.now()
      frames = 0
      handle = requestAnimationFrame(tick)
    }
    return () => {
      draws.delete(draw)
    }
  },
  /** Frames per second over the last half second. */
  fps(): number {
    return fps
  },
}
