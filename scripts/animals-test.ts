// Wildlife headless simulation: every species in its habitat, hunting, dolphins, fish. Run: npx tsx scripts/animals-test.ts
const mkCtx = () => new Proxy({}, { get: (_t, p) => (p === 'createLinearGradient' || p === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => mkCtx(), style: {} }) };
import * as THREE from 'three';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { AnimalManager } from '../src/animals/AnimalManager';
import { buildAnimal, variantCount } from '../src/animals/AnimalModel';
import { ALL_SPECIES, HABITAT, SPECIES } from '../src/animals/Species';
import { BUILT_UP_KINDS, getWorldZoneAt, rasterizeWorldZones } from '../src/city/WorldZones';
import { placementContains } from '../src/buildings/Placements';

const g = new TerrainGenerator(Config.world.seed);
const s = g.makeSample();
let bad = 0;
const fail = (t: string) => { console.log('FAIL', t); bad++; };

// 0) every model builds (all colour variants) and stands on the ground
for (const sp of ALL_SPECIES) {
  for (let v = 0; v < variantCount(sp); v++) {
    const rig = buildAnimal(sp, v);
    rig.group.updateMatrixWorld(true);
    if ((sp !== 'dolphin' && !(rig.hipY > 0)) || !(rig.length > 0) || rig.legs.length !== rig.knees.length) fail(`model ${sp}:${v} is broken`);
  }
}
console.log('models ok:', ALL_SPECIES.length, 'species');

// 1) habitats: stand in the middle of each kind of zone for 6 minutes and see who lives there
const zones = rasterizeWorldZones(100);
const centre = (kind: string): { x: number; z: number } | null => {
  const cells: { x: number; z: number }[] = [];
  for (let r = 0; r < zones.n; r++) for (let c = 0; c < zones.n; c++) {
    if (zones.kinds[zones.ids[r * zones.n + c]] !== kind) continue;
    const x = (c - zones.n / 2 + 0.5) * zones.cell, z = (r - zones.n / 2 + 0.5) * zones.cell;
    g.sample(x, z, s);
    if (Number.isNaN(s.water) && s.h > 1.5) cells.push({ x, z });
  }
  return cells.length ? cells[Math.floor(cells.length / 2)] : null;
};
const places: [string, { x: number; z: number } | null][] = [
  ['farmland', centre('farmland')], ['village', centre('village')], ['forest', centre('forest')], ['wetland', centre('wetland')],
  ['mountain', centre('mountain')], ['park', centre('park')], ['safari', { x: 3000, z: 1900 }], ['coast', centre('coast')],
];
const seenAll = new Set<string>();
let kills = 0;
for (const [name, p] of places) {
  if (!p) { console.log(name, ': no such zone on the map'); continue; }
  g.sample(p.x, p.z, s);
  const root = new THREE.Group();
  const m = new AnimalManager(root, g, Config.world.seed);
  const player = new THREE.Vector3(p.x, s.h + 1, p.z);
  const seen = new Map<string, number>();
  const states = new Set<string>();
  let illegal = 0, lastDead = 0;
  const why = new Map<string, number>();
  const bump = (w: string): void => { illegal++; why.set(w, (why.get(w) ?? 0) + 1); };
  for (let i = 0; i < 30 * 360; i++) {
    m.update(1 / 30, i / 30, player);
    const st = m.stats();
    if (st.dead > lastDead) kills++;
    lastDead = st.dead;
    for (const a of m.animals) {
      if (a.sp === 'dolphin') continue;
      seen.set(a.sp, Math.max(seen.get(a.sp) ?? 0, 1));
      states.add(`${a.sp}:${a.state}`);
      if (!Number.isFinite(a.x + a.y + a.z)) bump('nan');
      const k = getWorldZoneAt(a.x, a.z).kind;
      if (k === 'sea' || (BUILT_UP_KINDS.has(k) && !(k === 'village' && (HABITAT.village?.[a.sp] || a.sp === 'fox')))) bump(`zone ${k} ${a.sp}`);
      if (placementContains(a.x, a.z, 0)) bump(`building ${a.sp}`);
      g.sample(a.x, a.z, s);
      if (SPECIES[a.sp].swim === undefined && !Number.isNaN(s.water) && s.h < s.water - 0.1 && a.state !== 'dead') bump(`water ${a.sp}`);
    }
    if (m.landCountForTest() > 90) fail('too many animals');
  }
  for (const k of seen.keys()) seenAll.add(k);
  console.log(name.padEnd(9), [...seen.keys()].sort().join(' '), '| illegal', illegal, '| final', JSON.stringify(m.stats().bySpecies));
  if (illegal) console.log('  reasons', [...why.entries()].map(([k, v]) => `${k}=${v}`).join(', '));
  if (illegal) fail(`${name}: animals on buildings / in towns / in water`);
  if (seen.size < 2) fail(`${name}: too few species`);
  m.dispose();
}
console.log('kills', kills, '| species seen:', [...seenAll].sort().join(' '));
if (kills < 1) fail('no animal was ever hunted down');

