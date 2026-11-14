import type { PixelFrame } from './types.ts'

export type FrameHandler = (frame: PixelFrame, mediaTime: number) => void

/**
 * Sizes of the canvases a video is drawn through on its way down to the
 * analysis size. Each step shrinks by at most about 2x, so every source pixel
 * contributes to the result; a single big shrink would skip pixels and make
 * small dots flicker.
 */
export function downscaleSteps(
  videoWidth: number,
  videoHeight: number,
  targetWidth: number,
): { width: number; height: number }[] {
  const aspect = videoHeight / videoWidth
  const widths = [targetWidth]
  while (widths[0] * 4 <= videoWidth) widths.unshift(widths[0] * 2)
  return widths.map((width) => ({ width, height: Math.max(1, Math.round(width * aspect)) }))
}

/**
 * Draws each presented video frame to a small canvas and hands the pixels to
 * a callback. Uses requestVideoFrameCallback where available (exact frame
 * times), falling back to requestAnimationFrame.
 */
export class FrameSampler {
  private video: HTMLVideoElement
  private targetWidth: number
  private canvases: HTMLCanvasElement[] = []
  private contexts: CanvasRenderingContext2D[] = []
  private handler: FrameHandler | null = null
  private handle = 0
  private usingVideoFrames = false
  private lastTime = -1
  private sizedFor = ''

  constructor(video: HTMLVideoElement, targetWidth = 160) {
    this.video = video
    this.targetWidth = targetWidth
  }

  /** True if exact per-frame callbacks are in use rather than the fallback. */
  get exactFrames(): boolean {
    return this.usingVideoFrames
  }

  start(handler: FrameHandler): void {
    this.stop()
    this.handler = handler
    this.usingVideoFrames = 'requestVideoFrameCallback' in HTMLVideoElement.prototype
    this.schedule()
  }

  stop(): void {
    if (this.handle) {
      if (this.usingVideoFrames) this.video.cancelVideoFrameCallback(this.handle)
      else cancelAnimationFrame(this.handle)
    }
    this.handle = 0
    this.handler = null
  }

  /**
   * Sample whatever frame the video is showing right now. Browsers do not
   * always deliver a frame callback after a seek while paused, so the caller
   * asks for one explicitly.
   */
  sampleNow(): void {
    this.sample(this.video.currentTime)
  }

  private schedule(): void {
    if (!this.handler) return
    if (this.usingVideoFrames) {
      this.handle = this.video.requestVideoFrameCallback((_now, metadata) => {
        this.sample(metadata.mediaTime)
        this.schedule()
      })
    } else {
      this.handle = requestAnimationFrame(() => {
        const t = this.video.currentTime
        if (t !== this.lastTime) this.sample(t)
        this.schedule()
      })
    }
  }

  private ensureCanvases(): boolean {
    const { videoWidth, videoHeight } = this.video
    if (!videoWidth || !videoHeight) return false
    const key = `${videoWidth}x${videoHeight}`
    if (key === this.sizedFor) return true
    const steps = downscaleSteps(videoWidth, videoHeight, this.targetWidth)
    this.canvases = []
    this.contexts = []
    steps.forEach((size, i) => {
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      // Only the last, smallest canvas is read back.
      const ctx = canvas.getContext('2d', { willReadFrequently: i === steps.length - 1 })
      if (!ctx) throw new Error('2D canvas is not available')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      this.canvases.push(canvas)
      this.contexts.push(ctx)
    })
    this.sizedFor = key
    return true
  }

  private sample(mediaTime: number): void {
    if (!this.handler || this.video.readyState < 2 || !this.ensureCanvases()) return
    this.lastTime = mediaTime
    let source: CanvasImageSource = this.video
    for (let i = 0; i < this.canvases.length; i++) {
      const canvas = this.canvases[i]
      this.contexts[i].drawImage(source, 0, 0, canvas.width, canvas.height)
      source = canvas
    }
    const last = this.canvases[this.canvases.length - 1]
    const image = this.contexts[this.contexts.length - 1].getImageData(0, 0, last.width, last.height)
    this.handler({ data: image.data, width: image.width, height: image.height }, mediaTime)
  }
}
