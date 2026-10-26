import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids, type SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet } from '../../core/anim';
import { PAD, SITE } from './layout';
import { DAM_TOUR } from './tourScript';
import { createDamMats, type Ctx } from './parts/ctx';
import { buildSiteWorks } from './parts/site';
import { buildReservoir } from './parts/reservoir';
import { buildDam } from './parts/dam';
import { buildSpillway } from './parts/spillway';
import { buildRiver } from './parts/river';
import { buildIntake } from './parts/intake';
import { buildPowerhouse } from './parts/powerhouse';
import { buildElectrical } from './parts/electrical';
import { buildControl } from './parts/control';
import { buildModel } from './parts/model';

const NAME = 'Dam & Hydropower Station (2 x 25 MW)';

/** Floating English name tags: [text, x, y, z, scale] (local metres). */
const LABELS: [string, number, number, number, number?][] = [
  ['Main gate', 0, 10, 98],
  ['Visitor building', -42, 11, 92],
  ['Reservoir', 0, 46, -60],
  ['River inflow', 36, 60, -94],
  ['Concrete gravity dam', -62, 52, -21],
  ['Spillway radial gates', 0, 50, -19],
  ['Spillway chute', 0, 22, 0],
  ['Stilling basin', 0, 8, 36],
  ['Intake towers', 66, 54, -30],
  ['Full level 36 m', 66, 38, -38, 0.7],
  ['Max flood level 40 m', 66, 42, -38, 0.7],
  ['Min drawdown 26 m', 66, 25, -38, 0.7],
  ['Penstocks', 66, 24, 4],
  ['Powerhouse', 66, 22, 28],
  ['Generator', 58, 16, 28],
  ['Francis turbine', 58, 1, 34],
  ['Tailrace', 66, 5, 46],
  ['Downstream river', 30, 5, 62],
  ['Step-up transformers', 97, 15, 28],
  ['132 kV switchyard', 129, 18, 28],
  ['To the national grid', 160, 32, 28],
  ['Control room', -122, 15, 34],
  ['Forces on a dam (model)', -74, 20, 34],
];

export function createDamStation(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const t = createDamMats();
  const site = new Site(SITE, PAD);
  const anim = new AnimSet();
  const extraSolids: SolidShape[] = [];
  const ctx: Ctx = { mats, t, site, opts, anim, solids: extraSolids };
  const root = new THREE.Group();
  root.name = 'dam';
  const builders = [buildSiteWorks, buildReservoir, buildDam, buildSpillway, buildRiver, buildIntake, buildPowerhouse, buildElectrical, buildControl, buildModel];
  const parts: InfraPart[] = builders.map((b) => b(ctx));
  for (const p of parts) root.add(p.group);
  root.add(site.buildGround(mats.concrete, opts.skirtDepth, mats.concreteDark));

  const labels = new THREE.Group();
  labels.name = 'labels';
  for (const [text, x, y, z, sc] of LABELS) {
    const tag = makeLabel(text, sc ?? 1);
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
    id: 'dam',
    nameBn: NAME,
    category: 'civil',
    narrationLang: 'en',
    root,
    parts,
    tour: DAM_TOUR,
    legend: ['penstock'],
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

export const damDef: InfrastructureDef = {
  id: 'dam',
  nameBn: NAME,
  category: 'civil',
  create: (o) => createDamStation(o),
};
