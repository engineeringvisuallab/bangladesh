import type * as THREE from 'three';
import type { Vehicle } from './Vehicle';

/**
 * What a vehicle needs from the world's effect system (implemented by combat/Explosions.ts).
 * Kept as an interface so vehicles/ does not import combat/. All positions are WORLD coordinates.
 */
export interface VehicleFx {
  /** True when the fx system itself simulates the fire / smoke of burning vehicles (VehicleFire); the vehicle then emits nothing. */
  readonly managesFire?: boolean;
  /** Area explosion: hurts people and vehicles (except `ignore`), pushes vehicles, shows fire + smoke + sound. */
  explode(at: THREE.Vector3, radius: number, power: number, byPlayer: boolean, ignore?: Vehicle | null): void;
  /** A broken-off part flies away on its own: the object keeps its current world transform and is then driven by the debris system. */
  spawnPiece(obj: THREE.Object3D, velocity: THREE.Vector3, spin: THREE.Vector3, life?: number): void;
  smoke(at: THREE.Vector3, strength: number): void;
  fire(at: THREE.Vector3): void;
  /** Metal crash: sparks + a bang whose loudness follows the impact (dv in m/s). */
  crash(at: THREE.Vector3, dv: number): void;
}
