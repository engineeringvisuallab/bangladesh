import type { TourStop } from '../../core/types';
import { gridVoice, type GridVoiceId } from '../../../i18n/voice/grid.en';

type Focus = TourStop['focus'];
const s = (id: GridVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: gridVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/** Tour order = the path of the power: line -> bay -> bus -> transformer -> 33 kV feeders; then protection. Azimuth 0 = camera on the south (+z) side looking north. */
export const GRID_TOUR: TourStop[] = [
  s('intro', undefined, 'The Whole Substation at a Glance', 200, 36, 330, [0, 5, -5]),
  s('gate', 'gate', 'Main Gate & Security', 195, 14, 45, [-60, 3, -86], [-68, 0, -92, -44, 7, -80]),
  s('tower', 'hv', '1. Transmission Tower & Earth Wire', 330, 14, 80, [60, 14, -96], [50, -2, -112, 70, 31, -80]),
  s('gantry', 'hv', '2. Gantry, Lightning Arrester & CVT', 340, 14, 42, [60, 3, -70], [50, 0, -78, 70, 15, -66]),
  s('bay', 'hv', '3. Isolator, Circuit Breaker & CT', 25, 14, 40, [60, 3, -58], [50, 0, -65, 72, 6, -49]),
  s('bus', 'hv', '4. 132 kV Bus Bars & Shield Masts', 20, 22, 120, [60, 8, -46], [-14, 0, -52, 134, 25, -16]),
  s('transformer', 'transformer', '5. Power Transformer (132/33 kV)', 10, 20, 62, [20, 5, 6], [8, 0, 0, 33, 12, 12]),
  s('feeders', 'mv', '6. 33 kV Bus & Feeders', 5, 24, 120, [62, 5, 45], [-4, 0, 20, 130, 12, 100]),
  s('capacitor', 'mv', '7. Capacitor Bank', 30, 22, 38, [-30, 2, 40], [-42, 0, 34, -16, 6, 46]),
  s('control', 'control', '8. Control & Relay Building', 260, 20, 42, [-108, 3, -40], [-127, 0, -49, -89, 12, -31]),
  s('fault', 'mv', '9. Protection: Lightning Trips a Feeder', 330, 20, 60, [51, 6, 70], [40, 0, 30, 64, 16, 90]),
  s('outro', undefined, 'Summary: On the Way to the City', 160, 36, 330, [0, 5, -5]),
];
