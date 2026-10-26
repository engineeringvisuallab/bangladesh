import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids, type SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet } from '../../core/anim';
import { PAD, SITE } from './layout';
import { TECHPARK_TOUR } from './tourScript';
import { createTechMats, type Ctx } from './parts/ctx';
import { buildSiteWorks } from './parts/site';
import { buildCpu } from './parts/cpu';
import { buildAlgo } from './parts/algo';
import { buildTele } from './parts/tele';
import { buildNet } from './parts/net';
import { buildDatacenter } from './parts/datacenter';
import { buildAi } from './parts/ai';
import { buildTower } from './parts/tower';

/** Floating name tags: [text, x, y, z] (local metres). */
const LABELS: [string, number, number, number][] = [
  ['Main Gate', -166, 9, 0],
  ['CPU & Logic Hall', -110, 15, -52],
  ['Algorithms Hall', 10, 15, -52],
  ['Electronics & Telecom Lab', 122, 15, -52],
  ['Network Hall', -115, 15, 48],
  ['Data Centre', -5, 15, 48],
  ['AI Lab', 88, 15, 48],
  ['Cell Tower', 150, 54, 48],
];

export function createTechPark(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PAD.maxX);
  const mats = createMaterials();
  const t = createTechMats();
  const site = new Site(SITE, PAD);
  const anim = new AnimSet();
  const extraSolids: SolidShape[] = [];
  const lampCache = new Map<number, THREE.MeshBasicMaterial>();
  const lamp = (color: number): THREE.MeshBasicMaterial => {
    let mm = lampCache.get(color);
    if (!mm) {
      mm = new THREE.MeshBasicMaterial({ color });
      lampCache.set(color, mm);
      anim.disposables.push(mm);
    }
    return mm;
  };
  const ctx: Ctx = { mats, t, site, opts, anim, solids: extraSolids, lamp };
  const root = new THREE.Group();
  root.name = 'tech-park';
  const builders = [buildSiteWorks, buildCpu, buildAlgo, buildTele, buildNet, buildDatacenter, buildAi, buildTower];
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
    id: 'tech',
    narrationLang: 'en',
    nameBn: 'Computer Science & Electronics Park',
    category: 'electrical',
    root,
    parts,
    tour: TECHPARK_TOUR,
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

export const techDef: InfrastructureDef = {
  id: 'tech',
  nameBn: 'Computer Science & Electronics Park',
  category: 'electrical',
  create: (o) => createTechPark(o),
};
