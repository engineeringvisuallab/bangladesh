// STAGE 8: buildings. Right now ONE prototype building (the police station / thana) stands in the world; the other models are in ./models.
export { BuildingManager } from './BuildingManager';
export type { BuildingDeps } from './BuildingManager';
export { ProtoSite, PROTO_PLOT, PROTO_POS, PROTO_PATH, PROTO_SIZE, PROTO_MODEL_ID, protoKeepout } from './ProtoSite';
export { BUILDING_MODELS, BUILDING_MODEL_BY_ID } from './models/registry';
export { PlacedBuildings } from './PlacedBuildings';
export { FillBuildings } from './FillBuildings';
export { BUILDING_PLACEMENTS, placementContains, placementKeepout } from './Placements';
export { setBuildingTextureQuality } from './models/BuildingTextures';
