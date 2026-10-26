import type { TourStop } from '../../core/types';
import { damVoice, type DamVoiceId } from '../../../i18n/voice/dam.en';

type Focus = TourStop['focus'];
const s = (id: DamVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: damVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/** Tour order = the water (lake -> dam -> intake -> turbine -> river, then the flood path), then the electricity. Camera azimuth 0 = camera on the south (+z) side looking north. */
export const DAM_TOUR: TourStop[] = [
  s('intro', undefined, 'The whole station at a glance', 28, 30, 400, [0, 18, -15]),
  s('gate', 'gate', 'Main gate and safety', 10, 12, 52, [0, 3, 98], [-9, 0, 94, 12, 8, 107]),
  s('reservoir', 'reservoir', '1. The reservoir - storing water', 18, 30, 230, [0, 30, -62], [-110, 0, -96, 110, 38, -26]),
  s('inflow', 'reservoir', '2. River inflow and catchment', 8, 16, 130, [36, 44, -90], [28, 34, -99, 44, 56, -92]),
  s('dam', 'dam', '3. The concrete gravity dam', 35, 20, 175, [0, 22, -5], [-84, 0, -26, 84, 44, 14]),
  s('forces', 'model', '4. Forces on a dam (model)', 25, 20, 44, [-74, 8, 30], [-78, 0, 25, -70, 17, 40]),
  s('intake', 'intake', '5. Intake towers', 200, 18, 62, [66, 28, -32], [52, 8, -36, 82, 48, -26]),
  s('penstock', 'intake', '6. Penstocks', 40, 22, 72, [66, 12, 6], [53, 1, -8, 79, 30, 26]),
  s('hall', 'powerhouse', '7. The powerhouse', 15, 24, 74, [66, 8, 28], [46, 0, 18, 86, 18, 38]),
  s('turbine', 'powerhouse', '8. Francis turbine', 20, 16, 28, [58, 3, 28], [53, 0, 23, 63, 6, 33]),
  s('generator', 'powerhouse', '9. Generator', 25, 14, 24, [58, 11, 28], [54, 9, 24, 62, 14, 32]),
  s('tailrace', 'powerhouse', '10. Draft tube and tailrace', 20, 24, 62, [66, 0, 46], [48, -4, 40, 84, 2, 52]),
  s('gates', 'spillway', '11. Spillway and radial gates', 15, 28, 125, [0, 34, -14], [-42, 28, -26, 42, 45, -9]),
  s('chute', 'spillway', '12. The spillway chute', 25, 24, 105, [0, 14, 2], [-42, 0, -12, 42, 26, 20]),
  s('basin', 'spillway', '13. Stilling basin - killing the energy', 20, 28, 95, [0, 0, 35], [-46, -6, 20, 46, 3, 52]),
  s('transformer', 'electrical', '14. Step-up transformers (11 to 132 kV)', 35, 22, 58, [97, 6, 28], [90, 0, 15, 104, 13, 41]),
  s('switchyard', 'electrical', '15. Switchyard and transmission line', 20, 20, 115, [140, 12, 28], [110, 0, 18, 196, 28, 38]),
  s('control', 'control', '16. Control room', 15, 22, 58, [-122, 4, 34], [-138, 0, 26, -106, 12, 42]),
  s('outro', undefined, 'Summary - the energy chain', -35, 34, 400, [0, 15, -10]),
];
