import * as THREE from 'three';
import { FLOOR_H, Kit, pick, type BuiltBuilding } from './BuildingKit';

/**
 * EDUCATION: প্রাথমিক বিদ্যালয়, উচ্চ বিদ্যালয়, কলেজ, বিশ্ববিদ্যালয় ভবন, ইঞ্জিনিয়ারিং ল্যাব.
 */

const GLASS = 0x2f4f66;
const GREEN = 0x1a7a4a;
const RED = 0xd33a2c;

/** National flag on a pole. */
export function flagPole(k: Kit, x: number, z: number, h = 8): void {
  k.box(x, 0, z, 1.0, 0.3, 1.0, 0xcfc7b6);
  k.cyl(x, 0.3, z, 0.07, 0.05, h, 0xb7bcc2, 6);
  k.box(x + 0.95, h - 1.2, z, 1.8, 1.1, 0.04, GREEN);
  k.withMatrix(new THREE.Matrix4().makeTranslation(x + 0.85, h - 0.65, z + 0.03).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), () => k.cyl(0, -0.02, 0, 0.32, 0.32, 0.04, RED, 14));
}

function goalPost(k: Kit, x: number, z: number, ry: number): void {
  k.local(x, 0, z, ry, () => {
    k.box(-1.8, 0, 0, 0.1, 2.2, 0.1, 0xf4efe4);
    k.box(1.8, 0, 0, 0.1, 2.2, 0.1, 0xf4efe4);
    k.box(0, 2.15, 0, 3.7, 0.1, 0.1, 0xf4efe4);
  });
}

/** Shaheed Minar (শহীদ মিনার): the five-panel monument found in many schools. */
export function shaheedMinar(k: Kit, x: number, z: number): void {
  k.box(x, 0, z, 6, 0.3, 4.4, 0xcfc7b6);
  k.box(x, 0.3, z, 4.6, 0.3, 3.0, 0xe9e6de);
  k.box(x, 0.6, z, 0.9, 3.4, 0.5, 0xf4efe4); // centre column
  for (const s of [-1, 1]) {
    k.box(x + s * 1.1, 0.6, z, 0.7, 2.5, 0.45, 0xf4efe4);
    k.box(x + s * 2.05, 0.6, z + 0.2, 0.55, 1.7, 0.4, 0xf4efe4);
  }
  k.withMatrix(new THREE.Matrix4().makeTranslation(x, 3.9, z + 0.3).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), () => k.cyl(0, -0.03, 0, 0.65, 0.65, 0.06, RED, 14));
}

/** প্রাথমিক বিদ্যালয়: single-storey brick school with tin roof, veranda, flagpole, playground. */
export function buildPrimarySchool(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 40, D = 36;
  const wall = pick(seed, [0xe9d9a0, 0xe3d7c2, 0xd6e0c8]);
  k.box(0, 0, 0, W, 0.06, D, 0x74b05a);
  // building (long block, ridge along X) at the back
  const bz = -9, bw = 24, bd = 7;
  k.box(0, 0, bz, bw + 0.6, 0.5, bd + 0.6, 0xa5513a); // brick plinth
  k.box(0, 0.5, bz, bw, 3.0, bd, wall);
  k.local(0, 3.5, bz, Math.PI / 2, () => k.tinRoof(0, 0, 0, bd + 2.0, bw + 1.6, 1.9, 0x8d9aa0, 0xb6c0c4));
  const g = { y0: 0.5, floors: 1, cols: 4, ww: 1.5, wh: 1.4, sill: 0.9, glass: GLASS, frame: 0x3f6b4a };
  k.windowGrid('front', 0, bz, bw, bd, { ...g, cols: 6, skip: (_f, c) => c % 3 === 1 });
  k.windowGrid('back', 0, bz, bw, bd, { ...g, cols: 6 });
  for (let i = 0; i < 4; i++) k.box(-9 + i * 6, 0.5, bz + bd / 2 + 0.03, 1.1, 2.2, 0.08, 0x5a3a24);
  // veranda with posts
  k.box(0, 0, bz + bd / 2 + 1.1, bw, 0.4, 2.2, 0xcfc7b6);
  for (let i = 0; i <= 8; i++) k.box(-bw / 2 + 0.2 + i * ((bw - 0.4) / 8), 0.4, bz + bd / 2 + 2.0, 0.22, 3.1, 0.22, 0xf4efe4);
  k.box(0, 3.45, bz + bd / 2 + 2.0, bw, 0.18, 0.3, 0xf4efe4);
  // school sign
  k.box(0, 3.85, bz + bd / 2 + 2.2, 7.5, 0.9, 0.16, 0x2f5f8a);
  k.box(0, 4.05, bz + bd / 2 + 2.3, 6.2, 0.3, 0.04, 0xf4efe4);
  // playground with goals, tube-well, trees, flag
  k.box(0, 0.06, 9, 20, 0.04, 14, 0x8fc46a);
  goalPost(k, 0, 2.2, 0);
  goalPost(k, 0, 15.8, Math.PI);
  flagPole(k, -13, 4, 8);
  k.cyl(14, 0, 3, 0.1, 0.1, 0.9, 0x3a4a52, 8);
  k.box(14, 0, 3, 1.0, 0.12, 1.0, 0x9b8f84);
  k.tree(15, 12, 6);
  k.tree(-16, 14, 5.5);
  k.tree(17, -2, 6.5);
  // low boundary wall with gate
  k.boundaryWall(0, 0, W - 0.6, D - 0.6, 0xd9ceb8, 0x8d8b86, 5.0, 1.4);
  return k.finish(W, D, 9);
}

