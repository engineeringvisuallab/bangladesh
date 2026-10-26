import * as THREE from 'three';
import type { Mats } from '../../../core/materials';
import type { ResolvedOptions } from '../../../core/options';
import type { Site } from '../../../core/Site';
import type { SolidShape } from '../../../core/solids';
import type { AnimSet } from '../../../core/anim';

const std = (color: number, o: { rough?: number; metal?: number; opacity?: number } = {}): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0.3 });
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

export function createTechMats() {
  return {
    steel: std(0xb7bec6, { rough: 0.3, metal: 0.85 }),
    steelDark: std(0x3f454b, { rough: 0.5, metal: 0.6 }),
    frame: std(0x5b6670, { rough: 0.5, metal: 0.6 }),
    cabinet: std(0xd8dde2, { rough: 0.5, metal: 0.3 }),
    cabinetDark: std(0x2d3238, { rough: 0.6, metal: 0.4 }),
    plate: std(0x1f2428, { rough: 0.9 }),
    panel: std(0x2c3a46, { rough: 0.8 }),
    rack: std(0x23282d, { rough: 0.5, metal: 0.5 }),
    glass: Object.assign(std(0xaed4e6, { opacity: 0.22, rough: 0.1, metal: 0.2 }), { side: THREE.DoubleSide }),
    cold: std(0x7fc4ff, { opacity: 0.22, rough: 0.2 }),
    hot: std(0xff8a4c, { opacity: 0.22, rough: 0.2 }),
    cloud: std(0xdfe9f3, { opacity: 0.35, rough: 0.4 }),
    screenBg: basic(0x07131c),
    off: basic(0x2a3036),
    green: basic(0x38e07a),
    red: basic(0xff3b30),
    amber: basic(0xffb703),
    blue: basic(0x4c8dff),
    cyan: basic(0x4cc9f0),
    white: basic(0xf2f6fa),
    wireOff: basic(0x39424a),
    pcb: std(0x1f7a4d, { rough: 0.6, metal: 0.2 }),
    copper: std(0xb8693d, { rough: 0.4, metal: 0.8 }),
    tower: std(0xc8ccd0, { rough: 0.6, metal: 0.6 }),
    dish: std(0xe9edf0, { rough: 0.4, metal: 0.4 }),
    laptop: std(0x9aa3ab, { rough: 0.4, metal: 0.6 }),
  };
}
export type TMats = ReturnType<typeof createTechMats>;

export interface Ctx {
  mats: Mats;
  t: TMats;
  site: Site;
  opts: ResolvedOptions;
  anim: AnimSet;
  solids: SolidShape[];
  /** shared "lamp" materials: lamp(0x38e07a) returns the SAME material for the same colour (so hundreds of lamps cost nothing) */
  lamp(color: number): THREE.MeshBasicMaterial;
}
