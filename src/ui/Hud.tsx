import type { JukeboxPlayer } from '../player.ts'
import { useJukebox } from '../store.ts'
import type { Track } from '../tracks/types.ts'
import { Rolling } from './Rolling.tsx'

const MODE_NAMES = { play: 'Play', explore: 'Explore', eartest: 'Ear Test' } as const

/** Top HUD row above the video: track title and mode on the left, the date on the right. */
export function HudTop({ track }: { track: Track }) {
  const mode = useJukebox((s) => s.mode)
  const dateText = useJukebox((s) => s.dateText)
  const dateCorrected = useJukebox((s) => s.dateCorrected)
  return (
    <div className="hud-row top">
      <div className="hud-title">
        <p className="label" aria-hidden="true">
          {MODE_NAMES[mode]} · {track.projection === 'globe' ? 'Rotating globe' : 'Flat map'}
        </p>
        <h2 id="track-title">{track.title}</h2>
      </div>
      {dateText ? (
        <p className="hud-date">
          <span className="visually-hidden">Date shown: </span>
          <Rolling text={dateText} />
          {dateCorrected ? <span className="date-note">year corrected, see credits</span> : null}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Bottom HUD row below the video: live values on the left, place or the
 * one-line legend on the right. aria-hidden: the H key speaks the same content.
 */
export function HudBottom({ track }: { track: Track }) {
  const mode = useJukebox((s) => s.mode)
  const info = useJukebox((s) => s.readout?.info)
  const probe = useJukebox((s) => s.probeText)
  const values =
    mode === 'explore'
      ? [probe || 'Move the cursor.']
      : Object.entries(info ?? {})
          .slice(0, 2)
          .map(([k, v]) => `${k}: ${v}`)
  return (
    <div className="hud-row bottom" aria-hidden="true">
      <p className="hud-values">
        {values.length ? (
          values.map((v, i) => (
            <span key={i}>
              <Rolling text={v} />
            </span>
          ))
        ) : (
          <span>Press play.</span>
        )}
      </p>
      <p className="hud-legend">{track.legendShort}</p>
    </div>
  )
}

/** Mode switches: Play (1), Explore (2), Ear Test (3). The keys still work on their own. */
export function ModeSwitch({ player }: { player: JukeboxPlayer }) {
  const mode = useJukebox((s) => s.mode)
  const go = (next: 'play' | 'explore' | 'eartest') => {
    if (next === mode) return
    if (next === 'play') {
      player.exitExplore()
      player.exitEarTest()
    } else if (next === 'explore') {
      player.exitEarTest(false)
      void player.enterExplore()
    } else {
      void player.enterEarTest()
    }
  }
  const buttons: { id: 'play' | 'explore' | 'eartest'; label: string; key: string }[] = [
    { id: 'play', label: 'Play', key: '1' },
    { id: 'explore', label: 'Explore', key: '2' },
    { id: 'eartest', label: 'Ear Test', key: '3' },
  ]
  return (
    <div className="modes" role="group" aria-label="Mode">
      {buttons.map((b) => (
        <button key={b.id} type="button" aria-pressed={mode === b.id} onClick={() => go(b.id)}>
          <kbd aria-hidden="true">{b.key}</kbd>
          {b.label}
        </button>
      ))}
    </div>
  )
}
