/** Rec. 709 luminance of an 8-bit RGB pixel, 0..1. */
export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * How yellow an 8-bit RGB pixel is, 0..1: the amount by which both red and
 * green exceed blue. Zero for grey, white and blue pixels.
 */
export function yellowness(r: number, g: number, b: number): number {
  const v = Math.min(r, g) - b
  return v > 0 ? v / 255 : 0
}

/** Hue in degrees (0..360), saturation and value (0..1) of an 8-bit RGB pixel. */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const v = max / 255
  const s = max === 0 ? 0 : delta / max
  if (delta === 0) return { h: 0, s, v }
  let h: number
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, v }
}
