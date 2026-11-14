import { useJukebox } from '../store.ts'
import type { Track } from '../tracks/types.ts'

/**
 * Thin corner readouts over the video. aria-hidden: the H key speaks the same
 * content, so screen reader users are not made to tab through it.
 */
export function Hud({ track }: { track: Track }) {
  const mode = useJukebox((s) => s.mode)
  const info = useJukebox((s) => s.readout?.info)
  const probe = useJukebox((s) => s.probeText)
  if (mode === 'eartest') return null
  const values = mode === 'explore' ? [probe] : Object.entries(info ?? {}).slice(0, 2).map(([k, v]) => `${k}: ${v}`)
  return (
    <div className="hud" aria-hidden="true">
      <p className="hud-tl">
        {mode.toUpperCase()} · {track.shortTitle}
      </p>
      <p className="hud-tr">{track.legendShort}</p>
      {values.length && values[0] ? (
        <p className="hud-br">
          {values.map((v) => (
            <span key={v}>{v}</span>
          ))}
        </p>
      ) : null}
    </div>
  )
}
