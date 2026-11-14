/** "1:05" for 65 seconds. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "1 minute 5 seconds", for speech. */
export function formatSpokenTime(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const m = Math.floor(s / 60)
  const rest = s % 60
  const parts: string[] = []
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`)
  if (rest || !m) parts.push(`${rest} second${rest === 1 ? '' : 's'}`)
  return parts.join(' ')
}
