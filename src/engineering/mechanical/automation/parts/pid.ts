import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building, pipe, V } from '../../../core/prims';
import { every } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { sevenSeg } from './sevenseg';
import { bx, cx, cy } from './helpers';

/** A water tank with a PID controller (pure maths; the 3D part below just draws it). */
export class TankSim {
  level = 0.3; // 0..1
  setpoint = 0.5;
  demand = 0.7; // opening of the outlet valve (the disturbance), 0..1
  u = 0; // controller output = inlet valve opening, 0..1
  p = 0;
  i = 0;
  d = 0;
  private integral = 0;
  private prevErr = 0;
  time = 0;
  Kp = 2.6;
  Ki = 0.35;
  Kd = 0.9;
  step(dt: number): void {
    this.time += dt;
    const c = this.time % 60;
    this.setpoint = c < 30 ? 0.65 : 0.4; // the operator changes the target
    this.demand = c % 30 < 15 ? 0.7 : 1.0; // somebody opens the outlet wider (a disturbance)
    const err = this.setpoint - this.level;
    const deriv = (err - this.prevErr) / Math.max(dt, 1e-4);
    this.prevErr = err;
    this.p = this.Kp * err;
    const raw = this.p + this.Ki * this.integral + this.Kd * deriv * 0.2;
    if ((raw < 1 || err < 0) && (raw > 0 || err > 0)) this.integral += err * dt; // anti-windup
    this.integral = Math.max(-1.5, Math.min(1.5, this.integral));
    this.i = this.Ki * this.integral;
    this.d = this.Kd * deriv * 0.2;
    this.u = Math.max(0, Math.min(1, this.p + this.i + this.d));
    const qin = 0.34 * this.u;
    const qout = 0.2 * this.demand * Math.sqrt(Math.max(this.level, 0));
    this.level = Math.max(0, Math.min(1, this.level + (qin - qout) * dt));
  }
}

