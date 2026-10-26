import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids, type SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet } from '../../core/anim';
import { PAD, SITE } from './layout';
import { RENEW_TOUR } from './tourScript';
import { createRenewMats, Sim, type Ctx } from './parts/ctx';
import { buildSiteWorks } from './parts/site';
import { buildSolar } from './parts/solar';
import { buildWind } from './parts/wind';
import { buildBattery } from './parts/battery';
import { buildGrid } from './parts/grid';
import { buildControl } from './parts/control';

/** Floating name tags: [text, x, y, z] (local metres). */
const LABELS: [string, number, number, number][] = [
  ['Main Gate', -100, 9, 84],
  ['Administration', -60, 11, 72],
  ['Solar Field', -88, 9, -44],
  ['Solar Module Demo', -112, 8, 20],
  ['Inverter', -14, 7, 0],
  ['Wind Turbine 1', 30, 50, -60],
  ['Wind Turbine 2', 75, 50, -62],
  ['Wind Turbine 3', 120, 50, -56],
  ['Weather Mast', 78, 24, 58],
  ['Battery Storage', 76, 8, 22],
  ['Transformer', 30, 9, -10],
  ['Pylon to the Grid', 148, 19, -10],
  ['Energy Control Centre', 40, 11, 72],
];

export function createRenewPark(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const anim = new AnimSet();
  const t = createRenewMats(anim);
  const site = new Site(SITE, PAD);
  const sim = new Sim();
  anim.add((tt, dt) => sim.update(tt, dt)); // first in the list: every part reads the same day
  sim.update(0, 0);
  const extraSolids: SolidShape[] = [];
  const ctx: Ctx = { mats, t, site, opts, anim, solids: extraSolids, sim };
  const root = new THREE.Group();
  root.name = 'renew-park';
  const builders = [buildSiteWorks, buildSolar, buildWind, buildBattery, buildGrid, buildControl];
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
    id: 'renew',
    narrationLang: 'en',
    nameBn: 'Renewable Energy Park',
    category: 'energy',
    root,
    parts,
    tour: RENEW_TOUR,
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

export const renewDef: InfrastructureDef = {
  id: 'renew',
  nameBn: 'Renewable Energy Park',
  category: 'energy',
  create: (o) => createRenewPark(o),
};
