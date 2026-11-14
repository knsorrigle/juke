import type { PixelFrame } from './types.ts'

export type RGB = [number, number, number]

/** A frame filled with one colour. Test helper for building synthetic frames. */
export function solidFrame(width: number, height: number, [r, g, b]: RGB): PixelFrame {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let p = 0; p < data.length; p += 4) {
    data[p] = r
    data[p + 1] = g
    data[p + 2] = b
    data[p + 3] = 255
  }
  return { data, width, height }
}

/** Paint a filled rectangle (pixel coordinates) onto a frame, in place. */
export function paintRect(
  frame: PixelFrame,
  x: number,
  y: number,
  w: number,
  h: number,
  [r, g, b]: RGB,
): PixelFrame {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const p = (yy * frame.width + xx) * 4
      frame.data[p] = r
      frame.data[p + 1] = g
      frame.data[p + 2] = b
    }
  }
  return frame
}

export const BLACK: RGB = [0, 0, 0]
export const WHITE: RGB = [255, 255, 255]
export const GREY: RGB = [40, 40, 40]
export const YELLOW: RGB = [255, 230, 0]
