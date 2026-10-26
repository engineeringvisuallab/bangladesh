import * as THREE from 'three';
import type { Mats } from '../../../core/materials';
import type { ResolvedOptions } from '../../../core/options';
import type { Site } from '../../../core/Site';
import type { SolidShape } from '../../../core/solids';
import type { AnimSet } from '../../../core/anim';

const std = (color: number, o: { rough?: number; metal?: number; opacity?: number; double?: boolean } = {}): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0.1 });
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = false;
  }
  if (o.double) m.side = THREE.DoubleSide;
  return m;
};

/** Extra materials only the thermal plant needs. */
export function createThermalMats() {
  return {
    lagging: std(0xc9ced4, { rough: 0.35, metal: 0.7 }),
    porcelain: std(0x8a5a38, { rough: 0.3 }),
    paintGrey: std(0x9aa3ab, { rough: 0.6, metal: 0.3 }),
    paintRed: std(0xc0392b, { rough: 0.6 }),
    paintWhite: std(0xf0f0ee, { rough: 0.6 }),
    furnaceGlass: std(0x9fc4d8, { opacity: 0.28, rough: 0.1, metal: 0.2 }),
    casingGlass: std(0xaec2cf, { opacity: 0.3, rough: 0.2, metal: 0.4 }),
    tube: std(0xb5442c, { rough: 0.5, metal: 0.4 }),
    tubeHot: std(0xd9822b, { rough: 0.5, metal: 0.4 }),
    steelDark: std(0x44494e, { rough: 0.5, metal: 0.6 }),
    generator: std(0x5b7ea8, { rough: 0.45, metal: 0.45 }),
    blade: std(0xcfd4d9, { rough: 0.3, metal: 0.85 }),
    towerShell: std(0xcfcdc6, { rough: 0.95, double: true }),
    towerWater: std(0x3c93a8, { opacity: 0.85, rough: 0.2 }),
    fill: std(0x3a3f44, { rough: 1 }),
    hotPipe: std(0xd9822b, { rough: 0.5, metal: 0.25 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xff8a1c, transparent: true, opacity: 0.88, depthWrite: false }),
    flameCore: new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, depthWrite: false }),
    screenBg: new THREE.MeshBasicMaterial({ color: 0x07131c }),
    barA: new THREE.MeshBasicMaterial({ color: 0x38e07a }),
    barB: new THREE.MeshBasicMaterial({ color: 0x4cc9f0 }),
    barC: new THREE.MeshBasicMaterial({ color: 0xffb703 }),
    lampG: new THREE.MeshBasicMaterial({ color: 0x38e07a }),
    lampR: new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    resinBlue: std(0x2f6fbd, { rough: 0.5 }),
    resinRed: std(0xb23a2e, { rough: 0.5 }),
    asphaltLine: std(0xe8e6d8, { rough: 0.9 }),
  };
}
export type TMats = ReturnType<typeof createThermalMats>;

export interface Ctx {
  mats: Mats;
  t: TMats;
  site: Site;
  opts: ResolvedOptions;
  anim: AnimSet;
  /** collision shapes that cannot be found from the meshes (e.g. the lathe-turned cooling tower) */
  solids: SolidShape[];
}
