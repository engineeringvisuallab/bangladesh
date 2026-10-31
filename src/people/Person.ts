import type { PersonModel } from './PersonModel';
import type { Vehicle } from '../vehicles/Vehicle';

/**
 * A person as the Vehicle class sees one (driver / passenger). EVCity's full Person (walking AI, combat ...) is not ported;
 * only what seating needs is here.
 */
export interface Person {
  model: PersonModel;
  vehicle: Vehicle | null;
  task: string;
  mode: string;
  speed: number;
  heading: number;
  health: number;
}
