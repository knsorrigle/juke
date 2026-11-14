import {
  createNightLightsRuleset,
  nightPhase,
  nightYear,
  CHANGE_PHASE_END,
} from '../mapping/nightLights.ts'
import { createRunner } from '../mapping/runner.ts'
import { mediaUrl } from './mediaUrl.ts'
import type { TimeDescription, Track } from './types.ts'

const CHANGE_TEXT = 'Change, 2012 to 2023'

export function describeNightLights(time: number): TimeDescription {
  const phase = nightPhase(time)
  if (phase === 'years') {
    const year = String(nightYear(time))
    return { text: year, spoken: year, key: year, minGap: 1.5 }
  }
  if (phase === 'change') {
    return {
      text: CHANGE_TEXT,
      spoken: 'Change map, 2012 to 2023. Rising bells are new lights, falling low tones are lights out.',
      key: 'change',
      minGap: 0,
      urgent: true,
    }
  }
  return time >= CHANGE_PHASE_END
    ? { text: '2012', spoken: 'Back to 2012.', key: 'restart', minGap: 0, urgent: true }
    : { text: '2023', spoken: '2023', key: '2023', minGap: 1.5 }
}

export const nightLights: Track = {
  id: 'night-lights',
  title: 'Night lights, 2012 to 2023',
  shortTitle: 'Night lights',
  videoSrc: mediaUrl('night-lights.mp4'),
  credit: "NASA's Scientific Visualization Studio",
  sourceUrl: 'https://svs.gsfc.nasa.gov/5313/',
  description:
    'Yearly average night lights from 2012 to 2023, followed by a map of where lighting grew or faded between those years.',
  altText:
    'A dark world map. City lights appear in pale yellow while a year label counts from 2012 to 2023. The lights then fade into a map of change: purple where there is more light than in 2012, especially across India, China and the Middle East, and orange where there is less, especially across Western Europe. A thin vertical line sweeps across the map every 4 seconds.',
  projection: 'equirectangular',
  // Longitude measured to about a quarter of a degree; latitude fitted to the
  // coastlines as 91.5 N to 92.5 S, so treat it as the full globe give or take 2 degrees.
  geographic: { x: true, y: true, lon: [-180, 180], lat: [91.5, -92.5] },
  // Year label and change legend, measured over the whole clip.
  masks: [{ x: 0.005, y: 0.49, width: 0.175, height: 0.115 }],
  legend: [
    'Two parts. First, 2012 to 2023, one year about every 0.6 seconds: a chord that grows fuller and brighter as the world gets brighter, and a scanner sweeping west to east every 4 seconds that plays more bell notes over brightly lit places.',
    'Then, from about 10 seconds, the map of change: where lights are new, a bell rises; where lights went out, a low tone falls. Places with no change are silent. Left and right is west to east, so growth in Asia rises on your right and loss in Europe falls near the middle.',
  ],
  timeLabels: null,
  describeTime: describeNightLights,
  createRunner: () => createRunner(createNightLightsRuleset()),
}
