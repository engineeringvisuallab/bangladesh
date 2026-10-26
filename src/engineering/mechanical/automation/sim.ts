/**
 * The brain of the automated line (plain TypeScript, no 3D): spawns boxes, runs the conveyor, the height sensor + pusher (sorter),
 * the pick-and-place robot, the pallet and the AGV that carries full pallets to the rack. The 3D parts only DRAW this state,
 * and the PLC / SCADA screens show the same signals, so what a student sees on the screens is exactly what the machines do.
 */
import { L } from './layout';

export const CAP = 8; // boxes per pallet
export const RACK_SLOTS = 6;
const V_BELT = 1.3;
const SPAWN_EVERY = 2.2;
const AGV_SPEED = 6;
const H_SHORT = 1.0;
const H_TALL = 1.8;

export interface Item {
  id: number;
  kind: 'short' | 'tall';
  h: number;
  x: number;
  y: number;
  z: number;
  state: 'belt' | 'pushed' | 'held' | 'placed' | 'gone';
  pallet: number;
  slot: number;
  t: number;
}
export interface Pallet {
  id: number;
  where: 'station' | 'agv' | 'rack' | 'gone';
  rack: number;
  count: number;
  x: number;
  y: number;
  z: number;
}

const ease = (u: number): number => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

export class FactorySim {
  time = 0;
  items: Item[] = [];
  pallets: Pallet[] = [];
  private nextId = 0;
  private nextPalletId = 0;
  private nextSpawn = 1;

  // signals (what the PLC sees and drives)
  s1 = false; // photo-eye: a box passes (counts boxes)
  s2 = false; // height beam: a TALL box
  s3 = false; // a box waits at the pick position
  motor = true; // conveyor motor output
  pusher = 0; // 0..1 extension of the pneumatic pusher
  robotBusy = false;
  agvBusy = false;
  good = 0;
  rejected = 0;
  stored = 0; // pallets delivered to the rack
  total = 0;

  // robot
  robotPhase = -1; // -1 idle, else 0..8
  private robotT = 0;
  tip: { x: number; y: number; z: number } = { x: L.robot.x, y: 5.2, z: L.robot.z - 1 };
  gripClosed = false;
  private wp: { x: number; y: number; z: number }[] = [];
  private robotItem: Item | null = null;

  // AGV
  agv: { x: number; z: number; yaw: number; state: 'parked' | 'go1' | 'lift' | 'go2' | 'drop' | 'go3'; t: number; leg: number; lift: number } = { x: L.agv.parkX, z: L.agv.parkZ, yaw: 0, state: 'parked', t: 0, leg: 0, lift: 0 };
  private route1: [number, number][] = [];
  private route2: [number, number][] = [];
  private route3: [number, number][] = [];
  private carry: Pallet | null = null;
  rackCount = 0;
  private rackClearAt = -1;

  constructor() {
    const a = L.agv;
    this.route1 = [[a.parkX, a.laneZ], [L.pallet.x, a.laneZ], [L.pallet.x, L.pallet.z]];
    this.route2 = [[L.pallet.x, a.laneZ], [a.rackDropX, a.laneZ], [a.rackDropX, a.rackDropZ]];
    this.route3 = [[a.rackDropX, a.laneZ], [a.parkX, a.laneZ], [a.parkX, a.parkZ]];
    this.newPallet();
  }

  get station(): Pallet | undefined {
    return this.pallets.find((p) => p.where === 'station');
  }
  private newPallet(): void {
    this.pallets.push({ id: this.nextPalletId++, where: 'station', rack: -1, count: 0, x: L.pallet.x, y: 0, z: L.pallet.z });
  }
  /** local position of slot k on a pallet whose centre is (px, pz) */
  slotPos(k: number, px: number, pz: number): { x: number; z: number } {
    return { x: px - 1.9 + (k % 4) * 1.25, z: pz - 0.65 + Math.floor(k / 4) * 1.3 };
  }
  rackSlot(i: number): { x: number; y: number; z: number } {
    const r = L.rack;
    return { x: r.x + r.cols[i % 2], y: r.levels[Math.floor(i / 2)], z: r.z };
  }

  step(dtIn: number): void {
    const dt = Math.min(dtIn, 0.1);
    this.time += dt;
    this.spawn();
    this.conveyor(dt);
    this.robot(dt);
    this.agvStep(dt);
    this.palletsStep();
    this.itemsFollow();
    // rack full: empty it after a pause (boxes are shipped)
    if (this.rackClearAt >= 0 && this.time >= this.rackClearAt) {
      for (const p of this.pallets) if (p.where === 'rack') p.where = 'gone';
      for (const it of this.items) if (it.state === 'placed' && this.pallets.find((p) => p.id === it.pallet)?.where === 'gone') it.state = 'gone';
      this.rackCount = 0;
      this.rackClearAt = -1;
    }
    this.items = this.items.filter((i) => i.state !== 'gone');
    this.pallets = this.pallets.filter((p) => p.where !== 'gone');
  }

