import type { DriveInput } from '../vehicles/Vehicle';

/** Placeholder: AI traffic is not ported yet. Vehicle only checks `ai` for null and reads `input`. */
export interface AIDriver {
  input: DriveInput;
}
