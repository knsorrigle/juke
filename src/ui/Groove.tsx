import { useJukebox } from '../store.ts'
import { ACTIVITY } from '../tracks/activity.ts'

/**
 * The scrubber's groove: one bar per second of video, as tall as that second
 * is busy (measured from the video beforehand). Each track's own quietest and
 * busiest seconds set the scale, so its busy and quiet stretches stand out.
 * Hidden from screen readers; the slider next to it is the control.
 */
export function Groove() {
  const trackId = useJukebox((s) => s.trackId)
  const time = useJukebox((s) => s.time)
  const duration = useJukebox((s) => s.duration)
  const values = ACTIVITY[trackId]
  if (!values?.length) return null
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const played = duration ? time / duration : 0
  return (
    <svg className="groove" viewBox={`0 0 ${values.length} 1`} preserveAspectRatio="none" aria-hidden="true">
      {values.map((v, i) => {
        const h = 0.12 + 0.88 * (hi > lo ? (v - lo) / (hi - lo) : 0.5)
        return (
          <rect
            key={i}
            x={i + 0.1}
            y={1 - h}
            width={0.8}
            height={h}
            className={(i + 0.5) / values.length <= played ? 'played' : undefined}
          />
        )
      })}
    </svg>
  )
}
