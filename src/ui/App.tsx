import { useEffect, useMemo, useRef } from 'react'
import { JukeboxPlayer } from '../player.ts'
import { useJukebox } from '../store.ts'
import { playableTracks } from '../tracks/index.ts'
import { Announcer } from './Announcer.tsx'
import { Readout } from './Readout.tsx'
import { DateBadge, Transport } from './Transport.tsx'
import { useKeyboard } from './useKeyboard.ts'

const track = playableTracks[0]

export default function App() {
  const player = useMemo(() => new JukeboxPlayer(track), [])
  const videoRef = useRef<HTMLVideoElement>(null)
  const loading = useJukebox((s) => s.status === 'loading')
  const error = useJukebox((s) => s.error)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const detach = player.attach(video)
    if (import.meta.env.DEV) {
      // For debugging from the browser console.
      Object.assign(window, { __jukebox: { player, store: useJukebox } })
    }
    return detach
  }, [player])

  useKeyboard(player)

  return (
    <>
      <a className="skip-link" href="#player">
        Skip to player
      </a>
      <header className="site-header">
        <h1>Earth Jukebox</h1>
        <p>NASA Earth visualizations turned into sound, live, from the video frames.</p>
      </header>

      <main>
        <section id="player" aria-labelledby="track-title" tabIndex={-1}>
          <h2 id="track-title">{track.title}</h2>
          <p className="lede">{track.description}</p>

          <div className="stage">
            <video
              ref={videoRef}
              src={track.videoSrc}
              muted
              loop
              playsInline
              preload="auto"
              aria-label={`${track.title}: video`}
              aria-describedby="track-alt"
              onClick={() => void player.toggle()}
            />
            <DateBadge />
          </div>

          <Transport player={player} />

          <p className="hint">
            {loading ? 'Loading video. ' : ''}
            Keyboard: <kbd>Space</kbd> plays and pauses. <kbd>Left</kbd> and <kbd>Right</kbd> arrows
            skip 5 seconds. Sound starts when you press play.
          </p>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}

          <h3>What the picture shows</h3>
          <p id="track-alt">{track.altText}</p>
        </section>

        <section aria-labelledby="legend-title">
          <h2 id="legend-title">What you are hearing</h2>
          <ul className="legend">
            {track.legend.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="readout-title">
          <h2 id="readout-title">Live readout</h2>
          <Readout />
        </section>
      </main>

      <footer>
        <p>
          Visualization: {track.credit}. <a href={track.sourceUrl}>Source page on NASA SVS</a>.
          Sound is generated in your browser from the video; it is not part of NASA's visualization.
        </p>
        <p>
          Date labels are NASA's. The source file lists 2003 for dates after December 2022; they are
          shown here as 2023.
        </p>
      </footer>

      <Announcer />
    </>
  )
}
