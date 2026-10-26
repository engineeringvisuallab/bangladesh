import * as THREE from 'three';
import { Kit, pick, type BuiltBuilding } from './BuildingKit';

/** RELIGIOUS: মসজিদ, মন্দির, গির্জা, ঈদগাহ. */

const GOLD = 0xd9b44a;

/** Crescent finial on a short mast (metal). */
function crescent(k: Kit, x: number, y: number, z: number, s = 1): void {
  k.withSurface('metal', () => {
    k.cyl(x, y, z, 0.07 * s, 0.05 * s, 1.2 * s, GOLD, 6);
    k.sphere(x, y + 1.3 * s, z, 0.28 * s, GOLD);
    k.withMatrix(new THREE.Matrix4().makeTranslation(x, y + 2.0 * s, z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), () => {
      k.cyl(0, -0.04, 0, 0.5 * s, 0.5 * s, 0.08, GOLD, 12);
    });
    k.withMatrix(new THREE.Matrix4().makeTranslation(x + 0.18 * s, y + 2.0 * s, z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), () => {
      k.cyl(0, -0.05, 0, 0.46 * s, 0.46 * s, 0.1, 0xe9e6de, 12);
    });
  });
}

/** Minaret: square shaft, balcony, small dome. */
function minaret(k: Kit, x: number, z: number, h: number, shaft: number, color: number): void {
  k.box(x, 0, z, shaft * 1.5, 0.8, shaft * 1.5, 0xe9e6de);
  k.cyl(x, 0.8, z, shaft * 0.62, shaft * 0.5, h * 0.6, color, 12);
  k.cyl(x, 0.8 + h * 0.6, z, shaft * 0.95, shaft * 0.95, 0.35, 0xe9e6de, 12);
  k.cyl(x, 1.15 + h * 0.6, z, shaft * 0.75, shaft * 0.75, 0.9, 0xcfc7b6, 12);
  k.cyl(x, 2.05 + h * 0.6, z, shaft * 0.85, shaft * 0.85, 0.25, 0xe9e6de, 12);
  k.cyl(x, 2.3 + h * 0.6, z, shaft * 0.5, shaft * 0.35, h * 0.3, color, 12);
  k.withSurface('plaster', () => k.dome(x, 2.3 + h * 0.9, z, shaft * 0.6, shaft * 0.9, 0x1a7a4a, 14));
  crescent(k, x, 2.3 + h * 0.9 + shaft * 0.9, z, 0.7);
}