/** উচ্চ বিদ্যালয়: 3-storey U-shaped school around a courtyard with Shaheed Minar, flagpole, football field behind. */
export function buildHighSchool(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 56, D = 60, floors = 3, H = floors * FLOOR_H;
  const wall = pick(seed, [0xe3d7c2, 0xe8d9a8, 0xdfe3d3]);
  const trim = 0x2f5f8a;
  k.box(0, 0, 0, W, 0.05, D, 0x74b05a);
  const blocks: [number, number, number, number][] = [
    [0, 8, 42, 10], // front block (x,z,w,d)
    [-16, -8, 10, 22], // left wing
    [16, -8, 10, 22], // right wing
  ];
  for (const [x, z, w, d] of blocks) {
    k.box(x, 0, z, w + 0.5, 0.45, d + 0.5, 0x9b8f84);
    k.box(x, 0.45, z, w, H, d, wall);
    for (let f = 1; f <= floors; f++) k.box(x, 0.45 + f * FLOOR_H - 0.1, z, w + 0.16, 0.2, d + 0.16, trim);
    k.box(x, 0.45 + H, z, w + 0.4, 0.22, d + 0.4, 0xa7a49c);
    k.parapet(x, 0.67 + H, z, w + 0.4, d + 0.4, 0.8, 0.18, wall);
  }
  const g = { y0: 0.45, floors, ww: 1.4, wh: 1.45, sill: 0.9, glass: GLASS, frame: 0xf4efe4 };
  k.windowGrid('front', 0, 8, 42, 10, { ...g, cols: 12, skip: (f, c) => f === 0 && (c === 5 || c === 6) });
  k.windowGrid('back', 0, 8, 42, 10, { ...g, cols: 12 });
  k.windowGrid('left', -16, -8, 10, 22, { ...g, cols: 6 });
  k.windowGrid('right', 16, -8, 10, 22, { ...g, cols: 6 });
  k.windowGrid('right', -16, -8, 10, 22, { ...g, cols: 6 });
  k.windowGrid('left', 16, -8, 10, 22, { ...g, cols: 6 });
  // entrance pediment + columns
  k.box(0, 0.45, 13.4, 9, H, 2.0, 0xf4efe4);
  k.glass(0, 0.9, 14.45, 4.4, 3.4, 0.05, 0x3c6a86);
  k.box(0, 0.45 + H, 13.4, 9.6, 0.4, 2.4, 0xf4efe4);
  k.local(0, 0.85 + H, 13.4, Math.PI / 2, () => k.gable(0, 0, 0, 2.4, 9.6, 1.6, 0xe9e6de));
  for (const x of [-3.6, 3.6]) k.cyl(x, 0.45, 14.8, 0.3, 0.3, H - 0.3, 0xf4efe4, 10);
  k.box(0, 0.45 + 2 * FLOOR_H + 0.4, 14.55, 6.5, 0.9, 0.12, trim); // school name board
  for (let i = 0; i < 3; i++) k.box(0, i * 0.18, 15.2 + (2 - i) * 0.5, 7, 0.18 * (3 - i), 0.5, 0xcfc7b6);
  // rooftop tanks
  for (const x of [-12, 12]) k.waterTank(x, 0.67 + H + 0.1, 8, 1.0);
  // courtyard: Shaheed Minar + flagpole + trees
  shaheedMinar(k, 0, -2);
  flagPole(k, 12, -2, 10);
  k.tree(-10, -3, 5);
  k.tree(-6, -12, 5.5);
  // football field behind with track and goals
  k.box(0, 0.05, -22, 44, 0.04, 22, 0xcfc7b6);
  k.box(0, 0.09, -22, 40, 0.04, 18, 0x74b05a);
  k.box(0, 0.12, -22, 0.3, 0.03, 18, 0xf4efe4);
  goalPost(k, -19.5, -22, Math.PI / 2);
  goalPost(k, 19.5, -22, -Math.PI / 2);
  // boundary
  k.boundaryWall(0, 0, W - 0.6, D - 0.6, 0xd9ceb8, 0x8d8b86, 6.0, 1.8);
  return k.finish(W, D, 0.67 + H + 4.5);
}

