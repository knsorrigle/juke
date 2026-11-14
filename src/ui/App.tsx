import { useEffect, useMemo, useRef } from 'react'
import { JukeboxPlayer } from '../player.ts'
import { useJukebox } from '../store.ts'
import { getTrack, tracks } from '../tracks/index.ts'
import type { Track } from '../tracks/types.ts'
import { Announcer } from './Announcer.tsx'
import { DebugPanel } from './DebugPanel.tsx'
import { EarTestCurtain, EarTestPanel } from './EarTest.tsx'
import { Hud } from './Hud.tsx'
import { RippleCanvas } from './RippleCanvas.tsx'
import { Captions, ExploreLayer } from './Explore.tsx'
import { Readout } from './Readout.tsx'
import { TrackList } from './TrackList.tsx'
import { DateBadge, Transport } from './Transport.tsx'
import { useKeyboard } from './useKeyboard.ts'

const showDebug = new URLSearchParams(window.location.search).has('debug')

/** The scanner beam, drawn over the video on tracks that have one. */
function ScanBeam() {
  const scanX = useJukebox((s) => s.scanX)
  if (scanX === null) return null
  return <div className="scan-beam" aria-hidden="true" style={{ left: `${scanX * 100}%` }} />
}

/** Which instrument is soloed, if any, as visible text. */
function SoloStatus({ player }: { player: JukeboxPlayer }) {
  const solo = useJukebox((s) => s.solo)
  useJukebox((s) => s.trackId) // re-render on track change
  const instruments = player.soloable
  if (!instruments.length) return null
  return (
    <p className="hint">
      Instruments (Shift and a number to hear one alone):{' '}
      {instruments.map((i, n) => `${n + 1} ${i.label}`).join(', ')}.{' '}
      {solo ? (
        <strong>Solo: {instruments.find((i) => i.id === solo)?.label}.</strong>
      ) : (
        'All playing.'
      )}
    </p>
  )
}

export default function App() {
  const player = useMemo(() => new JukeboxPlayer(tracks[0]), [])
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackId = useJukebox((s) => s.trackId)
  const loading = useJukebox((s) => s.status === 'loading')
  const error = useJukebox((s) => s.error)
  const track = getTrack(trackId) ?? tracks[0]

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

  const choose = (next: Track) => {
    const video = videoRef.current
    player.selectTrack(next, Boolean(video && !video.paused))
  }

  return (
    <>
      <a className="skip-link" href="#player">
        Skip to player
      </a>
      <header className="site-header">
        <h1>Earth Jukebox</h1>
        <p>NASA Earth visualizations turned into sound, live, from the video frames.</p>
      </header>

      <TrackList tracks={tracks} onChoose={choose} />

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
            <RippleCanvas />
            <ScanBeam />
            <Hud track={track} />
            <ExploreLayer player={player} />
            <DateBadge />
            <EarTestCurtain />
          </div>
          <Captions />
          <EarTestPanel player={player} />

          <Transport player={player} />

          <p className="hint">
            {loading ? 'Loading video. ' : ''}
            Keyboard: <kbd>Space</kbd> plays and pauses. <kbd>Left</kbd> and <kbd>Right</kbd> skip 5
            seconds. <kbd>L</kbd> explains the sounds. <kbd>F</kbd> describes the frame,{' '}
            <kbd>G</kbd> in more detail, <kbd>H</kbd> reads the corner readouts, <kbd>C</kbd> switches high contrast. <kbd>2</kbd> explores the paused picture with a cursor:
            arrows move it (with <kbd>Shift</kbd>, 10 at a time), <kbd>I</kbd> says what is under it,{' '}
            <kbd>1</kbd> or <kbd>Esc</kbd> goes back. <kbd>4</kbd> starts the Ear Test. Sound starts
            when you press play.
          </p>
          <SoloStatus player={player} />
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
          <button type="button" className="secondary" onClick={() => player.speakLegend()}>
            What am I hearing?
          </button>
          <ul className="legend">
            {track.legend.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        {showDebug ? <DebugPanel /> : null}

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
        {track.id === 'lightning' ? (
          <p>
            Date labels are NASA's. The source file lists 2003 for dates after December 2022; they
            are shown here as 2023.
          </p>
        ) : null}
      </footer>

      <Announcer />
    </>
  )
}
