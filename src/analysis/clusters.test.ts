import { describe, expect, it } from 'vitest'
import { clusterPixels } from './clusters.ts'

const px = (x: number, y: number, weight = 1) => ({ px: x, py: y, weight })

describe('clusterPixels', () => {
  it('returns nothing for no pixels', () => {
    expect(clusterPixels([], 160, 80)).toEqual([])
  })

  it('groups touching pixels, including diagonals, and separates distant ones', () => {
    const clusters = clusterPixels(
      [px(10, 10), px(11, 10), px(12, 11), px(100, 40), px(50, 60), px(50, 61)],
      160,
      80,
    )
    expect(clusters.map((c) => c.size)).toEqual([3, 2, 1])
  })

  it('puts the centre at the weighted mean position, as 0..1', () => {
    const [c] = clusterPixels([px(10, 20, 1), px(11, 20, 3)], 100, 50)
    // Pixel centres 10.5 and 11.5, weights 1 and 3 -> 11.25
    expect(c.x).toBeCloseTo(11.25 / 100, 6)
    expect(c.y).toBeCloseTo(20.5 / 50, 6)
    expect(c.weight).toBe(4)
  })

  it('merges repeated coordinates instead of double counting size', () => {
    const [c] = clusterPixels([px(5, 5, 0.2), px(5, 5, 0.3)], 20, 20)
    expect(c.size).toBe(1)
    expect(c.weight).toBeCloseTo(0.5, 6)
  })

  it('orders by size, then by weight', () => {
    const clusters = clusterPixels([px(1, 1, 0.1), px(10, 10, 0.9), px(15, 15), px(16, 15)], 20, 20)
    expect(clusters[0].size).toBe(2)
    expect(clusters[1].weight).toBeCloseTo(0.9, 6)
    expect(clusters[2].weight).toBeCloseTo(0.1, 6)
  })

  it('does not join pixels across the left and right edges', () => {
    const clusters = clusterPixels([px(0, 5), px(19, 5)], 20, 10)
    expect(clusters).toHaveLength(2)
  })

  it('drops pixels outside the frame', () => {
    expect(clusterPixels([px(-1, 0), px(20, 0), px(0, 10)], 20, 10)).toEqual([])
  })
})
