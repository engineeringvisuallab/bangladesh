import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building, V } from '../../../core/prims';
import { every, flow } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { bx, cx, mesh } from './helpers';

/** Electronics & Telecom Lab: an RC circuit (capacitor charges and discharges: the exponential curve), a fibre-optic cable (light bounces along the core, data = light on/off), and a radio link (a wave travels from an antenna to a phone). */
export function buildTele({ mats: m, t, anim, lamp }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'tele';
  const C = L.tele;
  building(g, m, { x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, open: 'S', door: 'N' });
  const wz = C.z - C.d / 2 + 1.0;
  const zf = wz + 0.25;
  const sign = (text: string, w: number, x: number, y: number, z = zf + 0.05, h = 0.55): THREE.Mesh => {
    const s = makeSign(text, w, h);
    s.position.set(x, y, z);
    g.add(s);
    return s;
  };
  bx(g, C.w - 4, 10.5, 0.3, t.plate, C.x, 5.5, wz);
  const OFF = t.off;

  // ================= 1. RC circuit =================
  {
    const x0 = C.x - 33;
    sign('RC CIRCUIT: A CAPACITOR CHARGES AND DISCHARGES', 28, x0 + 7, 10.6, zf + 0.05, 0.8);
    // wires of a simple loop: battery (left), resistor (top), capacitor (right), LED + switch (bottom)
    const wires: THREE.Mesh[] = [];
    const wire = (w: number, h: number, x: number, y: number): THREE.Mesh => {
      const b = bx(g, w, h, 0.12, t.wireOff, x, y, zf);
      wires.push(b);
      return b;
    };
    wire(5, 0.18, x0 + 2.5, 8.2); // top-left wire
    wire(5, 0.18, x0 + 11.5, 8.2); // top-right
    wire(0.18, 6.0, x0, 5.2); // left
    wire(0.18, 2.2, x0 + 14, 7.0); // right (top part)
    wire(0.18, 2.2, x0 + 14, 3.4); // right (bottom part)
    wire(14, 0.18, x0 + 7, 2.2); // bottom
    // parts
    bx(g, 0.5, 1.8, 0.2, t.red, x0, 5.6, zf + 0.02); // battery
    bx(g, 0.5, 1.0, 0.2, t.blue, x0, 4.6, zf + 0.02);
    sign('BATTERY', 2.2, x0 - 1.5, 5.2, zf + 0.06, 0.4);
    bx(g, 3.4, 0.9, 0.2, t.copper, x0 + 7, 8.2, zf + 0.02); // resistor
    sign('RESISTOR R', 3.4, x0 + 7, 9.1, zf + 0.06, 0.4);
    const plateL = bx(g, 0.18, 2.2, 0.2, t.steel, x0 + 13.4, 5.2, zf + 0.02);
    const plateR = bx(g, 0.18, 2.2, 0.2, t.steel, x0 + 14.6, 5.2, zf + 0.02);
    void plateL; void plateR;
    sign('CAPACITOR C', 3.6, x0 + 16.4, 5.2, zf + 0.06, 0.4);
    const charge = bx(g, 1.0, 1, 0.14, lamp(0x4cc9f0), x0 + 14, 4.1, zf + 0.04); // charge level between the plates
    const ledMesh = mesh(g, new THREE.SphereGeometry(0.55, 14, 10), OFF, x0 + 10.5, 2.2, zf + 0.04);
    sign('LED', 1.6, x0 + 10.5, 1.1, zf + 0.06, 0.4);
    const sw = bx(g, 2.2, 0.16, 0.12, t.steel, x0 + 3.2, 2.5, zf + 0.04);
    sw.rotation.z = 0.45;
    sign('SWITCH', 2.2, x0 + 3.2, 1.2, zf + 0.06, 0.4);
    // curve of the voltage over one 10 s cycle (charge 5 s, discharge 5 s) and a moving dot
    const tau = 1.1;
    const cw = 14;
    const ch = 4.6;
    bx(g, cw + 1, ch + 1.4, 0.1, t.screenBg, x0 + 32 - 8, 6.2, zf - 0.02);
    sign('VOLTAGE ON THE CAPACITOR', 12, x0 + 24 - 0, 9.2, zf + 0.05, 0.5);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 100; i++) {
      const tt = (i / 100) * 10;
      const v = tt < 5 ? 1 - Math.exp(-tt / tau) : (1 - Math.exp(-5 / tau)) * Math.exp(-(tt - 5) / tau);
      pts.push(V(x0 + 17 + (i / 100) * cw - 0.0, 4.1 + v * ch, zf + 0.05));
    }
    const curve = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x38e07a }));
    anim.disposables.push(curve.geometry, curve.material as THREE.Material);
    curve.name = 'fx';
    g.add(curve);
    const dot = mesh(g, new THREE.SphereGeometry(0.28, 10, 8), lamp(0xffd23f), x0 + 17, 4.1, zf + 0.1);
    sign('TIME  ->', 3, x0 + 24, 3.2, zf + 0.05, 0.4);
    sign('charging (switch to battery)', 8, x0 + 20.5, 2.5, zf + 0.05, 0.4);
    sign('discharging through the LED', 8, x0 + 28.5, 2.5, zf + 0.05, 0.4);
    every(anim, (tm) => {
      const c = tm % 10;
      const charging = c < 5;
      const v = charging ? 1 - Math.exp(-c / tau) : (1 - Math.exp(-5 / tau)) * Math.exp(-(c - 5) / tau);
      charge.scale.y = Math.max(0.02, v * 2.0);
      charge.position.y = 4.1 + (v * 2.0) / 2 - 0.0;
      const cur = charging ? Math.exp(-c / tau) : v; // current is biggest at the start
      ledMesh.material = !charging && v > 0.08 ? lamp(0xffb703) : OFF;
      ledMesh.scale.setScalar(!charging ? 0.7 + v * 0.5 : 1);
      sw.rotation.z = charging ? 0.45 : -0.0;
      wires.forEach((w) => (w.material = cur > 0.05 ? lamp(0xffb703) : t.wireOff));
      dot.position.set(x0 + 17 + (c / 10) * cw, 4.1 + v * ch, zf + 0.1);
    });
  }

  // ================= 2. fibre optic =================
  {
    const x0 = C.x + 6;
    sign('FIBRE OPTIC: DATA AS PULSES OF LIGHT', 22, x0 + 8, 10.6, zf + 0.05, 0.8);
    // cladding (glass, outer) and core (inner)
    const clad = mesh(g, new THREE.CylinderGeometry(1.4, 1.4, 16, 20, 1, true), t.glass, x0 + 8, 6.2, zf + 0.3);
    clad.rotation.z = Math.PI / 2;
    const core = mesh(g, new THREE.CylinderGeometry(0.75, 0.75, 16, 18), t.cyan, x0 + 8, 6.2, zf + 0.3);
    core.rotation.z = Math.PI / 2;
    (core.material as THREE.Material) = new THREE.MeshBasicMaterial({ color: 0x2a6f8f, transparent: true, opacity: 0.55 });
    anim.disposables.push(core.material as THREE.Material);
    sign('CORE (light travels here)', 6, x0 + 3, 8.0, zf + 0.1, 0.4);
    sign('CLADDING (keeps the light inside)', 8, x0 + 13, 4.4, zf + 0.1, 0.4);
    // a light ray zig-zagging along the core (total internal reflection)
    const ray: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) ray.push(V(x0 + i * 1.0, 6.2 + (i % 2 === 0 ? -0.7 : 0.7), zf + 0.35));
    const rl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ray), new THREE.LineBasicMaterial({ color: 0xffd23f }));
    rl.name = 'fx';
    anim.disposables.push(rl.geometry, rl.material as THREE.Material);
    g.add(rl);
    flow(anim, g, ray, { color: 0xffffff, speed: 8, spacing: 3.2, size: 0.16 });
    // a byte stream: 1 = light on, 0 = light off (shifts along)
    sign('BITS SENT AS LIGHT:  on = 1,  off = 0', 14, x0 + 8, 3.2, zf + 0.05, 0.5);
    const bits = Array.from({ length: 16 }, (_, i) => bx(g, 0.8, 0.8, 0.1, OFF, x0 + 1 + i * 1.0, 1.8, zf + 0.05));
    const msg = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0];
    let lastShift = -1;
    every(anim, (tm) => {
      const s = Math.floor(tm * 2.5);
      if (s === lastShift) return;
      lastShift = s;
      bits.forEach((b, i) => (b.material = msg[(s + i) % msg.length] ? lamp(0xffd23f) : OFF));
    });
  }

  // ================= 3. radio link =================
  {
    const x0 = C.x + 32;
    sign('RADIO: A WAVE CARRIES INFORMATION', 16, x0 + 3, 10.6, zf + 0.05, 0.8);
    // transmitter antenna (left)
    bx(g, 0.2, 6, 0.2, t.steel, x0 - 1.0, 1.0, zf + 0.1);
    for (const dy of [4.5, 5.6]) bx(g, 2.2, 0.1, 0.1, t.steel, x0 - 1.0, 1.0 + dy, zf + 0.1);
    sign('TRANSMITTER', 3.6, x0 - 1.0, 8.6, zf + 0.06, 0.4);
    // receiver (a phone)
    bx(g, 1.4, 2.4, 0.2, t.cabinetDark, x0 + 13, 2.8, zf + 0.1);
    const phoneScr = bx(g, 1.1, 1.8, 0.05, OFF, x0 + 13, 3.05, zf + 0.22);
    sign('PHONE', 2, x0 + 13, 5.6, zf + 0.06, 0.4);
    // expanding rings from the antenna tip + a travelling sine wave towards the phone
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const rmat = new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
      anim.disposables.push(rmat);
      const r = mesh(g, new THREE.RingGeometry(0.9, 1.0, 36), rmat, x0 - 1.0, 6.5, zf + 0.05);
      r.name = 'fx';
      anim.disposables.push(r.geometry);
      rings.push(r);
    }
    const N = 80;
    const wpts = new Float32Array(N * 3);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wpts, 3));
    const wl = new THREE.Line(wg, new THREE.LineBasicMaterial({ color: 0xffd23f }));
    wl.frustumCulled = false;
    wl.name = 'fx';
    anim.disposables.push(wg, wl.material as THREE.Material);
    g.add(wl);
    sign('wavelength', 3, x0 + 6, 8.2, zf + 0.06, 0.4);
    bx(g, 5.0, 0.06, 0.06, t.steel, x0 + 5.5, 7.6, zf + 0.08);
    every(anim, (tm) => {
      rings.forEach((r, i) => {
        const ph = (tm * 0.45 + i / 4) % 1;
        r.scale.setScalar(0.5 + ph * 7);
        (r.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - ph);
      });
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 13;
        wpts[i * 3] = x0 + 0.2 + x;
        wpts[i * 3 + 1] = 5.4 + Math.sin(x * 1.25 - tm * 6) * 0.8 * Math.min(1, x / 2);
        wpts[i * 3 + 2] = zf + 0.1;
      }
      (wg.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      phoneScr.material = Math.sin(tm * 3) > -0.3 ? lamp(0x4cc9f0) : lamp(0x7fe3ff);
    });
  }
  void cx;
  return { id: 'tele', nameBn: 'Electronics & Telecom Lab', group: g };
}
