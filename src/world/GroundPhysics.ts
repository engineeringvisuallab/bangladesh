import type RAPIER from '@dimforge/rapier3d-compat';
import { TILE_SIZE_M, tileKey, tileOf, tileOrigin, type Region, type TileIndex, type WorldFrame } from '../geo';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

/** Heightfield cells per tile side (same as the render mesh: one vertex every 20 m). */
const CELLS = 25;

/**
 * Rapier ground colliders: one heightfield per 500 m global tile, only within `activeRadius` of the focus (same idea as
 * EVCity's TerrainPhysics). Heights come from the same function the terrain mesh uses, so a real height-map later
 * changes nothing here.
 */
export class GroundPhysics {
  private readonly active = new Map<string, RAPIER.RigidBody>();
  private timer = 1;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly frame: WorldFrame,
    private readonly regions: readonly Region[],
    private readonly heightAt: (x: number, z: number) => number,
  ) {}

  get activeCount(): number {
    return this.active.size;
  }

  /** True if the ground collider under scene position (x, z) exists. Vehicles wait for it before they start to fall. */
  hasColliderAt(x: number, z: number): boolean {
    return this.active.has(tileKey(tileOf(this.frame.toE(x), this.frame.toN(z))));
  }

  /** Call every frame with the focus (camera / driven vehicle) in scene coordinates. Work is throttled to 5 Hz. */
  update(dt: number, fx: number, fz: number): void {
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;
    const r = PhysicsConfig.activeRadius;
    const e = this.frame.toE(fx);
    const n = this.frame.toN(fz);
    const i0 = Math.floor((e - r) / TILE_SIZE_M);
    const i1 = Math.floor((e + r) / TILE_SIZE_M);
    const j0 = Math.floor((n - r) / TILE_SIZE_M);
    const j1 = Math.floor((n + r) / TILE_SIZE_M);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const t = { i, j };
        const key = tileKey(t);
        if (this.active.has(key) || !this.regions.some((reg) => reg.intersectsTile(t))) continue;
        if (this.distanceToTile(fx, fz, t) <= r) this.create(key, t);
      }
    }
    for (const [key, body] of this.active) {
      const [i, j] = key.split(',').map(Number);
      if (this.distanceToTile(fx, fz, { i, j }) > r + 64) {
        this.physics.world.removeRigidBody(body); // hysteresis, like EVCity
        this.active.delete(key);
      }
    }
  }

  private distanceToTile(fx: number, fz: number, t: TileIndex): number {
    const org = tileOrigin(t);
    const x0 = this.frame.toX(org.e);
    const z0 = this.frame.toZ(org.n + TILE_SIZE_M);
    const dx = Math.max(x0 - fx, 0, fx - (x0 + TILE_SIZE_M));
    const dz = Math.max(z0 - fz, 0, fz - (z0 + TILE_SIZE_M));
    return Math.hypot(dx, dz);
  }

  private create(key: string, t: TileIndex): void {
    const R = this.physics.RAPIER;
    const S = TILE_SIZE_M;
    const vn = CELLS + 1;
    const step = S / CELLS;
    const org = tileOrigin(t);
    const x0 = this.frame.toX(org.e); // west edge (scene)
    const z0 = this.frame.toZ(org.n + S); // north edge (scene)
    // Rapier heightfields are column-major: index = row + col * (nrows + 1); rows run along z, columns along x.
    const colMajor = new Float32Array(vn * vn);
    for (let iz = 0; iz < vn; iz++) {
      for (let ix = 0; ix < vn; ix++) colMajor[iz + ix * vn] = this.heightAt(x0 + ix * step, z0 + iz * step);
    }
    const body = this.physics.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x0 + S / 2, 0, z0 + S / 2));
    this.physics.world.createCollider(R.ColliderDesc.heightfield(CELLS, CELLS, colMajor, { x: S, y: 1, z: S }), body);
    this.active.set(key, body);
  }
}
