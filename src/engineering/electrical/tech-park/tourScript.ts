import type { TourStop } from '../../core/types';
import { techparkVoice, type TechparkVoiceId } from '../../../i18n/voice/techpark.en';

type Focus = TourStop['focus'];
const s = (id: TechparkVoiceId, partId: string | undefined, titleBn: string, az: number, el: number, dist: number, target?: [number, number, number], focus?: Focus): TourStop => ({
  id,
  partId,
  titleBn,
  voiceId: id,
  text: techparkVoice[id],
  shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target },
  focus,
});

/** Azimuth 0 = camera on the south side (the north-row halls open to the south), 180 = camera in the north (the south-row halls open to the north), 270 = camera in the west (the gate side). */
export const TECHPARK_TOUR: TourStop[] = [
  s('intro', undefined, 'The Whole Park at a Glance', 150, 38, 380, [0, 5, 0]),
  s('gate', 'gate', 'Main Gate', 270, 14, 50, [-168, 3, 0], [-176, 0, -9, -160, 7, 9]),
  s('logic', 'cpu', '1. Logic Gates', 0, 8, 38, [-148, 6, -70], [-166, 0, -72, -132, 11, -69]),
  s('adder', 'cpu', '2. Binary Numbers & the Adder', 0, 8, 30, [-116, 6, -70], [-127, 0, -72, -105, 11, -69]),
  s('cpu', 'cpu', '3. A CPU Running a Program', 0, 8, 38, [-72, 6, -70], [-89, 0, -72, -55, 11, -69]),
  s('sorting', 'algo', '4. Sorting Algorithms', 0, 8, 56, [-20, 6, -70], [-42, 0, -72, 12, 11, -69]),
  s('search', 'algo', '5. Linear vs Binary Search', 0, 8, 44, [40, 6, -70], [20, 0, -72, 62, 11, -69]),
  s('rc', 'tele', '6. RC Circuit', 0, 8, 40, [105, 6, -70], [87, 0, -72, 121, 11, -69]),
  s('fibre', 'tele', '7. Optical Fibre', 0, 8, 34, [136, 6, -70], [126, 0, -72, 147, 11, -69]),
  s('radio', 'tele', '8. Radio Waves', 0, 8, 32, [160, 6, -70], [150, 0, -72, 168, 11, -69]),
  s('network', 'net', '9. How a Web Page Arrives', 180, 10, 72, [-115, 5, 68], [-163, 0, 66, -67, 11, 70]),
  s('datacentre', 'dc', '10. Data Centre', 180, 24, 66, [-5, 3, 48], [-50, 0, 34, 45, 8, 62]),
  s('ai', 'ai', '11. A Neuron That Learns', 180, 8, 28, [104, 5, 68], [92, 0, 66, 116, 11, 70]),
  s('neural', 'ai', '12. A Neural Network', 180, 8, 28, [66, 5, 68], [55, 0, 66, 80, 11, 70]),
  s('tower', 'tower', '13. Cell Tower', 200, 14, 85, [150, 20, 48], [144, -2, 42, 158, 50, 54]),
  s('outro', undefined, 'Summary: Everything Starts with a Switch', 210, 38, 380, [0, 5, 0]),
];
