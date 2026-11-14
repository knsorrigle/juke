import { useJukebox } from '../store.ts'

function Bars({ values, max, label, hue }: { values: number[]; max: number; label: string; hue?: boolean }) {
  return (
    <div className="bars" role="img" aria-label={label}>
      {values.map((v, i) => (
        <span
          key={i}
          style={{
            height: `${Math.min(100, (v / max) * 100)}%`,
            background: hue ? `hsl(${(i + 0.5) * (360 / values.length)} 80% 60%)` : undefined,
          }}
        />
      ))}
    </div>
  )
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`
const db = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} dB` : 'silent')

/**
 * Live numbers from the analysis and the audio engine. Not a live region: it
 * updates several times a second, so a screen reader reads it only on request.
 */
export function Readout() {
  const r = useJukebox((s) => s.readout)
  const audioOn = useJukebox((s) => s.audioOn)
  if (!r) return <p className="muted">Waiting for the first video frame.</p>
  const colMax = Math.max(0.02, ...r.columnLuminance)
  const rowMax = Math.max(0.02, ...r.rowLuminance)
  const hueMax = Math.max(0.05, ...r.hueHistogram)
  return (
    <div className="readout" aria-live="off">
      <dl>
        <div>
          <dt>New lightning this pulse</dt>
          <dd>
            {r.tickFlashCount} pixels in {r.tickClusters} clusters, {r.tickNotes} notes played
          </dd>
        </div>
        <div>
          <dt>Hum level</dt>
          <dd>{Math.round(r.padLevel * 100)}%</dd>
        </div>
        <div>
          <dt>Newly lit pixels this frame</dt>
          <dd>{r.risingPixels}</dd>
        </div>
        <div>
          <dt>Yellow in frame</dt>
          <dd>{pct(r.signalMean)}</dd>
        </div>
        <div>
          <dt>Mean brightness</dt>
          <dd>{pct(r.meanLuminance)}</dd>
        </div>
        <div>
          <dt>Change since last frame</dt>
          <dd>{pct(r.diff)}</dd>
        </div>
        <div>
          <dt>Bright spots</dt>
          <dd>{r.brightSpots}</dd>
        </div>
        <div>
          <dt>Centre of brightness</dt>
          <dd>
            {r.centroid
              ? `${Math.round(r.centroid.x * 100)}% across, ${Math.round(r.centroid.y * 100)}% down`
              : 'none'}
          </dd>
        </div>
        <div>
          <dt>Main colour</dt>
          <dd>{r.dominantHue === null ? 'none' : `hue ${Math.round(r.dominantHue)} degrees`}</dd>
        </div>
        <div>
          <dt>Sound output</dt>
          <dd>{audioOn ? `${db(r.outputDb)} now, ${db(r.peakDb)} peak, ${r.notesTotal} notes` : 'off until you press play'}</dd>
        </div>
        <div>
          <dt>Analysis</dt>
          <dd>
            {r.width} x {r.height} pixels, {r.analysisMs.toFixed(2)} ms per frame
            {r.exactFrames ? '' : ' (fallback timing)'}
          </dd>
        </div>
      </dl>
      <div className="charts">
        <figure>
          <Bars values={r.columnLuminance} max={colMax} label="Brightness in 16 bands, west to east" />
          <figcaption>Brightness, west to east</figcaption>
        </figure>
        <figure>
          <Bars values={r.rowLuminance} max={rowMax} label="Brightness in 8 bands, north to south" />
          <figcaption>Brightness, north to south</figcaption>
        </figure>
        <figure>
          <Bars values={r.hueHistogram} max={hueMax} label="Colour histogram in 12 hue bands" hue />
          <figcaption>Colours present</figcaption>
        </figure>
      </div>
    </div>
  )
}
