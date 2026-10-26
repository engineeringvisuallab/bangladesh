import * as THREE from 'three';
import type { Mats } from '../../../core/materials';
import type { ResolvedOptions } from '../../../core/options';
import type { Site } from '../../../core/Site';
import type { SolidShape } from '../../../core/solids';
import type { AnimSet } from '../../../core/anim';

const std = (color: number, o: { rough?: number; metal?: number; opacity?: number; flat?: boolean } = {}): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0.05, flatShading: o.flat ?? false });
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = false;
  }
  return m;
};
const basic = (color: number, opacity = 1): THREE.MeshBasicMaterial => {
  const m = new THREE.MeshBasicMaterial({ color });
  if (opacity < 1) {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
  }
  return m;
};

/** Extra materials only the dam site needs. */
export function createDamMats() {
  return {
    rock: std(0x7b7266, { rough: 1, flat: true }),
    rockDark: std(0x5a5249, { rough: 1, flat: true }),
    rockLight: std(0x958b7c, { rough: 1, flat: true }),
    soilBrown: std(0x6b5238, { rough: 1 }),
    reservoir: std(0x2f7fa8, { opacity: 0.88, rough: 0.15, metal: 0.1 }),
    river: std(0x3b8fb0, { opacity: 0.85, rough: 0.2 }),
    spill: std(0xe6f3fa, { opacity: 0.72, rough: 0.3 }),
    mist: basic(0xffffff, 0.6),
    gateOrange: std(0xd9822b, { rough: 0.5, metal: 0.5 }),
    steelDark: std(0x44494e, { rough: 0.5, metal: 0.6 }),
    paintGrey: std(0x9aa3ab, { rough: 0.6, metal: 0.3 }),
    paintWhite: std(0xf0f0ee, { rough: 0.6 }),
    porcelain: std(0x8a5a38, { rough: 0.3 }),
    glass: std(0xaec2cf, { opacity: 0.3, rough: 0.2, metal: 0.4 }),
    blade: std(0xcfd4d9, { rough: 0.3, metal: 0.85 }),
    generator: std(0x5b7ea8, { rough: 0.45, metal: 0.45 }),
    poleRed: std(0xb23a2e, { rough: 0.5 }),
    poleBlue: std(0x2f6fbd, { rough: 0.5 }),
    copper: std(0xb87333, { rough: 0.4, metal: 0.8 }),
    dark: std(0x1c2024, { rough: 0.9 }),
    lvlGreen: basic(0x2ecc71),
    lvlRed: basic(0xe74c3c),
    lvlBlue: basic(0x3498db),
    arrowRed: basic(0xe53935),
    arrowGreen: basic(0x43a047),
    arrowOrange: basic(0xfb8c00),
    modelWater: std(0x3a8fc4, { opacity: 0.7, rough: 0.2 }),
    soilGlass: std(0x6b5238, { opacity: 0.55, rough: 1 }),
    screenBg: basic(0x07131c),
    barA: basic(0x38e07a),
    barB: basic(0x4cc9f0),
    barC: basic(0xffb703),
    lampG: basic(0x38e07a),
    buoy: std(0xf2b01e, { rough: 0.6 }),
  };
}
export type DMats = ReturnType<typeof createDamMats>;

export interface Ctx {
  mats: Mats;
  t: DMats;
  site: Site;
  opts: ResolvedOptions;
  anim: AnimSet;
  /** collision shapes that cannot be found from the meshes (extruded dam profile) */
  solids: SolidShape[];
}

/** Deterministic pseudo-random number in 0..1 (same look on every run). */
export function rnd(i: number): number {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** An axis-aligned collision box (corners x0..x1, y0..y1, z0..z1). */
export function solidBox(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): SolidShape {
  return { kind: 'box', c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], q: [0, 0, 0, 1], h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2] };
}

/** Extrude a side profile [(z, y), ...] along x from x0 to x1 (the dam body). */
export function extrudeProfile(pts: [number, number][], x0: number, x1: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  pts.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);
  geo.translate(x1, 0, 0);
  return new THREE.Mesh(geo, mat);
}

/**
 * A slab lying on a slope in the side view: from (z0, y0) to (z1, y1) (z1 > z0), `w` wide along x, `th` thick, lifted `lift` above the line.
 * Used for the spillway chute, its water sheet, training walls and the bridge ramps.
 */
export function slopeBox(parent: THREE.Object3D, mat: THREE.Material, w: number, th: number, z0: number, y0: number, z1: number, y1: number, x: number, lift = 0): THREE.Mesh {
  const dz = z1 - z0;
  const dy = y1 - y0;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, th, Math.hypot(dz, dy)), mat);
  const ang = Math.atan2(-dy, dz);
  mesh.rotation.x = ang;
  const k = lift + th / 2;
  mesh.position.set(x, (y0 + y1) / 2 + Math.cos(ang) * k, (z0 + z1) / 2 + Math.sin(ang) * k);
  parent.add(mesh);
  return mesh;
}
