import { createAerosolRuleset } from '../mapping/aerosols.ts'
import { createRunner } from '../mapping/runner.ts'
import { mediaUrl } from './mediaUrl.ts'
import type { Track } from './types.ts'

export const aerosols: Track = {
  id: 'aerosols',
  title: 'Aerosols in the air, August to September 2024',
  shortTitle: 'Aerosols',
  videoSrc: mediaUrl('aerosols.mp4'),
  credit:
    "NASA's Global Modeling Assimilation Office (GMAO) and NASA's Scientific Visualization Studio (SVS)",
  sourceUrl: 'https://svs.gsfc.nasa.gov/5572/',
  description:
    'Tiny airborne particles modelled by NASA GEOS from 1 August to 14 September 2024, coloured by type: black carbon from fires, desert dust, sea salt and sulfate.',
  altText:
    'A world map covered in swirling colour: green sulfate haze across the northern continents, a lilac river of Saharan dust crossing the Atlantic towards the Caribbean, orange-red smoke over central Africa and South America, and grey-blue sea-salt spirals around storms in the southern oceans. Small white labels name events such as hurricanes and volcanoes.',
  projection: 'equirectangular',
  // Longitude edges measured against the lightning map's coastlines. Latitude
  // could not be fitted (haze covers most land); the map looks full-globe.
  geographic: { x: true, y: true, lon: [-180, 180] },
  // The in-frame legend box, bottom right. White annotation text is ignored
  // by colour: it has no saturation, so it matches no aerosol type.
  masks: [{ x: 0.665, y: 0.895, width: 0.225, height: 0.09 }],
  legend: [
    'Four instruments, one per aerosol type. Hold Shift and press 1 to 4 to hear one alone, and the same keys again to hear them all.',
    '1. Black carbon (orange-red smoke from fires): a low, warm brass chord.',
    '2. Dust (lilac): an airy, breathy whistle.',
    '3. Sea salt (grey-blue): soft bells.',
    '4. Sulfate (green, from pollution and volcanoes): short plucked notes.',
    'For each one: louder or more frequent means more of it; left and right is where it is, west to east; higher means further north.',
  ],
  timeLabels: null,
  notes:
    'Dust demo: the whole-map dust centre only moves from about 22 E to 7 E between 0 and 16 s, a small pan change. The plume edge reaches the Caribbean (62 W) at about 12 to 18 s.',
  createRunner: () => createRunner(createAerosolRuleset()),
}
