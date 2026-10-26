// STAGE 14 / Step 5a: trains. Headless simulation (RailGraph, TrackPath, TrainSim) + low-poly geometry (TrainMesh) + three.js view (TrainView, used from Step 5b).
export { RailGraph, endKey } from './RailGraph';
export type { EndKey, GraphLeg, GraphNode } from './RailGraph';
export { LegPath, vertexRadius } from './TrackPath';
export type { PathZone } from './TrackPath';
export { Train, TrainFleet, mulberry32 } from './TrainSim';
export type { CarPose, TrainEvent, FleetOptions } from './TrainSim';
export { buildCarMesh, PANTOGRAPH_TOP, BODY } from './TrainMesh';
export type { TrainMeshData } from './TrainMesh';
export { TrainView, TrainMaterial, TrainLayer } from './TrainView';
export { TrainManager, DEFAULT_TRAIN_START, DEFAULT_TRAIN_SEED } from './TrainManager';
export type { TrainViewLike, TrainViewHost, TrainManagerOptions } from './TrainManager';
export { TRAIN, CONSIST, CAR_GAP, TRAIN_LENGTH, STOP_FRONT_D, RAIL_HEAD } from './TrainConfig';
export type { CarKind, CarSpec } from './TrainConfig';
export { TrainSelector } from './TrainManager';
export type { TrainMarker } from './TrainManager';
export { trainBoxes, boxFromPose, quatFromAxes, rayBox, BOX_BOTTOM, boxTop } from './TrainBoxes';
export type { TrainBox, Obb } from './TrainBoxes';
export { TrainContacts, obbPenetration, playerObb, vehicleObb } from './TrainOverlap';
export type { TrainEntity, TrainHit } from './TrainOverlap';
export { TrainPhysics } from './TrainPhysics';
// STAGE 15 / Step 6: signals, station board, announcements
export { SignalSystem, LegBlocks, BLOCK, lineBlockId, platformBlock, openBlocks } from './Signals';
export type { Aspect } from './Signals';
export { StationBoard, formatBoard } from './StationBoard';
export type { BoardInfo, BoardRow, BoardKind } from './StationBoard';
export { TrainAnnouncer } from './TrainAnnouncer';
export type { Announcement, SayFn } from './TrainAnnouncer';
export { APPROACH_NOTICE } from './TrainSim';
export type { TrainNotice, TrainNoticeKind } from './TrainSim';
export { SignalLayer } from './SignalView';
export { signalSpecs, MAST_OFFSET, HOME_BEFORE, STARTER_AHEAD } from './SignalSpecs';
export type { SignalSpec } from './SignalSpecs';
// Passenger ride: board a standing train at a platform, get off at the next station
export { TrainRider } from './TrainRider';
export type { RiderDeps } from './TrainRider';
export { findBoardable, alightSpot, canAlight, pathIndex } from './TrainRide';
export type { Boardable } from './TrainRide';
