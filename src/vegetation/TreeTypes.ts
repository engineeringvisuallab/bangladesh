/** Tree kinds and the layout of the placement data that travels from the chunk worker to the main thread. */
export const TreeKind = {
  broadleaf: 0,
  pine: 1,
  palm: 2,
  /** More broadleaf shapes (same physics family): wide spreading oak, upright vase, slender young tree. */
  oak: 3,
  vase: 4,
  slender: 5,
} as const;
export const TREE_KIND_COUNT = 6;

/** Stable id of a tree inside its chunk (the same at every LOD): kind + chunk-local position rounded to 0.5 m. */
export const treeKey = (kind: number, x: number, z: number): string => `${kind}:${Math.round(x * 2)}:${Math.round(z * 2)}`;

/** Floats per tree: x, y, z (chunk-local, metres), scale, yaw (rad), tint (colour multiplier ~0.8..1.15). */
export const TREE_STRIDE = 6;

/** Rock kinds. Same data layout as trees (TREE_STRIDE floats per rock). */
export const RockKind = {
  round: 0,
  slab: 1,
} as const;
export const ROCK_KIND_COUNT = 2;

/** Floats per grass tuft: x, y, z (tile-local, metres), scale, yaw (rad), tint (~0.85..1.15), dry (0 green .. 1 dry). */
export const GRASS_STRIDE = 7;

/**
 * Grass / flower tuft types (the main thread picks one per tuft from a hash + meadow patches; the workers do not care).
 * 0..3 = pure grass, 4..9 = a grass tuft with flowers growing out of it.
 */
export const GrassType = {
  lawn: 0, // short, fine, dense
  wild: 1, // tall, slim, bent blades
  clump: 2, // broad-leaf bunch
  seed: 3, // tall straw-coloured grass with seed heads
  daisy: 4,
  buttercup: 5,
  lavender: 6,
  poppy: 7,
  cornflower: 8,
  clover: 9,
} as const;
export const GRASS_TYPE_COUNT = 10;

/** One Float32Array per tree kind (index = TreeKind). Empty kinds have length 0. */
export type TreeChunkData = Float32Array[];