/** কলেজ: 4-storey college with central clock tower, arched portico, symmetrical wings, lawn + fountain. */
export function buildCollege(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 70, D = 46, floors = 4, H = floors * FLOOR_H;
  const wall = pick(seed, [0xc9a56a, 0xd6a39a, 0xe3d7c2]);
  const trim = 0xf4efe4;
  k.box(0, 0, 0, W, 0.05, D, 0x74b05a);
  // main wing
  k.box(0, 0, -6, 52, 0.6, 14, 0x9b8f84);
  k.box(0, 0.6, -6, 50, H, 12, wall);
  for (let f = 1; f <= floors; f++) k.box(0, 0.6 + f * FLOOR_H - 0.1, -6, 50.3, 0.2, 12.3, trim);
  k.box(0, 0.6 + H, -6, 50.6, 0.25, 12.6, 0xa7a49c);
  k.parapet(0, 0.85 + H, -6, 50.6, 12.6, 0.9, 0.2, wall);
  const g = { y0: 0.6, floors, ww: 1.4, wh: 1.9, sill: 0.6, glass: GLASS, frame: trim };
  k.windowGrid('front', 0, -6, 50, 12, { ...g, cols: 14, skip: (_f, c) => c >= 6 && c <= 7 });
  k.windowGrid('back', 0, -6, 50, 12, { ...g, cols: 14 });
  k.windowGrid('left', 0, -6, 50, 12, { ...g, cols: 3 });
  k.windowGrid('right', 0, -6, 50, 12, { ...g, cols: 3 });
  // central clock tower (projecting)
  k.box(0, 0.6, 1.6, 10, H + 4, 5.2, trim);
  k.box(0, 0.6, 1.6, 8.6, H + 4.05, 4.6, wall);
  // portico: 3 pointed arches at the ground floor
  for (const x of [-2.9, 0, 2.9]) {
    k.arch(x, 0.6, 4.25, 2.4, 4.2, 0.2, 0x2b2b2b);
    k.arch(x, 0.6, 4.35, 2.8, 4.6, 0.12, trim);
  }
  for (const x of [-4.6, -1.45, 1.45, 4.6]) k.box(x, 0.6, 4.3, 0.5, 4.4, 0.5, trim);
  // clock
  k.withMatrix(new THREE.Matrix4().makeTranslation(0, 0.6 + H + 1.2, 4.28).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), () => k.cyl(0, -0.05, 0, 1.5, 1.5, 0.1, 0xf4efe4, 20));
  k.box(0, 0.6 + H + 1.1, 4.4, 0.1, 1.2, 0.06, 0x222222);
  k.box(0.3, 0.6 + H + 1.1, 4.4, 0.8, 0.1, 0.06, 0x222222);
  k.box(0, 0.6 + H + 4.0, 1.6, 10.6, 0.3, 5.8, trim);
  k.hip(0, 0.6 + H + 4.3, 1.6, 9.0, 4.8, 5.5, 0xa8452b);
  k.cyl(0, 0.6 + H + 9.8, 1.6, 0.08, 0.05, 3.5, 0xb7bcc2, 6);
  // side wings (shorter)
  for (const s of [-1, 1]) {
    k.box(s * 31.5, 0.6, -2, 13, 3 * FLOOR_H, 20, wall);
    k.box(s * 31.5, 0.6 + 3 * FLOOR_H, -2, 13.5, 0.25, 20.5, 0xa7a49c);
    k.parapet(s * 31.5, 0.85 + 3 * FLOOR_H, -2, 13.5, 20.5, 0.8, 0.2, wall);
    k.windowGrid('front', s * 31.5, -2, 13, 20, { y0: 0.6, floors: 3, cols: 4, ww: 1.4, wh: 1.9, sill: 0.6, glass: GLASS, frame: trim });
    k.windowGrid(s < 0 ? 'left' : 'right', s * 31.5, -2, 13, 20, { y0: 0.6, floors: 3, cols: 6, ww: 1.4, wh: 1.9, sill: 0.6, glass: GLASS, frame: trim });
  }
  // lawn, fountain, drive, flag
  k.box(0, 0.05, 14, 4, 0.04, 20, 0xb9b3a4);
  k.cyl(0, 0.05, 15, 5.0, 5.0, 0.4, 0xe9e6de, 20);
  k.cyl(0, 0.3, 15, 4.5, 4.5, 0.2, 0x4cb0d0, 20);
  k.cyl(0, 0.45, 15, 0.7, 0.4, 2.0, 0xf4efe4, 10);
  flagPole(k, -10, 13, 11);
  for (const x of [-16, -8, 8, 16]) k.tree(x, 15, 6);
  k.boundaryWall(0, 0, W - 0.6, D - 0.6, 0xd9ceb8, 0x8d8b86, 8.0, 2.0);
  return k.finish(W, D, 0.6 + H + 14);
}

