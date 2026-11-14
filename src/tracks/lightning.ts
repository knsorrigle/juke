import { FULL_GLOBE } from '../mapping/geo.ts'
import { createLightningRuleset } from '../mapping/lightning.ts'
import { createRunner } from '../mapping/runner.ts'
import { mediaUrl } from './mediaUrl.ts'
import type { Track } from './types.ts'

/**
 * The video is NASA's Science On a Sphere version: one full-globe flat map,
 * 180 W at the left edge to 180 E at the right, 90 N at the top to 90 S at the
 * bottom. It has no labels, legend or date drawn on it, so nothing is masked.
 */
export const lightning: Track = {
  id: 'lightning',
  title: 'Lightning seen from the International Space Station',
  shortTitle: 'Lightning',
  videoSrc: mediaUrl('lightning-flat.mp4'),
  credit: "NASA's Scientific Visualization Studio",
  sourceUrl: 'https://svs.gsfc.nasa.gov/5011/',
  description:
    'Lightning detected by the Lightning Imaging Sensor on the International Space Station from March 2017 to 2023. Each moment shows the lightning from a ten-day window, so the pattern drifts north and south with the seasons.',
  altText:
    'A dark grey world map with the Americas on the left, Africa in the middle, and Asia and Australia on the right. Thousands of small yellow dots, each a lightning event, appear and fade over land in the tropics and mid-latitudes, thickest over central Africa, South America and Southeast Asia. The band of dots shifts north in the middle of each year and south at the turn of each year.',
  projection: 'equirectangular',
  geographic: { x: true, y: true, lon: [-180, 180], lat: [90, -90] },
  masks: [],
  legendShort: 'note = new lightning · left-right = west-east · high = north · hum = total',
  legend: [
    'Each soft mallet note is a cluster of new lightning. A steady pulse plays up to three notes at a time, for the biggest clusters since the last pulse.',
    'Left and right: where the lightning is, west to east. The Americas are on your left, Africa in the middle, Asia and Australia on your right.',
    'Pitch: how far north. High notes are northern storms, low notes are southern storms.',
    'Loudness of a note: the size of that cluster.',
    'The hum and rumble underneath: how much lightning there is everywhere. They swell and brighten in busy seasons and thin out in quiet ones.',
    'A very faint hum means the track is playing but there is little lightning, as in the first ten seconds.',
  ],
  timeLabels: {
    src: mediaUrl('lightning-flat.labels.txt'),
    sourceFps: 60,
    // NASA's file gives 2003 for the lines after December 2022. See credits.json.
    yearCorrections: [{ from: 2003, to: 2023 }],
  },
  createRunner: () => createRunner(createLightningRuleset(FULL_GLOBE)),
}
