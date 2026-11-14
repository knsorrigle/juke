import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { AudioEngine } from '../audio/engine.ts'
import { useJukebox } from '../store.ts'
import { frameLoop } from './frameLoop.ts'

const SEEN_KEY = 'earth-jukebox:intro-seen'

function seenThisSession(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Black screen with "Begin with sound" and "Skip intro". Beginning plays a low
 * drone; the page is revealed through a circle whose radius follows the
 * drone's real gain, and the title fades in at its peak. Escape skips. Shown
 * once per session; with reduced motion there is no reveal.
 */
export function Intro({ engine }: { engine: AudioEngine }) {
  const [open, setOpen] = useState(() => !seenThisSession())
  const [phase, setPhase] = useState<'ask' | 'playing'>('ask')
  const reduced = useReducedMotion()
  const overlay = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const begin = useRef<HTMLButtonElement>(null)

  const close = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Not saved; the intro may show again next visit.
    }
    engine.stopIntro()
    useJukebox.getState().patch({ introOpen: false })
    setOpen(false)
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('button.play')?.focus())
  }

  useEffect(() => {
    useJukebox.getState().patch({ introOpen: open })
    if (open) begin.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const start = async () => {
    try {
      await engine.start()
      useJukebox.getState().patch({ audioOn: true })
    } catch {
      close()
      return
    }
    const seconds = engine.startIntro()
    useJukebox.getState().patch({ cue: { text: 'Low drone swelling', at: performance.now() } })
    useJukebox.getState().announce('Earth Jukebox.')
    if (reduced) {
      close()
      return
    }
    setPhase('playing')
    const started = performance.now()
    let peaked = false
    const stop = frameLoop.subscribe((now) => {
      const el = overlay.current
      if (!el) return
      const level = engine.introLevel()
      // The hole grows with the drone's gain until it covers the whole screen.
      const full = Math.hypot(window.innerWidth, window.innerHeight)
      const sinceStart = (now - started) / 1000
      const radius = sinceStart > 2.4 ? full : level * full * 0.75
      el.style.setProperty('--r', `${radius}px`)
      if (!peaked && level > 0.96 && title.current) {
        peaked = true
        void animate(title.current, { opacity: [0, 1] }, { duration: 0.6, ease: 'easeOut' })
      }
      if (sinceStart > seconds) {
        stop()
        close()
      }
    })
  }

  if (!open) return null
  return (
    <div
      ref={overlay}
      className={`intro ${phase}`}
      role="dialog"
      aria-labelledby="intro-title"
    >
      <div className="intro-inner">
        <h1 id="intro-title" ref={title} className="intro-title" style={{ opacity: phase === 'ask' ? 1 : 0 }}>
          Earth Jukebox
        </h1>
        {phase === 'ask' ? (
          <>
            <p className="intro-lede">NASA Earth visualizations, played as sound. Headphones help.</p>
            <div className="intro-buttons">
              <button ref={begin} type="button" className="play" onClick={() => void start()}>
                Begin with sound
              </button>
              <button type="button" className="secondary" onClick={close}>
                Skip intro
              </button>
            </div>
          </>
        ) : (
          <p className="intro-caption">♪ Low drone swelling. Escape skips.</p>
        )}
      </div>
    </div>
  )
}
