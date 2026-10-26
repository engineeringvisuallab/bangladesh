import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids, type SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet } from '../../core/anim';
import { PAD, SITE } from './layout';
import { CHEM_TOUR } from './tourScript';
import { createChemMats, type Ctx } from './parts/ctx';
import { buildSiteWorks } from './parts/site';
import { buildTankFarm } from './parts/tankfarm';
import { buildDistill } from './parts/distill';
import { buildExchange } from './parts/exchange';
import { buildReactor } from './parts/reactor';
import { buildFlareControl } from './parts/flare';

/** Floating name tags: [text, x, y, z] (local metres). */
const LABELS: [string, number, number, number][] = [
  ['Main Gate', -100, 9, 66],
  ['Administration', -62, 12, 50],
  ['Crude Oil Tanks', -93, 17, -46],
  ['Product Tanks', -98, 13, -19],
  ['Feed Pump', -52, 5, -2],
  ['Heat Exchangers', -38, 7, -14],
  ['Cooling Tower', -38, 13, -58],
  ['Furnace', -15, 24, -38],
  ['Distillation Column', 38, 42, -38],
  ['Air Cooler (Condenser)', 38, 11, -52],
  ['Reflux Drum', 27, 7, -52],
  ['Stirred-Tank Reactor', 90, 11, -40],
  ['Fixed-Bed Reactor', 98, 16, -24],
  ['Flare Stack', 116, 50, -60],
  ['Control Room', 62, 11, 50],
];

export function createChemPlant(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const t = createChemMats();
  const site = new Site(SITE, PAD);
  const anim = new AnimSet();
  const extraSolids: SolidShape[] = [];
  const ctx: Ctx = { mats, t, site, opts, anim, solids: extraSolids };
  const root = new THREE.Group();
  root.name = 'chem-plant';
  const builders = [buildSiteWorks, buildTankFarm, buildExchange, buildDistill, buildReactor, buildFlareControl];
  const parts: InfraPart[] = builders.map((b) => b(ctx));
  for (const p of parts) root.add(p.group);
  root.add(site.buildGround(mats.concrete, opts.skirtDepth, mats.concreteDark));

  const labels = new THREE.Group();
  labels.name = 'labels';
  for (const [text, x, y, z] of LABELS) {
    const tag = makeLabel(text);
    tag.position.set(x, y, z);
    labels.add(tag);
  }
  root.add(labels);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mat = o.material as THREE.Material;
      const fx = o.name === 'fx';
      o.castShadow = !mat.transparent && !fx;
      o.receiveShadow = !fx;
    }
  });
  root.updateWorldMatrix(true, true);

  return {
    id: 'chem',
    nameBn: 'Chemical Process Plant',
    category: 'chemical',
    root,
    parts,
    tour: CHEM_TOUR,
    legend: [],
    footprint: { width: SITE.maxX - SITE.minX, depth: SITE.maxZ - SITE.minZ },
    solids: () => [...collectSolids(root), ...extraSolids],
    setLabelsVisible: (v) => {
      labels.visible = v;
    },
    update: (dt) => anim.update(dt),
    dispose: () => {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
      });
      Object.values(mats.pipe).forEach((m) => m.dispose());
      Object.entries(mats).forEach(([k, m]) => {
        if (k !== 'pipe') (m as THREE.Material).dispose();
      });
      Object.values(t).forEach((m) => m.dispose());
      anim.dispose();
    },
  };
}

export const chemDef: InfrastructureDef = {
  id: 'chem',
  nameBn: 'Chemical Process Plant',
  category: 'chemical',
  create: (o) => createChemPlant(o),
};