/** মসজিদ: big central dome, four domed corner minarets, pointed-arch facade, courtyard with wudu area, wall. */
export function buildMosque(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 48, D = 52;
  const wall = pick(seed, [0xf4efe4, 0xe9e6de]);
  const dome = pick(seed, [0x1a7a4a, 0xe9e6de, 0x2f6f9f]);
  k.box(0, 0, 0, W, 0.06, D, 0xcfc7b6);
  // prayer hall
  const hw = 26, hd = 22, hh = 9, hz = -6;
  k.box(0, 0, hz, hw + 1.4, 0.8, hd + 1.4, 0xcfc7b6);
  k.box(0, 0.8, hz, hw, hh, hd, wall);
  k.box(0, 0.8 + hh, hz, hw + 0.8, 0.5, hd + 0.8, 0xe9e6de);
  k.parapet(0, 1.3 + hh, hz, hw + 0.8, hd + 0.8, 1.0, 0.25, wall);
  // facade arches: 5 big pointed arch openings on the front, glass infill
  for (let i = 0; i < 5; i++) {
    const x = -9 + i * 4.5;
    k.arch(x, 0.8, hz + hd / 2 + 0.06, 3.0, 6.4, 0.12, 0x3c6a86, true);
    k.arch(x, 0.8, hz + hd / 2 + 0.04, 3.7, 7.0, 0.1, 0xcfc7b6);
  }
  for (const side of ['left', 'right'] as const) {
    for (let i = 0; i < 3; i++) {
      const z = hz - 6 + i * 6;
      k.local(side === 'left' ? -hw / 2 : hw / 2, 0, z, side === 'left' ? -Math.PI / 2 : Math.PI / 2, () => {
        k.arch(0, 0.8, 0.06, 2.4, 5.4, 0.12, 0x3c6a86, true);
        k.arch(0, 0.8, 0.04, 3.0, 6.0, 0.1, 0xcfc7b6);
      });
    }
  }
  // central dome on a drum + 4 small domes at the corners
  k.cyl(0, 1.3 + hh, hz, 7.6, 7.6, 2.2, wall, 20);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.arch(Math.cos(a) * 7.62, 1.3 + hh + 0.3, Math.sin(a) * 7.62 + hz, 1.1, 1.8, 0.2, 0x3c6a86, true);
  }
  k.withSurface('plaster', () => k.dome(0, 3.5 + hh, hz, 8.2, 8.0, dome, 28));
  k.cyl(0, 3.5 + hh + 8.0, hz, 0.25, 0.1, 1.2, 0xe9e6de, 8);
  crescent(k, 0, 4.6 + hh + 8.0, hz, 1.3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.withSurface('plaster', () => k.dome(sx * 9.5, 1.3 + hh, hz + sz * 7.5, 2.4, 2.8, dome, 16));
    crescent(k, sx * 9.5, 1.3 + hh + 2.8, hz + sz * 7.5, 0.5);
  }
  // four minarets at the hall corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) minaret(k, sx * 15.5, hz + sz * 13, 18, 1.5, 0xf4efe4);
  // porch (verandah) in front with columns
  k.box(0, 0, 11, 22, 0.4, 5, 0xcfc7b6);
  for (let i = 0; i <= 6; i++) k.cyl(-10 + i * 3.33, 0.4, 13.2, 0.35, 0.3, 4.4, 0xf4efe4, 10);
  k.box(0, 4.8, 12, 22.5, 0.4, 4.6, 0xe9e6de);
  // courtyard: wudu (ablution) tap row, shoe racks, trees, lamps
  k.box(-14, 0, 20, 10, 0.5, 2.2, 0xcfc7b6);
  for (let i = 0; i < 6; i++) k.cyl(-18 + i * 1.6, 0.5, 20.7, 0.07, 0.07, 0.5, 0xb7bcc2, 6);
  k.box(-14, 2.8, 20, 11, 0.2, 3.2, 0x8d9aa0);
  for (const x of [-18.6, -9.4]) k.cyl(x, 0, 21, 0.1, 0.1, 2.8, 0x6a6a68, 6);
  for (const x of [8, 11, 14]) k.box(x, 0, 18, 2.2, 0.8, 0.6, 0x7a5a3a);
  for (const [x, z] of [[-20, 12], [20, 12], [-20, -22], [20, -22]] as const) k.tree(x, z, 6, 0x4b8a42);
  // boundary wall with arched gate
  k.boundaryWall(0, 0, W - 0.6, D - 0.6, 0xe9e6de, 0xcfc7b6, 7.0, 2.2);
  return k.finish(W, D, 4.6 + hh + 8.0 + 3.5);
}

