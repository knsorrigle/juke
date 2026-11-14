import { describe, expect, it } from 'vitest'
import { MOMENT_SETS } from './moments.ts'
import {
  type Difficulty,
  STEP_RANGE,
  TEST_SCALE,
  eligiblePairs,
  loadBest,
  makeRound,
  revealText,
  saveBest,
  seededRandom,
  stepOf,
} from './questions.ts'
import type { MomentSet } from './types.ts'

const set: MomentSet = {
  trackId: 'lightning',
  question: 'lightning',
  unit: 'pixels',
  moments: [0, 1, 2, 4, 8, 15].map((value, i) => ({ time: i, value, label: `m${i}` })),
}

describe('Ear Test questions', () => {
  it('places values on 16 scale steps within the track range', () => {
    expect(stepOf(set, 0)).toBe(0)
    expect(stepOf(set, 15)).toBe(15)
    expect(stepOf(set, 8)).toBe(8)
    expect(TEST_SCALE).toHaveLength(16)
  })

  it('pairs moments only at the distance for each difficulty, never equal', () => {
    for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
      for (const [a, b] of eligiblePairs(set, d)) {
        const dist = Math.abs(stepOf(set, a.value) - stepOf(set, b.value))
        expect(dist).toBeGreaterThanOrEqual(STEP_RANGE[d][0])
        expect(dist).toBeLessThanOrEqual(STEP_RANGE[d][1])
        expect(dist).toBeGreaterThan(0)
      }
    }
  })

  it('makes a full round of 8 from the real moments at every difficulty, with a correct answer', () => {
    for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
      const round = makeRound(MOMENT_SETS, d, seededRandom(7))
      expect(round).toHaveLength(8)
      for (const q of round) {
        const more = q.left.value > q.right.value ? 'left' : 'right'
        expect(q.correct).toBe(q.ask === 'more' ? more : more === 'left' ? 'right' : 'left')
        expect(q.leftMidi).not.toBe(q.rightMidi)
        // The higher tone is always the larger value.
        expect(q.leftMidi > q.rightMidi).toBe(q.left.value > q.right.value)
      }
      expect(new Set(round.map((q) => q.set.trackId)).size).toBeGreaterThan(2)
    }
  })

  it('reveals both moments in words', () => {
    const [q] = makeRound([set], 'easy', seededRandom(1))
    expect(revealText(q, 'Lightning')).toMatch(/^Lightning\. Left: m\d, [\d.]+ pixels\. Right: m\d, [\d.]+ pixels\.$/)
  })
})

describe('best scores', () => {
  it('keeps the best per difficulty and survives missing or broken storage', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    expect(saveBest(storage, 'easy', 5)).toEqual({ easy: 5 })
    expect(saveBest(storage, 'easy', 3)).toEqual({ easy: 5 })
    expect(saveBest(storage, 'hard', 2)).toEqual({ easy: 5, hard: 2 })
    expect(loadBest(undefined)).toEqual({})
    const broken = { getItem: () => '{not json', setItem: () => { throw new Error('full') } }
    expect(loadBest(broken)).toEqual({})
    expect(saveBest(broken, 'easy', 4)).toEqual({ easy: 4 })
  })
})
