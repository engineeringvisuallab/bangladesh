import type { TourStop } from '../../core/types';
import { vehicleVoice, type VehicleVoiceId } from '../../../i18n/voice/vehicle.en';

type Focus = TourStop['focus'];
const s = (id: VehicleVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: vehicleVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/** Tour order = how a car is made: design -> materials -> press -> body -> paint -> power train -> assembly -> tests -> shipping. Camera azimuth 0 = camera on the south (+z) side looking north. */
export const VEHICLE_TOUR: TourStop[] = [
  s('intro', undefined, 'The factory at a glance', 28, 34, 500, [0, 6, -20]),
  s('gate', 'gate', 'Main gate and safety', 10, 12, 52, [0, 3, 142], [-9, 0, 138, 12, 8, 152]),
  s('design', 'design', '1. Design studio', 12, 20, 85, [-155, 4, 32], [-176, 0, 14, -136, 11, 50]),
  s('windtunnel', 'design', '2. Wind tunnel', 20, 16, 42, [-124, 3, 32], [-140, 0, 24, -106, 8, 40]),
  s('coils', 'press', '3. Steel coils and blanking', 8, 28, 85, [-150, 3, -112], [-180, 0, -139, -120, 9, -85]),
  s('press', 'press', '4. Press shop', 10, 22, 78, [-139, 5, -25], [-176, 0, -50, -116, 13, 0]),
  s('body', 'body', '5. Body shop - welding robots', 12, 20, 80, [-82, 3, -25], [-112, 0, -50, -52, 12, 0]),
  s('paintdip', 'paint', '6. Pre-treatment and e-coat dips', 14, 20, 48, [-35, 3, -25], [-47, 0, -30, -24, 7, -20]),
  s('paintbooths', 'paint', '7. Spray booths and ovens', 10, 22, 70, [0, 3, -25], [-23, 0, -50, 22, 12, 0]),
  s('battery', 'battery', '8. Battery shop', 10, 26, 100, [48, 4, -112], [0, 0, -139, 96, 12, -85]),
  s('motor', 'battery', '9. Electric motor and e-axle', 15, 22, 32, [86, 2, -100], [78, 0, -112, 96, 4, -92]),
  s('trim', 'assembly', '10. Final assembly - cockpit and glass', 12, 20, 58, [40, 3, -25], [26, 0, -50, 56, 12, 0]),
  s('marriage', 'assembly', '11. The marriage - battery meets body', 20, 20, 24, [60, 1, -25], [54, 0, -30, 66, 4, -20]),
  s('wheels', 'assembly', '12. Wheels and trim', 15, 18, 32, [84, 2, -25], [76, 0, -35, 92, 5, -15]),
  s('eol', 'eol', '13. End-of-line tests', 12, 20, 78, [150, 3, -25], [120, 0, -50, 178, 10, 0]),
  s('crash', 'testing', '14. Crash laboratory', 12, 18, 72, [-55, 3, 32], [-90, 0, 14, -20, 10, 50]),
  s('track', 'testing', '15. Test track', 15, 42, 200, [106, 0, 96], [44, 0, 54, 168, 3, 138]),
  s('yard', 'eol', '16. Vehicle yard and shipping', 10, 28, 72, [150, 2, 30], [122, 0, 14, 178, 5, 46]),
  s('warehouse', 'warehouse', '17. Parts warehouse', 8, 26, 105, [-60, 5, -112], [-100, 0, -139, -20, 16, -85]),
  s('outro', undefined, 'Summary - from clay to customer', -30, 34, 500, [0, 6, -20]),
];
