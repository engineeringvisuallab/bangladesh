import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids, type SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet } from '../../core/anim';
import { PAD, SITE } from './layout';
import { VEHICLE_TOUR } from './tourScript';
import { createVehMats, type Ctx } from './parts/ctx';
import { buildSiteWorks } from './parts/site';
import { buildLine } from './parts/line';
import { buildPress } from './parts/press';
import { buildBody } from './parts/body';
import { buildPaint } from './parts/paint';
import { buildBattery } from './parts/battery';
import { buildAssembly } from './parts/assembly';
import { buildEol } from './parts/eol';
import { buildWarehouse } from './parts/warehouse';
import { buildDesign } from './parts/design';
import { buildTesting } from './parts/testing';

const NAME = 'EV Vehicle Factory';

/** Floating English name tags: [text, x, y, z, scale] (local metres). */
const LABELS: [string, number, number, number, number?][] = [
  ['Main gate', 0, 10, 140],
  ['Visitor centre', -34, 12, 122],
  ['Design studio', -156, 15, 32],
  ['Wind tunnel', -127, 12, 32],
  ['Steel coils', -150, 12, -112],
  ['Press shop', -146, 17, -25],
  ['Body shop', -82, 16, -25],
  ['Pre-treatment + e-coat dips', -35, 12, -25, 0.8],
  ['Paint booths', -4, 16, -25],
  ['Cure oven', 17, 10, -25, 0.8],
  ['Battery shop', 48, 16, -112],
  ['Motor line', 86, 8, -98, 0.8],
  ['Final assembly', 70, 16, -25],
  ['Marriage station', 60, 8, -25, 0.8],
  ['Wheel fitting', 84, 8, -25, 0.8],
  ['End-of-line tests', 150, 14, -25],
  ['Roller dynamometer', 142, 5, -25, 0.7],
  ['Water test', 129, 7, -25, 0.7],
  ['Crash lab', -55, 14, 32],
  ['Test track', 106, 12, 60],
  ['Skid pad', 106, 6, 96, 0.8],
  ['Vehicle yard', 150, 8, 30],
  ['Car carrier', 140, 7, 10, 0.8],
  ['Parts warehouse', -60, 20, -112],
];

export function createVehicleFactory(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const t = createVehMats();
  const site = new Site(SITE, PAD);
  const anim = new AnimSet();
  const extraSolids: SolidShape[] = [];
  const ctx: Ctx = { mats, t, site, opts, anim, solids: extraSolids, line: { cars: [] } };
  const root = new THREE.Group();
  root.name = 'vehicle';
  // the line is built first: other parts read the cars (the marriage lift follows them)
  const builders = [buildSiteWorks, buildLine, buildPress, buildBody, buildPaint, buildBattery, buildAssembly, buildEol, buildWarehouse, buildDesign, buildTesting];
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
    id: 'vehicle',
    nameBn: NAME,
    category: 'mechanical',
    narrationLang: 'en',
    root,
    parts,
    tour: VEHICLE_TOUR,
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

export const vehicleDef: InfrastructureDef = {
  id: 'vehicle',
  nameBn: NAME,
  category: 'mechanical',
  create: (o) => createVehicleFactory(o),
};
