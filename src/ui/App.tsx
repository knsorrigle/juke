import { useEffect, useMemo, useRef, useState } from 'react'
import { JukeboxPlayer } from '../player.ts'
import { useJukebox } from '../store.ts'
import { getTrack, tracks } from '../tracks/index.ts'
import type { Track } from '../tracks/types.ts'
import { Announcer } from './Announcer.tsx'
import { DebugPanel } from './DebugPanel.tsx'
import { EarTestCurtain, EarTestPanel } from './EarTest.tsx'
import { Graticule } from './Graticule.tsx'
import { Halo } from './halo/Halo.tsx'
import { Captions, ExploreLayer } from './Explore.tsx'
import { HudBottom, HudTop, ModeSwitch } from './Hud.tsx'
import { Readout } from './Readout.tsx'
import { RippleCanvas } from './RippleCanvas.tsx'
import { TrackList } from './TrackList.tsx'
import { Transport } from './Transport.tsx'
import { useAccent } from './useAccent.ts'
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
  // The screen keeps each video's own shape (2:1 maps, 16:9 globe and night lights).
  const [aspect, setAspect] = useState(2)

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
  useAccent()

  const choose = (next: Track) => {
    const video = videoRef.current
    player.selectTrack(next, Boolean(video && !video.paused))
  }

  return (
    <>
      <a className="skip-link" href="#player">
        Skip to player
      </a>
      <div className="console">
        <header className="masthead">
          <div className="brand">
            <h1>
              Earth <span>Jukebox</span>
            </h1>
            <p>NASA Earth visualizations, played as sound from the video frames.</p>
          </div>
          <ModeSwitch player={player} />
        </header>

        <main className="deck">
          <section id="player" aria-labelledby="track-title" tabIndex={-1}>
            <HudTop track={track} />
            <div className="viewport" style={{ '--aspect': aspect } as React.CSSProperties}>
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
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight)
                }}
              />
              <Graticule track={track} />
              <RippleCanvas />
              <ScanBeam />
              <ExploreLayer player={player} />
              <EarTestCurtain />
              <Halo engine={player.engine} />
              <span className="crop tl" aria-hidden="true" />
              <span className="crop tr" aria-hidden="true" />
              <span className="crop bl" aria-hidden="true" />
              <span className="crop br" aria-hidden="true" />
            </div>
            <HudBottom track={track} />
            <Transport player={player} />
            <Captions />
            <EarTestPanel player={player} />
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        </main>

        <aside className="shelf" aria-label="Record shelf">
          <h3>Records</h3>
          <TrackList tracks={tracks} onChoose={choose} />
        </aside>

        <div className="lower">
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
            <SoloStatus player={player} />
          </section>

          <section aria-labelledby="about-title">
            <h2 id="about-title">The picture</h2>
            <p className="muted">{track.description}</p>
            <h3>What it shows</h3>
            <p id="track-alt">{track.altText}</p>
          </section>

          <section aria-labelledby="keys-title">
            <h2 id="keys-title">Keys</h2>
            <p className="hint">
              {loading ? 'Loading video. ' : ''}
              <kbd>Space</kbd> plays and pauses. <kbd>Left</kbd> and <kbd>Right</kbd> skip 5
              seconds. <kbd>L</kbd> explains the sounds. <kbd>F</kbd> describes the frame,{' '}
              <kbd>G</kbd> in more detail, <kbd>H</kbd> reads the corner readouts, <kbd>C</kbd>{' '}
              switches high contrast. <kbd>2</kbd> explores the paused picture with a cursor: arrows
              move it (with <kbd>Shift</kbd>, 10 at a time), <kbd>I</kbd> says what is under it,{' '}
              <kbd>1</kbd> or <kbd>Esc</kbd> goes back. <kbd>4</kbd> starts the Ear Test. Sound
              starts when you press play.
            </p>
          </section>

          {showDebug ? <DebugPanel /> : null}

          <section aria-labelledby="readout-title">
            <h2 id="readout-title">Live readout</h2>
            <Readout />
          </section>

          <footer>
            <p>
              Visualization: {track.credit}. <a href={track.sourceUrl}>Source page on NASA SVS</a>.
              Sound is generated in your browser from the video; it is not part of NASA's
              visualization.
            </p>
            {track.id === 'lightning' ? (
              <p>
                Date labels are NASA's. The source file lists 2003 for dates after December 2022;
                they are shown here as 2023.
              </p>
            ) : null}
          </footer>
        </div>
      </div>

      <Announcer />
    </>
  )
}
