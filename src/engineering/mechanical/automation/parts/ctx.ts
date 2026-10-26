import * as THREE from 'three';
import type { Mats } from '../../../core/materials';
import type { ResolvedOptions } from '../../../core/options';
import type { Site } from '../../../core/Site';
import type { SolidShape } from '../../../core/solids';
import type { AnimSet } from '../../../core/anim';
import type { FactorySim } from '../sim';

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

export function createAutoMats() {
  return {
    steel: std(0xb7bec6, { rough: 0.3, metal: 0.85 }),
    steelDark: std(0x3f454b, { rough: 0.5, metal: 0.6 }),
    frame: std(0x5b6670, { rough: 0.5, metal: 0.6 }),
    beltTop: std(0x23272b, { rough: 0.95, metal: 0.05 }),
    beltMark: basic(0x3a4046),
    robotOrange: std(0xe8731a, { rough: 0.4, metal: 0.4 }),
    robotGrey: std(0xcfd4d9, { rough: 0.4, metal: 0.4 }),
    boxShort: std(0x3aa56a, { rough: 0.7 }),
    boxTall: std(0xe8731a, { rough: 0.7 }),
    pallet: std(0xb08a58, { rough: 0.9 }),
    agvBody: std(0x2f6fbd, { rough: 0.4, metal: 0.4 }),
    agvStripe: std(0xffd23f, { rough: 0.6 }),
    rackFrame: std(0x2f5f9e, { rough: 0.5, metal: 0.5 }),
    rackBeam: std(0xe8731a, { rough: 0.5, metal: 0.4 }),
    cabinet: std(0xd8dde2, { rough: 0.5, metal: 0.3 }),
    cabinetDark: std(0x2d3238, { rough: 0.6, metal: 0.4 }),
    glass: Object.assign(std(0xaed4e6, { opacity: 0.22, rough: 0.1, metal: 0.2 }), { side: THREE.DoubleSide }),
    water: std(0x3c93a8, { opacity: 0.8, rough: 0.2 }),
    screenBg: basic(0x07131c),
    plate: std(0x2b2f33, { rough: 0.9 }),
    red: basic(0xff3b30),
    green: basic(0x38e07a),
    amber: basic(0xffb703),
    cyan: basic(0x4cc9f0),
    off: basic(0x2a3036),
    beamRed: basic(0xff2a2a, 0.55),
    wave: basic(0x7fd0ff, 0.5),
    alarmBg: basic(0x07131c),
  };
}
export type AMats = ReturnType<typeof createAutoMats>;

export interface Ctx {
  mats: Mats;
  t: AMats;
  site: Site;
  opts: ResolvedOptions;
  anim: AnimSet;
  solids: SolidShape[];
  sim: FactorySim;
}
