import type { TourStop } from '../../../core/types';
import { stpVoice, type StpVoiceId } from '../../../../i18n/voice/stp.en';

type Focus = TourStop['focus'];
const s = (id: StpVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: stpVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/** Tour order = the journey of the sewage, then of the sludge. */
export const STP_TOUR: TourStop[] = [
  s('intro', undefined, 'The Whole Plant at a Glance', -30, 40, 340, [0, 0, -5]),
  s('gate', 'gate', 'Main Gate & Security', 20, 14, 50, [-8, 3, 96]),
  s('inlet', 'inlet', '1. Inlet Pump Station (Screw Pumps)', 25, 26, 44, undefined, [-138, -6, -52, -119, 8.5, -38]),
  s('screen', 'inlet', '2. Fine Screen', 30, 24, 36, undefined, [-122, 0, -50, -96, 8.5, -38]),
  s('grit', 'grit', '3. Grit Chamber', 25, 32, 42),
  s('primary', 'primary', '4. Primary Clarifier', 20, 42, 78, undefined, [-71, -3.5, -62, -15, 4, -32]),
  s('aeration', 'aeration', '5. Aeration Tank', 12, 40, 96, undefined, [0, -5, -58, 71, 4.5, -32]),
  s('blower', 'aeration', '6. Blower House', 15, 24, 36, undefined, [24, 0, -28, 46, 6, -18]),
  s('secondary', 'secondary', '7. Secondary Clarifier', 20, 42, 78, undefined, [78, -4, -58, 130, 4, -26]),
  s('disinfection', 'disinfection', '8. Chlorine Contact Tank', 20, 38, 58, undefined, [84, -4, -9, 130, 5, 19]),
  s('outfall', 'disinfection', '9. Release to the River (Outfall)', -50, 28, 60, [158, -1, 14], [124, -4.5, 6, 183, 2, 24]),
  s('thickener', 'thickener', '10. Sludge Thickener', 20, 36, 44),
  s('digester', 'digester', '11. Anaerobic Digester', 30, 24, 62, undefined, [-47, 0, 34, -16, 21, 56]),
  s('gas', 'digester', '12. Biogas & Flare', 20, 26, 40, undefined, [-53, 0, 58, -29, 8, 73]),
  s('dewatering', 'dewatering', '13. Dewatering (Belt Press)', 20, 28, 48, undefined, [2, 0, 40, 30, 7.5, 66]),
  s('electrical', 'electrical', 'Power: Substation & Generator', 20, 28, 55, undefined, [88, 0, 54, 134, 12, 72]),
  s('lab', 'lab', 'Control Room & Laboratory', 15, 26, 55),
  s('outro', undefined, 'Summary', 35, 40, 340, [0, 0, -5]),
];