/** Process control lab: closed-loop level control. The chart shows the real response (overshoot, disturbance, recovery). */
export function buildPid({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'pid';
  const P = L.pidLab;
  building(g, m, { x: P.x, z: P.z, w: P.w, d: P.d, h: P.h, open: 'S', door: 'N' });
  const sim = new TankSim();
  const zc = P.z + 1;
  const tx = P.x - 15;
  const H = 7;
  const R = 3;
  bx(g, 54, 0.4, 20, t.cabinet, P.x, 0, P.z + 3);
  // tank
  cy(g, R + 0.2, 0.5, t.frame, tx, 0.65, zc, 32);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 32, 1, true), t.glass);
  glass.position.set(tx, 0.9 + H / 2, zc);
  g.add(glass);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.05, R - 0.05, 1, 28), t.water);
  g.add(water);
  const spRing = new THREE.Mesh(new THREE.TorusGeometry(R + 0.06, 0.07, 6, 40), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  anim.disposables.push(spRing.geometry, spRing.material as THREE.Material);
  spRing.rotation.x = Math.PI / 2;
  spRing.position.set(tx, 0, zc);
  g.add(spRing);
  cy(g, R + 0.05, 0.3, t.steelDark, tx, 0.9 + H, zc, 32);
  // level transmitter on top (ultrasonic) and its label
  cy(g, 0.35, 0.8, t.cabinetDark, tx, 0.9 + H + 0.3, zc, 14);
  const lt = makeSign('LEVEL SENSOR', 4, 0.6);
  lt.position.set(tx, 0.9 + H + 1.7, zc + 0.3);
  g.add(lt);
  const sp = makeSign('SETPOINT (target level)', 6, 0.6);
  sp.position.set(tx - R - 3.4, 0.9, zc + R + 0.3);
  const spLabel = sp;
  g.add(spLabel);
  // inlet: pump + control valve (its opening is the controller output); outlet: manual valve (the disturbance)
  const inY = 0.9 + H + 0.9;
  const inPipe = [V(tx - 12, 1.2, zc + 1), V(tx - 12, inY, zc + 1), V(tx - 1, inY, zc + 1), V(tx - 1, inY - 0.5, zc + 1)];
  pipe(g, inPipe, 0.28, m.pipe.filtered);
  cx(g, 0.8, 1.6, t.robotOrange, tx - 11, 0.9, zc + 1, 20);
  const pump = makeSign('PUMP', 2, 0.5);
  pump.position.set(tx - 11, 2.2, zc + 1.2);
  g.add(pump);
  const valveStem = bx(g, 0.2, 1.0, 0.2, t.steel, tx - 6, inY + 0.3, zc + 1);
  const valveWheel = bx(g, 1.0, 0.12, 0.12, t.agvStripe, tx - 6, inY + 1.3, zc + 1);
  bx(g, 1.0, 0.8, 0.8, t.robotOrange, tx - 6, inY - 0.4, zc + 1);
  const cvl = makeSign('CONTROL VALVE', 4, 0.5);
  cvl.position.set(tx - 6, inY + 2.1, zc + 1.3);
  g.add(cvl);
  const outPipe = [V(tx + R, 1.6, zc), V(tx + R + 3.5, 1.6, zc), V(tx + R + 3.5, 0.5, zc)];
  pipe(g, outPipe, 0.28, m.pipe.sludge);
  const outWheel = bx(g, 1.0, 0.12, 0.12, t.red as unknown as THREE.Material, tx + R + 1.6, 2.5, zc);
  bx(g, 0.2, 0.8, 0.2, t.steel, tx + R + 1.6, 1.7, zc);
  const outl = makeSign('OUTLET VALVE (the disturbance)', 6.4, 0.5);
  outl.position.set(tx + R + 2.2, 3.5, zc + 0.3);
  g.add(outl);

  // controller box with P, I, D, output bars
  const cx0 = P.x + 2;
  bx(g, 11, 6.5, 0.4, t.screenBg, cx0 - 2, 2.2, P.z - P.d / 2 + 1.0);
  const title = makeSign('PID CONTROLLER', 9, 0.8);
  title.position.set(cx0 - 2, 8.3, P.z - P.d / 2 + 1.25);
  g.add(title);
  const barDefs: { label: string; color: number }[] = [
    { label: 'P (now)', color: 0x38e07a }, { label: 'I (past)', color: 0x4cc9f0 }, { label: 'D (future)', color: 0xffb703 }, { label: 'OUTPUT', color: 0xff6a2b },
  ];
  const bars = barDefs.map((b, k) => {
    const mat = new THREE.MeshBasicMaterial({ color: b.color });
    anim.disposables.push(mat);
    const y = 6.7 - k * 1.45;
    const lab = makeSign(b.label, 3, 0.5);
    lab.position.set(cx0 - 5.6, y + 0.1, P.z - P.d / 2 + 1.25);
    g.add(lab);
    const bar = bx(g, 1, 0.5, 0.12, mat, cx0 - 2, y - 0.25, P.z - P.d / 2 + 1.25);
    bx(g, 6.4, 0.04, 0.1, t.off as unknown as THREE.Material, cx0 - 0.8, y - 0.55, P.z - P.d / 2 + 1.22);
    return bar;
  });
  // chart: setpoint (red) and level (green)
  const chartX = P.x + 17;
  bx(g, 14, 8, 0.3, t.screenBg, chartX, 2.2, P.z - P.d / 2 + 1.0);
  const ct = makeSign('LEVEL vs TIME (last 30 s)', 12, 0.8);
  ct.position.set(chartX, 8.9, P.z - P.d / 2 + 1.25);
  g.add(ct);
  const N = 120;
  const mk = (color: number): { line: THREE.Line; pts: Float32Array } => {
    const pts = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color });
    anim.disposables.push(geo, mat);
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.name = 'fx';
    line.position.set(chartX - 6, 3.0, P.z - P.d / 2 + 1.2);
    g.add(line);
    return { line, pts };
  };
  const pvL = mk(0x38e07a);
  const spL = mk(0xff3b30);
  const hist = { pv: new Array<number>(N).fill(0.3), sp: new Array<number>(N).fill(0.5) };
  const legend = makeSign('green = water level, red = target', 11, 0.6);
  legend.position.set(chartX, 2.0, P.z - P.d / 2 + 1.25);
  g.add(legend);
  const segPv = sevenSeg(g, 3, chartX - 5.5, 0.7, P.z - P.d / 2 + 1.3, 0.55, 0x38e07a, anim.disposables);
  const segSp = sevenSeg(g, 3, chartX + 1.0, 0.7, P.z - P.d / 2 + 1.3, 0.55, 0xff3b30, anim.disposables);
  const l1 = makeSign('LEVEL %', 3, 0.5);
  l1.position.set(chartX - 3.2, 2.6 - 0.2, P.z - P.d / 2 + 1.3);
  g.add(l1);

  let acc = 0;
  let sample = 0;
  anim.add((_tm, dt) => {
    // fixed 1/60 s steps of the physics, so the response does not depend on the frame rate
    acc += dt;
    while (acc >= 1 / 60) {
      sim.step(1 / 60);
      acc -= 1 / 60;
      sample += 1 / 60;
    }
    const lvH = Math.max(0.05, sim.level * H);
    water.scale.y = lvH;
    water.position.set(tx, 0.9 + lvH / 2, zc);
    spRing.position.y = 0.9 + sim.setpoint * H;
    valveWheel.rotation.y = sim.u * Math.PI * 2;
    valveStem.position.y = inY + 0.3 + (1 - sim.u) * -0.2;
    outWheel.rotation.y = sim.demand * Math.PI;
    bars[0].scale.x = Math.max(0.02, Math.min(1, Math.abs(sim.p))) * 6.4;
    bars[0].position.x = cx0 - 4.0 + bars[0].scale.x / 2;
    bars[1].scale.x = Math.max(0.02, Math.min(1, Math.abs(sim.i))) * 6.4;
    bars[1].position.x = cx0 - 4.0 + bars[1].scale.x / 2;
    bars[2].scale.x = Math.max(0.02, Math.min(1, Math.abs(sim.d))) * 6.4;
    bars[2].position.x = cx0 - 4.0 + bars[2].scale.x / 2;
    bars[3].scale.x = Math.max(0.02, sim.u) * 6.4;
    bars[3].position.x = cx0 - 4.0 + bars[3].scale.x / 2;
    if (sample >= 0.25) {
      sample = 0;
      hist.pv.shift();
      hist.pv.push(sim.level);
      hist.sp.shift();
      hist.sp.push(sim.setpoint);
      for (let i = 0; i < N; i++) {
        pvL.pts[i * 3] = (i / (N - 1)) * 12;
        pvL.pts[i * 3 + 1] = hist.pv[i] * 5;
        spL.pts[i * 3] = (i / (N - 1)) * 12;
        spL.pts[i * 3 + 1] = hist.sp[i] * 5;
      }
      (pvL.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (spL.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    segPv.set(sim.level * 100);
    segSp.set(sim.setpoint * 100);
  });
  void every;
  return { id: 'pid', nameBn: 'Process Control Lab (PID Level Control)', group: g };
}