/** মন্দির: Bengal-style temple: stepped shikhara over the sanctum, four small corner towers, pillared hall (mandap), courtyard, wall. */
export function buildTemple(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 40, D = 44;
  const body = pick(seed, [0xf1ede4, 0xe9c9a8, 0xd9b48a]);
  const trim = 0xb85c38;
  k.box(0, 0, 0, W, 0.06, D, 0xcfc7b6);
  // raised platform
  k.box(0, 0.06, -4, 22, 1.0, 22, 0xcfc7b6);
  k.box(0, 1.06, -4, 20, 0.3, 20, 0xe9e6de);
  // sanctum (garbhagriha) + doorway
  const sw = 10, sz = -8;
  k.box(0, 1.36, sz, sw, 7.0, sw, body);
  k.box(0, 1.36, sz, sw + 0.4, 0.5, sw + 0.4, trim);
  k.arch(0, 1.36, sz + sw / 2 + 0.05, 3.0, 5.0, 0.1, 0x2b1d14);
  k.arch(0, 1.36, sz + sw / 2 + 0.03, 3.8, 5.6, 0.1, GOLD);
  k.box(0, 8.4, sz, sw + 0.6, 0.5, sw + 0.6, trim);
  // stepped, tapering shikhara tower (curved profile)
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    const w = (sw - 0.4) * (1 - 0.82 * Math.pow(t, 0.8));
    k.box(0, 8.9 + i * 0.95, sz, w, 0.95, w, i % 2 ? body : 0xe9d8c0);
    k.box(0, 8.9 + i * 0.95, sz, w + 0.3, 0.2, w + 0.3, trim);
  }
  const tipY = 8.9 + 12 * 0.95;
  k.withSurface('plaster', () => k.dome(0, tipY, sz, 0.9, 0.8, 0xf4efe4, 12));
  k.withSurface('metal', () => { k.cyl(0, tipY + 0.8, sz, 0.1, 0.1, 1.4, GOLD, 6); k.sphere(0, tipY + 2.4, sz, 0.28, GOLD); });
  // four corner mini-shikharas
  for (const sx of [-1, 1]) for (const zz of [-1, 1]) {
    const x = sx * 4.4, z = sz + zz * 4.4;
    k.box(x, 8.9, z, 2.4, 1.6, 2.4, body);
    for (let i = 0; i < 5; i++) k.box(x, 10.5 + i * 0.7, z, 2.2 * (1 - i * 0.17), 0.7, 2.2 * (1 - i * 0.17), i % 2 ? body : 0xe9d8c0);
    k.withSurface('metal', () => k.sphere(x, 14.2, z, 0.3, GOLD));
  }
  // pillared hall (mandap) in front, gable roof, open sides
  const mz = 6;
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) k.cyl(sx * 5, 1.36, mz - 3 + i * 3.2, 0.34, 0.3, 4.4, 0xf4efe4, 10);
  k.box(0, 5.7, mz + 1.6, 11.4, 0.5, 11.2, trim);
  k.local(0, 6.2, mz + 1.6, Math.PI / 2, () => k.gable(0, 0, 0, 11.6, 12.0, 2.6, 0xa8452b));
  // altar, bell, tulsi platform, lamp post
  k.box(0, 1.36, mz + 2, 2.6, 0.6, 1.4, 0xe9e6de);
  k.cyl(-6.2, 1.36, mz + 5.6, 0.5, 0.5, 0.5, 0xe9e6de, 8);
  k.box(6.2, 0, 15, 1.6, 0.6, 1.6, 0xcfc7b6);
  k.cyl(6.2, 0.6, 15, 0.3, 0.2, 0.4, 0x6b8a3a, 8);
  k.cyl(-9, 0, 14, 0.15, 0.1, 3.4, 0x555a60, 6);
  k.withSurface('metal', () => k.sphere(-9, 3.6, 14, 0.4, GOLD));
  // temple pond corner (small) and trees
  k.box(12, 0.06, -17, 8, 0.15, 6, 0x7a5a3a);
  k.box(12, 0.2, -17, 7, 0.06, 5, 0x3f9ab8);
  for (const [x, z] of [[-14, -18], [-15, 8], [15, 8], [15, -6]] as const) k.tree(x, z, 6, 0x4b8a42);
  k.boundaryWall(0, 0, W - 0.6, D - 0.6, 0xe9c9a8, trim, 5.0, 2.2);
  return k.finish(W, D, 17);
}

