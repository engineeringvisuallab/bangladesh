import * as THREE from 'three';
import type { Mats } from '../../../core/materials';
import { box, cyl, cylH, V } from '../../../core/prims';
import type { GMats } from './ctx';

type G = THREE.Object3D;

/** Porcelain column with sheds (the "skirts" that lengthen the creepage path). */
export function insulatorColumn(g: G, gm: GMats, x: number, y: number, z: number, h: number, r = 0.2): void {
  cyl(g, r, h, gm.porcelain, x, y, z, 10);
  const n = Math.max(2, Math.round(h / 0.45));
  for (let i = 0; i < n; i++) cyl(g, r * 2, 0.07, gm.porcelain, x, y + 0.2 + (i * (h - 0.3)) / n, z, 12);
}

/** Lightning (surge) arrester: slim porcelain column with a grading ring on top. Phase pitch = distance between the 3 phases (along x). */
export function arrester(g: G, m: Mats, gm: GMats, x: number, z: number, pitch: number, k = 1): number {
  for (const dx of [-pitch, 0, pitch]) {
    box(g, 0.5, 2 * k, 0.5, m.steel, x + dx, 0, z);
    insulatorColumn(g, gm, x + dx, 2 * k, z, 3.2 * k, 0.17 * k + 0.05);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55 * k, 0.05, 6, 16), gm.galv);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x + dx, 5.35 * k, z);
    g.add(ring);
  }
  return 5.4 * k;
}

/** Capacitor voltage transformer: tall stack with a metal head. */
export function cvt(g: G, m: Mats, gm: GMats, x: number, z: number, pitch: number, k = 1): number {
  for (const dx of [-pitch, 0, pitch]) {
    box(g, 0.5, 1.8 * k, 0.5, m.steel, x + dx, 0, z);
    insulatorColumn(g, gm, x + dx, 1.8 * k, z, 3.4 * k, 0.28 * k + 0.05);
    cyl(g, 0.38 * k + 0.08, 0.6 * k, gm.paintGrey, x + dx, 5.2 * k, z, 12);
  }
  return 5.8 * k;
}

/** Isolator (disconnector): two post insulators and a rotating blade; used ONLY with no current flowing. */
export function isolator(g: G, m: Mats, gm: GMats, x: number, z: number, pitch: number, k = 1): number {
  for (const dx of [-pitch, 0, pitch]) {
    box(g, 0.45, 2 * k, 3.4 * k, m.steel, x + dx, 0, z);
    for (const dz of [-1.4, 1.4]) insulatorColumn(g, gm, x + dx, 2 * k, z + dz * k, 1.9 * k, 0.2 * k + 0.04);
    box(g, 0.16, 0.16, 3.0 * k, gm.galv, x + dx, 3.95 * k, z); // closed blade
  }
  return 4.1 * k;
}

/** Circuit breaker (SF6): two porcelain columns carrying a white horizontal interrupter, mechanism box with a status lamp. */
export function breaker(g: G, m: Mats, gm: GMats, x: number, z: number, pitch: number, k: number, lamp: THREE.Material): number {
  for (const dx of [-pitch, 0, pitch]) {
    box(g, 0.5, 1.6 * k, 0.5, m.steel, x + dx, 0, z);
    insulatorColumn(g, gm, x + dx, 1.6 * k, z - 1.2 * k, 2.2 * k, 0.2 * k + 0.05);
    insulatorColumn(g, gm, x + dx, 1.6 * k, z + 1.2 * k, 2.2 * k, 0.2 * k + 0.05);
    cylH(g, 0.42 * k + 0.05, 2.8 * k, gm.paintWhite, x + dx, 3.95 * k, z, 'z', 14);
  }
  box(g, 1.4, 1.5, 1.0, gm.paintGrey, x + pitch + 1.6, 0, z);
  box(g, 0.4, 0.4, 0.15, lamp, x + pitch + 1.6, 1.8, z + 0.55);
  return 4.4 * k;
}

/** Current transformer: oil-filled head on a porcelain column. */
export function ct(g: G, m: Mats, gm: GMats, x: number, z: number, pitch: number, k = 1): number {
  for (const dx of [-pitch, 0, pitch]) {
    box(g, 0.5, 1.6 * k, 0.5, m.steel, x + dx, 0, z);
    insulatorColumn(g, gm, x + dx, 1.6 * k, z, 2.2 * k, 0.22 * k + 0.04);
    cyl(g, 0.5 * k + 0.1, 0.9 * k, gm.paintGrey, x + dx, 3.8 * k, z, 14);
  }
  return 4.7 * k;
}

