import { createCo2Ruleset } from '../mapping/co2.ts'
import { createRunner } from '../mapping/runner.ts'
import { mediaUrl } from './mediaUrl.ts'
import type { TimeDescription, Track } from './types.ts'

/** The stamp reads 14 Jan 2020 22:00 on the first frame and advances one hour per frame (30 fps). */
const START_MS = Date.UTC(2020, 0, 14, 22)
const HOURS_PER_SECOND = 30
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function co2DateAt(time: number): Date {
  const frame = Math.floor(Math.max(0, time) * 30 + 1e-6)
  return new Date(START_MS + (frame * 3600_000 * HOURS_PER_SECOND) / 30)
}

export function describeCo2(time: number): TimeDescription {
  const d = co2DateAt(time)
  const day = d.getUTCDate()
  const hh = String(d.getUTCHours()).padStart(2, '0')
  return {
    text: `${day} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:00`,
    spoken: `${day} ${MONTHS_LONG[d.getUTCMonth()]}`,
    key: `${d.getUTCMonth()}-${day}`,
    minGap: 5,
  }
}

export const co2: Track = {
  id: 'co2',
  title: 'Carbon dioxide, January to March 2020',
  shortTitle: 'Carbon dioxide',
  videoSrc: mediaUrl('co2.mp4'),
  credit: "NASA's Scientific Visualization Studio",
  sourceUrl: 'https://svs.gsfc.nasa.gov/5196/',
  description:
    'Carbon dioxide moving through the atmosphere from mid-January to early March 2020, from the DYAMOND model run, on a slowly turning globe.',
  altText:
    'A globe on a black background, turning slowly from Asia past Africa to the Americas. Carbon dioxide appears as a pale haze that thickens to orange and red over cities, industrial regions and fires, and pulses from day to night. A date and time stamp sits in the bottom-right corner.',
  projection: 'globe',
  // The camera orbits, so a pixel's position is not a place on Earth.
  geographic: { x: false, y: false },
  // The date stamp, measured over the whole clip: x 0.805-0.981, y 0.943-0.963, plus a margin.
  masks: [{ x: 0.79, y: 0.93, width: 0.2, height: 0.045 }],
  legend: [
    'Two drones. A quiet, steady one is the reference: roughly where the colour scale turns from pale to orange, around 415 parts per million.',
    'The main drone rises above it, opens up and gets louder the more orange and red, high carbon dioxide, is in view. Listen to it pull away from the reference over industrial Asia and the fires of Africa and South America, and sink back over the oceans.',
    'The slow wobble in loudness is the day-night pulse in the data: fires and plants change through each day.',
    'The globe turns, so left and right and high and low do not tell you where anything is on this track.',
  ],
  timeLabels: null,
  describeTime: describeCo2,
  notes: 'Colour scale: 380 to 460 ppm; nearly transparent below about 415, orange near 440, red at 460.',
  createRunner: () => createRunner(createCo2Ruleset()),
}
