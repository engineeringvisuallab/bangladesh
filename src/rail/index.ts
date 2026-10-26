// STAGE 11B: railway network plan. STAGE 12: engineering (long section, structures, earthworks) and the track / structure meshes.
export { RailNetwork } from './RailNetwork';
export type { RailEdge, RailStation, RailSegment, RailCrossing, CrossingKind, RailTerrain, RailPier, RailLink } from './RailNetwork';
export { RailFormation } from './RailFormation';
export { RailPhysics } from './RailPhysics';
export { RailChunkBuilder, RailMaterial } from './RailChunkBuilder';
export { RailDebug } from './RailDebug';
export { STATIONS, LINES, RAIL_DESIGN } from './RailPlan';
export { buildSwitches, buildDiamonds } from './RailSwitches';
export type { RailSwitch, RailDiamond } from './RailSwitches';