/**
 * Portal gantry (two lattice posts + beam) with insulator strings hanging from the beam, one per phase.
 * Returns the 3 conductor attach points (world-local).
 */
export function portal(g: G, m: Mats, gm: GMats, x: number, z: number, pitch: number, h: number): THREE.Vector3[] {
  const half = pitch * 2 + 1.5;
  for (const dx of [-half, half]) {
    box(g, 0.5, h, 0.5, gm.tower, x + dx, 0, z);
    box(g, 0.14, h, 0.14, gm.tower, x + dx - 0.35, 0, z - 0.35);
    box(g, 0.14, h, 0.14, gm.tower, x + dx + 0.35, 0, z + 0.35);
  }
  box(g, half * 2 + 1, 0.4, 0.5, gm.tower, x, h - 0.4, z);
  const pts: THREE.Vector3[] = [];
  for (const dx of [-pitch, 0, pitch]) {
    for (let i = 0; i < 4; i++) cyl(g, 0.22, 0.12, gm.glassInsul, x + dx, h - 1.1 - i * 0.3, z, 10);
    cyl(g, 0.03, 0.4, gm.steelDark, x + dx, h - 0.8, z, 6);
    pts.push(V(x + dx, h - 1.5, z));
  }
  void m;
  return pts;
}

export interface TowerPoints {
  phases: THREE.Vector3[];
  earth: THREE.Vector3;
}

/** Lattice steel transmission tower (line runs along z). Base at `yBase` (relative), so it can stand on lower ground. */
export function lattice(g: G, gm: GMats, x: number, z: number, h: number, yBase = 0): TowerPoints {
  const baseHalf = 3.2;
  const topHalf = 0.7;
  const dz = 0.0;
  const legH = h + (0 - yBase);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = box(g, 0.28, Math.hypot(legH, baseHalf - topHalf), 0.28, gm.tower, x, 0, z);
    leg.position.set(x + sx * (baseHalf + topHalf) / 2, yBase + legH / 2, z + sz * (baseHalf + topHalf) / 2);
    const lean = Math.atan2(baseHalf - topHalf, legH);
    leg.rotation.z = sx * lean;
    leg.rotation.x = -sz * lean;
    box(g, 1.2, 1.5, 1.2, gm.paintGrey, x + sx * baseHalf, yBase - 0.5, z + sz * baseHalf); // concrete footing
  }
  // cross braces at levels
  for (let i = 1; i <= 7; i++) {
    const f = i / 8;
    const half = baseHalf + (topHalf - baseHalf) * f;
    const y = yBase + legH * f;
    box(g, half * 2, 0.14, 0.14, gm.tower, x, y, z - half);
    box(g, half * 2, 0.14, 0.14, gm.tower, x, y, z + half);
    box(g, 0.14, 0.14, half * 2, gm.tower, x - half, y, z);
    box(g, 0.14, 0.14, half * 2, gm.tower, x + half, y, z);
  }
  // crossarm with 3 insulator strings (horizontal configuration) and an earth-wire peak on top
  const yArm = h - 4;
  box(g, 13, 0.4, 0.5, gm.tower, x, yArm, z);
  box(g, 0.4, 4, 0.4, gm.tower, x, h - 4, z);
  const phases: THREE.Vector3[] = [];
  for (const dx of [-5.5, 0, 5.5]) {
    const nDisc = 9;
    for (let i = 0; i < nDisc; i++) cyl(g, 0.34, 0.12, gm.glassInsul, x + dx, yArm - 0.3 - i * 0.22, z, 10);
    cyl(g, 0.03, nDisc * 0.22 + 0.2, gm.steelDark, x + dx, yArm - 0.3 - nDisc * 0.22, z, 6);
    phases.push(V(x + dx, yArm - 0.4 - nDisc * 0.22, z + dz));
  }
  return { phases, earth: V(x, h + 0.6, z) };
}

/** Concrete distribution pole with a crossarm (33 kV feeder, horizontal). */
export function pole(g: G, gm: GMats, x: number, z: number, h: number, yBase = 0): THREE.Vector3[] {
  cyl(g, 0.22, h - yBase, gm.pole, x, yBase, z, 10);
  box(g, 5, 0.18, 0.3, gm.steelDark, x, h - 0.6, z);
  const pts: THREE.Vector3[] = [];
  for (const dx of [-2, 0, 2]) {
    insulatorColumn(g, gm, x + dx, h - 0.45, z, 0.7, 0.07);
    pts.push(V(x + dx, h + 0.3, z));
  }
  return pts;
}
