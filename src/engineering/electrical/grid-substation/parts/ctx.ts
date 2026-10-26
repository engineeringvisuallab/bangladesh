import * as THREE from 'three';
import type { Mats } from '../../../core/materials';
import type { ResolvedOptions } from '../../../core/options';
import type { Site } from '../../../core/Site';
import type { SolidShape } from '../../../core/solids';
import type { AnimSet } from '../../../core/anim';

const std = (color: number, o: { rough?: number; metal?: number; opacity?: number } = {}): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0.1 });
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = false;
  }
  return m;
};

export function createGridMats() {
  return {
    porcelain: std(0x8a5a38, { rough: 0.3 }),
    glassInsul: std(0xb8d8d0, { rough: 0.2, opacity: 0.9 }),
    galv: std(0x9ea6ad, { rough: 0.55, metal: 0.7 }),
    tower: std(0x8d969e, { rough: 0.6, metal: 0.6 }),
    paintGrey: std(0x9aa3ab, { rough: 0.6, metal: 0.3 }),
    paintWhite: std(0xf0f0ee, { rough: 0.5 }),
    paintGreen: std(0x4d7a52, { rough: 0.6 }),
    steelDark: std(0x44494e, { rough: 0.5, metal: 0.6 }),
    conductor: std(0xc8ccd0, { rough: 0.35, metal: 0.8 }),
    pole: std(0x9b9588, { rough: 0.95 }),
    gravelPit: std(0x7d8084, { rough: 1 }),
    canBody: std(0x8fa3b5, { rough: 0.4, metal: 0.5 }),
    reactor: std(0xc98a3c, { rough: 0.6, metal: 0.4 }),
    screenBg: new THREE.MeshBasicMaterial({ color: 0x07131c }),
    barA: new THREE.MeshBasicMaterial({ color: 0x38e07a }),
    barB: new THREE.MeshBasicMaterial({ color: 0x4cc9f0 }),
    barC: new THREE.MeshBasicMaterial({ color: 0xffb703 }),
    bolt: new THREE.LineBasicMaterial({ color: 0xfff6c8 }),
    arc: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }),
  };
}
export type GMats = ReturnType<typeof createGridMats>;

/** What the protection demo is doing right now (written by the mv part, read by the control room screens and lamps). */
export interface FaultState {
  /** 0 = healthy, 1 = fault on the feeder (breaker tripped, feeder dead), 2 = breaker re-closed (healthy again) */
  phase: 0 | 1 | 2;
}

export interface Ctx {
  mats: Mats;
  g: GMats;
  site: Site;
  opts: ResolvedOptions;
  anim: AnimSet;
  solids: SolidShape[];
  fault: FaultState;
  /** per-feeder status lamp materials (green = closed, red = open); the control room has its own copies for the panel */
  feederLamps: THREE.MeshBasicMaterial[];
}
