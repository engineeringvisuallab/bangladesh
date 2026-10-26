import * as THREE from 'three';
import type { Mats } from '../../../../core/materials';
import { box, cyl } from '../../../../core/prims';

/** Mechanism of a circular clarifier: centre pier, feed well, rotating bridge with scraper, effluent launder ring. */
export function clarifierMech(g: THREE.Group, m: Mats, x: number, z: number, r: number, depth: number, top: number, rot = 0.6): void {
  cyl(g, 1.0, depth + top + 0.5, m.concrete, x, -depth, z, 20);
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 2.4, 28, 1, true), m.concreteDS);
  feed.position.set(x, -1.2, z);
  g.add(feed);
  const bridge = new THREE.Group();
  bridge.position.set(x, 0, z);
  bridge.rotation.y = rot;
  box(bridge, r, 0.3, 0.9, m.steel, r / 2, top + 0.15, 0);
  box(bridge, r, 0.06, 0.06, m.steel, r / 2, top + 1.2, 0.4);
  box(bridge, r, 0.06, 0.06, m.steel, r / 2, top + 0.7, 0.4);
  box(bridge, 1.2, 0.9, 1.4, m.motor, r - 0.6, top + 0.3, 0);
  box(bridge, 0.5, 0.5, 0.5, m.steel, r - 0.3, top - 0.4, 0);
  box(bridge, r - 1.2, 0.12, 0.3, m.steel, r / 2 + 0.6, -depth + 0.5, 0); // scraper arm near the floor
  for (let i = 0; i < 5; i++) box(bridge, 0.12, 0.5, 1.4, m.steel, 2.5 + i * ((r - 4) / 4), -depth + 0.55, 0.4);
  g.add(bridge);
  const weir = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.9, r - 0.9, 0.7, 56, 1, true), m.concreteDS);
  weir.position.set(x, top - 0.55, z);
  g.add(weir);
}
