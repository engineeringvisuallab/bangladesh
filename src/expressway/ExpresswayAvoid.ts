import { ARMY, SEAPORT } from '../city/WorldZones';
import type { XAvoid } from './ExpresswayRouter';

/**
 * Where the expressway must not go: the army camp (+ 150 m), and the flat land west of the seaport that is kept for the
 * second (future) airport (x < the port's west edge, down to the coast).
 */
export function expresswayAvoid(): XAvoid[] {
  return [
    { x0: ARMY.x0, z0: ARMY.z0, x1: ARMY.x1, z1: ARMY.z1, margin: 150 },
    { x0: -600, z0: 2400, x1: SEAPORT.x0 - 5, z1: 3300, margin: 45 },
  ];
}
