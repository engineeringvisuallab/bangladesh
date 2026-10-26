// Stage 7 step 2 check (grass + rocks): npx tsx scripts/grass-rock-test.ts
// placement rules, determinism, speed, rock collision (real Rapier) and the grass tile manager (fake worker).
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { CityPlan } from '../src/city/CityPlan';
import { Config } from '../src/core/Config';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { RockPlacer } from '../src/vegetation/RockPlacement';
import { GrassPlacer } from '../src/vegetation/GrassPlacement';
import { TreePhysics } from '../src/vegetation/TreePhysics';
import { GrassManager } from '../src/vegetation/GrassManager';
import { GrassAssets } from '../src/vegetation/GrassAssets';
import { RockAssets } from '../src/vegetation/RockAssets';
import { GRASS_STRIDE, ROCK_KIND_COUNT, TREE_STRIDE } from '../src/vegetation/TreeTypes';
import { chunkKey, chunkOriginX, chunkOriginZ, CHUNKS_PER_SIDE } from '../src/world/WorldGrid';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};
const G = Config.vegetation.grass;
const RK = Config.vegetation.rocks;
const HALF = Config.world.size / 2;

const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
const rocks = new RockPlacer(gen, trees, Config.world.seed);
const grass = new GrassPlacer(gen, plan, Config.world.seed, trees);
const s = gen.makeSample();
const sx = gen.makeSample();
const sz = gen.makeSample();
const mask = new Float32Array(2);

// ---------- rocks ----------
{
  let bad = 0;
  const fail = (m: string) => { if (bad++ < 10) console.log('  rock problem:', m); };
  let total = 0, chunks = 0, ms = 0, big = 0, steep = 0;
  const kinds = new Array<number>(ROCK_KIND_COUNT).fill(0);
  for (let cz = -2; cz < CHUNKS_PER_SIDE + 2; cz += 1) for (let cx = -2; cx < CHUNKS_PER_SIDE + 2; cx += 2) {
    chunks++;
    const t0 = performance.now();
    const r = rocks.place(cx, cz);
    ms += performance.now() - t0;
    const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
    r.forEach((d, k) => {
      kinds[k] += d.length / TREE_STRIDE;
      for (let i = 0; i < d.length; i += TREE_STRIDE) {
        total++;
        const x = ox + d[i], z = oz + d[i + 2], sc = d[i + 3];
        if (d[i] < 0 || d[i] >= 500 || d[i + 2] < 0 || d[i + 2] >= 500) fail('outside its chunk');
        gen.sample(x, z, s);
        if (Math.abs(s.h - 0.22 * sc - d[i + 1]) > 0.01) fail('height mismatch');
        if (s.h < RK.minHeight) fail(`on the beach / in the sea at ${x.toFixed(0)},${z.toFixed(0)}`);
        if (!Number.isNaN(s.water) && s.h < s.water + RK.waterMargin) fail(`in water at ${x.toFixed(0)},${z.toFixed(0)}`);
        gen.roads.maskAt(x, z, 1, mask);
        if (mask[1] > 0.01) fail(`on a road at ${x.toFixed(0)},${z.toFixed(0)}`);
        const a = plan.areaAt(x, z);
        if (a && Config.vegetation.cityZoneChance[a.kind] === undefined) fail(`in built-up area ${a.id}`);
        if (!(sc >= 0.39 && sc <= 2.51)) fail(`odd scale ${sc}`);
        if (sc > 1.5) big++;
        gen.sample(x + 1.5, z, sx); gen.sample(x, z + 1.5, sz);
        if (Math.hypot(sx.h - s.h, sz.h - s.h) / 1.5 > 0.45) steep++;
      }
    });
  }
  const again = new RockPlacer(new TerrainGenerator(Config.world.seed), trees, Config.world.seed);
  for (const [cx, cz] of [[10, 10], [4, 14], [16, 3]]) {
    const a = rocks.place(cx, cz), b = again.place(cx, cz);
    a.forEach((d, k) => { if (d.length !== b[k].length || d.some((v, i) => v !== b[k][i])) fail(`not deterministic at ${cx},${cz}`); });
  }
  console.log(`rocks: ${total} in ${chunks} chunks (round ${kinds[0]}, slab ${kinds[1]}), ${big} bigger than 1.5, ${steep} on steep ground, ${(ms / chunks).toFixed(1)} ms / chunk`);
  ok(bad === 0, 'rocks: not in water / beach / on roads / in built-up areas, deterministic, inside their chunk');
  ok(total > 500, 'rocks: there are rocks');
  ok(steep > 0, 'rocks: outcrops appear on steep ground');
}

