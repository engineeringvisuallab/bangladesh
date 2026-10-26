import * as THREE from 'three';
import type { RailNetwork } from './RailNetwork';

/**
 * Debug overlay of the railway PLAN (nothing is built yet): the track centre lines (black-yellow = on the ground,
 * magenta = tunnel, orange = bridge / viaduct), the station areas (rings + a tall pole) and the road crossings
 * (red = road flyover, cyan = road underpass, magenta = tunnel, white = already a road bridge). Toggle with key 4.
 */
export class RailDebug {
  readonly group = new THREE.Group();

  constructor(rail: RailNetwork) {
    this.group.name = 'RailDebug';
    this.group.visible = false;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    const seg = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number): void => {
      c.set(hex);
      pos.push(x0, y0, z0, x1, y1, z1);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    };
    for (const e of rail.edges) {
      for (let i = 0; i < e.xs.length - 1; i++) {
        const kind = e.segments.find((s) => e.cum[i] >= s.s0 && e.cum[i] <= s.s1)?.kind ?? 'ground';
        const hex = kind === 'tunnel' ? 0xff40ff : kind === 'bridge' ? 0xff9a1f : i % 4 < 2 ? 0x111111 : 0xffe14a;
        // two parallel lines (= two rails) 1.5 m apart, 2 m above the natural ground
        const dx = e.xs[i + 1] - e.xs[i];
        const dz = e.zs[i + 1] - e.zs[i];
        const l = Math.hypot(dx, dz) || 1;
        const nx = (-dz / l) * 0.75;
        const nz = (dx / l) * 0.75;
        for (const sgn of [-1, 1]) {
          seg(e.xs[i] + nx * sgn, e.ground[i] + 2, e.zs[i] + nz * sgn, e.xs[i + 1] + nx * sgn, e.ground[i + 1] + 2, e.zs[i + 1] + nz * sgn, hex);
        }
      }
    }
    for (const s of rail.stations) {
      const hex = s.kind === 'freight' ? 0xff8a1f : s.kind === 'mixed' ? 0x7dff7d : 0x4aa3ff;
      const M = 48;
      for (let i = 0; i < M; i++) {
        const a0 = (i / M) * Math.PI * 2;
        const a1 = ((i + 1) / M) * Math.PI * 2;
        seg(s.x + Math.cos(a0) * s.radius, s.y + 3, s.z + Math.sin(a0) * s.radius, s.x + Math.cos(a1) * s.radius, s.y + 3, s.z + Math.sin(a1) * s.radius, hex);
      }
      seg(s.x, s.y, s.z, s.x, s.y + 70, s.z, hex);
    }
    for (const x of rail.crossings) {
      const hex = x.kind === 'road-over-rail' ? 0xff4040 : x.kind === 'rail-over-road' ? 0x22d3ee : x.kind === 'rail-tunnel' ? 0xff40ff : 0xffffff;
      const e = rail.edges.find((q) => q.id === x.edgeId)!;
      let i = 0;
      while (i < e.cum.length - 2 && e.cum[i + 1] < x.s) i++;
      seg(x.x, e.ground[i] + 2, x.z, x.x, e.ground[i] + 28, x.z, hex);
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
