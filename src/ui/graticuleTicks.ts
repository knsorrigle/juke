const STEP = 30

/** Ticks every 30 degrees between two edge values, as fractions 0..1 along the edge. */
export function graticuleTicks(from: number, to: number): { at: number; deg: number }[] {
  const out: { at: number; deg: number }[] = []
  const lo = Math.ceil(Math.min(from, to) / STEP) * STEP
  for (let d = lo; d <= Math.max(from, to); d += STEP) {
    const at = (d - from) / (to - from)
    if (at > 0.02 && at < 0.98) out.push({ at, deg: d })
  }
  return out
}
