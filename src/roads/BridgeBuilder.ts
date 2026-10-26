import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain';
import { basisFromDirection, deckSegments, spanCount } from './BridgeGeometry';
import type { BridgeSpec, RoadSpec } from './RoadTypes';

interface Part {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
}

/**
 * Visual bridges (deck slab, parapets, girders, piers down to the riverbed, steel arch ribs).
 * Parts of the same kind are drawn with ONE InstancedMesh each, so even many bridges cost only a few draw calls.
 * Everything is placed in absolute world coordinates under the world root (the floating origin moves the root).
 */
export class BridgeBuilder {
  readonly group = new THREE.Group();
  private concrete: Part[] = [];
  private rails: Part[] = [];
  private steel: Part[] = [];
  private geo = new THREE.BoxGeometry(1, 1, 1);
  private mats: THREE.MeshLambertMaterial[] = [];

  constructor(
    bridges: BridgeSpec[],
    roads: RoadSpec[],
    private terrain: TerrainGenerator,
  ) {
    this.group.name = 'Bridges';
    for (const b of bridges) this.addBridge(b, roads[b.roadId]);
    this.finish(this.concrete, 0xb4b1a8);
    this.finish(this.rails, 0xd2cfc6);
    this.finish(this.steel, 0x566b7a);
  }

  private finish(parts: Part[], color: number): void {
    if (parts.length === 0) return;
    const mat = new THREE.MeshLambertMaterial({ color });
    this.mats.push(mat);
    const mesh = new THREE.InstancedMesh(this.geo, mat, parts.length);
    const m = new THREE.Matrix4();
    parts.forEach((p, i) => mesh.setMatrixAt(i, m.compose(p.pos, p.quat, p.scale)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // instances are spread over the whole map
    this.group.add(mesh);
  }

  /** Point on the deck centreline at distance `s` (m) from the start of the deck: [position, direction]. */
  private along(r: RoadSpec, b: BridgeSpec, s: number): { p: THREE.Vector3; d: THREE.Vector3 } {
    const f = Math.max(b.i0, Math.min(b.i1 - 1e-6, b.i0 + s / r.step));
    const i = Math.floor(f);
    const t = f - i;
    const p = new THREE.Vector3(r.xs[i] + (r.xs[i + 1] - r.xs[i]) * t, r.ys[i] + (r.ys[i + 1] - r.ys[i]) * t, r.zs[i] + (r.zs[i + 1] - r.zs[i]) * t);
    const d = new THREE.Vector3(r.xs[i + 1] - r.xs[i], r.ys[i + 1] - r.ys[i], r.zs[i + 1] - r.zs[i]);
    return { p, d };
  }

  private addBridge(b: BridgeSpec, r: RoadSpec): void {
    const half = b.deckHalfWidth;
    const T = b.type === 'beam' ? 1.1 : 0.8; // slab thickness
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    for (const seg of deckSegments(r, b)) {
      const L = seg.len + 0.12;
      // slab (top surface = road surface)
      this.concrete.push({ pos: seg.mid.clone().addScaledVector(seg.ay, -T / 2), quat: seg.quat, scale: V(half * 2, T, L) });
      // parapets on both sides
      for (const side of [1, -1]) {
        this.rails.push({ pos: seg.mid.clone().addScaledVector(seg.ax, side * (half - 0.18)).addScaledVector(seg.ay, 0.5), quat: seg.quat, scale: V(0.3, 1.0, L) });
      }
      // girders under a beam bridge
      if (b.type === 'beam') {
        for (const k of [-0.6, 0, 0.6]) {
          this.concrete.push({ pos: seg.mid.clone().addScaledVector(seg.ax, half * k).addScaledVector(seg.ay, -T - 0.45), quat: seg.quat, scale: V(0.7, 0.9, L) });
        }
      }
    }

    const n = spanCount(b);
    const approach = (b.lengthM - b.spanM) / 2;
    const horiz = (d: THREE.Vector3) => basisFromDirection(V(d.x, 0, d.z)).quat;

    // piers: walls from the riverbed up to the underside of the deck
    for (let k = 1; k < n; k++) {
      const { p, d } = this.along(r, b, approach + (b.spanM * k) / n);
      const top = p.y - T - (b.type === 'beam' ? 0.9 : 0);
      const bottom = this.terrain.heightAt(p.x, p.z) - 1.5;
      const springY = b.type === 'arch' ? this.archSpring(b, r, approach, k, n, T) : top;
      const pierTop = Math.min(top, springY);
      const h = Math.max(0.5, pierTop - bottom);
      this.concrete.push({ pos: V(p.x, bottom + h / 2, p.z), quat: horiz(d), scale: V(half * 2 - 1.4, h, b.type === 'arch' ? 2.6 : 1.5) });
    }

    // steel arch ribs, one arch per span, two ribs (left / right), with columns up to the deck
    if (b.type === 'arch') {
      for (let k = 0; k < n; k++) {
        const sA = approach + (b.spanM * k) / n;
        const sB = approach + (b.spanM * (k + 1)) / n;
        const rise = Math.min(0.2 * (sB - sA), 18);
        const mid = this.along(r, b, (sA + sB) / 2);
        const crown = mid.p.y - T - 0.7;
        const spring = crown - rise;
        const N = 14;
        for (const side of [1, -1]) {
          let prev: THREE.Vector3 | null = null;
          for (let i = 0; i <= N; i++) {
            const t = i / N;
            const a = this.along(r, b, sA + (sB - sA) * t);
            const lat = new THREE.Vector3(-a.d.z, 0, a.d.x).normalize().multiplyScalar(side * (half - 1.0));
            const y = spring + rise * (1 - (2 * t - 1) ** 2);
            const p = V(a.p.x + lat.x, y, a.p.z + lat.z);
            if (prev) {
              const dir = p.clone().sub(prev);
              const len = dir.length();
              this.steel.push({ pos: prev.clone().add(p).multiplyScalar(0.5), quat: basisFromDirection(dir).quat, scale: V(0.8, 0.9, len + 0.1) });
            }
            // spandrel column between rib and deck
            if (i > 0 && i < N && i % 2 === 0) {
              const under = a.p.y - T;
              const h = Math.max(0.2, under - y);
              this.steel.push({ pos: V(p.x, y + h / 2, p.z), quat: horiz(a.d), scale: V(0.45, h, 0.45) });
            }
            prev = p;
          }
        }
      }
    }
  }

  /** Height where the arches of span k-1 and k meet on pier k. */
  private archSpring(b: BridgeSpec, r: RoadSpec, approach: number, k: number, n: number, T: number): number {
    const sA = approach + (b.spanM * (k - 1)) / n;
    const sB = approach + (b.spanM * k) / n;
    const rise = Math.min(0.2 * (sB - sA), 18);
    const mid = this.along(r, b, (sA + sB) / 2);
    return mid.p.y - T - 0.7 - rise;
  }

  dispose(): void {
    this.geo.dispose();
    for (const m of this.mats) m.dispose();
  }
}
