import * as THREE from 'three';
import type { DriveInput, Vehicle } from '../vehicles/Vehicle';
import { clamp } from '../utils/math';
import type { TourWaypoint } from './TourRoadPlanner';

const POS = new THREE.Vector3();
const FWD = new THREE.Vector3();
const OTHER = new THREE.Vector3();
const OTHER_FWD = new THREE.Vector3();

/**
 * High-speed road-following Tour autopilot with collision-aware pacing and cautious overtaking.
 * It never deliberately overtakes on narrow roads or into an occupied oncoming lane. If there is no safe gap,
 * it follows the slower vehicle at a safe distance instead of forcing a pass.
 */
export class TourRoadPilot {
  readonly input: DriveInput = { throttle: false, brake: false, steer: 0, handbrake: false, throttleAmt: 0, brakeAmt: 0 };
  private index = 0;
  private steer = 0;
  private stopped = false;
  private elapsed = 0;
  private overtakeTime = 0;
  private overtakeOffset = 0;
  private passingOffset = 3.2;
  private blockedVehicle: Vehicle | null = null;

  constructor(readonly points: TourWaypoint[], private getTraffic: () => readonly Vehicle[] = () => []) {}

  get finished(): boolean { return this.stopped; }

  update(dt: number, vehicle: Vehicle): void {
    const inp = this.input;
    this.elapsed += dt;
    if (this.stopped || this.points.length < 2) {
      inp.throttle = false; inp.brake = true; inp.handbrake = true; inp.steer = 0; inp.throttleAmt = 0; inp.brakeAmt = 1;
      return;
    }

    vehicle.getWorldPosition(POS);
    vehicle.forwardVector(FWD);
    const flat = Math.hypot(FWD.x, FWD.z) || 1;
    const fx = FWD.x / flat;
    const fz = FWD.z / flat;
    const speed = Math.max(0, vehicle.forwardSpeed);
    const distanceAt = (i: number) => Math.hypot(this.points[i].x - POS.x, this.points[i].z - POS.z);

    // Keep the route index monotonic. This prevents intersection turns from skipping onto a different road.
    while (this.index + 1 < this.points.length - 1 && distanceAt(this.index + 1) + 0.8 < distanceAt(this.index)) this.index++;

    const end = this.points[this.points.length - 1];
    const endDistance = Math.hypot(end.x - POS.x, end.z - POS.z);
    if (endDistance < 4.2 && speed < 1.1) {
      this.stopped = true;
      inp.throttle = false; inp.brake = true; inp.handbrake = true; inp.steer = 0; inp.throttleAmt = 0; inp.brakeAmt = 1;
      return;
    }

    const lanePoint = this.points[Math.min(this.points.length - 1, this.index + 2)];
    const roadWidth = lanePoint.roadWidth ?? 8;
    let targetSpeed = Math.min(31, lanePoint.vmax);
    targetSpeed = Math.min(targetSpeed, Math.max(7, 31 - Math.abs(this.steer) * 22));
    targetSpeed = Math.min(targetSpeed, Math.sqrt(Math.max(0, 2 * 4.2 * Math.max(0, endDistance - 1.5))));
    if (endDistance < 16) targetSpeed = Math.min(targetSpeed, Math.max(0, (endDistance - 2) * 1.8));

    // Traffic scan: forward/lateral projections avoid braking for cars in another lane or behind us.
    let closestAhead = Infinity;
    let frontCar: Vehicle | null = null;
    let frontGap = Infinity;
    let frontSpeed = 0;
    for (const other of this.getTraffic()) {
      if (other === vehicle || !other.enabled) continue;
      other.getWorldPosition(OTHER);
      const rx = OTHER.x - POS.x;
      const rz = OTHER.z - POS.z;
      const along = rx * fx + rz * fz;
      const lateral = rx * fz - rz * fx;
      if (along < -2 || along > 58) continue;
      const lateralSafe = vehicle.spec.half.x + other.spec.half.x + 0.6;
      if (Math.abs(lateral) > Math.max(2.15, lateralSafe)) continue;
      if (along < closestAhead) {
        closestAhead = along;
        frontCar = other;
        frontGap = Math.max(0, along - vehicle.spec.half.z - other.spec.half.z - 1.8);
        other.forwardVector(OTHER_FWD);
        frontSpeed = Math.max(0, other.forwardSpeed * Math.sign(OTHER_FWD.x * fx + OTHER_FWD.z * fz));
      }
    }

    // A pass only starts on a wide road, with an empty right-side passing corridor and no closing traffic.
    if (frontCar && frontGap < 30 && frontSpeed < speed - 1.8 && this.overtakeTime <= 0) {
      const passOffset = clamp(lanePoint.passOffset ?? 3.2, 2.6, 5.8);
      const safe = roadWidth >= 10.5 && this.isStraightAhead() && this.passingLaneClear(vehicle, POS, fx, fz, passOffset, 52);
      if (safe) {
        this.passingOffset = passOffset;
        this.overtakeTime = 5.8;
        this.blockedVehicle = frontCar;
      }
    }

    if (this.overtakeTime > 0) {
      this.overtakeTime = Math.max(0, this.overtakeTime - dt);
      if (this.blockedVehicle?.enabled) {
        this.blockedVehicle.getWorldPosition(OTHER);
        const passedAlong = (OTHER.x - POS.x) * fx + (OTHER.z - POS.z) * fz;
        // Keep the passing lane only as long as needed to clear the slower vehicle.
        if (passedAlong > -7) this.overtakeTime = Math.max(this.overtakeTime, 0.75);
        else this.overtakeTime = Math.min(this.overtakeTime, 0.35);
      }
      // Cancel instantly if a new vehicle enters the passing corridor.
      if (!this.passingLaneClear(vehicle, POS, fx, fz, this.passingOffset, 36)) this.overtakeTime = 0;
    }

    // If no safe pass is possible, pace the car in front with a comfortable time gap.
    if (frontCar && frontGap < 42 && this.overtakeTime <= 0) {
      const followingSpeed = frontSpeed + Math.sqrt(Math.max(0, 2 * 3.6 * Math.max(0, frontGap - 4)));
      targetSpeed = Math.min(targetSpeed, followingSpeed);
    }
    if (frontCar && frontGap < 8) targetSpeed = Math.min(targetSpeed, Math.max(0, frontSpeed - 0.4));

    const lookAhead = clamp(5 + speed * 0.32, 6, 18);
    let targetIndex = this.index;
    let alongPath = 0;
    while (targetIndex + 1 < this.points.length && alongPath < lookAhead) {
      alongPath += Math.hypot(this.points[targetIndex + 1].x - this.points[targetIndex].x, this.points[targetIndex + 1].z - this.points[targetIndex].z);
      targetIndex++;
    }
    const target = this.points[targetIndex];
    let tx = target.x - POS.x;
    let tz = target.z - POS.z;

    // Shift across to the right only while a verified pass is in progress, then smoothly return to lane centre.
    const wantOffset = this.overtakeTime > 0 ? -this.passingOffset : 0;
    this.overtakeOffset += (wantOffset - this.overtakeOffset) * Math.min(1, 1.8 * dt);
    const nextIndex = Math.min(this.points.length - 1, targetIndex + 1);
    const prevIndex = Math.max(0, targetIndex - 1);
    const tangentX = this.points[nextIndex].x - this.points[prevIndex].x;
    const tangentZ = this.points[nextIndex].z - this.points[prevIndex].z;
    const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
    // The road graph uses positive offset for the left-hand traffic lane; negative offset moves right for overtaking.
    tx += (tangentZ / tangentLength) * this.overtakeOffset;
    tz -= (tangentX / tangentLength) * this.overtakeOffset;

    const along = tx * fx + tz * fz;
    const lateral = tx * fz - tz * fx;
    const alpha = Math.atan2(lateral, Math.max(0.01, along));
    const wheelbase = vehicle.spec.wheelbaseHalf * 2;
    const delta = Math.atan((2 * wheelbase * Math.sin(alpha)) / Math.max(3, Math.hypot(tx, tz)));
    const maxSteer = Math.max(0.05, vehicle.spec.maxSteer / (1 + (speed / 22) ** 2));
    const desiredSteer = clamp(delta / maxSteer, -1, 1);
    this.steer += (desiredSteer - this.steer) * Math.min(1, 7 * dt);

    // During a verified pass keep the road's allowed cruise speed; do not artificially cap the Tour vehicle.
    if (this.overtakeTime > 0 && frontCar) targetSpeed = Math.min(31, Math.max(targetSpeed, frontSpeed + 3.2));
    const error = targetSpeed - vehicle.forwardSpeed;
    inp.steer = this.steer;
    inp.handbrake = false;
    inp.throttle = error > 0.7;
    inp.brake = error < -0.5 && vehicle.forwardSpeed > 0.6;
    inp.throttleAmt = inp.throttle ? clamp(error * 0.09, 0.16, 1) : 0;
    inp.brakeAmt = inp.brake ? clamp(-error * 0.18, 0.2, 1) : 0;

    if (this.overtakeTime <= 0 && this.overtakeOffset < 0.05) this.blockedVehicle = null;
  }


