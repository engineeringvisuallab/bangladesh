import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../../core/types';
import { resolveOptions } from '../../../core/options';
import { collectSolids } from '../../../core/solids';
import { createMaterials } from '../../../core/materials';
import { Site } from '../../../core/Site';
import { makeLabel } from '../../../core/Labels';
import { PAD, SITE } from './layout';
import { SWTP_TOUR } from './tourScript';
import type { Ctx } from './parts/ctx';
import { buildEnvironment } from './parts/env';
import { buildSiteWorks } from './parts/site';
import { buildGate } from './parts/gate';
import { buildIntake } from './parts/intake';
import { buildIntakePump } from './parts/intakePump';
import { buildRawMain } from './parts/rawMain';
import { buildRapidMix } from './parts/rapidMix';
import { buildChemicalHouse } from './parts/chemicalHouse';
import { buildFlocculation } from './parts/flocculation';
import { buildSedimentation } from './parts/sedimentation';
import { buildFiltration } from './parts/filtration';
import { buildBackwash } from './parts/backwash';
import { buildDisinfection } from './parts/disinfection';
import { buildReservoir } from './parts/reservoir';
import { buildHighLift } from './parts/highLift';
import { buildDelivery } from './parts/delivery';
import { buildSludge } from './parts/sludge';
import { buildElectrical } from './parts/electrical';
import { buildAdmin } from './parts/admin';

export function createSwtp(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'W', -PAD.minX);
  const mats = createMaterials();
  const site = new Site(SITE, PAD);
  const ctx: Ctx = { mats, site, opts };
  const root = new THREE.Group();
  root.name = 'swtp';

  const builders = [
    buildEnvironment, buildSiteWorks, buildGate, buildIntake, buildIntakePump, buildRawMain, buildRapidMix, buildChemicalHouse,
    buildFlocculation, buildSedimentation, buildFiltration, buildBackwash, buildDisinfection, buildReservoir, buildHighLift,
    buildDelivery, buildSludge, buildElectrical, buildAdmin,
  ];
  const parts: InfraPart[] = builders.filter((b) => opts.withEnvironment || b !== buildEnvironment).map((b) => b(ctx));
  for (const p of parts) root.add(p.group);
  root.add(site.buildGround(mats.gravel, opts.skirtDepth, mats.concreteDark)); // after the parts: they registered their pits

  // floating name tags above each tour part
  const labels = new THREE.Group();
  labels.name = 'labels';
  root.updateWorldMatrix(true, true);
  const tourParts = new Set(SWTP_TOUR.map((t) => t.partId));
  for (const p of parts) {
    if (!tourParts.has(p.id)) continue;
    const box = new THREE.Box3().setFromObject(p.group);
    const c = box.getCenter(new THREE.Vector3());
    const tag = makeLabel(p.nameBn, p.id === 'delivery' ? 0.8 : 1);
    tag.position.set(p.id === 'delivery' ? 15 : c.x, box.max.y + 4.5, p.id === 'delivery' ? 70 : c.z);
    labels.add(tag);
  }
  root.add(labels);

  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mat = o.material as THREE.Material;
      o.castShadow = !mat.transparent;
      o.receiveShadow = true;
    }
  });

  return {
    id: 'swtp',
    nameBn: 'Surface Water Treatment Plant (SWTP)',
    category: 'civil',
    root,
    parts,
    tour: SWTP_TOUR,
    legend: ['raw', 'settled', 'filtered', 'chemical', 'chlorine', 'sludge', 'backwash', 'delivery'],
    footprint: { width: SITE.maxX - SITE.minX, depth: SITE.maxZ - SITE.minZ },
    solids: () => collectSolids(root),
    setLabelsVisible: (v) => {
      labels.visible = v;
    },
    dispose: () => {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
      });
      Object.values(mats.pipe).forEach((m) => m.dispose());
      Object.entries(mats).forEach(([k, m]) => {
        if (k !== 'pipe') (m as THREE.Material).dispose();
      });
    },
  };
}

export const swtpDef: InfrastructureDef = {
  id: 'swtp',
  nameBn: 'Surface Water Treatment Plant (SWTP)',
  category: 'civil',
  create: (o) => createSwtp(o),
};
