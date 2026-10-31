import { Config } from '../core/Config';

export type WeaponId = keyof typeof Config.combat.weapons;

export interface WeaponSpec {
  id: WeaponId;
  /** Seconds between shots. */
  interval: number;
  /** Hold the button to keep firing. */
  auto: boolean;
  damage: number;
  /** Bullets per shot (shotgun = many). */
  pellets: number;
  /** Cone half-angle (rad). */
  spread: number;
  range: number;
  gunLength: number;
  /** Bullets in one magazine. */
  magazine: number;
  /** Spare bullets the player starts with. */
  reserve: number;
  /** Most spare bullets the player can carry. */
  reserveMax: number;
  /** Seconds to reload. */
  reload: number;
}

export const WEAPON_ORDER: readonly WeaponId[] = Config.combat.order;

export function weaponSpec(id: WeaponId): WeaponSpec {
  return { id, ...Config.combat.weapons[id] };
}
