import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building, V } from '../../../core/prims';
import { every, flow } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { bx, cy, mesh } from './helpers';

/** Cell tower (base station): lattice mast with three sector antennas and two microwave dishes, waves spreading out, a fibre line to the ground cabinet. */
export function buildTower({ mats: m, t, anim, lamp, opts }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'tower';
  const T = L.tower;
  const H = 46;
  const yBase = Math.min(0, opts.groundY(T.x, T.z));
  // 4 tapering legs, braces, platform
  const baseHalf = 3.4;
  const topHalf = 0.6;
  const legH = H - yBase;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = bx(g, 0.35, Math.hypot(legH, baseHalf - topHalf), 0.35, t.tower, T.x, 0, T.z);
    leg.position.set(T.x + (sx * (baseHalf + topHalf)) / 2, yBase + legH / 2, T.z + (sz * (baseHalf + topHalf)) / 2);
    const lean = Math.atan2(baseHalf - topHalf, legH);
    leg.rotation.z = sx * lean;
    leg.rotation.x = -sz * lean;
    bx(g, 1.4, 1.4, 1.4, t.cabinet, T.x + sx * baseHalf, yBase - 0.6, T.z + sz * baseHalf);
  }
  for (let i = 1; i <= 14; i++) {
    const f = i / 15;
    const half = baseHalf + (topHalf - baseHalf) * f;
    const y = yBase + legH * f;
    bx(g, half * 2, 0.16, 0.16, t.tower, T.x, y, T.z - half);
    bx(g, half * 2, 0.16, 0.16, t.tower, T.x, y, T.z + half);
    bx(g, 0.16, 0.16, half * 2, t.tower, T.x - half, y, T.z);
    bx(g, 0.16, 0.16, half * 2, t.tower, T.x + half, y, T.z);
  }
  bx(g, 4.4, 0.3, 4.4, t.steelDark, T.x, H - 1.0, T.z);
  // three sector antennas (panels) around the top
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3;
    const p = bx(g, 0.5, 3.6, 0.2, t.dish, T.x + Math.sin(a) * 2.4, H - 4.4, T.z + Math.cos(a) * 2.4);
    p.rotation.y = a;
  }
  // two microwave dishes
  for (const [dx, dy, a] of [[2.4, H - 8.5, Math.PI / 2], [-2.4, H - 11, -Math.PI / 2]] as const) {
    const dish = mesh(g, new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, 0, 0.9), t.dish, T.x + dx, dy, T.z);
    dish.rotation.z = dx > 0 ? -Math.PI / 2 : Math.PI / 2;
    void a;
  }
  cy(g, 0.12, 4, t.steelDark, T.x, H - 0.8, T.z, 8);
  bx(g, 0.5, 0.5, 0.5, lamp(0xff3b30), T.x, H + 3.2, T.z);
  // waves spreading from the antennas (flat translucent rings that grow and fade)
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const rmat = new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    anim.disposables.push(rmat);
    const r = mesh(g, new THREE.RingGeometry(0.96, 1.0, 48), rmat, T.x, H - 4.4, T.z);
    r.rotation.x = -Math.PI / 2;
    r.name = 'fx';
    anim.disposables.push(r.geometry);
    rings.push(r);
  }
  every(anim, (tm) => {
    rings.forEach((r, i) => {
      const ph = (tm * 0.3 + i / 5) % 1;
      r.scale.setScalar(2 + ph * 60);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - ph) * (1 - ph);
    });
  });
  // ground cabinet (the base station electronics) + fibre going up the tower
  bx(g, 3.0, 2.2, 1.6, t.cabinet, T.x + 7, 0, T.z + 1);
  bx(g, 1.4, 0.8, 0.1, lamp(0x38e07a), T.x + 7, 1.2, T.z + 1.85);
  flow(anim, g, [V(T.x + 7, 2.2, T.z + 1), V(T.x + 1.4, 2.2, T.z + 1), V(T.x + 0.2, yBase + 4, T.z + 0.2), V(T.x + 0.2, H - 4.4, T.z + 0.2)], { color: 0xffd23f, speed: 12, spacing: 3.5, size: 0.14 });
  const s = makeSign('CELL TOWER (BASE STATION)', 9, 0.8);
  s.position.set(T.x, 9, T.z + 4.4);
  g.add(s);
  void building; void m;
  return { id: 'tower', nameBn: 'Cell Tower', group: g };
}
