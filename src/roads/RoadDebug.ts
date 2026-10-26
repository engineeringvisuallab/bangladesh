import * as THREE from 'three';
import type { RoadNetwork } from './RoadNetwork';

/** Debug overlay: road centrelines (orange = highway, cyan = local, magenta = bridge deck) and junction markers. Toggle with key 3. */
export class RoadDebug {
  readonly group = new THREE.Group();

  constructor(roads: RoadNetwork) {
    this.group.name = 'RoadDebug';
    this.group.visible = false;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (const r of roads.roads) {
      const n = r.xs.length;
      const m = r.closed ? n : n - 1;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % n;
        const bridge = r.bridgeOf[i] >= 0 && r.bridgeOf[j] >= 0;
        c.set(bridge ? 0xff40ff : r.kind === 'highway' ? 0xff8a1f : r.kind === 'arterial' ? 0xfde047 : r.kind === 'collector' ? 0x4ade80 : 0x22d3ee);
        pos.push(r.xs[i], r.ys[i] + 1.2, r.zs[i], r.xs[j], r.ys[j] + 1.2, r.zs[j]);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    for (const j of roads.junctions) {
      c.set(j.type === 'roundabout' ? 0xffffff : j.type === '4way' ? 0xffe14a : 0x7dff7d);
      pos.push(j.x, j.y + 0.5, j.z, j.x, j.y + 12, j.z);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, fog: false }));
    lines.frustumCulled = false;
    this.group.add(lines);
  }

  toggle(): void {
    this.group.visible = !this.group.visible;
  }
  get visible(): boolean {
    return this.group.visible;
  }
  dispose(): void {
    this.group.traverse((o) => {
      const l = o as THREE.LineSegments;
      l.geometry?.dispose();
      (l.material as THREE.Material | undefined)?.dispose();
    });
  }
}
