/**
 * Ground height in scene coordinates (x east, z south, metres). The terrain mesh, and later the vehicle physics
 * (wheel ray-casts, colliders), all ask this one interface - so swapping the flat ground for a real height-map
 * (SRTM / Copernicus DEM, or a PNG you paint) changes only the class behind it.
 */
export interface Heightfield {
  heightAt(x: number, z: number): number;
}

export class FlatHeightfield implements Heightfield {
  constructor(private readonly y: number) {}
  heightAt(_x: number, _z: number): number {
    return this.y;
  }
}