// ---------- grass ----------
{
  let bad = 0;
  const fail = (m: string) => { if (bad++ < 10) console.log('  grass problem:', m); };
  // tiles around spawn, the 3 city sites, a river area, the mountains and random places
  const spots: [number, number][] = [[0, 0], [300, -200], ...gen.sites.map((st) => [st.x + 200, st.z + 100] as [number, number]), [-2500, 1800], [2000, -2500], [-3500, -3500], [1200, 2900]];
  let tiles = 0, tufts = 0, ms = 0, max = 0, dryTufts = 0, empty = 0;
  for (const [px, pz] of spots) {
    const tx0 = Math.floor((px + HALF) / G.tile);
    const tz0 = Math.floor((pz + HALF) / G.tile);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const tx = tx0 + dx, tz = tz0 + dz;
      const t0 = performance.now();
      const d = grass.place(tx, tz);
      ms += performance.now() - t0;
      tiles++;
      const n = d.length / GRASS_STRIDE;
      tufts += n;
      max = Math.max(max, n);
      if (n === 0) empty++;
      const ox = tx * G.tile - HALF, oz = tz * G.tile - HALF;
      for (let i = 0; i < d.length; i += GRASS_STRIDE) {
        const lx = d[i], ly = d[i + 1], lz = d[i + 2];
        if (lx < 0 || lx >= G.tile || lz < 0 || lz >= G.tile) fail('outside its tile');
        const x = ox + lx, z = oz + lz;
        gen.sample(x, z, s);
        if (Math.abs(s.h - 0.03 - ly) > 0.01) fail('height mismatch');
        if (!Number.isNaN(s.water) && s.h < s.water + 0.3) fail(`in water at ${x.toFixed(0)},${z.toFixed(0)}`);
        if (s.h < 3.5) fail(`on the beach at ${x.toFixed(0)},${z.toFixed(0)} h=${s.h.toFixed(2)}`);
        gen.roads.maskAt(x, z, 1, mask);
        if (mask[1] > 0.01) fail(`on a road at ${x.toFixed(0)},${z.toFixed(0)}`);
        gen.sample(x + 1, z, sx); gen.sample(x, z + 1, sz);
        if (Math.hypot(sx.h - s.h, sz.h - s.h) >= G.maxSlope + 1e-6) fail('too steep');
        if (s.h > G.heightFadeEnd) fail('above the grass line');
        if (d[i + 6] < 0 || d[i + 6] > 1) fail('dry out of range');
        if (d[i + 6] > 0.5) dryTufts++;
      }
    }
  }
  const again = new GrassPlacer(new TerrainGenerator(Config.world.seed), plan, Config.world.seed, trees);
  for (const [tx, tz] of [[156, 156], [160, 150], [100, 200]]) {
    const a = grass.place(tx, tz), b = again.place(tx, tz);
    if (a.length !== b.length || a.some((v, i) => v !== b[i])) fail(`not deterministic at tile ${tx},${tz}`);
  }
  console.log(`grass: ${tiles} tiles, ${tufts} tufts (max ${max} per tile, ${empty} empty tiles, ${dryTufts} dry), ${(ms / tiles).toFixed(1)} ms / tile`);
  ok(bad === 0, 'grass: not in water / beach / on roads / on steep ground / above the grass line, deterministic, inside its tile');
  ok(tufts > 5000 && max <= (G.tile / G.cell) ** 2, 'grass: sensible amount');
  ok(ms / tiles < 120, 'grass: tile generation is fast enough (< 120 ms, runs in a worker; the grass is ~2.4x denser than before)');
}

// ---------- coarse grass ring = subset of the full tile ----------
{
  const full = grass.place(156, 156, 1), coarse = grass.place(156, 156, 5);
  const set = new Set<string>();
  for (let i = 0; i < full.length; i += GRASS_STRIDE) set.add(`${full[i].toFixed(4)},${full[i + 2].toFixed(4)}`);
  let sub = true;
  for (let i = 0; i < coarse.length; i += GRASS_STRIDE) if (!set.has(`${coarse[i].toFixed(4)},${coarse[i + 2].toFixed(4)}`)) sub = false;
  ok(sub && coarse.length < full.length / 10, `coarse grass ring (stride 5): ${coarse.length / GRASS_STRIDE} tufts of ${full.length / GRASS_STRIDE}, all at positions of the full tile`);
}

