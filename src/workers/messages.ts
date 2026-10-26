import type { RoadMeshData } from '../roads/RoadMesh';
import type { RailMeshData } from '../rail/RailMesh';
import type { PortMeshData } from '../port/PortMesh';
import type { WaterMeshData } from '../terrain/TerrainMeshData';
import type { TreeChunkData } from '../vegetation/TreeTypes';

/** Messages between the main thread and chunk.worker.ts. */

export interface ChunkRequest {
  type: 'generate';
  key: string;
  cx: number;
  cz: number;
  lod: number;
  seed: number;
  vertsPerSide: number;
  skirtDepth: number;
}

export interface ChunkResult {
  type: 'generated';
  key: string;
  cx: number;
  cz: number;
  lod: number;
  vertsPerSide: number;
  /** (n+1)^2 heights, row-major [z][x]. Kept for physics heightfields. */
  heights: Float32Array;
  /** Chunk-local vertex positions incl. skirts. */
  positions: Float32Array;
  normals: Float32Array;
  minHeight: number;
  maxHeight: number;
  /** Rivers / lakes / sea surface of this chunk, or null. */
  water: WaterMeshData | null;
  /** STAGE 6: per-vertex road coverage for the terrain shader (null = no road here). */
  roadMask: Float32Array | null;
  /** STAGE 6: asphalt ribbon for LOD0/1 (null = none). */
  road: RoadMeshData | null;
  /** STAGE 12: railway mesh for LOD0-2 (null = none in this chunk). */
  rail: RailMeshData | null;
  /** STAGE 14: sea port mesh for LOD0-2 (null = none in this chunk). */
  port: PortMeshData | null;
  /** Terrain index buffer with the tunnel / box holes cut out (LOD0 chunks a tunnel passes), or null = the shared one. */
  holeIndices: Uint16Array | Uint32Array | null;
  /** STAGE 7: tree placement per tree kind (chunk-local), or null for chunks too far away to have trees. */
  trees: TreeChunkData | null;
  /** STAGE 7: rock placement per rock kind (same layout as trees), or null for far chunks. */
  rocks: TreeChunkData | null;
}

/** STAGE 7: ask for the grass of one tile (tx, tz = tile index on the world grid of Config.vegetation.grass.tile). */
export interface GrassRequest {
  type: 'grass';
  tx: number;
  tz: number;
  seed: number;
  /** only every `stride`-th cell of the tile's cell grid gets a tuft (1 = all; far LOD rings use 2 and 5). */
  stride: number;
}

export interface GrassResult {
  type: 'grass';
  tx: number;
  tz: number;
  stride: number;
  /** GRASS_STRIDE floats per tuft, tile-local. */
  data: Float32Array;
}