  private isStraightAhead(): boolean {
    const a = this.points[Math.min(this.points.length - 1, this.index + 1)];
    const b = this.points[Math.min(this.points.length - 1, this.index + 4)];
    const c = this.points[Math.min(this.points.length - 1, this.index + 10)];
    const ax = b.x - a.x, az = b.z - a.z;
    const bx = c.x - b.x, bz = c.z - b.z;
    const al = Math.hypot(ax, az), bl = Math.hypot(bx, bz);
    if (al < 0.1 || bl < 0.1) return false;
    return (ax * bx + az * bz) / (al * bl) > 0.94;
  }

  private passingLaneClear(vehicle: Vehicle, pos: THREE.Vector3, fx: number, fz: number, offset: number, lookAhead: number): boolean {
    const roadWidth = this.points[Math.min(this.points.length - 1, this.index + 2)].roadWidth ?? 8;
    if (roadWidth < 10.5) return false;
    for (const other of this.getTraffic()) {
      if (other === vehicle || !other.enabled) continue;
      other.getWorldPosition(OTHER);
      const rx = OTHER.x - pos.x;
      const rz = OTHER.z - pos.z;
      const along = rx * fx + rz * fz;
      const lateral = rx * fz - rz * fx;
      // A pass occupies the right-side lane: any vehicle within this forward corridor makes it unsafe,
      // including oncoming traffic, vehicles emerging at a junction, or another car already passing.
      if (along > -7 && along < lookAhead && Math.abs(lateral + offset) < vehicle.spec.half.x + other.spec.half.x + 0.35) return false;
      // Also leave room to get back in front of the passed vehicle.
      if (along > 10 && along < lookAhead + 12 && Math.abs(lateral) < 1.8 && other.forwardSpeed > vehicle.forwardSpeed * 0.8) return false;
    }
    return true;
  }
}
