import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids, type SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet } from '../../core/anim';
import { PAD, SITE } from './layout';
import { FactorySim } from './sim';
import { AUTOMATION_TOUR } from './tourScript';
import { createAutoMats, type Ctx } from './parts/ctx';
import { buildSiteWorks } from './parts/site';
import { buildSensors } from './parts/sensors';
import { buildPid } from './parts/pid';
import { buildPlc } from './parts/plc';
import { buildFactory } from './parts/factory';

/** Floating name tags: [text, x, y, z] (local metres). */
const LABELS: [string, number, number, number][] = [
  ['Main Gate', 176, 9, 0],
  ['Sensor Lab', -140, 12, -60],
  ['Process Control Lab (PID)', -70, 14, -60],
  ['PLC & Control Room', -5, 12, -60],
  ['Administration', 100, 11, -58],
  ['Automated Production Hall', -62, 15, 40],
  ['Warehouse & AGV', 62, 15, 40],
];

export function createAutomationPlant(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const t = createAutoMats();
  const site = new Site(SITE, PAD);
  const anim = new AnimSet();
  const sim = new FactorySim();
  anim.add((_tm, dt) => sim.step(dt)); // the line is simulated ONCE per frame, before any part is drawn
  const extraSolids: SolidShape[] = [];
  const ctx: Ctx = { mats, t, site, opts, anim, solids: extraSolids, sim };
  const root = new THREE.Group();
  root.name = 'automation';
  const builders = [buildSiteWorks, buildSensors, buildPid, buildPlc, buildFactory];
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
  const shade = (o: THREE.Object3D): void => {
    if (o instanceof THREE.Mesh) {
      const mat = o.material as THREE.Material;
      const fx = o.name === 'fx';
      o.castShadow = !mat.transparent && !fx;
      o.receiveShadow = !fx;
    }
  };
  root.traverse(shade);
  root.updateWorldMatrix(true, true);

  return {
    id: 'auto',
    narrationLang: 'en',
    nameBn: 'Automation & Robotics Plant',
    category: 'mechanical',
    root,
    parts,
    tour: AUTOMATION_TOUR,
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

export const autoDef: InfrastructureDef = {
  id: 'auto',
  nameBn: 'Automation & Robotics Plant',
  category: 'mechanical',
  create: (o) => createAutomationPlant(o),
};
