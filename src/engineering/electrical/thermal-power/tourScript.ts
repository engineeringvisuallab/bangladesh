import type { TourStop } from '../../core/types';
import { thermalVoice, type ThermalVoiceId } from '../../../i18n/voice/thermal.en';

type Focus = TourStop['focus'];
const s = (id: ThermalVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: thermalVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/** Tour order = the fuel and the water/steam cycle (Rankine cycle), then the electricity. Camera azimuth 0 = camera on the south (+z) side looking north. */
export const THERMAL_TOUR: TourStop[] = [
  s('intro', undefined, 'The Whole Plant at a Glance', 25, 38, 430, [0, 10, -10]),
  s('gate', 'gate', 'Main Gate & Security', 15, 14, 48, [0, 3, 104], [-8, 0, 100, 12, 7, 114]),
  s('gas', 'gas', '1. Gas Receiving & Metering Station', 20, 24, 46, undefined, [-162, 0, 10, -138, 5, 30]),
  s('boiler', 'boiler', '2. Boiler: Heat Turns Water into Steam', 55, 20, 105, [-95, 22, -30], [-110, 0, -43, -82, 46, -16]),
  s('burner', 'boiler', '3. Burners & Flame', 65, 12, 34, [-95, 9, -26], [-103, 5, -40, -85, 14, -16]),
  s('stack', 'stack', '4. Flue Gas Fan & Chimney', 40, 20, 80, [-120, 28, -30], [-132, 0, -34, -108, 72, -26]),
  s('steam', 'turbine', '5. Main Steam Line', -30, 22, 120, [-65, 30, -34], [-104, 0, -37, -38, 49, -31]),
  s('turbine', 'turbine', '6. Steam Turbine (HP & LP)', 20, 22, 52, [-8, 9, -30], [-27, 5, -35, 3, 17, -25]),
  s('generator', 'turbine', '7. Generator', 30, 18, 42, [16, 10, -30], [8, 6, -34, 26, 15, -26]),
  s('condenser', 'condenser', '8. Condenser: Steam Back to Water', -35, 20, 36, [-2, 3, -30], [-9, 0, -37, 5, 6, -23]),
  s('cooling', 'cooling', '9. Cooling Tower', 160, 20, 150, [105, 28, -66], [82, 0, -90, 128, 70, -42]),
  s('feedwater', 'feedwater', '10. Deaerator & Feed Water Pumps', 25, 24, 56, [-62, 5, 8], [-84, 0, -2, -44, 12, 18]),
  s('dm', 'dm', '11. DM Plant: Pure Water', 25, 26, 70, [-118, 4, 58], [-152, 0, 46, -88, 12, 78]),
  s('transformer', 'electrical', '12. Generator Transformer (11 → 132 kV)', 35, 24, 52, [43, 6, -30], [29, 0, -36, 52, 14, -23]),
  s('switchyard', 'electrical', '13. Switchyard & Transmission Line', 30, 22, 105, [110, 7, -15], [66, 0, -26, 182, 21, -3]),
  s('control', 'control', '14. Control Room', 15, 24, 40, undefined, [6, 0, 0, 38, 12, 16]),
  s('outro', undefined, 'Summary: How Energy Changes Form', -35, 38, 430, [0, 10, -10]),
];
