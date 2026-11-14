import type { JukeboxPlayer } from '../player.ts'
import { useJukebox } from '../store.ts'

/**
 * The Explore cursor drawn over the video, and the surface that turns pointer
 * and touch positions into cursor moves. Hidden from screen readers: the
 * same information is spoken by the I key and shown in the caption bar.
 */
export function ExploreLayer({ player }: { player: JukeboxPlayer }) {
  const mode = useJukebox((s) => s.mode)
  const cursor = useJukebox((s) => s.cursor)
  if (mode !== 'explore') return null
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    player.setCursorAt((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height)
  }
  return (
    <div
      className="explore-layer"
      aria-hidden="true"
      onPointerDown={move}
      onPointerMove={move}
    >
      <div
        className="explore-cursor"
        style={{
          left: `${(cursor.col / cursor.cols) * 100}%`,
          top: `${(cursor.row / cursor.rows) * 100}%`,
          width: `${100 / cursor.cols}%`,
          height: `${100 / cursor.rows}%`,
        }}
      />
    </div>
  )
}

/**
 * Visible captions for people who cannot hear: what is sounding now, and the
 * last thing the screen reader was told. aria-hidden because the live region
 * already speaks the same messages.
 */
export function Captions() {
  const sounding = useJukebox((s) => s.sounding)
  const said = useJukebox((s) => s.announcement.text)
  const mode = useJukebox((s) => s.mode)
  return (
    <div className="captions" aria-hidden="true">
      <p>
        <span className="cap-label">{mode === 'explore' ? 'Explore' : 'Sound'}</span> {sounding || 'Silent.'}
      </p>
      {said ? (
        <p className="said">
          <span className="cap-label">Said</span> {said}
        </p>
      ) : null}
    </div>
  )
}
