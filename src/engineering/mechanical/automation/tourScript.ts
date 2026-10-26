import type { TourStop } from '../../core/types';
import { automationVoice, type AutomationVoiceId } from '../../../i18n/voice/automation.en';

type Focus = TourStop['focus'];
const s = (id: AutomationVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: automationVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/**
 * Azimuth 0 = camera on the south (+z) side looking north (the north-row labs open to the south), 180 = camera in the north (the south-row hall and warehouse
 * open to the north), 90 = camera in the east (the gate side).
 */
export const AUTOMATION_TOUR: TourStop[] = [
  s('intro', undefined, 'The Whole Plant at a Glance', 150, 38, 400, [0, 5, -5]),
  s('gate', 'gate', 'Main Gate & Safety', 90, 14, 50, [178, 3, 0], [174, 0, -8, 186, 7, 8]),
  s('inductive', 'sensors', '1. Inductive Proximity Sensor', 0, 8, 34, [-159, 3, -58], [-167, 0, -66, -151, 8, -52]),
  s('photo', 'sensors', '2. Photoelectric Sensor (Through-Beam)', 0, 8, 34, [-140, 3, -58], [-148, 0, -66, -132, 8, -52]),
  s('ultrasonic', 'sensors', '3. Ultrasonic Distance Sensor', 0, 8, 34, [-121, 3, -58], [-129, 0, -66, -113, 8, -52]),
  s('belt', 'factory', '4. Conveyor, Counting & Inspection', 180, 22, 46, [-95, 2, 45], [-126, 0, 41, -86, 6, 49]),
  s('sorter', 'factory', '5. Height Sensor & Pneumatic Pusher', 180, 24, 30, [-65, 2, 47], [-69, 0, 38, -55, 6, 56]),
  s('robot', 'factory', '6. Robot Arm: Pick and Place', 180, 22, 32, [-30, 3, 37], [-38, 0, 25, -22, 8, 47]),
  s('agv', 'factory', '7. Automated Guided Vehicle (AGV) & Rack', 180, 34, 130, [20, 1, 22], [-36, 0, 2, 72, 8, 58]),
  s('plc', 'plc', '8. PLC: Scan Cycle & Ladder Logic', 0, 14, 40, [-12, 4, -66], [-27, 0, -77, 6, 11, -58]),
  s('scada', 'plc', '9. SCADA / HMI Screen', 0, 8, 24, [3, 5, -74], [-4, 1, -77, 11, 11, -73]),
  s('pid', 'pid', '10. Feedback Control: PID Level Loop', 0, 12, 44, [-72, 4, -62], [-97, 0, -77, -43, 11, -48]),
  s('outro', undefined, 'Summary: Sense, Decide, Act', 200, 38, 400, [0, 5, -5]),
];