  private spawn(): void {
    if (this.time < this.nextSpawn) return;
    const L0 = L.line;
    const last = this.items.filter((i) => i.state === 'belt').reduce((m, i) => Math.min(m, i.x), 1e9);
    if (last < L0.xSpawn + 2.6) return;
    if (this.items.length > 80) return;
    this.nextSpawn = this.time + SPAWN_EVERY;
    const tall = this.nextId % 3 === 1;
    this.items.push({ id: this.nextId++, kind: tall ? 'tall' : 'short', h: tall ? H_TALL : H_SHORT, x: L0.xSpawn, y: L0.beltY, z: L0.beltZ, state: 'belt', pallet: -1, slot: -1, t: 0 });
    this.total++;
  }

  private conveyor(dt: number): void {
    const l = L.line;
    const belt = this.items.filter((i) => i.state === 'belt').sort((a, b) => b.x - a.x);
    let leader: Item | null = null;
    this.s1 = this.s2 = this.s3 = false;
    for (const it of belt) {
      const limit = leader ? leader.x - 2.0 : it.kind === 'short' ? l.xPick : 1e9;
      if (this.motor) it.x = Math.min(it.x + V_BELT * dt, limit);
      if (Math.abs(it.x - l.xS1) < 0.9) this.s1 = true;
      if (it.kind === 'tall' && Math.abs(it.x - l.xS2) < 0.9) this.s2 = true;
      if (it.kind === 'short' && it.x >= l.xPick - 0.05) this.s3 = true;
      if (it.kind === 'tall' && it.x >= l.xSort) {
        it.state = 'pushed';
        it.t = 0;
      }
      leader = it;
    }
    // pushed boxes: the pneumatic pusher shoves them sideways into the reject bin
    let ext = 0;
    for (const it of this.items) {
      if (it.state !== 'pushed') continue;
      it.t += dt;
      const u = Math.min(1, it.t / 1.0);
      it.z = l.beltZ + 4.4 * ease(u);
      it.x = l.xSort;
      ext = Math.max(ext, u < 1 ? ease(u) : Math.max(0, 1 - (it.t - 1.0) / 0.5));
      if (it.t > 1.0) it.y = Math.max(0.3, l.beltY - (it.t - 1.0) * 1.8);
      if (it.t > 1.6) {
        it.state = 'gone';
        this.rejected++;
      }
    }
    this.pusher = ext;
  }

