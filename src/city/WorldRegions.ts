import { Config } from '../core/Config';

/** Named 2 km x 2 km districts cover the entire playable 10 km x 10 km world. */
export type WorldRegionKind = 'mountain' | 'forest' | 'plain' | 'urban' | 'industrial' | 'delta' | 'coast' | 'wetland' | 'safari';

export interface WorldRegion {
  id: string;
  row: number;
  col: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  x: number;
  z: number;
  kind: WorldRegionKind;
}

const DEFINITIONS: ReadonlyArray<readonly [string, WorldRegionKind]> = [
  ['nw-highlands', 'mountain'], ['north-forest', 'forest'], ['north-plateau', 'plain'], ['northeast-forest', 'forest'], ['ne-highlands', 'mountain'],
  ['nw-woodland', 'forest'], ['north-lakes', 'wetland'], ['north-approach', 'urban'], ['east-woodland', 'forest'], ['east-highlands', 'mountain'],
  ['west-rural', 'plain'], ['west-plains', 'plain'], ['central-metro', 'urban'], ['east-plains', 'plain'], ['east-works', 'industrial'],
  ['southwest-farms', 'plain'], ['west-delta', 'delta'], ['south-safari', 'safari'], ['east-wetlands', 'wetland'], ['southeast-coast', 'coast'],
  ['southwest-coast', 'coast'], ['south-coastal-plain', 'coast'], ['delta-mouth', 'delta'], ['mangrove-belt', 'wetland'], ['southeast-shore', 'coast'],
];

const HALF = Config.world.size / 2;
const CELL = Config.world.size / 5;

export const WORLD_REGIONS: readonly WorldRegion[] = DEFINITIONS.map(([id, kind], index) => {
  const row = Math.floor(index / 5);
  const col = index % 5;
  const minX = -HALF + col * CELL;
  const minZ = -HALF + row * CELL;
  return {
    id, row, col, kind,
    minX, maxX: minX + CELL,
    minZ, maxZ: minZ + CELL,
    x: minX + CELL / 2,
    z: minZ + CELL / 2,
  };
});

/** Returns the named district for any point within or immediately outside the playable map. */
export function getWorldRegionAt(x: number, z: number): WorldRegion {
  const col = Math.max(0, Math.min(4, Math.floor((x + HALF) / CELL)));
  const row = Math.max(0, Math.min(4, Math.floor((z + HALF) / CELL)));
  return WORLD_REGIONS[row * 5 + col];
}

export const WORLD_REGION_COLORS: Record<WorldRegionKind, string> = {
  mountain: '#9aa6b3',
  forest: '#43845b',
  plain: '#d3b56f',
  urban: '#5da5ed',
  industrial: '#a184d4',
  delta: '#55b3b2',
  coast: '#e0c98d',
  wetland: '#4b9d95',
  safari: '#7ba94e',
};
