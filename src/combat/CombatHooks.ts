import type * as THREE from 'three';
import type { CombatEffects } from './CombatEffects';
import type { GunAudio } from './GunAudio';
import type { Wanted } from './Wanted';

/** What PeopleManager needs from the combat system (kept as an interface so people/ does not import the whole combat code). */
export interface CombatHooks {
  wanted: Wanted;
  effects: CombatEffects;
  audio: GunAudio;
  /** World position of the player's body centre (on foot or in a vehicle). */
  playerWorld(out: THREE.Vector3): THREE.Vector3;
  /** An NPC bullet hit the player (red flash + thud; the player cannot die). */
  playerHit(damage: number): void;
  /** True if something solid (terrain, a car) is between two WORLD points. */
  blocked(a: THREE.Vector3, b: THREE.Vector3): boolean;
}
