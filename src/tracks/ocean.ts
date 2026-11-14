import { createOceanRuleset } from '../mapping/ocean.ts'
import { createRunner } from '../mapping/runner.ts'
import { mediaUrl } from './mediaUrl.ts'
import type { Track } from './types.ts'

export const seaSurfaceCurrents: Track = {
  id: 'sea-surface-currents',
  title: 'Ocean surface currents and temperature',
  shortTitle: 'Ocean currents',
  videoSrc: mediaUrl('sea-surface-currents.mp4'),
  credit: 'NASA/Goddard Space Flight Center Scientific Visualization Studio',
  sourceUrl: 'https://svs.gsfc.nasa.gov/3912/',
  description:
    'Modelled ocean surface currents (ECCO2) drawn as flowing lines, coloured by sea surface temperature from 0 to 32 degrees Celsius.',
  altText:
    'A world map with grey land. The oceans are filled with fine flowing lines that curl into eddies: red and orange in the warm tropics, yellow and green in the mid-latitudes, blue near the poles. A thin vertical line sweeps across the map from left to right every 8 seconds.',
  projection: 'equirectangular',
  // Measured against the lightning map's coastlines: 180 W to 180 E, 89 N to 90 S.
  geographic: { x: true, y: true, lon: [-180, 180], lat: [89, -90] },
  masks: [],
  legend: [
    'Eight soft held notes, one for each band of latitude from north to south. Warmer water plays a higher note, so the tropics sit high and the polar seas sit low and dark.',
    'When the water in a band moves fast, with currents and eddies, its note gets brighter and shimmers.',
    'A scanner sweeps the map west to east every 8 seconds, drawn as a line on the video. It plays a gentle run of notes for the water under it, panned to where it is. Land is silent.',
  ],
  timeLabels: null,
  notes: 'Colour scale: 0 C blue, about 10 C green, about 25 C yellow, 32 C red. No date in the frame.',
  createRunner: () => createRunner(createOceanRuleset()),
}
