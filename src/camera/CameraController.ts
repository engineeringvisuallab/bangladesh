/** A camera behaviour (EVCity's CameraController is not ported; only this interface is needed by OrbitCamera). */
export interface CameraMode {
  update(dt: number): void;
}
