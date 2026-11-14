import { useRef } from 'react'
import { useJukebox } from '../store.ts'
import type { Track } from '../tracks/types.ts'

/**
 * The track switcher: one button per track. Up and Down move between them
 * (wrapping), Home and End jump to the ends, Enter or Space plays the focused
 * track. Only the current track is in the Tab order.
 */
export function TrackList({ tracks, onChoose }: { tracks: Track[]; onChoose: (track: Track) => void }) {
  const trackId = useJukebox((s) => s.trackId)
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const keys = ['ArrowUp', 'ArrowDown', 'Home', 'End']
    if (!keys.includes(event.key)) return
    const current = refs.current.findIndex((b) => b === document.activeElement)
    if (current < 0) return
    event.preventDefault()
    const n = tracks.length
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? n - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + n) % n
    refs.current[next]?.focus()
  }

  return (
    <nav aria-labelledby="tracks-title" className="tracks">
      <h2 id="tracks-title" className="visually-hidden">
        Tracks
      </h2>
      <p className="hint" id="tracks-hint">
        Up and Down choose a track, Enter plays it.
      </p>
      <ul onKeyDown={onKeyDown} aria-describedby="tracks-hint">
        {tracks.map((t, i) => (
          <li key={t.id}>
            <button
              type="button"
              ref={(el) => {
                refs.current[i] = el
              }}
              aria-current={t.id === trackId ? 'true' : undefined}
              tabIndex={t.id === trackId ? 0 : -1}
              onClick={() => onChoose(t)}
            >
              {t.shortTitle}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