/** বিশ্ববিদ্যালয় ভবন: modern 6-storey academic block: glass atrium, sun-shading fins, plaza with sculpture, solar roof. */
export function buildUniversityBuilding(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 70, D = 54, floors = 6, fh = 3.9, H = floors * fh;
  const concrete = pick(seed, [0xd0cdc6, 0xc9ccd0]);
  k.box(0, 0, 0, W, 0.05, D, 0xcfc7b6);
  // main block
  k.box(0, 0, -8, 60, 0.5, 20.5, 0x9b968c);
  k.box(0, 0.5, -8, 60, H, 20, concrete);
  // glass atrium (central) projecting forward
  k.glass(0, 0.5, 3.1, 16, H, 0.5, 0x3c6a86);
  for (let i = 0; i <= 8; i++) k.box(-8 + i * 2, 0.5, 3.4, 0.2, H, 0.3, 0x30343a);
  for (let f = 1; f < floors; f++) k.box(0, 0.5 + f * fh, 3.4, 16, 0.2, 0.3, 0x30343a);
  // side wings with ribbon windows and vertical fins
  for (const s of [-1, 1]) {
    for (let f = 0; f < floors; f++) k.glass(s * 19.5, 0.5 + f * fh + 0.8, 2.04, 20, 2.3, 0.05, GLASS);
    for (let i = 0; i < 14; i++) k.box(s * 19.5 - 9.5 + i * (19 / 13), 0.5, 2.3, 0.35, H, 0.7, 0xe9e6de);
    for (let f = 0; f <= floors; f++) k.box(s * 19.5, 0.5 + f * fh - 0.1, 2.2, 21, 0.25, 0.4, 0xf4efe4);
  }
  for (const side of ['left', 'right', 'back'] as const) {
    k.onSide(side, 0, -8, 60, 20, (len, half) => {
      for (let f = 0; f < floors; f++) k.glass(0, 0.5 + f * fh + 0.8, half + 0.04, len - 3, 2.3, 0.05, GLASS);
      for (let i = 0; i <= 10; i++) k.box(-len / 2 + 1.5 + ((len - 3) * i) / 10, 0.5, half + 0.1, 0.4, H, 0.3, 0xe9e6de);
    });
  }
  // roof: parapet, solar panels, plant room
  k.box(0, 0.5 + H, -8, 60.4, 0.3, 20.4, 0xa7a49c);
  k.parapet(0, 0.8 + H, -8, 60.4, 20.4, 1.0, 0.2, concrete);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) {
    k.local(-24 + i * 6, 0.8 + H, -12 + r * 4, 0, () => {
      k.withMatrix(new THREE.Matrix4().makeRotationX(-0.45), () => k.glass(0, 0, 0, 5, 0.08, 2.4, 0x1c3a5a));
      k.box(0, 0, 0.3, 0.2, 1.0, 0.2, 0x555a60);
    });
  }
  k.box(18, 0.8 + H, -2, 10, 3.0, 6, 0xb7bcc2);
  // plaza: fountain + abstract sculpture, trees, benches, bike racks
  k.cyl(0, 0.05, 13, 6.0, 6.0, 0.5, 0xe9e6de, 24);
  k.cyl(0, 0.3, 13, 5.5, 5.5, 0.3, 0x4cb0d0, 24);
  k.box(0, 0.5, 13, 0.6, 5, 0.6, 0xb7bcc2);
  k.withMatrix(new THREE.Matrix4().makeTranslation(0, 4.8, 13).multiply(new THREE.Matrix4().makeRotationZ(0.5)), () => k.box(0, 0, 0, 0.5, 3, 0.5, 0xd49a2a));
  for (const [x, z] of [[-18, 12], [-26, 6], [18, 12], [26, 6], [-30, 20], [30, 20]] as const) k.tree(x, z, 6, 0x4b8a42);
  for (const x of [-12, -8, 8, 12]) k.box(x, 0.05, 10, 2.2, 0.5, 0.6, 0x7a5a3a);
  for (let i = 0; i < 6; i++) k.box(-26 + i * 1.2, 0.05, 20, 0.08, 0.9, 0.9, 0x555a60);
  // entrance steps
  for (let i = 0; i < 3; i++) k.box(0, i * 0.17, 3.6 + (2 - i) * 0.6, 14, 0.17 + i * 0.0, 0.6, 0xe9e6de);
  k.box(0, 0.5 + H + 0.8, -8, 14, 1.4, 0.4, 0x2f5f8a);
  return k.finish(W, D, 0.8 + H + 4);
}

