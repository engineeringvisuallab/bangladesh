import * as THREE from 'three';
import type { BridgeSpec, RoadSpec } from './RoadTypes';

/** One straight piece of bridge deck (between two centreline points). Shared by the visuals and the Rapier colliders. */
export interface DeckSegment {
  /** Middle of the TOP surface of the deck (world metres). */
  mid: THREE.Vector3;
  len: number;
  /** Local axes: x = across the deck, y = up (perpendicular to the deck), z = along the road. */
  quat: THREE.Quaternion;
  ax: THREE.Vector3;
  ay: THREE.Vector3;
  az: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);

export function basisFromDirection(dir: THREE.Vector3): { quat: THREE.Quaternion; ax: THREE.Vector3; ay: THREE.Vector3; az: THREE.Vector3 } {
  const az = dir.clone().normalize();
  const ax = new THREE.Vector3().crossVectors(UP, az).normalize();
  const ay = new THREE.Vector3().crossVectors(az, ax).normalize();
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ax, ay, az));
  return { quat, ax, ay, az };
}

export function deckSegments(road: RoadSpec, b: BridgeSpec): DeckSegment[] {
  const out: DeckSegment[] = [];
  for (let i = b.i0; i < b.i1; i++) {
    const a = new THREE.Vector3(road.xs[i], road.ys[i], road.zs[i]);
    const c = new THREE.Vector3(road.xs[i + 1], road.ys[i + 1], road.zs[i + 1]);
    const d = c.clone().sub(a);
    const len = d.length();
    out.push({ mid: a.clone().add(c).multiplyScalar(0.5), len, ...basisFromDirection(d) });
  }
  return out;
}

/** Number of spans (and therefore piers + 1) a bridge needs. Beam bridges: spans <= 25 m, arch bridges: <= 100 m. */
export function spanCount(b: BridgeSpec): number {
  return Math.max(1, Math.ceil(b.spanM / (b.type === 'beam' ? 25 : 100)));
}
