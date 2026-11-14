/** A weighted pixel in analysis-pixel coordinates. */
export interface WeightedPixel {
  px: number
  py: number
  weight: number
}

/** A group of touching pixels. x and y are the weighted centre, 0..1. */
export interface Cluster {
  x: number
  y: number
  /** Number of pixels in the group. */
  size: number
  /** Sum of the pixels' weights. */
  weight: number
}

/**
 * Group pixels that touch (including diagonally) into clusters, largest first.
 * Duplicate coordinates are merged and their weights added.
 */
export function clusterPixels(pixels: WeightedPixel[], width: number, height: number): Cluster[] {
  const weights = new Map<number, number>()
  for (const p of pixels) {
    if (p.px < 0 || p.py < 0 || p.px >= width || p.py >= height) continue
    const key = p.py * width + p.px
    weights.set(key, (weights.get(key) ?? 0) + p.weight)
  }

  const clusters: Cluster[] = []
  const seen = new Set<number>()
  for (const start of weights.keys()) {
    if (seen.has(start)) continue
    seen.add(start)
    const stack = [start]
    let size = 0
    let weight = 0
    let sx = 0
    let sy = 0
    while (stack.length) {
      const key = stack.pop()!
      const w = weights.get(key)!
      const x = key % width
      const y = (key - x) / width
      size++
      weight += w
      sx += w * (x + 0.5)
      sy += w * (y + 0.5)
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const nk = ny * width + nx
          if (!seen.has(nk) && weights.has(nk)) {
            seen.add(nk)
            stack.push(nk)
          }
        }
      }
    }
    clusters.push({
      x: weight > 0 ? sx / weight / width : 0,
      y: weight > 0 ? sy / weight / height : 0,
      size,
      weight,
    })
  }
  return clusters.sort((a, b) => b.size - a.size || b.weight - a.weight)
}
