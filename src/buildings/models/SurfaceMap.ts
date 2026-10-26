import * as THREE from 'three';

/**
 * SURFACES: which real-world material each part of a building is made of.
 * The building code only gives a colour per part; `classifySurface` decides the material from the colour + kind of part
 * (+ optional per-model overrides), so brick, plaster, tin, thatch, tile ... get their own texture without touching every call.
 */

export type Surface =
  | 'plain' | 'brick' | 'plaster' | 'concrete' | 'tin' | 'thatch' | 'roofTile' | 'mud' | 'earth' | 'stone'
  | 'wood' | 'bamboo' | 'foliage' | 'bark' | 'metal' | 'grass' | 'asphalt' | 'water' | 'glass';

export type PartKind = 'box' | 'cyl' | 'sphere' | 'roof';
export type SurfaceOverrides = Partial<Record<number, Surface>>;

/** Texture size in metres [along u, along v] and bump strength. */
export const SURFACE_SPEC: Record<Exclude<Surface, 'plain'>, { file: string; size: [number, number]; bump: number }> = {
  brick: { file: 'brick', size: [0.96, 0.6], bump: 1.6 },
  plaster: { file: 'plaster', size: [3, 3], bump: 0.2 },
  concrete: { file: 'concrete', size: [4, 4], bump: 0.4 },
  tin: { file: 'tin', size: [0.9, 2.2], bump: 2.2 },
  thatch: { file: 'thatch', size: [1.6, 1.6], bump: 1.6 },
  roofTile: { file: 'roof_tile', size: [1.6, 1.6], bump: 1.8 },
  mud: { file: 'mud', size: [3, 3], bump: 1.0 },
  earth: { file: 'earth', size: [4, 4], bump: 0.8 },
  stone: { file: 'stone', size: [1.6, 1.6], bump: 1.0 },
  wood: { file: 'wood', size: [1.0, 1.4], bump: 0.8 },
  bamboo: { file: 'bamboo', size: [1.0, 1.0], bump: 1.4 },
  foliage: { file: 'foliage', size: [3, 3], bump: 1.2 },
  bark: { file: 'bark', size: [0.7, 1.6], bump: 1.4 },
  metal: { file: 'metal', size: [2, 2], bump: 0.1 },
  grass: { file: 'grass', size: [3, 3], bump: 0.8 },
  asphalt: { file: 'asphalt', size: [3, 3], bump: 0.6 },
  water: { file: 'water', size: [6, 6], bump: 0.2 },
  glass: { file: 'glass', size: [4, 4], bump: 0 },
};

const TIN = new Set([0x6f9fb8, 0x7fae8a, 0xb7a58a, 0x9cb0b6, 0x9fb0b5, 0x8d9aa0, 0x7d8a8f, 0x7f8a8e, 0x6a6f73]);
const METAL = new Set([0xb7bcc2, 0xb8c0c4, 0xaab4b8, 0xb6c0c4, 0x9a9a95, 0xc9c9c9, 0xdddddd, 0xeeeeee, 0xb8c0c8, 0x555a60, 0x3a4a52, 0x2b343a, 0x3d3d3f, 0x2d3439, 0x333333, 0x222222, 0x3b3b3b, 0x30343a, 0x2b3037, 0x1d2530, 0x24323b]);
const FOLIAGE = new Set([0x3f7a35, 0x2f6a30, 0x4f8a3a, 0x55a63c, 0x3f8a3a, 0x6bb04a, 0x4b8a42, 0x4b8a3f, 0x4b7f3f, 0x3f6f38, 0x386230, 0x6b9a4a, 0x74b05a, 0x6b8a3a, 0x8aa84a]);
const WATER = new Set([0x38a8cc, 0x3f9ab8, 0x4cb0d0, 0x9ad8ee]);
const BARK = new Set([0x6b4a2f, 0x7a6a50, 0x6b5a45, 0x5a4330, 0x5a4338, 0x5a4a3a]);
const WOOD = new Set([0x5a3f2a, 0x7a5a3a, 0x8a6a45, 0x5a3a24, 0x8b6b3d, 0x8d6a40, 0x7a5c33, 0x7d5f28, 0x3a2a1a, 0x2b1d14, 0xc8a77d, 0xb98a5c, 0x8a4a2a]);
const BAMBOO = new Set([0xb59f55, 0xc7b36a, 0xa88a52]);

const _c = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

/** @param dims size of the part [w,h,d] in metres (cylinders: 2r,h,2r). */
export function classifySurface(kind: PartKind, color: number, dims: readonly [number, number, number], over?: SurfaceOverrides): Surface {
  const o = over?.[color];
  if (o) return o;
  _c.setHex(color);
  _c.getHSL(_hsl, THREE.SRGBColorSpace);
  const { h, s, l } = _hsl;
  const [w, hh, d] = dims;
  const flat = hh <= 0.5 && w >= 1.5 && d >= 1.5;

  if (kind === 'roof') {
    if (TIN.has(color) || METAL.has(color)) return 'tin';
    if ((h < 0.07 || h > 0.95) && s > 0.3) return 'roofTile';
    if (h >= 0.07 && h <= 0.2 && s > 0.3) return 'thatch';
    return 'tin';
  }
  if (WATER.has(color) && (flat || kind === 'cyl')) return 'water';
  if (FOLIAGE.has(color)) {
    if (kind === 'box' && flat) return 'grass';
    return 'foliage';
  }
  if (kind === 'sphere') return 'plain';
  if (TIN.has(color)) return 'tin';
  if (METAL.has(color)) return 'metal';
  if (BAMBOO.has(color)) return 'bamboo';
  if (BARK.has(color) && !flat) return kind === 'cyl' ? 'bark' : 'wood';
  if (BARK.has(color)) return 'earth';
  if (WOOD.has(color)) return 'wood';
  // bright, saturated paint (signs, awnings, cars, accents)
  if (s > 0.5 && l > 0.3) return 'plain';
  // brick red
  if ((h < 0.07 || h > 0.97) && s > 0.34 && l > 0.28 && l < 0.52) return 'brick';
  // flat ground
  if (flat) {
    if (l < 0.36 && s < 0.2) return 'asphalt';
    if (h >= 0.06 && h <= 0.13 && s > 0.2 && l > 0.42 && l < 0.7) return 'earth';
    return 'concrete';
  }
  if (s < 0.12) return l < 0.8 ? 'concrete' : 'plaster';
  if (s > 0.38 && l < 0.5) return 'plain';
  return 'plaster';
}