/** ইঞ্জিনিয়ারিং ল্যাব: saw-tooth workshop hall + office block, gantry crane, wind turbine, solar roof, test truss bridge, transformer yard. */
export function buildEngineeringLab(seed = 0): BuiltBuilding {
  const k = new Kit();
  const W = 64, D = 50;
  const brand = pick(seed, [0x2f6f9f, 0x3b8a55, 0xd49a2a]);
  k.box(0, 0, 0, W, 0.06, D, 0xb9b3a4);
  // workshop hall with saw-tooth roof (5 teeth), glazed north faces
  const hx = -10, hz = -8, hw = 36, hd = 20, hh = 7;
  k.box(hx, 0, hz, hw + 0.6, 0.4, hd + 0.6, 0x9b968c);
  k.box(hx, 0.4, hz, hw, hh, hd, 0xcfcab9);
  for (let i = 0; i < 5; i++) {
    const x = hx - hw / 2 + (hw / 5) * (i + 0.5);
    k.local(x, 0.4 + hh, hz, 0, () => {
      k.shed(0, 0, 0, hw / 5, hd, 0.2, 2.2, 0x8d9aa0);
      k.glass(-hw / 10 + 0.05, 0.25, 0, 0.06, 1.8, hd - 0.4, 0x4c7f9f);
    });
  }
  // big roller doors on the front + signage
  for (let i = 0; i < 3; i++) k.box(hx - 10 + i * 10, 0.4, hz + hd / 2 + 0.05, 5.2, 4.8, 0.1, 0x6a6f73);
  k.box(hx, 0.4 + hh - 1.4, hz + hd / 2 + 0.2, 20, 1.2, 0.2, brand);
  k.windowGrid('left', hx, hz, hw, hd, { y0: 0.4, floors: 1, cols: 5, ww: 2.0, wh: 1.2, sill: 3.0, glass: GLASS, frame: 0xf4efe4 });
  // overhead gantry crane rails + crane on the right outdoor bay
  for (const x of [8, 22]) for (const z of [-10, 4]) k.box(x, 0, z, 0.5, 8, 0.5, 0xd49a2a);
  k.box(8, 8, -3, 0.5, 0.6, 14.5, 0xd49a2a);
  k.box(22, 8, -3, 0.5, 0.6, 14.5, 0xd49a2a);
  k.box(15, 7.6, -3, 14.5, 0.8, 1.0, 0xd49a2a);
  k.box(15, 6.6, -3, 1.2, 1.0, 1.2, 0x30343a);
  k.box(15, 4.0, -3, 0.06, 2.6, 0.06, 0x222222);
  k.box(15, 3.6, -3, 0.5, 0.5, 0.5, 0xd33a2c);
  // office / classroom block (3 storeys) at the front-right
  const ox = 18, oz = 10, ow = 22, od = 14;
  k.box(ox, 0, oz, ow + 0.5, 0.4, od + 0.5, 0x9b968c);
  k.box(ox, 0.4, oz, ow, 3 * FLOOR_H, od, 0xe3d7c2);
  for (let f = 1; f <= 3; f++) k.box(ox, 0.4 + f * FLOOR_H - 0.1, oz, ow + 0.16, 0.2, od + 0.16, brand);
  const g = { y0: 0.4, floors: 3, ww: 1.5, wh: 1.4, sill: 0.95, glass: GLASS, frame: 0xf4efe4 };
  k.windowGrid('front', ox, oz, ow, od, { ...g, cols: 6, skip: (f, c) => f === 0 && c === 2 });
  k.windowGrid('back', ox, oz, ow, od, { ...g, cols: 6 });
  k.windowGrid('left', ox, oz, ow, od, { ...g, cols: 4 });
  k.windowGrid('right', ox, oz, ow, od, { ...g, cols: 4 });
  k.box(ox, 0.4, oz + od / 2 + 0.04, 1.4, 2.3, 0.08, 0x5a3a24);
  k.box(ox, 0.4 + 3 * FLOOR_H, oz, ow + 0.4, 0.22, od + 0.4, 0xa7a49c);
  k.parapet(ox, 0.62 + 3 * FLOOR_H, oz, ow + 0.4, od + 0.4, 0.8, 0.18, 0xe3d7c2);
  // solar roof on the office block
  for (let i = 0; i < 5; i++) k.local(ox - 8 + i * 4, 0.62 + 3 * FLOOR_H, oz, 0, () => {
    k.withMatrix(new THREE.Matrix4().makeRotationX(-0.4), () => k.glass(0, 0, 0, 3.4, 0.08, 6, 0x1c3a5a));
  });
  // wind turbine (demonstration)
  k.cyl(-26, 0, 14, 0.5, 0.25, 16, 0xe9e6de, 10);
  k.box(-26, 15.6, 14.4, 0.7, 0.7, 1.6, 0xe9e6de);
  k.local(-26, 16, 15.3, 0, () => {
    for (let i = 0; i < 3; i++) k.withMatrix(new THREE.Matrix4().makeRotationZ((i * Math.PI * 2) / 3 + 0.4), () => k.box(-0.12, 0, 0.0, 0.24, 7, 0.08, 0xf4efe4));
    k.box(0, -0.2, 0, 0.5, 0.5, 0.5, 0xd33a2c);
  });
  // test truss bridge (model, 14 m)
  k.local(-22, 0, 20, 0, () => {
    for (const z of [-1.2, 1.2]) {
      k.box(0, 1.0, z, 14, 0.2, 0.2, 0xd49a2a);
      k.box(0, 3.2, z, 14, 0.2, 0.2, 0xd49a2a);
      for (let i = 0; i <= 7; i++) k.box(-7 + i * 2, 1.0, z, 0.15, 2.4, 0.15, 0xd49a2a);
      for (let i = 0; i < 7; i++) k.withMatrix(new THREE.Matrix4().makeTranslation(-6 + i * 2, 2.2, z).multiply(new THREE.Matrix4().makeRotationZ(i % 2 ? 0.75 : -0.75)), () => k.box(0, -1.3, 0, 0.12, 2.7, 0.12, 0xd49a2a));
    }
    k.box(0, 0.85, 0, 14, 0.2, 3, 0x6a6f73);
    for (const x of [-7.5, 7.5]) k.box(x, 0, 0, 1.2, 1.0, 3.4, 0x9b968c);
  });
  // transformer yard
  k.box(26, 0, -18, 10, 0.2, 8, 0x8a8a85);
  for (let i = 0; i < 2; i++) {
    k.box(23 + i * 5, 0.2, -18, 2.6, 2.4, 2.0, 0x6a7a8a);
    for (let j = 0; j < 3; j++) k.cyl(22 + i * 5 + j * 1.0, 2.6, -18, 0.14, 0.14, 0.9, 0xb0603a, 6);
  }
  k.box(26, 0, -22.4, 10, 1.8, 0.1, 0x555a60);
  k.box(26, 0.2, -13.6, 10, 1.8, 0.06, 0x555a60);
  // chimney/exhaust + water tank
  k.cyl(-25, 0.4 + hh, -14, 0.5, 0.4, 9, 0xb0603a, 8);
  k.waterTank(-2, 0.4 + hh, -2, 1.2);
  k.tree(-28, 2, 5);
  k.tree(30, 20, 5);
  k.boundaryWall(0, 0, W - 0.6, D - 0.6, 0xcfc7b6, 0x8d8b86, 6.0, 1.8);
  return k.finish(W, D, 17);
}
