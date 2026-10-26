import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Tiny helpers to build underwater models from primitives: every part gets a vertex colour (from its position) and an
 * `aFlap` weight (turtle flippers), is made non-indexed and loses its uv, so all parts merge into ONE geometry.
 */
export function part(
  geo: THREE.BufferGeometry,
  colorFn: (x: number, y: number, z: number) => [number, number, number],
  flapFn?: (x: number, y: number, z: number) => number,
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const fl = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const c = colorFn(x, y, z);
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
    fl[i] = flapFn ? flapFn(x, y, z) : 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFlap', new THREE.BufferAttribute(fl, 1));
  if (g !== geo) geo.dispose();
  return g;
}

export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(parts, false);
  if (!m) throw new Error('water geometry merge failed');
  for (const p of parts) p.dispose();
  return m;
}

/** Deterministic hash of two integers (+ salt) -> 0..1. */
export function hash2(a: number, b: number, salt = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(salt | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise 0..1 on a lattice of 1 unit. */
export function vnoise(x: number, z: number, salt = 0): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, salt);
  const b = hash2(ix + 1, iz, salt);
  const c = hash2(ix, iz + 1, salt);
  const d = hash2(ix + 1, iz + 1, salt);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
