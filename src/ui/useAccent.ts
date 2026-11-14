import { useEffect } from 'react'
import { useJukebox } from '../store.ts'
import { TRACK_ACCENTS } from './theme/tokens.ts'

/**
 * Re-tint the page to the active track's legend colour. The CSS registers
 * --accent as a colour, so it glides over 600 ms (instantly with reduced
 * motion). High contrast keeps its own fixed accent.
 */
export function useAccent(): void {
  const trackId = useJukebox((s) => s.trackId)
  const highContrast = useJukebox((s) => s.highContrast)
  useEffect(() => {
    const root = document.documentElement
    if (highContrast) root.style.removeProperty('--accent')
    else root.style.setProperty('--accent', TRACK_ACCENTS[trackId] ?? TRACK_ACCENTS.lightning)
  }, [trackId, highContrast])
}
