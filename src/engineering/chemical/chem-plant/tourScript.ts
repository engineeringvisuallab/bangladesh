import type { TourStop } from '../../core/types';
import { chemVoice, type ChemVoiceId } from '../../../i18n/voice/chem.en';

type Focus = TourStop['focus'];
const s = (id: ChemVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: chemVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/**
 * Azimuth 0 = camera on the south (+z) side looking north (the gate side, and the side the process units face), 180 = camera in the north.
 * The tour follows the oil: tanks -> pump -> heat exchanger -> furnace -> column -> products / overhead -> reactors -> flare -> control room.
 */
export const CHEM_TOUR: TourStop[] = [
  s('intro', undefined, 'The Whole Plant at a Glance', 160, 36, 330, [0, 5, 0]),
  s('gate', 'gate', 'Main Gate & Safety', 0, 14, 55, [-100, 3, 64], [-108, 0, 58, -90, 7, 76]),
  s('crude', 'tankfarm', '1. Crude Oil Tanks', 20, 20, 90, [-93, 6, -46], [-118, 0, -58, -68, 13, -33]),
  s('bund', 'tankfarm', '2. Product Tanks & the Bund Wall', 25, 18, 70, [-98, 4, -19], [-123, 0, -25, -72, 10, -13]),
  s('pump', 'tankfarm', '3. Feed Pump', 15, 12, 30, [-52, 2, -4], [-57, 0, -6, -48, 4, 2]),
  s('exchanger', 'exchange', '4. Shell-and-Tube Heat Exchanger', 15, 12, 34, [-38, 2, -10], [-44, 0, -12, -32, 4, -8]),
  s('cooling', 'exchange', '5. Cooling Tower', 10, 16, 55, [-38, 5, -58], [-48, 0, -63, -28, 10, -53]),
  s('furnace', 'distill', '6. The Furnace', 0, 10, 42, [-15, 4, -38], [-23, 0, -45, -7, 11, -31]),
  s('column', 'distill', '7. The Distillation Column', 340, 14, 80, [38, 18, -38], [34, 0, -42, 42, 38, -34]),
  s('trays', 'distill', '8. Trays: Vapour Up, Liquid Down', 0, 8, 32, [38, 22, -38], [34.8, 9, -41.2, 41.2, 33, -34.8]),
  s('draws', 'distill', '9. The Four Products', 25, 16, 70, [38, 12, -30], [34, 4, -36, 42, 31, -27]),
  s('overhead', 'exchange', '10. Overhead: Condenser & Reflux', 20, 18, 55, [32, 6, -52], [20, 0, -56, 46, 9, -48]),
  s('cstr', 'reactor', '11. Stirred-Tank Reactor', 0, 12, 36, [90, 3, -40], [86, 0, -44, 94, 9, -36]),
  s('bed', 'reactor', '12. Fixed-Bed Catalytic Reactor', 0, 14, 45, [98, 6, -24], [95, 0, -27, 101, 14, -21]),
  s('flare', 'flare', '13. The Flare Stack', 0, 10, 85, [116, 22, -60], [114, 0, -62, 118, 48, -58]),
  s('control', 'flare', '14. The Control Room', 180, 12, 52, [62, 3, 50], [45, 0, 42, 79, 8, 58]),
  s('outro', undefined, 'Summary', 200, 36, 330, [0, 5, 0]),
];
