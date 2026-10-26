import type { TourStop } from '../../../core/types';
import { swtpVoice, type SwtpVoiceId } from '../../../../i18n/voice/swtp.en';

const s = (
  id: SwtpVoiceId,
  partId: string | undefined,
  titleBn: string,
  azimuthDeg: number,
  elevationDeg: number,
  distance: number,
  target?: [number, number, number],
  focus?: TourStop['focus'],
): TourStop => ({ id, partId, titleBn, voiceId: id, text: swtpVoice[id], shot: { azimuthDeg, elevationDeg, distance, target }, focus });

/** Tour order = the journey of the water. azimuth 0 = camera south of the target, 90 = east, -90 = west. */
export const SWTP_TOUR: TourStop[] = [
  s('intro', undefined, 'The Whole Plant at a Glance', -35, 38, 360, [-5, 0, 0]),
  s('gate', 'gate', 'Main Gate & Security', 25, 14, 52, [-34, 3, 106]),
  s('intake', 'intake', '1. Intake: Taking Water from the River', -60, 24, 60, [-170, -1, -40], [-190, -7.4, -47, -141, 4.2, -33]),
  s('intakePump', 'intakePump', '2. Intake Pump House', 15, 24, 46),
  s('rawMain', 'rawMain', '3. Raw Water Rising Main', 20, 22, 62),
  s('rapidMix', 'rapidMix', '4. Parshall Flume & Rapid Mixing', 35, 28, 42),
  s('chemical', 'chemical', '5. Chemical House', 10, 24, 50, undefined, [-102, 0, -14, -78, 6, -2]),
  s('flocculation', 'flocculation', '6. Flocculation Basins', 20, 42, 74),
  s('sedimentation', 'sedimentation', '7. Sedimentation Tanks', 20, 40, 100),
  s('filtration', 'filtration', '8. Rapid Sand Filters', 25, 42, 100),
  s('backwash', 'backwash', '9. Backwash Tank', 40, 22, 52, undefined, [57, 0, -13, 72, 19.6, -3]),
  s('disinfection', 'disinfection', '10. Chlorine Contact Tank', 20, 42, 88, undefined, [96, -4.4, -72, 126, 4.9, -28]),
  s('reservoir', 'reservoir', '11. Clear Water Reservoir', 15, 34, 84),
  s('highLift', 'highLift', '12. High-Lift Pump House', 15, 26, 46, undefined, [30, 0, 8, 52, 6.4, 20]),
  s('delivery', 'delivery', '13. Delivery Main', 70, 32, 125),
  s('sludge', 'sludge', 'Sludge Lagoons', 35, 38, 80, undefined, [-145, -3.4, 60, -115, 2.1, 100]),
  s('electrical', 'electrical', 'Power: Substation & Generator', -25, 28, 80, undefined, [34, 0, 55, 100, 12, 77]),
  s('lab', 'lab', 'Control Room & Laboratory', 12, 24, 52),
  s('outro', undefined, 'Summary', 35, 40, 380, [-5, 0, 0]),
];
