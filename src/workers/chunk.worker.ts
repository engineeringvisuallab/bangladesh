import { TerrainGenerator } from '../terrain/TerrainGenerator';
import { buildChunkMeshData } from '../terrain/TerrainMeshData';
import { CityPlan } from '../city/CityPlan';
import { Config } from '../core/Config';
import { GrassPlacer } from '../vegetation/GrassPlacement';
import { RockPlacer } from '../vegetation/RockPlacement';
import { TreePlacer } from '../vegetation/TreePlacement';
import type { ChunkRequest, ChunkResult, GrassRequest, GrassResult } from './messages';

/**
 * Chunk generation worker. Runs off the main thread so the game never freezes.
 * STAGE 2: samples the terrain function and builds vertex buffers (positions, normals, skirts).
 * STAGE 3: rivers, lakes and the sea come from TerrainGenerator.sample(); the water mesh is built here too.
 * STAGE 6: road coverage mask + asphalt ribbon are built here too (roads are already part of TerrainGenerator.sample()).
 * STAGE 7: tree and rock placement are generated here too, for chunks up to Config.vegetation.maxLod;
 *          grass tiles are made on request ('grass' messages) because only the tiles around the player are needed.
 * STAGE 8+ HOOK: building placement data is generated here too.
 */
const ctx = self as unknown as Worker;
let generator: TerrainGenerator | null = null;
let generatorSeed = NaN;
let treePlacer: TreePlacer | null = null;
let rockPlacer: RockPlacer | null = null;
let grassPlacer: GrassPlacer | null = null;

function ensureGenerator(seed: number): TerrainGenerator {
  if (!generator || generatorSeed !== seed) {
    generator = new TerrainGenerator(seed);
    generatorSeed = seed;
    const plan = new CityPlan(generator.sites);
    treePlacer = new TreePlacer(generator, plan, seed);
    rockPlacer = new RockPlacer(generator, treePlacer, seed);
    grassPlacer = new GrassPlacer(generator, plan, seed, treePlacer);
  }
  return generator;
}

ctx.onmessage = (e: MessageEvent<ChunkRequest | GrassRequest>) => {
  const req = e.data;

  if (req.type === 'grass') {
    ensureGenerator(req.seed);
    const data = grassPlacer!.place(req.tx, req.tz, req.stride);
    const out: GrassResult = { type: 'grass', tx: req.tx, tz: req.tz, stride: req.stride, data };
    ctx.postMessage(out, [data.buffer as ArrayBuffer]);
    return;
  }
  if (req.type !== 'generate') return;

  const gen = ensureGenerator(req.seed);
  const m = buildChunkMeshData(gen, req.cx, req.cz, req.vertsPerSide, req.skirtDepth, req.lod);

  const withPlants = req.lod <= Config.vegetation.maxLod;
  const trees = withPlants ? treePlacer!.place(req.cx, req.cz) : null;
  const rocks = withPlants ? rockPlacer!.place(req.cx, req.cz) : null;

  const result: ChunkResult = {
    type: 'generated',
    key: req.key,
    cx: req.cx,
    cz: req.cz,
    lod: req.lod,
    vertsPerSide: req.vertsPerSide,
    heights: m.heights,
    positions: m.positions,
    normals: m.normals,
    minHeight: m.minHeight,
    maxHeight: m.maxHeight,
    water: m.water,
    roadMask: m.roadMask,
    road: m.road,
    rail: m.rail,
    port: m.port,
    holeIndices: m.holeIndices,
    trees,
    rocks,
  };
  const transfer: ArrayBuffer[] = [m.heights.buffer, m.positions.buffer, m.normals.buffer] as ArrayBuffer[];
  if (m.water) {
    const w = m.water;
    transfer.push(w.positions.buffer as ArrayBuffer, w.normals.buffer as ArrayBuffer, w.depth.buffer as ArrayBuffer, w.flow.buffer as ArrayBuffer, w.indices.buffer as ArrayBuffer);
  }
  if (m.roadMask) transfer.push(m.roadMask.buffer as ArrayBuffer);
  if (m.holeIndices) transfer.push(m.holeIndices.buffer as ArrayBuffer);
  if (m.road) transfer.push(m.road.positions.buffer as ArrayBuffer, m.road.normals.buffer as ArrayBuffer, m.road.info.buffer as ArrayBuffer, m.road.indices.buffer as ArrayBuffer);
  if (m.rail) transfer.push(m.rail.positions.buffer as ArrayBuffer, m.rail.normals.buffer as ArrayBuffer, m.rail.colors.buffer as ArrayBuffer, m.rail.glow.buffer as ArrayBuffer, m.rail.indices.buffer as ArrayBuffer);
  if (m.port) transfer.push(m.port.positions.buffer as ArrayBuffer, m.port.normals.buffer as ArrayBuffer, m.port.colors.buffer as ArrayBuffer, m.port.indices.buffer as ArrayBuffer);
  for (const list of [trees, rocks]) if (list) for (const t of list) if (t.length > 0) transfer.push(t.buffer as ArrayBuffer);
  ctx.postMessage(result, transfer);
};