/** গির্জা: gothic church: long nave with tall pointed windows, front bell tower with spire, rose window, buttresses, porch, graves. */
export function buildChurch(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 36, D = 52;
  const wall = pick(seed, [0xe9e6de, 0xd9d4c8]);
  const roof = 0x6a6f73;
  k.box(0, 0, 0, W, 0.06, D, 0x74b05a);
  k.box(0, 0.06, 5, 26, 0.5, 40, 0xb9b6ae);
  k.box(0, 0.56, 5, 12, 0.3, 40.4, 0x8a8a85);
  // nave
  const nw = 11, nd = 28, nh = 9, nz = 0;
  k.box(0, 0.56, nz, nw, nh, nd, wall);
  k.local(0, 0.56 + nh, nz, Math.PI, () => k.gable(0, 0, 0, nw + 1.6, nd + 1.6, 5.5, roof));
  // aisles (lower) both sides
  for (const s of [-1, 1]) {
    k.box(s * 7.4, 0.56, nz, 3.8, 5.2, nd, wall);
    k.box(s * 7.9, 5.76, nz, 3.4, 0.25, nd + 0.8, roof);
  }
  // tall pointed windows on the nave walls (clerestory) and aisles, buttresses between
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = nz - nd / 2 + 2.3 + i * ((nd - 4.6) / 5);
      k.local(s * (nw / 2), 0, z, s > 0 ? Math.PI / 2 : -Math.PI / 2, () => {
        k.arch(0, 0.56 + 3.2, 0.05, 1.3, 4.6, 0.12, 0x3c6a86, true);
        k.arch(0, 0.56 + 3.1, 0.03, 1.8, 5.2, 0.1, 0xcfc7b6);
      });
      k.box(s * 9.4, 0.56, z + 1.5, 0.7, 5.6, 0.7, 0xcfc7b6);
    }
  }
  // front: bell tower with spire, rose window, big door
  const tz = nz + nd / 2 + 3.5, tw = 8;
  k.box(0, 0.56, tz, tw, 16, 7, wall);
  k.box(0, 16.5, tz, tw + 0.8, 0.5, 7.8, 0xcfc7b6);
  for (const sx of [-1, 1]) k.box(sx * (tw / 2 + 0.2), 0.56, tz + 3.2, 1.0, 12, 1.0, 0xcfc7b6);
  k.arch(0, 0.56, tz + 3.55, 3.2, 5.6, 0.12, 0x5a3a24);
  k.arch(0, 0.56, tz + 3.52, 4.2, 6.4, 0.1, 0xcfc7b6);
  k.withMatrix(new THREE.Matrix4().makeTranslation(0, 9.2, tz + 3.6).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), () => {
    k.cyl(0, -0.05, 0, 1.5, 1.5, 0.1, 0xcfc7b6, 18);
    k.asGlass(() => k.cyl(0, 0.04, 0, 1.2, 1.2, 0.14, 0x3c6a86, 18));
  });
  // belfry openings
  for (const s of ['front', 'back', 'left', 'right'] as const) {
    k.onSide(s, 0, tz, tw, 7, (_len, half) => k.arch(0, 12.0, half + 0.05, 1.5, 3.8, 0.1, 0x3c6a86, true));
  }
  k.local(0, 17.0, tz, Math.PI / 4, () => k.hip(0, 0, 0, tw * 1.35, tw * 1.35, 13, roof));
  k.box(0, 29.5, tz, 0.18, 2.4, 0.18, 0xd9d9d6);
  k.box(0, 30.6, tz, 1.2, 0.18, 0.18, 0xd9d9d6);
  // apse at the back
  k.cyl(0, 0.56, nz - nd / 2 - 1.4, 4.2, 4.2, 7.5, wall, 12);
  k.hip(0, 8.05, nz - nd / 2 - 1.4, 8.8, 8.8, 3.2, roof);
  // front steps
  for (let i = 0; i < 4; i++) k.box(0, 0.06 + i * 0.12, tz + 4.4 + (3 - i) * 0.6, 8.5, 0.12 * (i + 1), 0.6, 0xcfc7b6);
  // churchyard graves with crosses + trees
  for (let i = 0; i < 6; i++) {
    const x = -13 + (i % 3) * 2.2, z = -18 + Math.floor(i / 3) * 3.4;
    k.box(x, 0.06, z, 1.0, 0.25, 2.0, 0xb9b6ae);
    k.box(x, 0.3, z - 0.8, 0.12, 1.2, 0.12, 0xe9e6de);
    k.box(x, 1.05, z - 0.8, 0.6, 0.12, 0.12, 0xe9e6de);
  }
  for (const [x, z] of [[-14, 12], [14, 12], [-14, -18], [14, -18]] as const) k.tree(x, z, 7, 0x3f7a35);
  k.boundaryWall(0, 0, W - 0.6, D - 0.6, 0xcfc7b6, 0x8d8b86, 5.0, 1.6);
  return k.finish(W, D, 31);
}