  private robot(dt: number): void {
    const r = L.robot;
    const l = L.line;
    const pal = this.station;
    if (this.robotPhase < 0) {
      const front = this.items.find((i) => i.state === 'belt' && i.kind === 'short' && i.x >= l.xPick - 0.05);
      if (front && pal && pal.count < CAP && !this.agvBusyLifting()) {
        this.robotPhase = 0;
        this.robotT = 0;
        this.robotItem = front;
        const s = this.slotPos(pal.count, pal.x, pal.z);
        const g = r.grip;
        const hp = H_SHORT + l.beltY + g; // wrist height when the fingertips touch the top of a box on the belt
        const hs = 0.3 + H_SHORT + g; // ... and when the box touches the pallet
        const home = { x: r.x, y: 5.2, z: r.z - 1 };
        this.wp = [
          home,
          { x: l.xPick, y: 4.2, z: l.beltZ },
          { x: l.xPick, y: hp, z: l.beltZ },
          { x: l.xPick, y: hp, z: l.beltZ },
          { x: l.xPick, y: 4.2, z: l.beltZ },
          { x: s.x, y: 4.2, z: s.z },
          { x: s.x, y: hs, z: s.z },
          { x: s.x, y: hs, z: s.z },
          { x: s.x, y: 4.2, z: s.z },
          home,
        ];
      }
    }
    this.robotBusy = this.robotPhase >= 0;
    if (this.robotPhase < 0) return;
    const dur = [1.0, 0.6, 0.35, 0.6, 1.3, 0.6, 0.3, 0.5, 0.9];
    const k = this.robotPhase;
    this.robotT += dt;
    const u = Math.min(1, this.robotT / dur[k]);
    const a = this.wp[k];
    const b = this.wp[k + 1];
    const e = ease(u);
    this.tip = { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z, b.z, e) };
    if (k >= 3 && k <= 5) this.gripClosed = true;
    if (k === 2) this.gripClosed = u > 0.5;
    if (k === 6) this.gripClosed = u < 0.5;
    if (u >= 1) {
      this.robotT = 0;
      if (k === 2 && this.robotItem) {
        this.robotItem.state = 'held';
      }
      if (k === 6 && this.robotItem && pal) {
        this.robotItem.state = 'placed';
        this.robotItem.pallet = pal.id;
        this.robotItem.slot = pal.count;
        pal.count++;
        this.good++;
        this.robotItem = null;
      }
      this.robotPhase++;
      if (this.robotPhase > 8) {
        this.robotPhase = -1;
        this.robotBusy = false;
        this.gripClosed = false;
      }
    }
  }

  private agvBusyLifting(): boolean {
    return this.agv.state === 'lift' || this.agv.state === 'go1';
  }

  private drive(route: [number, number][], dt: number): boolean {
    const g = this.agv;
    const target = route[g.leg];
    const dx = target[0] - g.x;
    const dz = target[1] - g.z;
    const d = Math.hypot(dx, dz);
    const step = AGV_SPEED * dt;
    if (d > 1e-4) g.yaw = Math.atan2(dx, dz);
    if (d <= step) {
      g.x = target[0];
      g.z = target[1];
      g.leg++;
      return g.leg >= route.length;
    }
    g.x += (dx / d) * step;
    g.z += (dz / d) * step;
    return false;
  }

  private agvStep(dt: number): void {
    const g = this.agv;
    const pal = this.station;
    this.agvBusy = g.state !== 'parked';
    if (g.state === 'parked') {
      if (pal && pal.count >= CAP && this.robotPhase < 0) {
        g.state = 'go1';
        g.leg = 0;
      }
    } else if (g.state === 'go1') {
      if (this.drive(this.route1, dt)) {
        g.state = 'lift';
        g.t = 0;
      }
    } else if (g.state === 'lift') {
      g.t += dt;
      g.lift = Math.min(1, g.t / 1.0);
      if (g.t >= 1.0 && pal) {
        pal.where = 'agv';
        this.carry = pal;
        this.newPallet(); // a fresh empty pallet is put on the station
        g.state = 'go2';
        g.leg = 0;
      }
    } else if (g.state === 'go2') {
      if (this.drive(this.route2, dt)) {
        g.state = 'drop';
        g.t = 0;
      }
    } else if (g.state === 'drop') {
      g.t += dt;
      if (g.t >= 1.8 && this.carry) {
        this.carry.where = 'rack';
        this.carry.rack = this.rackCount;
        this.rackCount++;
        this.stored++;
        this.carry = null;
        g.lift = 0;
        if (this.rackCount >= RACK_SLOTS) this.rackClearAt = this.time + 4;
        g.state = 'go3';
        g.leg = 0;
      }
    } else if (g.state === 'go3') {
      if (this.drive(this.route3, dt)) {
        g.state = 'parked';
        g.yaw = 0;
      }
    }
  }

  private palletsStep(): void {
    const a = this.agv;
    for (const p of this.pallets) {
      if (p.where === 'station') {
        p.x = L.pallet.x;
        p.z = L.pallet.z;
        p.y = a.state === 'lift' && this.carry === null && p === this.pallets.find((q) => q.where === 'station' && q.count >= CAP) ? 0.5 * a.lift : 0;
      } else if (p.where === 'agv') {
        p.x = a.x;
        p.z = a.z;
        p.y = 0.55;
      } else if (p.where === 'rack') {
        const s = this.rackSlot(p.rack);
        p.x = s.x;
        p.y = s.y;
        p.z = s.z;
      }
    }
    // while being lifted at the station the full pallet follows the AGV
    if (a.state === 'lift') {
      const full = this.pallets.find((p) => p.where === 'station' && p.count >= CAP);
      if (full) {
        full.x = a.x;
        full.z = a.z;
        full.y = 0.55 * a.lift;
      }
    }
    // dropping at the rack: the pallet glides from the AGV into its slot
    if (a.state === 'drop' && this.carry) {
      const s = this.rackSlot(this.rackCount);
      const u = ease(Math.min(1, a.t / 1.8));
      this.carry.x = lerp(a.x, s.x, u);
      this.carry.y = lerp(0.55, s.y, u);
      this.carry.z = lerp(a.z, s.z, u);
    }
  }

  private itemsFollow(): void {
    const r = L.robot;
    void r;
    for (const it of this.items) {
      if (it.state === 'held') {
        it.x = this.tip.x;
        it.z = this.tip.z;
        it.y = this.tip.y - L.robot.grip - it.h; // the box hangs under the fingertips (y = bottom of the box)
      } else if (it.state === 'placed') {
        const p = this.pallets.find((q) => q.id === it.pallet);
        if (!p) continue;
        const s = this.slotPos(it.slot, p.x, p.z);
        it.x = s.x;
        it.z = s.z;
        it.y = p.y + 0.3;
      }
    }
  }
}

/** Two-link arm (+ base turn): angles that put the wrist at `tip`. Elbow up. `ok` is false when the point is out of reach. */
export function solveIK(tip: { x: number; y: number; z: number }): { yaw: number; a1: number; el: number; ok: boolean } {
  const r = L.robot;
  const dx = tip.x - r.x;
  const dz = tip.z - r.z;
  const reach = Math.hypot(dx, dz);
  const h = tip.y - r.shoulderY;
  let d = Math.hypot(reach, h);
  const max = r.l1 + r.l2 - 0.01;
  const ok = d <= max;
  d = Math.min(d, max);
  const c = Math.max(-1, Math.min(1, (d * d - r.l1 * r.l1 - r.l2 * r.l2) / (2 * r.l1 * r.l2)));
  const el = -Math.acos(c); // elbow bends down relative to link 1 (elbow up)
  const a1 = Math.atan2(h, reach) - Math.atan2(r.l2 * Math.sin(el), r.l1 + r.l2 * Math.cos(el));
  return { yaw: Math.atan2(dx, dz), a1, el, ok };
}
