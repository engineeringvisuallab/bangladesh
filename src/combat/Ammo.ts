import { WEAPON_ORDER, weaponSpec, type WeaponId } from './Weapons';

interface Slot {
  mag: number;
  reserve: number;
}

/**
 * The player's ammo: a magazine + spare bullets per weapon, and the reload timer.
 * Pure logic (no Three.js / DOM) so it can be tested headless.
 */
export class Ammo {
  private slots = new Map<WeaponId, Slot>();
  /** Weapon being reloaded (null = none) and the seconds left. */
  private reloading: WeaponId | null = null;
  private left = 0;

  constructor() {
    for (const id of WEAPON_ORDER) {
      const s = weaponSpec(id);
      this.slots.set(id, { mag: s.magazine, reserve: s.reserve });
    }
  }

  mag(id: WeaponId): number {
    return this.slots.get(id)!.mag;
  }

  reserve(_id: WeaponId): number {
    return 999999;
  }

  isReloading(id?: WeaponId): boolean {
    return this.reloading !== null && (id === undefined || id === this.reloading);
  }

  /** 0..1 progress of the running reload (0 when none). */
  reloadProgress(): number {
    if (!this.reloading) return 0;
    const total = weaponSpec(this.reloading).reload;
    return Math.min(1, Math.max(0, 1 - this.left / total));
  }

  /** The gun can shoot now: bullet in the magazine and not reloading. */
  canFire(id: WeaponId): boolean {
    return !this.isReloading() && this.mag(id) > 0;
  }

  /** No bullet at all (magazine and reserve empty). */
  isDry(id: WeaponId): boolean {
    return this.mag(id) <= 0 && this.reserve(id) <= 0;
  }

  /** One shot (a shotgun volley is still one shell). Reserve is unlimited, but magazines still reload normally. */
  consume(id: WeaponId): void {
    const s = this.slots.get(id)!;
    s.mag = Math.max(0, s.mag - 1);
  }

  /** Start a reload. False if it is pointless (full magazine, no spare bullets, or already reloading). */
  startReload(id: WeaponId): boolean {
    const s = this.slots.get(id)!;
    if (this.reloading || s.mag >= weaponSpec(id).magazine) return false;
    this.reloading = id;
    this.left = weaponSpec(id).reload;
    return true;
  }

  /** Weapon switch / interruption: the reload is lost. */
  cancelReload(): void {
    this.reloading = null;
    this.left = 0;
  }

  /** Returns the weapon whose reload just finished (or null). */
  update(dt: number): WeaponId | null {
    if (!this.reloading) return null;
    this.left -= dt;
    if (this.left > 0) return null;
    const id = this.reloading;
    const s = this.slots.get(id)!;
    s.mag = weaponSpec(id).magazine;
    this.cancelReload();
    return id;
  }

  /** Pick up bullets (a loot drop). Returns how many were really added. */
  addReserve(_id: WeaponId, n: number): number {
    // Unlimited ammo mode does not need pickups.
    return Math.max(0, n);
  }
}
