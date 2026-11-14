import { useJukebox } from '../store.ts'

/**
 * The page's single polite live region. Screen readers speak each new message:
 * the track title, play / pause / seek, and month changes. The live feature
 * readout is deliberately not in here; it changes many times a second.
 */
export function Announcer() {
  const { id, text } = useJukebox((s) => s.announcement)
  // A trailing no-break space on alternate messages makes a repeated message
  // (e.g. "Paused" twice) count as a change, so it is spoken again.
  return (
    <div className="visually-hidden" aria-live="polite" aria-atomic="true" data-testid="announcer">
      {text ? text + (id % 2 ? ' ' : '') : ''}
    </div>
  )
}
