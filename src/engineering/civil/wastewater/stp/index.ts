import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../../core/types';
import { resolveOptions } from '../../../core/options';
import { collectSolids } from '../../../core/solids';
import { createMaterials } from '../../../core/materials';
import { Site } from '../../../core/Site';
import { makeLabel } from '../../../core/Labels';
import { PAD, SITE } from './layout';
import { STP_TOUR } from './tourScript';
import type { Ctx } from './parts/ctx';
import { buildEnvironment } from './parts/env';
import { buildSiteWorks } from './parts/site';
import { buildGate } from './parts/gate';
import { buildInlet } from './parts/inlet';
import { buildGrit } from './parts/grit';
import { buildPrimary } from './parts/primary';
import { buildAeration } from './parts/aeration';
import { buildSecondary } from './parts/secondary';
import { buildDisinfection } from './parts/disinfection';
import { buildThickener } from './parts/thickener';
import { buildDigester } from './parts/digester';
import { buildDewatering } from './parts/dewatering';
import { buildElectrical } from './parts/electrical';
import { buildAdmin } from './parts/admin';

export function createStp(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const site = new Site(SITE, PAD);
  const ctx: Ctx = { mats, site, opts };
  const root = new THREE.Group();
  root.name = 'stp';
  const builders = [
    buildEnvironment, buildSiteWorks, buildGate, buildInlet, buildGrit, buildPrimary, buildAeration, buildSecondary,
    buildDisinfection, buildThickener, buildDigester, buildDewatering, buildElectrical, buildAdmin,
  ];
  const parts: InfraPart[] = builders.filter((b) => opts.withEnvironment || b !== buildEnvironment).map((b) => b(ctx));
  for (const p of parts) root.add(p.group);
  root.add(site.buildGround(mats.gravel, opts.skirtDepth, mats.concreteDark));

  const labels = new THREE.Group();
  labels.name = 'labels';
  root.updateWorldMatrix(true, true);
  const tourParts = new Set(STP_TOUR.map((t) => t.partId));
  for (const p of parts) {
    if (!tourParts.has(p.id)) continue;
    const box = new THREE.Box3().setFromObject(p.group);
    const c = box.getCenter(new THREE.Vector3());
    const tag = makeLabel(p.nameBn);
    // disinfection includes the long outfall pipe: put its tag over the contact tank
    tag.position.set(p.id === 'disinfection' ? 100 : c.x, Math.min(box.max.y, 22) + 4.5, p.id === 'disinfection' ? 10 : c.z);
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
    id: 'stp',
    nameBn: 'Sewage Treatment Plant (STP)',
    category: 'civil',
    root,
    parts,
    tour: STP_TOUR,
    legend: ['sewage', 'effluent', 'sludge', 'air', 'biogas', 'chlorine'],
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

export const stpDef: InfrastructureDef = {
  id: 'stp',
  nameBn: 'Sewage Treatment Plant (STP)',
  category: 'civil',
  create: (o) => createStp(o),
};
