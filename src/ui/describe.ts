import type { FrameFeatures } from '../analysis/types.ts'
import type { Track } from '../tracks/types.ts'

const THIRDS_X = { geo: ['the west', 'the middle longitudes', 'the east'], screen: ['the left', 'the middle', 'the right'] }
const THIRDS_Y = { geo: ['the north', 'the tropics', 'the south'], screen: ['the top', 'the middle', 'the bottom'] }

/** Mean of each third of a list of band values. */
function thirds(values: number[]): number[] {
  const n = values.length
  return [0, 1, 2].map((i) => {
    const part = values.slice(Math.floor((i * n) / 3), Math.floor(((i + 1) * n) / 3))
    return part.length ? part.reduce((a, b) => a + b, 0) / part.length : 0
  })
}

const argmax = (a: number[]) => a.indexOf(Math.max(...a))

/**
 * A spoken description of the frame. Short: date, the track's own numbers and
 * where the picture is brightest. Detailed: adds brightness by third, colour and
 * how much is changing. Uses compass words only on geographic axes.
 */
export function describeFrame(
  track: Track,
  f: FrameFeatures,
  date: string | null,
  info: Record<string, string>,
  detailed: boolean,
): string {
  const xWords = track.geographic.x ? THIRDS_X.geo : THIRDS_X.screen
  const yWords = track.geographic.y ? THIRDS_Y.geo : THIRDS_Y.screen
  const cols = thirds(f.columnLuminance)
  const rows = thirds(f.rowLuminance)
  const parts: string[] = []
  if (date) parts.push(`${date}.`)
  for (const [k, v] of Object.entries(info)) parts.push(`${k}: ${v}.`)
  parts.push(`Brightest towards ${yWords[argmax(rows)]} and ${xWords[argmax(cols)]}.`)
  if (!track.geographic.x) parts.push('The globe turns, so these are screen positions, not places.')
  if (detailed) {
    const pct = (v: number) => `${Math.round(v * 100)}`
    parts.push(
      `Brightness by third, ${xWords.join(', ')}: ${cols.map(pct).join(', ')} percent.`,
      `By third, ${yWords.join(', ')}: ${rows.map(pct).join(', ')} percent.`,
      f.dominantHues[0] ? `Main colour hue ${Math.round(f.dominantHues[0].hue)} degrees.` : 'Almost no colour.',
      `Changing ${f.diff > 0.01 ? 'quickly' : f.diff > 0.002 ? 'slowly' : 'hardly at all'} from frame to frame.`,
    )
  }
  return parts.join(' ')
}
