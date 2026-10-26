import * as THREE from 'three';

/**
 * Shared types and helpers of the procedural animal models (AnimalModel: four-legged animals, AnimalExtra: birds,
 * dolphin, fish). Every animal faces +Z. The manager animates the pivots below.
 */
export type RigKind = 'quad' | 'bird' | 'croc' | 'dolphin';

export interface Rig {
  kind: RigKind;
  group: THREE.Group;
  body: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  /** Hip pivots. Quadrupeds: 0 front-left, 1 front-right, 2 back-left, 3 back-right. Birds: 0 left, 1 right. */
  legs: THREE.Group[];
  knees: THREE.Group[];
  /** Standing rotation of the hips / knees (rad); the walk cycle swings around it. */
  legRest: number[];
  kneeRest: number[];
  /** Standing height of the hip pivots above the ground (m). */
  hipY: number;
  /** Body length (m): stride length and bite distance. */
  length: number;
  /** Half the body width: how high the body lies when the animal is dead on its side (m). */
  side: number;
  /** Neck angle with the head up (negative = raised) and how far the neck goes down to graze (rad). */
  neckRest: number;
  grazeRange: number;
  /** The head rotation with the head up, and how much of the neck's graze rotation the head gives back (0..1). */
  headRest: number;
  headComp: number;
  /** Walk-cycle leg swing (rad). */
  swing: number;
  /** A hanging tail swings sideways (z); a horizontal one swings around y. */
  tailHang: boolean;
  trunk?: THREE.Group[];
  ears?: THREE.Group[];
  /** Body segments that bend while swimming (dolphin): front to back. */
  spine?: THREE.Group[];
  /** How far the body sinks below the surface while swimming (m). */
  floatDepth: number;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/** Geometry shared by all animals of one species / colour variant. */
export function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

export function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  parent.add(m);
  return m;
}

export const sm = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const DARK = [0.06, 0.05, 0.05];
