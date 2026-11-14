import { useState } from 'react'
import type { Knobs } from '../mapping/types.ts'
import { useJukebox } from '../store.ts'

const RANGES: { key: keyof Knobs; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'maxNotes', label: 'Max notes per pulse', min: 0, max: 6, step: 1, unit: '' },
  { key: 'humDb', label: 'Hum level', min: -12, max: 12, step: 0.5, unit: ' dB' },
  { key: 'panWidth', label: 'Stereo width', min: 0, max: 1, step: 0.05, unit: '' },
  { key: 'tempo', label: 'Tempo', min: 60, max: 160, step: 1, unit: ' bpm' },
  { key: 'reverb', label: 'Reverb', min: 0, max: 1, step: 0.05, unit: '' },
]

/** Hidden tuning panel, shown with ?debug in the address. Changes apply live. */
export function DebugPanel() {
  const trackId = useJukebox((s) => s.trackId)
  const knobs = useJukebox((s) => s.knobs[s.trackId])
  const setKnob = useJukebox((s) => s.setKnob)
  const [copied, setCopied] = useState(false)
  if (!knobs) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ [trackId]: knobs }, null, 2))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <section aria-labelledby="debug-title" className="debug">
      <h2 id="debug-title">Tuning: {trackId}</h2>
      {RANGES.map((r) => (
        <label key={r.key} className="knob">
          <span>
            {r.label}: <output>{knobs[r.key]}{r.unit}</output>
          </span>
          <input
            type="range"
            min={r.min}
            max={r.max}
            step={r.step}
            value={knobs[r.key]}
            onChange={(e) => setKnob(trackId, r.key, Number(e.currentTarget.value))}
          />
        </label>
      ))}
      <button type="button" onClick={() => void copy()}>
        Copy settings
      </button>{' '}
      <span role="status">{copied ? 'Copied.' : ''}</span>
    </section>
  )
}
