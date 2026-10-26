// STAGE 5: drivable vehicles (Rapier raycast vehicle + our drivetrain model).
export { Vehicle } from './Vehicle';
export type { DriveInput, VehicleTelemetry } from './Vehicle';
export { VehicleManager } from './VehicleManager';
export { Powertrain } from './Powertrain';
export { SEDAN, JEEP, HYPERCAR, EVHYPAR, BIKE, EVBIKE, RICKSHAW, AUTO, BUS, TANK, SPECS, wheelDefs, groundY } from './VehicleSpec';
export type { VehicleSpec } from './VehicleSpec';
export { USE, canUse, canUseRoad, canUsePlace } from './VehicleUse';
export type { VehicleUse } from './VehicleUse';