// ---------- rock collision (real Rapier) ----------
{
  let found: { cx: number; cz: number; r: Float32Array[]; x: number; y: number; z: number; s: number; kind: number } | null = null;
  for (let cz = 3; cz < 17 && !found; cz++) for (let cx = 3; cx < 17 && !found; cx++) {
    const r = rocks.place(cx, cz);
    const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
    const all: { x: number; z: number; y: number; s: number; kind: number }[] = [];
    r.forEach((d, kind) => { for (let i = 0; i < d.length; i += TREE_STRIDE) all.push({ x: ox + d[i], y: d[i + 1], z: oz + d[i + 2], s: d[i + 3], kind }); });
    const pick = all.find((a) => a.kind === 0 && a.s > 1.3 && all.every((b) => b === a || Math.hypot(a.x - b.x, a.z - b.z) > 8));
    if (pick) found = { cx, cz, r, ...pick };
  }
  ok(!!found, 'found a big isolated boulder to test with');
  if (found) {
    const bus = new EventBus<EngineEvents>();
    const physics = await PhysicsWorld.create(bus);
    const origin = new FloatingOrigin(new THREE.Group(), bus);
    const tp = new TreePhysics(physics, origin, bus);
    const base = physics.colliderCount;
    bus.emit('chunk:loaded', { key: chunkKey(found.cx, found.cz), cx: found.cx, cz: found.cz, lod: 0, vertsPerSide: 128, heights: new Float32Array(0), trees: null, rocks: found.r });
    for (let i = 0; i < 4; i++) tp.update(0.25, found.x - 5, found.z);
    ok(tp.activeColliders > 0, `rocks near the player get colliders (${tp.activeColliders})`);
    physics.step();
    const R = physics.RAPIER;
    const dist = 5;
    const groundY = found.y + 0.22 * found.s;
    const hit = physics.world.castRay(new R.Ray({ x: found.x - dist - origin.origin.x, y: groundY + 0.3, z: found.z - origin.origin.z }, { x: 1, y: 0, z: 0 }), 12, true);
    const expect = dist - 0.8 * found.s;
    ok(!!hit && Math.abs(hit.timeOfImpact - expect) < 0.06, `a ray at knee height hits the boulder at ${hit ? hit.timeOfImpact.toFixed(2) : 'none'} m (expected ${expect.toFixed(2)})`);
    tp.update(1, found.x + 450, found.z + 450);
    ok(tp.activeColliders === 0 && physics.colliderCount === base, 'far away: rock colliders removed');
    // small rocks never get colliders
    const small = new Float32Array([100, 5, 100, 0.5, 0, 1]);
    bus.emit('chunk:loaded', { key: 'x', cx: 5, cz: 5, lod: 0, vertsPerSide: 128, heights: new Float32Array(0), trees: null, rocks: [small, new Float32Array(0)] });
    tp.update(1, chunkOriginX(5) + 100, chunkOriginZ(5) + 100);
    ok(tp.activeColliders === 0, 'a small rock (0.5 scale) can be walked over: no collider');
    tp.dispose();
  }
}

// ---------- grass manager with a fake worker ----------
{
  const root = new THREE.Group();
  const assets = new GrassAssets();
  let requested = 0;
  const source = {
    requestGrass: (tx: number, tz: number, stride: number) => {
      requested++;
      return new Promise<{ type: 'grass'; tx: number; tz: number; stride: number; data: Float32Array }>((res) => setTimeout(() => res({ type: 'grass', tx, tz, stride, data: grass.place(tx, tz, stride) }), 1));
    },
  };
  const mgr = new GrassManager(root, source, assets);
  const ground = (x: number, z: number) => gen.heightAt(x, z);
  const px = 300, pz = -200;
  const py = ground(px, pz) + 2;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const pump = async (n: number, x = px, y = py, z = pz) => { for (let i = 0; i < n; i++) { mgr.update(0.25, x, y, z, ground); await wait(3); } };
  await pump(300);
  const expectTiles = Math.PI * G.radius ** 2 / G.tile ** 2;
  ok(mgr.tileCount >= expectTiles * 0.8 && mgr.tileCount <= expectTiles * 2.6, `tiles around the player: ${mgr.tileCount} (disc area suggests ~${expectTiles.toFixed(0)}), ${mgr.tuftCount} tufts`);
  ok(mgr.tuftCount < 200000, `LOD rings keep the tuft count sane (${mgr.tuftCount})`);
  const lods = new Set<number>(); for (const t of (mgr as unknown as { tiles: Map<string, { lod: number }> }).tiles.values()) lods.add(t.lod);
  ok(lods.size === G.lods.length, `all ${G.lods.length} LOD rings are in use (${[...lods].join(',')})`);
  ok(root.children.length === mgr.meshCount && mgr.meshCount >= mgr.tileCount * 0.9, 'every tile mesh (one per grass / flower type) is in the scene');
  const before = requested;
  await pump(10);
  ok(requested === before, 'standing still requests nothing more');
  await pump(400, px + 400, ground(px + 400, pz) + 2, pz);
  const nearNew = mgr.tileCount;
  ok(nearNew >= expectTiles * 0.8 && root.children.length === mgr.meshCount, `after walking 400 m the old tiles are gone and new ones exist (${nearNew})`);
  await pump(10, px + 400, ground(px + 400, pz) + 200, pz); // camera high up
  ok(mgr.tileCount === 0 && root.children.length === 0, 'camera 200 m above the ground: no grass tiles');
  mgr.dispose();
  assets.dispose();
}

new RockAssets().dispose();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
