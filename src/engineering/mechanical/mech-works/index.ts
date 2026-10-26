import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids, type SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet } from '../../core/anim';
import { PAD, SITE } from './layout';
import { MECH_TOUR } from './tourScript';
import { createMechMats, type Ctx } from './parts/ctx';
import { buildSiteWorks } from './parts/site';
import { buildEngine } from './parts/engine';
import { buildMechanisms } from './parts/mechanisms';
import { buildShop } from './parts/shop';
import { buildHydraulics } from './parts/hydraulics';
import { buildRefrigeration } from './parts/refrigeration';

/** Floating Bangla name tags: [text, x, y, z] (local metres). */
const LABELS: [string, number, number, number][] = [
  ['Main Gate', 166, 9, 0],
  ['Engine Test Cell', -150, 16, -55],
  ['Mechanisms Hall', -50, 13, -55],
  ['Machine Shop', 75, 14, -55],
  ['Hydraulics Bay', -120, 14, 55],
  ['Refrigeration Plant', -25, 12, 55],
  ['Administration Building', 140, 11, 58],
];

export function createMechWorks(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const t = createMechMats();
  const site = new Site(SITE, PAD);
  const anim = new AnimSet();
  const extraSolids: SolidShape[] = [];
  const ctx: Ctx = { mats, t, site, opts, anim, solids: extraSolids };
  const root = new THREE.Group();
  root.name = 'mech-works';
  const builders = [buildSiteWorks, buildEngine, buildMechanisms, buildShop, buildHydraulics, buildRefrigeration];
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
    id: 'mech',
    nameBn: 'Mechanical Works',
    category: 'mechanical',
    root,
    parts,
    tour: MECH_TOUR,
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

export const mechDef: InfrastructureDef = {
  id: 'mech',
  nameBn: 'Mechanical Works',
  category: 'mechanical',
  create: (o) => createMechWorks(o),
};
