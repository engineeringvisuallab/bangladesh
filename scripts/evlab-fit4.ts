import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const g = new TerrainGenerator(Config.world.seed); const sc = g.makeSample();
const obs: number[][] = [];
const dens = (xs: ArrayLike<number>, zs: ArrayLike<number>, hw: number) => { for (let i = 0; i + 1 < xs.length; i++) { const L = Math.hypot(xs[i + 1] - xs[i], zs[i + 1] - zs[i]); const k = Math.max(1, Math.ceil(L / 4)); for (let j = 0; j < k; j++) obs.push([xs[i] + (xs[i + 1] - xs[i]) * j / k, zs[i] + (zs[i + 1] - zs[i]) * j / k, hw]); } };
for (const r of g.roads.roads) if (r.kind !== 'local' && r.name !== 'F6') dens(r.xs, r.zs, 8);
for (const e of g.rail.edges) dens(e.xs, e.zs, 14);
const near = obs.filter((o) => o[0] > -1500 && o[0] < 300 && o[1] > -1200 && o[1] < 100);
// natural ground grid, 20 m
const G = 20, X0 = -700, Z0 = -720, NX = 40, NZ = 36; const H: number[][] = [];
for (let j = 0; j < NZ; j++) { const row: number[] = []; for (let i = 0; i < NX; i++) { g.sampleGround(X0 + i * G, Z0 + j * G, sc); row.push(sc.h); } H.push(row); }
const flatOK = (cx: number, cz: number, half: number, yaw: number): number => { let worst = 0; const m = 20, c = Math.cos(yaw), sn = Math.sin(yaw); for (let lx = -half - m; lx <= half + m; lx += 12) for (let lz = -half - m; lz <= half + m; lz += 12) { const x = cx + lx * c + lz * sn, z = cz - lx * sn + lz * c; const i = Math.round((x - X0) / G), j = Math.round((z - Z0) / G); const h = (H[j] ?? [])[i]; if (h === undefined) return 99; worst = Math.max(worst, Math.abs(h - 18.3)); } return worst; };
const roadCl = (cx: number, cz: number, half: number, yaw: number): number => { let b = 1e9; const c = Math.cos(yaw), sn = Math.sin(yaw); for (const o of near) { const dx0 = o[0] - cx, dz0 = o[1] - cz; const lx = dx0 * c - dz0 * sn, lz = dx0 * sn + dz0 * c; const dx = Math.max(Math.abs(lx) - half, 0), dz = Math.max(Math.abs(lz) - half, 0); const inside = Math.abs(lx) < half && Math.abs(lz) < half; const d = inside ? -1 : Math.hypot(dx, dz) - o[2]; if (d < b) b = d; } return b; };
const mall = { x: g.mall.x, z: g.mall.z };
const mallOk = (cx: number, cz: number, half: number, yaw: number): boolean => { const c = Math.cos(yaw), sn = Math.sin(yaw); for (let mx = -50; mx <= 50; mx += 8) for (let mz = -37; mz <= 37; mz += 8) { const dx = mall.x + mx - cx, dz = mall.z + mz - cz; if (Math.abs(dx * c - dz * sn) < half + 8 && Math.abs(dx * sn + dz * c) < half + 8) return false; } return true; };
for (const S of [520, 500, 480, 460, 440, 420, 400, 380]) {
  const half = S / 2; let best: any = null;
  for (let yD = 0; yD < 90; yD += 5) { const yaw = yD * Math.PI / 180;
  for (let cx = -600; cx <= 0; cx += 10) for (let cz = -650; cz <= -60; cz += 10) {
    if (!mallOk(cx, cz, half, yaw)) continue;
    const f = flatOK(cx, cz, half, yaw); if (f > 2.5) continue;
    const rc = roadCl(cx, cz, half, yaw); if (rc < 16) continue;
    const d = Math.hypot(cx + 60, cz + 45); if (!best || d < best.d) best = { cx, cz, yD, rc: Math.round(rc), f: +f.toFixed(1), d: Math.round(d) };
  } }
  console.log('S', S, best);
}
