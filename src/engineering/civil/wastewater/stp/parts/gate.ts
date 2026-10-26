import * as THREE from 'three';
import type { InfraPart } from '../../../../core/types';
import { box, cyl } from '../../../../core/prims';
import { makeSign } from '../../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';

export function buildGate({ mats: m }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'gate';
  const { x, z } = L.gate;
  for (const sx of [-5, 5]) {
    box(g, 1.1, 3.4, 1.1, m.concrete, x + sx, 0, z);
    box(g, 1.4, 0.3, 1.4, m.concreteDark, x + sx, 3.4, z);
  }
  box(g, 11, 0.5, 0.6, m.steel, x, 4.4, z);
  const sign = makeSign('Sewage Treatment Plant (STP)', 9, 1.8);
  sign.position.set(x, 5.5, z + 0.35);
  g.add(sign);
  box(g, 9, 2.4, 0.12, m.steel, x - 9.5, 0.3, z);
  for (let i = 0; i < 10; i++) box(g, 0.08, 2.4, 0.14, m.concreteDark, x - 13.5 + i * 0.95, 0.3, z);
  box(g, 4.2, 3.0, 3.6, m.wall, x - 8, 0, z - 6);
  box(g, 4.8, 0.3, 4.2, m.roof, x - 8, 3.0, z - 6);
  box(g, 0.1, 1.2, 2.4, m.glass, x - 5.85, 1.3, z - 6);
  box(g, 0.4, 1.1, 0.4, m.red, x - 4, 0, z - 3);
  box(g, 7, 0.14, 0.14, m.white, x - 0.5, 1.0, z - 3);
  cyl(g, 0.05, 4, m.steel, x + 8, 0, z - 8, 6);
  return { id: 'gate', nameBn: 'Main Gate & Security', group: g };
}
