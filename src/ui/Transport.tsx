import type { JukeboxPlayer } from '../player.ts'
import { useJukebox } from '../store.ts'
import { formatClock, formatSpokenTime } from './format.ts'
import { Groove } from './Groove.tsx'
import { Rolling } from './Rolling.tsx'

/** Play / pause button, position slider and clock. Subscribes to the fast-changing time itself. */
export function Transport({ player }: { player: JukeboxPlayer }) {
  const status = useJukebox((s) => s.status)
  const time = useJukebox((s) => s.time)
  const duration = useJukebox((s) => s.duration)
  return (
    <div className="controls">
      <button
        type="button"
        className="play"
        onClick={() => void player.toggle()}
        disabled={status === 'error'}
      >
        {status === 'playing' ? 'Pause' : 'Play'}
      </button>
      <label className="seek">
        <Groove />
        <span className="visually-hidden">Position in track</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          disabled={!duration}
          aria-valuetext={`${formatSpokenTime(time)} of ${formatSpokenTime(duration)}`}
          onChange={(e) => player.seekTo(Number(e.currentTarget.value), false)}
        />
      </label>
      <span className="clock" aria-hidden="true">
        <Rolling text={`${formatClock(time)} / ${formatClock(duration)}`} minInterval={0} />
      </span>
    </div>
  )
}
