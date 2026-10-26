import type { TourStop } from '../../core/types';
import { mechVoice, type MechVoiceId } from '../../../i18n/voice/mech.en';

type Focus = TourStop['focus'];
const s = (id: MechVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: mechVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/**
 * Azimuth 0 = camera on the south (+z) side looking north (the north-row buildings open to the south), 180 = camera in the north (the south-row buildings open to the north),
 * 90 = camera in the east (the gate side).
 */
export const MECH_TOUR: TourStop[] = [
  s('intro', undefined, 'The Whole Works at a Glance', 150, 38, 380, [0, 5, 0]),
  s('gate', 'gate', 'Main Gate & Security', 90, 14, 50, [168, 3, 0], [164, 0, -8, 176, 7, 8]),
  s('engine', 'engine', '1. The 4-Stroke Engine', 0, 10, 38, [-156, 6, -48], [-162, 0, -52, -148, 12, -44]),
  s('crank', 'engine', '2. Piston, Crank, Cams & Valves', 0, 8, 26, [-156, 5, -48], [-159, 1, -51, -153, 11, -45]),
  s('gear', 'mech', '3. Gear Train', 0, 8, 26, [-74, 4, -52], [-80, 0.7, -54, -68, 6, -50]),
  s('belt', 'mech', '4. Belt Drive', 0, 8, 24, [-62, 4, -52], [-67, 0.7, -54, -57, 6, -50]),
  s('cam', 'mech', '5. Cam, Follower & Live Graph', 0, 8, 26, [-50, 4, -52], [-56, 0.7, -54, -44, 6, -50]),
  s('linkage', 'mech', '6. Four-Bar Linkage', 0, 8, 24, [-38, 4, -52], [-43, 0.7, -54, -33, 6, -50]),
  s('governor', 'mech', '7. Centrifugal Governor', 0, 8, 24, [-26, 4, -52], [-31, 0.7, -54, -21, 7, -50]),
  s('lathe', 'shop', '8. The Lathe', 0, 12, 30, [52, 3, -59], [45, 0, -62, 60, 5, -56]),
  s('mill', 'shop', '9. Milling, Drilling & Grinding', 0, 14, 44, [82, 4, -59], [64, 0, -62, 100, 9, -56]),
  s('press', 'hydro', '10. Hydraulic Press', 180, 10, 40, [-108, 5, 53], [-113, 0, 50, -101, 11, 58]),
  s('pascal', 'hydro', '11. Pascal\'s Law', 180, 10, 30, [-135, 3, 53], [-141, 0, 51, -129, 6, 56]),
  s('fridge', 'fridge', '12. Refrigeration Plant', 180, 14, 60, [-25, 3, 55], [-50, 0, 51, 0, 8, 62]),
  s('outro', undefined, 'Summary', 200, 38, 380, [0, 5, 0]),
];
