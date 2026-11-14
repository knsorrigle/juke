import type { Difficulty } from '../eartest/questions.ts'
import type { JukeboxPlayer } from '../player.ts'
import { useJukebox } from '../store.ts'

const LEVELS: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'easy', label: 'Easy', hint: 'tones 5 or more notes apart' },
  { id: 'medium', label: 'Medium', hint: '3 or 4 notes apart' },
  { id: 'hard', label: 'Hard', hint: '1 or 2 notes apart' },
]

/** Covers the video during the Ear Test, so the picture gives nothing away. */
export function EarTestCurtain() {
  const mode = useJukebox((s) => s.mode)
  if (mode !== 'eartest') return null
  return (
    <div className="curtain" aria-hidden="true">
      <p>Ear Test: listen, no peeking.</p>
    </div>
  )
}

/** The Ear Test panel: difficulty, the current question, answer buttons and the reveal. */
export function EarTestPanel({ player }: { player: JukeboxPlayer }) {
  const mode = useJukebox((s) => s.mode)
  const view = useJukebox((s) => s.earTest)
  if (mode !== 'eartest') return null
  const asking = view.phase === 'asking'
  return (
    <section aria-labelledby="ear-title" className="ear-test">
      <h2 id="ear-title">Ear Test</h2>
      <p className="hint">
        Two tones, left ear then right. A higher tone means more. Answer with <kbd>Left</kbd> or{' '}
        <kbd>Right</kbd>. <kbd>Space</kbd> starts, replays the tones or goes on. <kbd>1</kbd> or{' '}
        <kbd>Esc</kbd> goes back to the music. Headphones help.
      </p>
      <fieldset disabled={asking || view.phase === 'revealed'}>
        <legend>Difficulty</legend>
        {LEVELS.map((l) => (
          <label key={l.id} className="radio">
            <input
              type="radio"
              name="difficulty"
              checked={view.difficulty === l.id}
              onChange={() => player.setDifficulty(l.id)}
            />
            {l.label} <span className="muted">({l.hint}; best {view.best[l.id] ?? 'none yet'})</span>
          </label>
        ))}
      </fieldset>
      {view.phase === 'setup' ? (
        <button type="button" className="play" onClick={() => player.startRound()}>
          Start
        </button>
      ) : null}
      {view.prompt ? <p className="prompt">{view.prompt}</p> : null}
      {asking ? (
        <div className="answer-row">
          <button type="button" onClick={() => player.answer('left')}>
            Left
          </button>
          <button type="button" className="secondary" onClick={() => player.playTones()}>
            Hear again
          </button>
          <button type="button" onClick={() => player.answer('right')}>
            Right
          </button>
        </div>
      ) : null}
      {view.phase === 'revealed' ? (
        <>
          <p className="reveal">{view.reveal}</p>
          <button type="button" className="play" onClick={() => player.earSpace()}>
            {view.index + 1 < view.total ? 'Next question' : 'See score'}
          </button>
        </>
      ) : null}
      {view.phase === 'done' ? (
        <>
          <p className="prompt">
            Score: {view.score} out of {view.total} on {view.difficulty}. Best: {view.best[view.difficulty]}.
          </p>
          <button type="button" className="play" onClick={() => player.startRound()}>
            Play again
          </button>
        </>
      ) : null}
      <p className="hint">
        Score so far: {view.score} of {view.total || 8}.
      </p>
    </section>
  )
}
