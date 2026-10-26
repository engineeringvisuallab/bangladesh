// STAGE 7: trees, rocks and grass.
export { TreeAssets } from './TreeAssets';
export { RockAssets } from './RockAssets';
export { GrassAssets } from './GrassAssets';
export { GrassManager } from './GrassManager';
export { TreeChunkBuilder } from './TreeChunkBuilder';
export { TreePhysics } from './TreePhysics';
export { TreeDestruction } from './TreeDestruction';
export { TreeKind, treeKey, TREE_KIND_COUNT, TREE_STRIDE, RockKind, ROCK_KIND_COUNT, GRASS_STRIDE, type TreeChunkData } from './TreeTypes';
// TreePlacer / RockPlacer / GrassPlacer are imported straight from their files by the chunk worker (no three.js there).
