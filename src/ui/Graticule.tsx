import type { Track } from '../tracks/types.ts'
import { graticuleTicks } from './graticuleTicks.ts'

function label(deg: number, pos: string, neg: string): string {
  if (deg === 0) return '0°'
  return `${Math.abs(deg)}°${deg > 0 ? pos : neg}`
}

/**
 * Scope-style ticks along the inside edges of the video. Longitude and
 * latitude are labelled only where the track's config says that axis is
 * geographic and its edges were measured; otherwise the ticks are plain
 * eighths. Decorative for sighted viewers: hidden from screen readers.
 */
export function Graticule({ track }: { track: Track }) {
  const geo = track.geographic
  const lon = geo.x && geo.lon ? graticuleTicks(geo.lon[0], geo.lon[1]) : null
  const lat = geo.y && geo.lat ? graticuleTicks(geo.lat[0], geo.lat[1]) : null
  const plain = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ at: i / 8, deg: NaN }))
  const xs = lon ?? plain
  const ys = lat ?? plain
  return (
    <div className="graticule" aria-hidden="true">
      {xs.map((t) => (
        <span key={`x${t.at}`} className="tick x" style={{ left: `${t.at * 100}%` }}>
          {lon ? <span className="tick-label">{label(t.deg, 'E', 'W')}</span> : null}
        </span>
      ))}
      {ys.map((t) => (
        <span key={`y${t.at}`} className="tick y" style={{ top: `${t.at * 100}%` }}>
          {lat ? <span className="tick-label">{label(t.deg, 'N', 'S')}</span> : null}
        </span>
      ))}
    </div>
  )
}
