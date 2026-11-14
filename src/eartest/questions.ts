import { MINOR_PENTATONIC, scaleNotes } from '../mapping/scales.ts'
import type { Moment, MomentSet } from './types.ts'

export type Difficulty = 'easy' | 'medium' | 'hard'
export type Side = 'left' | 'right'

/** How far apart the two tones are, in scale steps. Never zero. */
export const STEP_RANGE: Record<Difficulty, [number, number]> = {
  easy: [5, 15],
  medium: [3, 4],
  hard: [1, 2],
}
export const QUESTIONS_PER_ROUND = 8
/** The 16 notes a value is placed on: three octaves of A minor pentatonic. */
export const TEST_SCALE = scaleNotes(45, MINOR_PENTATONIC, 3)

export interface Question {
  set: MomentSet
  left: Moment
  right: Moment
  leftMidi: number
  rightMidi: number
  ask: 'more' | 'less'
  correct: Side
}

/** A small seeded random number generator, so rounds can be replayed in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Scale step (0..15) for a moment, placed within its own track's range. */
export function stepOf(set: MomentSet, value: number): number {
  const values = set.moments.map((m) => m.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const p = hi > lo ? (value - lo) / (hi - lo) : 0.5
  return Math.round(p * (TEST_SCALE.length - 1))
}

/** Every pair of moments in a set whose tones are the right distance apart. */
export function eligiblePairs(set: MomentSet, difficulty: Difficulty): [Moment, Moment][] {
  const [lo, hi] = STEP_RANGE[difficulty]
  const pairs: [Moment, Moment][] = []
  for (let i = 0; i < set.moments.length; i++) {
    for (let j = i + 1; j < set.moments.length; j++) {
      const d = Math.abs(stepOf(set, set.moments[i].value) - stepOf(set, set.moments[j].value))
      if (d >= lo && d <= hi) pairs.push([set.moments[i], set.moments[j]])
    }
  }
  return pairs
}

/** One question: two moments from the same track, a random side each, more or less. */
export function makeQuestion(set: MomentSet, difficulty: Difficulty, random: () => number): Question | null {
  const pairs = eligiblePairs(set, difficulty)
  if (!pairs.length) return null
  const [a, b] = pairs[Math.floor(random() * pairs.length)]
  const [left, right] = random() < 0.5 ? [a, b] : [b, a]
  const ask = random() < 0.5 ? 'more' : 'less'
  const leftMore = left.value > right.value
  return {
    set,
    left,
    right,
    leftMidi: TEST_SCALE[stepOf(set, left.value)],
    rightMidi: TEST_SCALE[stepOf(set, right.value)],
    ask,
    correct: (ask === 'more') === leftMore ? 'left' : 'right',
  }
}

/** A round of questions, taking the tracks in turn. */
export function makeRound(sets: MomentSet[], difficulty: Difficulty, random: () => number): Question[] {
  const usable = sets.filter((s) => eligiblePairs(s, difficulty).length)
  const round: Question[] = []
  for (let i = 0; usable.length && round.length < QUESTIONS_PER_ROUND; i++) {
    const q = makeQuestion(usable[i % usable.length], difficulty, random)
    if (q) round.push(q)
  }
  return round
}

/** What really happened, spoken after an answer. */
export function revealText(q: Question, title: string): string {
  const fmt = (m: Moment) => `${m.label}, ${m.value.toFixed(m.value < 10 ? 2 : 1)} ${q.set.unit}`
  return `${title}. Left: ${fmt(q.left)}. Right: ${fmt(q.right)}.`
}

const STORAGE_KEY = 'earth-jukebox:ear-test-best'

/** Best scores per difficulty from earlier visits; empty if storage is unavailable. */
export function loadBest(storage: Pick<Storage, 'getItem'> | undefined): Partial<Record<Difficulty, number>> {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

/** Save a score if it beats the best for its difficulty. Returns the new bests. */
export function saveBest(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  difficulty: Difficulty,
  score: number,
): Partial<Record<Difficulty, number>> {
  const best = loadBest(storage)
  if (score > (best[difficulty] ?? -1)) best[difficulty] = score
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(best))
  } catch {
    // Private mode or storage full: keep playing without saving.
  }
  return best
}
