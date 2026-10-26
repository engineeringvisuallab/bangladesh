import type { VehicleSpec } from './VehicleSpec';

const RADS_TO_RPM = 60 / (2 * Math.PI);

/** Linear interpolation on a [x, y] table. */
export function lerpCurve(curve: [number, number][], x: number): number {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (x <= curve[i][0]) {
      const [x0, y0] = curve[i - 1];
      const [x1, y1] = curve[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
}

/**
 * Engine -> clutch -> gearbox -> final drive -> wheels.
 *
 *   wheel force = engine torque x gear ratio x final drive x efficiency / wheel radius
 *
 * - Torque comes from a real torque curve (Nm vs rpm). Power = torque x angular speed.
 * - Engine rpm follows the wheels (through the gear ratio) when the clutch is closed.
 * - At low speed the clutch slips so the engine can rev and the car can pull away.
 * - Closed throttle gives engine braking (negative torque). At the redline the fuel is cut (rev limiter).
 * - Automatic gearbox shifts by rpm; during a shift the clutch opens and no torque reaches the wheels.
 * The tyre/suspension forces are Rapier's job; this class only produces the drive force.
 */
export class Powertrain {
  rpm: number;
  /** 1..n forward, -1 reverse, 0 neutral. */
  gear = 1;
  auto = true;
  shiftTimer = 0;
  // telemetry
  torque = 0;
  powerKw = 0;
  /** Signed total drive force at the wheels (N), + = forward. */
  wheelForce = 0;
  slip = false;
  limiter = false;
  engineBraking = false;

  constructor(private spec: VehicleSpec) {
    this.rpm = spec.engine.idleRpm;
  }

  get ratio(): number {
    const s = this.spec;
    if (this.gear > 0) return s.gears[this.gear - 1] * s.finalDrive;
    if (this.gear < 0) return s.reverse * s.finalDrive;
    return 0;
  }

  /** Manual shift request: leaves automatic mode. */
  requestShift(dir: 1 | -1): void {
    this.auto = false;
    const n = this.spec.gears.length;
    let g = this.gear + dir;
    if (this.gear < 0 && dir > 0) g = 0; // R -> N
    else if (this.gear === 0 && dir > 0) g = 1; // N -> 1
    else if (this.gear === 1 && dir < 0) g = 0; // 1 -> N
    else if (this.gear === 0 && dir < 0) g = -1; // N -> R
    g = Math.max(-1, Math.min(n, g));
    if (g !== this.gear) this.setGear(g);
  }

  setGear(g: number): void {
    if (g === this.gear) return;
    this.gear = g;
    this.shiftTimer = 0.28;
  }

  /** Driver wants to go forward (dir=1) or backward (dir=-1) from standstill. */
  selectDirection(dir: 1 | -1): void {
    if (dir > 0 && this.gear <= 0) this.setGear(1);
    else if (dir < 0 && this.gear >= 0) this.setGear(-1);
  }

  /**
   * @param throttle 0..1
   * @param speed signed speed along the car's forward axis (m/s)
   */
  step(dt: number, throttle: number, speed: number): void {
    const e = this.spec.engine;
    const r = this.spec.wheelRadius;
    const n = this.spec.gears.length;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    const ratio = this.ratio;
    const clutchOpen = this.gear === 0 || this.shiftTimer > 0;
    const rpmWheel = (Math.abs(speed) / r) * ratio * RADS_TO_RPM;

    // --- automatic gearbox ---
    if (this.auto && this.gear > 0 && this.shiftTimer === 0) {
      const lowerRatio = this.gear > 1 ? this.spec.gears[this.gear - 2] * this.spec.finalDrive : 0;
      const rpmLower = this.gear > 1 ? (Math.abs(speed) / r) * lowerRatio * RADS_TO_RPM : 0;
      if (this.gear < n && this.rpm > e.redlineRpm * (throttle > 0.6 ? 0.92 : 0.7) && throttle > 0.05) this.setGear(this.gear + 1);
      else if (this.gear > 1 && (this.rpm < e.idleRpm * 1.7 || (throttle > 0.85 && rpmLower < e.redlineRpm * 0.82 && this.rpm < e.redlineRpm * 0.5))) {
        this.setGear(this.gear - 1);
      }
    }

    // --- engine rpm ---
    const launchRpm = e.idleRpm + throttle * ((e.launchRpm ?? 1900) - e.idleRpm);
    this.slip = false;
    let target: number;
    if (clutchOpen) {
      target = e.idleRpm + throttle * (e.redlineRpm * 0.85 - e.idleRpm);
    } else {
      target = Math.max(rpmWheel, e.idleRpm);
      if (rpmWheel < launchRpm && throttle > 0.05) {
        target = launchRpm; // clutch slipping: engine revs above wheel-driven rpm
        this.slip = true;
      }
    }
    this.rpm += (target - this.rpm) * Math.min(1, 14 * dt);
    this.rpm = Math.min(Math.max(this.rpm, e.idleRpm), e.redlineRpm * 1.03);

    // --- torque ---
    const full = lerpCurve(e.torque, this.rpm);
    const drag = e.engineBraking * (this.rpm / e.redlineRpm);
    let t = throttle * full - (1 - throttle) * drag;
    this.limiter = this.rpm >= e.redlineRpm && throttle > 0.05;
    if (this.limiter) t = Math.min(t, 0);
    this.engineBraking = t < 0 && !clutchOpen && Math.abs(speed) > 0.5;
    if (clutchOpen || (t < 0 && Math.abs(speed) < 0.5)) t = 0;
    this.torque = t;
    this.powerKw = (t * this.rpm * (2 * Math.PI)) / 60 / 1000;

    const dir = this.gear < 0 ? -1 : 1;
    this.wheelForce = (dir * t * ratio * this.spec.efficiency) / r;
  }
}
