import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building, V } from '../../../core/prims';
import { flow } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { Perceptron } from '../perceptron';
import { sevenSeg } from './sevenseg';
import { bx, mesh } from './helpers';

const SEEDS = [5, 6, 3, 4, 1];

/**
 * AI Lab: a single artificial neuron really LEARNS to separate two groups of points (watch the line move and the accuracy climb),
 * plus a small neural network whose signals flow forward.
 */
export function buildAi({ mats: m, t, anim, lamp }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'ai';
  const C = L.ai;
  building(g, m, { x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, open: 'N', door: 'S' });
  const board = new THREE.Group();
  board.position.set(C.x, 0, C.z + C.d / 2 - 1.2);
  board.rotation.y = Math.PI; // faces the open (north) side; x to the viewer's right
  g.add(board);
  const sign = (text: string, w: number, x: number, y: number, z = 0.4, h = 0.55): THREE.Mesh => {
    const s = makeSign(text, w, h);
    s.position.set(x, y, z);
    board.add(s);
    return s;
  };
  bx(board, C.w - 3, 10.8, 0.3, t.plate, 0, 5.5, 0);
  sign('MACHINE LEARNING: A NEURON LEARNS FROM EXAMPLES', 40, 0, 10.9, 0.3, 0.9);

  // ================= left: the learning plot =================
  const px = -15; // centre of the plot
  const py = 5.0;
  const S = 6.2; // half size of the plot
  bx(board, S * 2 + 0.6, S * 2 + 0.6, 0.12, t.screenBg, px, py - S - 0.3 + S, 0.25);
  bx(board, S * 2, 0.06, 0.1, t.steel, px, py, 0.32);
  bx(board, 0.06, S * 2, 0.1, t.steel, px, py, 0.32);
  const net = new Perceptron(SEEDS[0]);
  const dots: THREE.Mesh[] = [];
  const dotGeo = new THREE.SphereGeometry(0.28, 12, 8);
  anim.disposables.push(dotGeo);
  for (let i = 0; i < net.pts.length; i++) {
    const d = new THREE.Mesh(dotGeo, lamp(0x4c8dff));
    d.position.z = 0.45;
    board.add(d);
    dots.push(d);
  }
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  anim.disposables.push(lineMat);
  const dline = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 0.1), lineMat);
  dline.position.z = 0.4;
  board.add(dline);
  anim.disposables.push(dline.geometry);
  const look = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 20), lamp(0xffd23f));
  look.position.z = 0.5;
  board.add(look);
  anim.disposables.push(look.geometry);
  sign('THE NEURON DRAWS A LINE BETWEEN BLUE AND ORANGE DOTS', 14, px, py + S + 0.9, 0.3, 0.5);
  sign('yellow ring = the dot being checked.  Wrong? The line is pushed.', 14, px, py - S - 0.85, 0.3, 0.45);
  const accBar = bx(board, 1, 0.5, 0.12, lamp(0x38e07a), px - 5, py - S - 1.8, 0.3);
  bx(board, 10.4, 0.1, 0.1, t.off, px, py - S - 2.2, 0.28);
  sign('ACCURACY', 3, px - 7.2, py - S - 1.8, 0.3, 0.4);
  const accSeg = sevenSeg(board, 3, px + 6.3, py - S - 2.4, 0.3, 0.4, 0x38e07a, anim.disposables);
  const toXY = (x: number, y: number): [number, number] => [px + x * S, py + y * S];

  // ================= right: a small neural network =================
  const layers = [3, 4, 4, 2];
  const nx0 = 12;
  const nodeP: THREE.Vector3[][] = layers.map((n, li) => Array.from({ length: n }, (_, i) => V(nx0 + li * 7, 5.2 + (i - (n - 1) / 2) * 2.2, 0.5)));
  const nodes: THREE.Mesh[][] = nodeP.map((col) =>
    col.map((p) => {
      const nm = mesh(board, new THREE.SphereGeometry(0.62, 16, 12), lamp(0x2a5d8f), p.x, p.y, p.z);
      anim.disposables.push(nm.geometry);
      return nm;
    }),
  );
  for (let li = 0; li < layers.length - 1; li++) {
    for (const a of nodeP[li]) for (const b of nodeP[li + 1]) {
      const len = a.distanceTo(b);
      const e = bx(board, 0.04, len, 0.04, t.wireOff, (a.x + b.x) / 2, (a.y + b.y) / 2, 0.4);
      e.rotation.z = Math.atan2(-(b.x - a.x), b.y - a.y);
    }
  }
  const inLab = ['pixels', 'sound', 'numbers'];
  inLab.forEach((s, i) => sign(s, 3, nx0 - 3.3, nodeP[0][i].y, 0.4, 0.4));
  ['cat', 'dog'].forEach((s, i) => sign(s, 2.4, nx0 + 21 + 2.4, nodeP[3][i].y, 0.4, 0.45));
  sign('INPUT', 3, nx0, 9.4, 0.3, 0.45);
  sign('HIDDEN LAYERS (they find patterns)', 11, nx0 + 10.5, 9.4, 0.3, 0.45);
  sign('OUTPUT', 3, nx0 + 21, 9.4, 0.3, 0.45);
  sign('SIGNALS FLOW FORWARD; TRAINING TUNES THE CONNECTIONS', 22, nx0 + 10.5, 0.8, 0.3, 0.5);
  // signals (dots) running from layer to layer, three waves
  for (let li = 0; li < layers.length - 1; li++) {
    for (let i = 0; i < nodeP[li].length; i++) {
      const b = nodeP[li + 1][(i * 2) % nodeP[li + 1].length];
      flow(anim, board, [nodeP[li][i], b], { color: 0xffd23f, speed: 3.2, spacing: 3.5, size: 0.12 });
    }
  }

  // ================= run =================
  let round = 0;
  let acc = 0;
  let hold = 0;
  const redraw = (cur: number): void => {
    net.pts.forEach((p, i) => {
      const [x, y] = toXY(p.x, p.y);
      dots[i].position.set(x, y, 0.45);
      dots[i].material = lamp(p.label === 1 ? 0xff9f1c : 0x4c8dff);
    });
    // decision line  w0 x + w1 y + b = 0  drawn across the plot
    const w0 = net.w[0];
    const w1 = net.w[1];
    const b = net.b;
    let ax = -1;
    let ay: number;
    let bxp = 1;
    let by: number;
    if (Math.abs(w1) > 1e-3) {
      ay = -(w0 * ax + b) / w1;
      by = -(w0 * bxp + b) / w1;
    } else {
      ax = bxp = -b / (w0 || 1e-3);
      ay = -1;
      by = 1;
    }
    const [x1, y1] = toXY(ax, Math.max(-1.3, Math.min(1.3, ay)));
    const [x2, y2] = toXY(bxp, Math.max(-1.3, Math.min(1.3, by)));
    dline.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.4);
    dline.scale.x = Math.hypot(x2 - x1, y2 - y1);
    dline.rotation.z = Math.atan2(y2 - y1, x2 - x1);
    const [lx, ly] = toXY(net.pts[cur].x, net.pts[cur].y);
    look.position.set(lx, ly, 0.5);
    const a = net.accuracy;
    accBar.scale.x = Math.max(0.02, a) * 10;
    accBar.position.x = px - 5.2 + accBar.scale.x / 2;
    accSeg.set(a * 100);
  };
  redraw(0);
  let cur = 0;
  void cur;
  anim.add((tm, dt) => {
    // neurons glow in waves while the network "thinks"
    nodes.forEach((col, li) => col.forEach((n, i) => (n.material = Math.sin(tm * 3 - li * 1.2 + i) > 0.1 ? lamp(0xffd23f) : lamp(0x2a5d8f))));
    if (net.errors === 0) {
      hold += dt;
      if (hold > 5) {
        hold = 0;
        round++;
        net.reset(SEEDS[round % SEEDS.length] + Math.floor(round / SEEDS.length) * 17);
        cur = 0;
        redraw(0);
      }
      return;
    }
    acc += dt;
    while (acc >= 0.45) {
      acc -= 0.45;
      const r = net.step();
      cur = net.pts.indexOf(r.p);
      redraw(cur);
    }
  });
  return { id: 'ai', nameBn: 'AI Lab (A Neuron That Learns)', group: g };
}
