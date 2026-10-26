import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids, type SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet } from '../../core/anim';
import { L, PAD, SITE } from './layout';
import { GRID_TOUR } from './tourScript';
import { createGridMats, type Ctx, type FaultState } from './parts/ctx';
import { buildSiteWorks } from './parts/site';
import { buildHv } from './parts/hv';
import { buildTransformers } from './parts/transformer';
import { buildMv } from './parts/mv';
import { buildControl } from './parts/control';

/** Floating Bangla name tags: [text, x, y, z] (local metres). */
const LABELS: [string, number, number, number][] = [
  ['Main Gate', -60, 10, -88],
  ['Transmission Tower', 60, 36, -106],
  ['Line Bay (132 kV)', 60, 18, -62],
  ['132 kV Bus Bar', 60, 18, -46],
  ['Power Transformer 1', 20, 17, 6],
  ['Power Transformer 2', 100, 17, 6],
  ['33 kV Feeders', 62, 14, 40],
  ['Capacitor Bank', -30, 9, 40],
  ['Control & Relay Building', -108, 14, -40],
];

export function createGridSubstation(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const gm = createGridMats();
  const site = new Site(SITE, PAD);
  const anim = new AnimSet();
  const extraSolids: SolidShape[] = [];
  const fault: FaultState = { phase: 0 };
  const feederLamps = L.feederX.map(() => new THREE.MeshBasicMaterial({ color: 0x38e07a }));
  anim.disposables.push(...feederLamps);
  const ctx: Ctx = { mats, g: gm, site, opts, anim, solids: extraSolids, fault, feederLamps };
  const root = new THREE.Group();
  root.name = 'grid';
  const builders = [buildSiteWorks, buildHv, buildTransformers, buildMv, buildControl];
  const parts: InfraPart[] = builders.map((b) => b(ctx));
  for (const p of parts) root.add(p.group);
  root.add(site.buildGround(mats.gravel, opts.skirtDepth, mats.concreteDark));

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
    id: 'grid',
    nameBn: 'Grid Substation (132/33 kV)',
    category: 'electrical',
    root,
    parts,
    tour: GRID_TOUR,
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
      Object.values(gm).forEach((m) => m.dispose());
      anim.dispose();
    },
  };
}

export const gridDef: InfrastructureDef = {
  id: 'grid',
  nameBn: 'Grid Substation (132/33 kV)',
  category: 'electrical',
  create: (o) => createGridSubstation(o),
};
