import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import type { Difficulty } from '../eartest/questions.ts'
import type { JukeboxPlayer } from '../player.ts'
import { useJukebox } from '../store.ts'
import { ACTIVITY } from '../tracks/activity.ts'
import { getTrack } from '../tracks/index.ts'

const LEVELS: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'easy', label: 'Easy', hint: '5 or more notes apart' },
  { id: 'medium', label: 'Medium', hint: '3 or 4 notes apart' },
  { id: 'hard', label: 'Hard', hint: '1 or 2 notes apart' },
]

/** The score as tally marks: groups of four strokes crossed by a fifth. */
function Tally({ score, total }: { score: number; total: number }) {
  const groups = Math.ceil(Math.max(score, 1) / 5)
  return (
    <div className="tally">
      <svg viewBox={`0 0 ${groups * 40} 32`} width={groups * 40} height={32} aria-hidden="true">
        {Array.from({ length: score }, (_, i) => {
          const g = Math.floor(i / 5)
          const k = i % 5
          const x0 = g * 40 + 4
          return k < 4 ? (
            <line key={i} x1={x0 + k * 7} y1={4} x2={x0 + k * 7} y2={28} />
          ) : (
            <line key={i} x1={x0 - 3} y1={24} x2={x0 + 25} y2={8} />
          )
        })}
      </svg>
      <span>
        {score} of {total || 8}
      </span>
    </div>
  )
}

/** One moment shown on reveal: the video frame at that time. */
function MomentFrame({ src, time, label, side, correct }: { src: string; time: number; label: string; side: 'left' | 'right'; correct: boolean }) {
  // The right answer is outlined in the accent.
  const ref = useRef<HTMLVideoElement>(null)
  return (
    <figure className={`moment ${correct ? 'answer' : ''}`}>
      <video
        ref={ref}
        src={src}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        onLoadedMetadata={() => {
          if (ref.current) ref.current.currentTime = time
        }}
      />
      <figcaption>
        <span className="pad-letter">{side === 'left' ? 'L' : 'R'}</span> {label}
      </figcaption>
    </figure>
  )
}

/** The groove of the question's track with both moments marked. */
function MarkedGroove({ trackId, left, right }: { trackId: string; left: number; right: number }) {
  const values = ACTIVITY[trackId] ?? []
  if (!values.length) return null
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const n = values.length
  return (
    <svg className="marked-groove" viewBox={`0 0 ${n} 2.6`} preserveAspectRatio="none" aria-hidden="true">
      {values.map((v, i) => {
        const h = 0.1 + 0.85 * (hi > lo ? (v - lo) / (hi - lo) : 0.5)
        return <rect key={i} x={i + 0.15} y={1.3 - h} width={0.7} height={2 * h} />
      })}
      {[
        ['L', left],
        ['R', right],
      ].map(([s, t]) => (
        <line key={s as string} className="mark" x1={t as number} x2={t as number} y1={0} y2={2.6} />
      ))}
    </svg>
  )
}

/**
 * The Ear Test, full screen. The track's video is hidden behind a dark
 * curtain; two huge L and R pads light while their tone plays; the question is
 * set large; the score is kept as tally marks. Answering opens the curtain on
 * the two real moments and marks them on that track's groove. Keys: Left and
 * Right answer, Space starts, replays or moves on, 1 or Escape goes back.
 */
export function EarTestScreen({ player }: { player: JukeboxPlayer }) {
  const mode = useJukebox((s) => s.mode)
  const view = useJukebox((s) => s.earTest)
  const reduced = useReducedMotion()
  const start = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (mode === 'eartest' && view.phase === 'setup') start.current?.focus()
  }, [mode, view.phase])

  if (mode !== 'eartest') return null
  const asking = view.phase === 'asking'
  const revealed = view.phase === 'revealed'
  const m = view.moments
  const mTrack = m ? getTrack(m.trackId) : undefined
  const open = revealed && m && mTrack

  return (
    <section className="ear-screen" aria-labelledby="ear-title">
      <header className="ear-top">
        <h2 id="ear-title" className="label">
          Ear Test
        </h2>
        <Tally score={view.score} total={view.total} />
        <button type="button" className="secondary" onClick={() => player.exitEarTest()}>
          Back to the music <kbd>Esc</kbd>
        </button>
      </header>

      <p className="ear-question">
        {view.phase === 'setup'
          ? 'Two tones, left ear then right. Which shows more?'
          : view.phase === 'done'
            ? `${view.score} out of ${view.total} on ${view.difficulty}.`
            : view.prompt}
      </p>

      <div className="ear-stage">
        {/* The curtain: closed while asking, opens on the reveal. */}
        <motion.div
          className="ear-curtain left"
          aria-hidden="true"
          initial={false}
          animate={{ x: open ? '-100%' : '0%' }}
          transition={reduced ? { duration: 0 } : { duration: 0.7, ease: 'easeInOut' }}
        />
        <motion.div
          className="ear-curtain right"
          aria-hidden="true"
          initial={false}
          animate={{ x: open ? '100%' : '0%' }}
          transition={reduced ? { duration: 0 } : { duration: 0.7, ease: 'easeInOut' }}
        />

        {open ? (
          <div className="ear-reveal">
            <MomentFrame
              src={mTrack.videoSrc}
              time={m.left.time}
              label={m.left.label}
              side="left"
              correct={m.correct === 'left'}
            />
            <MomentFrame
              src={mTrack.videoSrc}
              time={m.right.time}
              label={m.right.label}
              side="right"
              correct={m.correct === 'right'}
            />
            <MarkedGroove trackId={m.trackId} left={m.left.time} right={m.right.time} />
          </div>
        ) : (
          <div className="pads">
            {(['left', 'right'] as const).map((side) => (
              <button
                key={side}
                type="button"
                className={`pad ${view.lit === side ? 'lit' : ''}`}
                disabled={!asking}
                aria-label={side === 'left' ? 'Left' : 'Right'}
                onClick={() => player.answer(side)}
              >
                <span className="pad-letter" aria-hidden="true">
                  {side === 'left' ? 'L' : 'R'}
                </span>
                <span className="pad-key" aria-hidden="true">
                  {side === 'left' ? '← Left arrow' : 'Right arrow →'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="ear-bottom">
        {view.phase === 'setup' || view.phase === 'done' ? (
          <>
            <fieldset className="levels">
              <legend className="label">Difficulty</legend>
              {LEVELS.map((l) => (
                <label key={l.id} className="radio">
                  <input
                    type="radio"
                    name="difficulty"
                    checked={view.difficulty === l.id}
                    onChange={() => player.setDifficulty(l.id)}
                  />
                  {l.label} <span className="muted">· {l.hint} · best {view.best[l.id] ?? '–'}</span>
                </label>
              ))}
            </fieldset>
            <button ref={start} type="button" className="play" onClick={() => player.startRound()}>
              {view.phase === 'done' ? 'Play again' : 'Start'} <kbd>Space</kbd>
            </button>
          </>
        ) : null}
        {asking ? (
          <button type="button" className="secondary" onClick={() => player.playTones()}>
            Hear again <kbd>Space</kbd>
          </button>
        ) : null}
        {revealed ? (
          <>
            <p className="ear-reveal-text">{view.reveal}</p>
            <button type="button" className="play" onClick={() => player.earSpace()}>
              {view.index + 1 < view.total ? 'Next question' : 'See score'} <kbd>Space</kbd>
            </button>
          </>
        ) : null}
      </footer>
    </section>
  )
}