// 2) dolphins in the sea
const seaSpot = ((): { x: number; z: number } | null => {
  for (let r = 100; r < 4700; r += 100) for (let a = 0; a < 6.28; a += 0.15) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (getWorldZoneAt(x, z).kind !== 'sea') continue;
    g.sample(x, z, s);
    if (!Number.isNaN(s.water) && s.water - s.h > 5) return { x, z };
  }
  return null;
})();
console.log('deep sea found at', seaSpot);
if (seaSpot) {
  const m3 = new AnimalManager(new THREE.Group(), g, Config.world.seed);
  const pl = new THREE.Vector3(seaSpot.x, 5, seaSpot.z);
  let maxD = 0, bad5 = 0;
  for (let i = 0; i < 30 * 120; i++) {
    m3.update(1 / 30, i / 30, pl);
    maxD = Math.max(maxD, m3.stats().bySpecies.dolphin ?? 0);
    for (const a of m3.animals) if (a.sp === 'dolphin') { g.sample(a.x, a.z, s); if (Number.isNaN(s.water) || s.water - s.h < 2) bad5++; }
  }
  console.log('dolphins', maxD, 'in shallow water frames', bad5);
  if (maxD < 2) fail('no dolphins in the sea');
  if (bad5) fail('dolphins in shallow water');
}

// 3) fish: stand on the river / lake / sea shore
let water: { x: number; z: number } | null = null;
for (let r = 50; r < 4600 && !water; r += 50) for (let a = 0; a < 6.28 && !water; a += 0.2) {
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  g.sample(x, z, s);
  if (!Number.isNaN(s.water) && s.water - s.h > 2.5) water = { x, z };
}
console.log('deep water found at', water);
if (water) {
  const m2 = new AnimalManager(new THREE.Group(), g, Config.world.seed);
  const pl = new THREE.Vector3(water.x, 5, water.z);
  let tt = 0, bad4 = 0, maxFish = 0;
  for (let i = 0; i < 30 * 60; i++) {
    tt += 1 / 30; m2.update(1 / 30, tt, pl);
    maxFish = Math.max(maxFish, m2.stats().fish);
  }
  const mesh = (m2 as any).fishMesh as THREE.InstancedMesh; const mat = new THREE.Matrix4(); const v = new THREE.Vector3();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, mat); v.setFromMatrixPosition(mat); g.sample(v.x, v.z, s);
    if (Number.isNaN(s.water) || v.y > s.water || v.y < s.h) bad4++;
  }
  console.log('fish:', maxFish, 'max, outside water:', bad4);
  if (maxFish < 20) fail('too few fish near deep water');
  if (bad4 > mesh.count * 0.05) fail('fish outside the water');
}
console.log(bad ? 'FAILED' : 'ALL OK');
process.exit(bad ? 1 : 0);
