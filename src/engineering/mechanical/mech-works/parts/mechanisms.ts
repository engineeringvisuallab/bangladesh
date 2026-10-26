import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building, V } from '../../../core/prims';
import { every, flow } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { bar, bx, cy, cz, gearGeometry, mesh, span } from './helpers';

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Mechanisms hall: gear train, belt drive, cam and follower (with a live displacement graph), four-bar linkage (with its coupler curve), centrifugal governor. */
export function buildMechanisms({ mats: m, t, anim }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'mech';
  const M = L.mech;
  building(g, m, { x: M.x, z: M.z, w: M.w, d: M.d, h: M.h, open: 'S', door: 'N' });
  const zc = M.z + 3; // exhibits stand here
  const exhibit = (i: number, title: string): THREE.Group => {
    const x = M.x + (i - 2) * 12;
    bx(g, 11, 7.4, 0.2, t.plate, x, 4.4, M.z - 4); // backdrop
    bx(g, 11.4, 0.7, 5, t.paintGrey, x, 0.35, zc - 0.5); // plinth
    const s = makeSign(title, 9, 1.3);
    s.position.set(x, 9.0, M.z - 3.8);
    g.add(s);
    const grp = new THREE.Group();
    grp.position.set(x, 0.7, zc);
    g.add(grp);
    return grp;
  };

  // ---- 1. gear train: 12 -> 30 -> 18 teeth, same module; the speed of each gear is exactly inverse to its teeth
  {
    const e = exhibit(0, 'Gear Train (12 → 30 → 18 teeth)');
    const mod = 0.16;
    const N = [12, 30, 18];
    const mats = [t.gearA, t.gearB, t.gearC];
    const rp = N.map((n) => (mod * n) / 2);
    const x0 = -4.7;
    const xs = [x0, x0 + rp[0] + rp[1], x0 + rp[0] + 2 * rp[1] + rp[2]];
    const y = 3.5;
    const gears = N.map((n, i) => {
      const gr = new THREE.Mesh(gearGeometry(n, mod, 0.5), mats[i]);
      gr.position.set(xs[i], y, 0);
      e.add(gr);
      anim.disposables.push(gr.geometry);
      bx(gr, 0.12, 0.3, 0.7, t.mark, 0, rp[i] - 0.18, 0);
      cz(e, 0.14, 1.4, t.steel, xs[i], y, 0, 12);
      return gr;
    });
    const thB0 = Math.PI + Math.PI / N[1];
    every(anim, (tm) => {
      const a = 1.0 * tm;
      gears[0].rotation.z = a;
      const b = thB0 - (N[0] / N[1]) * a;
      gears[1].rotation.z = b;
      gears[2].rotation.z = Math.PI - (N[1] / N[2]) * (b - thB0);
    });
  }

  // ---- 2. belt drive: big pulley drives a small one (open belt), small turns faster
  {
    const e = exhibit(1, 'Belt Drive (pulleys 2:1)');
    const rl = 1.5;
    const rr = 0.75;
    const d = 5.4;
    const xl = -2.6;
    const y = 3.4;
    const pl = new THREE.Group();
    pl.position.set(xl, y, 0);
    const pr = new THREE.Group();
    pr.position.set(xl + d, y, 0);
    e.add(pl, pr);
    cz(pl, rl, 0.7, t.cast, 0, 0, 0, 32);
    cz(pr, rr, 0.7, t.cast, 0, 0, 0, 24);
    bx(pl, 0.2, 0.4, 0.8, t.markY, 0, rl - 0.3, 0);
    bx(pr, 0.2, 0.3, 0.8, t.markY, 0, rr - 0.2, 0);
    for (const p of [pl, pr]) cz(p, 0.15, 1.6, t.steel, 0, 0, 0, 10);
    // belt path = convex hull of the two circles
    const beta = Math.asin((rl - rr) / d);
    const path: THREE.Vector3[] = [];
    const arc = (cx: number, r: number, from: number, to: number): void => {
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = from + ((to - from) * i) / n;
        path.push(V(cx + Math.cos(a) * r, y + Math.sin(a) * r, 0));
      }
    };
    arc(xl + d, rr, Math.PI / 2 - beta, -(Math.PI / 2 - beta));
    arc(xl, rl, -(Math.PI / 2 - beta), -(3 * Math.PI) / 2 - beta);
    const curve = new THREE.CatmullRomCurve3(path, true, 'catmullrom', 0.05);
    const belt = mesh(e, new THREE.TubeGeometry(curve, 120, 0.07, 6, true), t.belt);
    anim.disposables.push(belt.geometry);
    flow(anim, e, [...path, path[0]], { color: 0xffd23f, speed: 2.0, spacing: 0.7, size: 0.09 }).position.z = 0.1;
    every(anim, (tm) => {
      pl.rotation.z = -(2.0 / rl) * tm;
      pr.rotation.z = -(2.0 / rr) * tm;
    });
    // belt direction: the dots run along `path` (clockwise): matches the pulley rotation sign above (clockwise seen from the front)
  }

  // ---- 3. cam and follower + live displacement graph
  {
    const e = exhibit(2, 'Cam & Follower');
    const r0 = 0.95;
    const hc = 0.85;
    const w = 1.1;
    const lobe = (a: number): number => {
      const x = wrap(a);
      return Math.abs(x) < w ? Math.cos((Math.PI * x) / (2 * w)) ** 2 : 0;
    };
    const shape = new THREE.Shape();
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      const r = r0 + hc * lobe(a);
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false });
    geo.translate(0, 0, -0.3);
    anim.disposables.push(geo);
    const cam = new THREE.Mesh(geo, t.gearA);
    const cy0 = 2.6;
    cam.position.set(-2.2, cy0, 0);
    e.add(cam);
    cz(e, 0.14, 1.4, t.steel, -2.2, cy0, 0, 10);
    bx(cam, 0.2, 0.2, 0.7, t.mark, r0 - 0.1, 0, 0);
    // follower with roller, guide, and a load block on top
    const fol = new THREE.Group();
    fol.position.set(-2.2, 0, 0);
    e.add(fol);
    cz(fol, 0.22, 0.6, t.steel, 0, 0, 0, 14); // roller (centre at follower origin)
    cy(fol, 0.12, 3.2, t.steel, 0, 1.6, 0, 10);
    bx(fol, 1.6, 0.8, 0.9, t.paintBlue, 0, 3.4, 0);
    bx(e, 0.5, 4.6, 0.4, t.steelDark, -2.2 - 0.55, 2.3 + 0.3, 0);
    bx(e, 1.3, 0.35, 0.5, t.steelDark, -2.2 - 0.2, 4.2, 0);
    // graph: lift against time, drawn live
    const N = 80;
    const pts = new Float32Array(N * 3);
    const gl = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x38e07a }));
    gl.geometry.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    anim.disposables.push(gl.geometry, gl.material as THREE.Material);
    gl.position.set(0.6, 1.2, 0.35);
    gl.name = 'fx';
    gl.frustumCulled = false;
    e.add(gl);
    bx(e, 5.4, 3.0, 0.1, t.plate, 3.3, 2.3, 0.28);
    const hist: number[] = new Array(N).fill(0);
    let acc = 0;
    every(anim, (tm) => {
      const c = 1.6 * tm;
      cam.rotation.z = Math.PI / 2 + c;
      const lift = hc * lobe(-c);
      fol.position.y = cy0 + r0 + lift - 0.2 + 0.2;
      acc += 1;
      if (acc % 3 === 0) {
        hist.shift();
        hist.push(lift);
        for (let i = 0; i < N; i++) {
          pts[i * 3] = (i / (N - 1)) * 5;
          pts[i * 3 + 1] = (hist[i] / hc) * 2.2 + 0.2;
          pts[i * 3 + 2] = 0;
        }
        (gl.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      }
    });
  }

  // ---- 4. four-bar linkage (crank-rocker) with its coupler curve
  {
    const e = exhibit(3, 'Four-Bar Linkage');
    const A = { x: -2.2, y: 2.0 };
    const D = { x: 0.6, y: 2.0 };
    const a = 1.0;
    const b2 = 2.6;
    const c2 = 2.2;
    const solve = (th: number): { B: [number, number]; C: [number, number]; P: [number, number] } => {
      const Bx = A.x + a * Math.cos(th);
      const By = A.y + a * Math.sin(th);
      const dx = D.x - Bx;
      const dy = D.y - By;
      const dd = Math.hypot(dx, dy);
      const xx = (dd * dd + b2 * b2 - c2 * c2) / (2 * dd);
      const hh = Math.sqrt(Math.max(0, b2 * b2 - xx * xx));
      const ux = dx / dd;
      const uy = dy / dd;
      const Cx = Bx + xx * ux - hh * uy;
      const Cy = By + xx * uy + hh * ux;
      // coupler point P: middle of the coupler, pushed sideways
      const mx = (Bx + Cx) / 2;
      const my = (By + Cy) / 2;
      const nx = -(Cy - By) / b2;
      const ny = (Cx - Bx) / b2;
      return { B: [Bx, By], C: [Cx, Cy], P: [mx + nx * 1.1, my + ny * 1.1] };
    };
    const curvePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 120; i++) {
      const s = solve((i / 120) * Math.PI * 2);
      curvePts.push(V(s.P[0], s.P[1], 0.35));
    }
    const curve = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curvePts), new THREE.LineBasicMaterial({ color: 0xffd23f }));
    anim.disposables.push(curve.geometry, curve.material as THREE.Material);
    e.add(curve);
    const crank = bar(e, 0.22, 0.3, t.gearA, 0.0);
    const coupler = bar(e, 0.22, 0.3, t.gearB, 0.0);
    const rocker = bar(e, 0.22, 0.3, t.gearC, 0.0);
    const tip = bx(e, 0.3, 0.3, 0.3, t.mark, 0, 0, 0.3);
    bx(e, 0.5, 0.5, 0.5, t.steelDark, A.x, A.y - 0.5, 0);
    bx(e, 0.5, 0.5, 0.5, t.steelDark, D.x, D.y - 0.5, 0);
    bx(e, 3.6, 0.3, 0.6, t.steelDark, (A.x + D.x) / 2, A.y - 0.9, 0); // ground link
    // a wiper-like pointer extending the rocker, to show the oscillation
    const wiper = bar(e, 0.1, 0.2, t.steel, 0.0);
    every(anim, (tm) => {
      const th = 1.2 * tm;
      const s = solve(th);
      span(crank, A.x, A.y, s.B[0], s.B[1]);
      span(coupler, s.B[0], s.B[1], s.C[0], s.C[1]);
      span(rocker, D.x, D.y, s.C[0], s.C[1]);
      const rx = s.C[0] - D.x;
      const ry = s.C[1] - D.y;
      span(wiper, D.x, D.y, D.x + rx * 1.9, D.y + ry * 1.9);
      tip.position.set(s.P[0], s.P[1], 0.3);
    });
  }

  // ---- 5. centrifugal governor: balls fly out when speed rises, the sleeve lifts (closes the throttle)
  {
    const e = exhibit(4, 'Centrifugal Governor');
    const top = 5.4;
    cy(e, 0.14, 4.6, t.steel, 0, 3.1, 0, 10);
    bx(e, 1.4, 0.4, 0.8, t.steelDark, 0, top + 0.2, 0);
    const spin = new THREE.Group();
    spin.position.set(0, top, 0);
    e.add(spin);
    const Lr = 1.9;
    const up: THREE.Mesh[] = [bar(spin, 0.12, 0.2, t.steel), bar(spin, 0.12, 0.2, t.steel)];
    const low: THREE.Mesh[] = [bar(spin, 0.1, 0.2, t.steel), bar(spin, 0.1, 0.2, t.steel)];
    const balls = [mesh(spin, new THREE.SphereGeometry(0.42, 16, 12), t.gearA), mesh(spin, new THREE.SphereGeometry(0.42, 16, 12), t.gearA)];
    const sleeve = cy(e, 0.28, 0.5, t.brass, 0, 0, 0, 14);
    const lever = bar(e, 0.1, 0.2, t.steelDark);
    // speed varies slowly, as when the load on an engine changes
    every(anim, (tm) => {
      const w = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(tm * 0.45));
      spin.rotation.y += 0; // set below
      spin.rotation.y = tm * (2 + 6 * w);
      const alpha = 0.3 + 0.95 * w * w;
      const sy = -2 * Lr * Math.cos(alpha);
      [-1, 1].forEach((s, i) => {
        const bxp = s * Lr * Math.sin(alpha);
        const byp = -Lr * Math.cos(alpha);
        span(up[i], 0, 0, bxp, byp);
        span(low[i], bxp, byp, 0, sy);
        balls[i].position.set(bxp, byp, 0);
      });
      sleeve.position.set(0, top + sy - 0.1, 0);
      span(lever, 0.6, top + sy - 0.1, 3.2, top + sy - 0.1 - (alpha - 0.3) * 0.6);
    });
  }
  return { id: 'mech', nameBn: 'Mechanisms Hall (Gears, Belt, Cam, Linkage, Governor)', group: g };
}
