import type { TourStop } from '../../core/types';
import { renewVoice, type RenewVoiceId } from '../../../i18n/voice/renew.en';

type Focus = TourStop['focus'];
const s = (id: RenewVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: renewVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/**
 * Azimuth 0 = camera on the south (+z) side looking north (the gate side; the solar modules and the turbine rotors face it), 180 = camera in the north.
 * The tour follows the energy: sun -> modules -> inverter -> wind -> battery -> transformer -> grid -> control centre.
 */
export const RENEW_TOUR: TourStop[] = [
  s('intro', undefined, 'The Whole Park at a Glance', 160, 36, 330, [0, 5, 0]),
  s('gate', 'gate', 'Main Gate & Safety', 0, 14, 55, [-100, 3, 82], [-108, 0, 76, -90, 7, 94]),
  s('solar', 'solar', '1. The Solar Field', 15, 22, 120, [-88, 2, -44], [-148, 0, -82, -28, 4, -8]),
  s('module', 'solar', '2. Inside a Solar Module', 20, 14, 26, [-110, 2.5, 20], [-116, 0, 17, -100, 5, 23]),
  s('inverter', 'solar', '3. The Inverter', 10, 12, 30, [-14, 1.5, 0], [-18, 0, -2, -10, 4, 2]),
  s('wind', 'wind', '4. The Wind Turbines', 10, 14, 150, [75, 20, -58], [20, 0, -66, 135, 58, -50]),
  s('rotor', 'wind', '5. Rotor, Nacelle & Tower', 0, 12, 60, [75, 36, -60], [66, 24, -64, 84, 58, -52]),
  s('mast', 'wind', '6. Weather Mast', 0, 8, 34, [78, 14, 58], [75, 0, 55, 81, 22, 61]),
  s('battery', 'battery', '7. Battery Storage', 10, 16, 80, [76, 2, 22], [44, 0, 10, 112, 5, 34]),
  s('inside', 'battery', '8. Inside a Battery Container', 0, 8, 24, [52, 2, 14], [46, 0, 12, 58, 4, 16]),
  s('transformer', 'grid', '9. The Step-Up Transformer', 20, 14, 38, [30, 3, -10], [25, 0, -14, 38, 6, -6]),
  s('line', 'grid', '10. Switchyard & Line to the Grid', 0, 14, 100, [96, 8, -10], [40, 0, -16, 156, 22, -4]),
  s('control', 'control', '11. The Energy Control Centre', 180, 12, 52, [40, 3, 72], [22, 0, 64, 58, 8, 80]),
  s('outro', undefined, 'Summary', 200, 36, 330, [0, 5, 0]),
];