/** ঈদগাহ: walled open-air prayer ground: tall qibla wall with mihrab niche + 3 domes, 2 pillars, steps, wudu area, paved rows. */
export function buildEidgah(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 72, D = 54;
  const wall = pick(seed, [0xf4efe4, 0xe9e6de]);
  const dome = pick(seed, [0x1a7a4a, 0xe9e6de]);
  k.box(0, 0, 0, W, 0.06, D, 0x74b05a);
  // paved prayer ground with rows
  k.box(0, 0.06, 2, 64, 0.1, 42, 0xcfc7b6);
  for (let i = 0; i < 18; i++) k.box(0, 0.16, -16 + i * 2.2, 60, 0.02, 0.22, 0xf4efe4);
  // qibla wall (back, west), 9 m high with 5 arched recesses + central mihrab bay
  const qz = -22;
  k.box(0, 0, qz, 66, 8.0, 1.6, wall);
  k.box(0, 8.0, qz, 67, 0.6, 2.0, 0xe9e6de);
  for (let i = 0; i < 9; i++) {
    const x = -24 + i * 6;
    if (i === 4) continue;
    k.arch(x, 0.6, qz + 0.84, 2.8, 5.4, 0.1, 0xcfc7b6);
    k.arch(x, 0.6, qz + 0.86, 2.0, 4.4, 0.1, 0x3c6a86, true);
  }
  // mihrab bay: protruding centre with a dome
  k.box(0, 0, qz + 1.6, 9.0, 10.5, 2.6, wall);
  k.arch(0, 0.6, qz + 2.95, 4.6, 8.0, 0.14, 0xcfc7b6);
  k.arch(0, 0.6, qz + 2.98, 3.4, 6.6, 0.1, 0x3c6a86, true);
  k.box(0, 10.5, qz + 1.6, 9.6, 0.5, 3.2, 0xe9e6de);
  k.withSurface('plaster', () => k.dome(0, 11.0, qz + 1.6, 4.2, 4.2, dome, 20));
  crescent(k, 0, 15.2, qz + 1.6, 0.9);
  // flank domes + pillars (chhatri style)
  for (const sx of [-1, 1]) {
    k.box(sx * 22, 8.6, qz, 5.0, 1.2, 5.0, 0xe9e6de);
    for (const dx of [-1.8, 1.8]) for (const dz of [-1.8, 1.8]) k.cyl(sx * 22 + dx, 9.8, qz + dz, 0.22, 0.22, 2.4, wall, 8);
    k.withSurface('plaster', () => k.dome(sx * 22, 12.2, qz, 3.1, 2.6, dome, 16));
    crescent(k, sx * 22, 14.8, qz, 0.6);
    k.box(sx * 32, 0, qz, 2.4, 11.0, 2.4, wall);
    k.box(sx * 32, 11.0, qz, 3.0, 0.4, 3.0, 0xe9e6de);
    k.withSurface('plaster', () => k.dome(sx * 32, 11.4, qz, 1.6, 2.0, dome, 12));
    crescent(k, sx * 32, 13.4, qz, 0.5);
  }
  // pulpit (mimbar) steps in front of the mihrab
  for (let i = 0; i < 4; i++) k.box(0, 0.16, qz + 5.4 + (3 - i) * 0.7, 5.2 - i * 0.5, 0.35 * (i + 1), 0.7, 0xe9e6de);
  // low arcaded boundary wall + gate on the front
  k.boundaryWall(0, 0, W - 0.6, D - 0.6, 0xe9e6de, 0xcfc7b6, 8.0, 2.2);
  // ablution block near the entrance
  k.box(-26, 0.06, 22, 12, 3.2, 5, 0xf1ede4);
  k.local(-26, 3.26, 22, Math.PI / 2, () => k.shed(0, 0, 0, 5.6, 12.6, 0.2, 0.9, 0x8d9aa0));
  for (let i = 0; i < 5; i++) k.cyl(-30 + i * 2, 0.06, 24.65, 0.07, 0.07, 1.0, 0xb7bcc2, 6);
  // trees along the sides
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) k.tree(s * 33.5, -14 + i * 9, 6, 0x4b8a42);
  return k.finish(W, D, 16);
}
