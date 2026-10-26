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

export function createMechMats() {
  return {
    cast: std(0x6d747b, { rough: 0.7, metal: 0.5 }),
    steel: std(0xb7bec6, { rough: 0.3, metal: 0.85 }),
    steelDark: std(0x3f454b, { rough: 0.5, metal: 0.6 }),
    brass: std(0xc9a227, { rough: 0.35, metal: 0.8 }),
    copper: std(0xb8693d, { rough: 0.4, metal: 0.8 }),
    gearA: std(0xd4572f, { rough: 0.45, metal: 0.6 }),
    gearB: std(0x2f6fbd, { rough: 0.45, metal: 0.6 }),
    gearC: std(0x3aa56a, { rough: 0.45, metal: 0.6 }),
    belt: std(0x1d1d1f, { rough: 0.9, metal: 0.05 }),
    paintBlue: std(0x2e5c8a, { rough: 0.55 }),
    paintGreen: std(0x3f7d5a, { rough: 0.55 }),
    paintRed: std(0xb5382c, { rough: 0.55 }),
    paintGrey: std(0x8f979e, { rough: 0.6 }),
    paintWhite: std(0xefefec, { rough: 0.5 }),
    glass: Object.assign(std(0xaed4e6, { opacity: 0.22, rough: 0.1, metal: 0.2 }), { side: THREE.DoubleSide }),
    cold: std(0x9fd4ff, { opacity: 0.2, rough: 0.1 }),
    oil: std(0xd89a2b, { opacity: 0.55, rough: 0.2 }),
    plate: std(0x2b2f33, { rough: 0.9 }),
    fin: std(0xc2cbd2, { rough: 0.4, metal: 0.8 }),
    pipeHot: std(0xc23b2e, { rough: 0.5, metal: 0.4 }),
    pipeLiquid: std(0xe08a2e, { rough: 0.5, metal: 0.4 }),
    pipeCold: std(0x4aa8e0, { rough: 0.5, metal: 0.4 }),
    pipeSuction: std(0x9ed8e8, { rough: 0.5, metal: 0.4 }),
    pipeOilP: std(0xb3541e, { rough: 0.5, metal: 0.4 }),
    pipeOilR: std(0x4c6f93, { rough: 0.5, metal: 0.4 }),
    mark: basic(0xff3b30),
    markY: basic(0xffd23f),
    spark: basic(0xffb347),
    lampOff: basic(0x333a40),
    /** colour of the gas inside the engine cylinder (changes with the stroke) */
    gas: basic(0x7fd0ff, 0.55),
    flash: basic(0xffffff, 0.95),
  };
}
export type MMats = ReturnType<typeof createMechMats>;

export interface Ctx {
  mats: Mats;
  t: MMats;
  site: Site;
  opts: ResolvedOptions;
  anim: AnimSet;
  solids: SolidShape[];
}
