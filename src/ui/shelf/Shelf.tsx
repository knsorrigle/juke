import { animate, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../../audio/engine.ts'
import { useJukebox } from '../../store.ts'
import type { Track } from '../../tracks/types.ts'
import { frameLoop } from '../frameLoop.ts'
import { TRACK_LABEL_COLORS } from '../theme/tokens.ts'
import { Disc } from './Disc.tsx'

/** 33 1/3 rpm at full output level, in degrees per second. */
const FULL_SPEED = (100 / 3) * 6

/**
 * The record shelf. Each track is a vinyl disc in a sleeve, and a real button.
 * Up and Down move between records (wrapping), Home and End jump to the ends,
 * Enter or Space plays one. The chosen disc slides out of its sleeve and spins
 * while playing, faster when the music is louder; a stylus drops on it with the
 * needle-drop sound. With reduced motion nothing spins or slides.
 */
export function Shelf({
  tracks,
  onChoose,
  engine,
}: {
  tracks: Track[]
  onChoose: (track: Track) => void
  engine: AudioEngine
}) {
  const trackId = useJukebox((s) => s.trackId)
  const dropId = useJukebox((s) => s.dropId)
  const reduced = useReducedMotion()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const spinner = useRef<HTMLSpanElement | null>(null)
  const stylus = useRef<HTMLSpanElement | null>(null)

  // Spin the chosen disc with the output level, in the page's one animation loop.
  useEffect(() => {
    if (reduced) return
    let angle = 0
    let speed = 0
    return frameLoop.subscribe((_now, dt) => {
      const el = spinner.current
      if (!el) return
      const playing = useJukebox.getState().status === 'playing'
      const db = engine.level().db
      const level = playing && Number.isFinite(db) ? Math.max(0, Math.min(1, (db + 50) / 40)) : 0
      const target = playing ? FULL_SPEED * (0.35 + 0.65 * level) : 0
      speed += (target - speed) * Math.min(1, dt * 3) // spin up and down like a platter
      angle = (angle + speed * dt) % 360
      el.style.transform = `rotate(${angle}deg)`
    })
  }, [engine, reduced])

  // Drop the stylus in time with the needle-drop sound.
  useEffect(() => {
    const el = stylus.current
    if (!el || !dropId || reduced) return
    void animate(el, { rotate: [-28, 2, 0] }, { duration: 0.32, ease: 'easeOut' })
  }, [dropId, reduced])

  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const current = buttons.current.findIndex((b) => b === document.activeElement)
    if (current < 0) return
    event.preventDefault()
    const n = tracks.length
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? n - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + n) % n
    buttons.current[next]?.focus()
  }

  return (
    <nav aria-labelledby="tracks-title" className="tracks shelf-list">
      <h2 id="tracks-title" className="label">
        Records
      </h2>
      <p className="hint" id="tracks-hint">
        Up and Down choose a record, Enter plays it.
      </p>
      <ul onKeyDown={onKeyDown} aria-describedby="tracks-hint">
        {tracks.map((t, i) => {
          const current = t.id === trackId
          return (
            <li key={t.id}>
              <button
                type="button"
                ref={(el) => {
                  buttons.current[i] = el
                }}
                className="record"
                aria-current={current ? 'true' : undefined}
                tabIndex={current ? 0 : -1}
                onClick={() => onChoose(t)}
              >
                <span className="sleeve-area" aria-hidden="true">
                  <motion.span
                    className="disc"
                    initial={false}
                    animate={{ x: current ? '64%' : '34%' }}
                    transition={reduced ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' }}
                  >
                    <span className="disc-spin" ref={current ? spinner : undefined}>
                      <Disc colors={TRACK_LABEL_COLORS[t.id] ?? ['#888']} number={i + 1} />
                    </span>
                  </motion.span>
                  <span className="sleeve" />
                  {current ? <span className="stylus" ref={stylus} /> : null}
                </span>
                <span className="record-text">
                  <span className="record-number">{String(i + 1).padStart(2, '0')}</span>
                  <span className="record-title">{t.shortTitle}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
