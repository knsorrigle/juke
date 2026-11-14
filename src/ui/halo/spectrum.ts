/**
 * Fold an FFT (decibels per bin, as from an AnalyserNode) into `bands`
 * log-spaced bands between `fMin` and `fMax`, each 0..1. Each band takes its
 * loudest bin, mapped from `floorDb` (0) to `ceilDb` (1).
 */
export function spectrumBands(
  db: ArrayLike<number>,
  sampleRate: number,
  bands = 48,
  fMin = 60,
  fMax = 8000,
  floorDb = -100,
  ceilDb = -25,
): number[] {
  const binHz = sampleRate / (2 * db.length)
  const out: number[] = []
  for (let b = 0; b < bands; b++) {
    const lo = fMin * (fMax / fMin) ** (b / bands)
    const hi = fMin * (fMax / fMin) ** ((b + 1) / bands)
    const i0 = Math.max(0, Math.floor(lo / binHz))
    const i1 = Math.min(db.length - 1, Math.max(i0, Math.ceil(hi / binHz) - 1))
    let peak = -Infinity
    for (let i = i0; i <= i1; i++) if (db[i] > peak) peak = db[i]
    const v = (peak - floorDb) / (ceilDb - floorDb)
    out.push(Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)
  }
  return out
}

/** Fast attack, slow release: bars jump up with a sound and sink back gently. */
export function attackRelease(previous: number, target: number, dt: number, attack = 0.03, release = 0.35): number {
  const tau = target > previous ? attack : release
  return previous + (target - previous) * (1 - Math.exp(-dt / tau))
}
