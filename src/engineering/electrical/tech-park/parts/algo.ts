import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building } from '../../../core/prims';

import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { SORTS, searchSteps, shuffled } from '../sorting';
import { sevenSeg } from './sevenseg';
import { bx } from './helpers';

const N = 24;
const SORT_RATE = 26; // steps per second

/** Algorithms Hall: four sorting algorithms racing through the same kind of shuffled list (bars), and linear search vs binary search. */
export function buildAlgo({ mats: m, t, anim, lamp }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'algo';
  const C = L.algo;
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

  // ================= sorting board =================
  const sx0 = C.x - 50;
  const bw = 1.55;
  bx(g, N * bw + 2, 8.6, 0.12, t.panel, sx0 + (N * bw) / 2, 5.4, zf - 0.03);
  const titles = SORTS.map((s) => {
    const sg = sign(`${s.name}    ${s.big}`, 18, sx0 + (N * bw) / 2, 10.3, zf + 0.05, 0.9);
    sg.visible = false;
    return sg;
  });
  const bars: THREE.Mesh[] = [];
  for (let i = 0; i < N; i++) {
    const b = bx(g, bw - 0.2, 1, 0.5, t.cyan, sx0 + i * bw + bw / 2, 1.2, zf + 0.1);
    bars.push(b);
  }
  const cmpSeg = sevenSeg(g, 3, sx0 + N * bw + 3.2, 6.8, zf + 0.04, 0.55, 0xffb703, anim.disposables);
  const swpSeg = sevenSeg(g, 3, sx0 + N * bw + 3.2, 3.6, zf + 0.04, 0.55, 0xff6a2b, anim.disposables);
  sign('COMPARISONS', 5, sx0 + N * bw + 4.8, 8.6, zf + 0.05, 0.5);
  sign('SWAPS / WRITES', 5, sx0 + N * bw + 4.8, 5.4, zf + 0.05, 0.5);
  sign('yellow = comparing   red = swapping   green = sorted', 28, sx0 + (N * bw) / 2, 0.55, zf + 0.05, 0.5);

  // playback state
  let alg = -1;
  let arr: number[] = [];
  let ops: ReturnType<(typeof SORTS)[number]['run']> = [];
  let pos = 0;
  let cmps = 0;
  let swps = 0;
  let hold = 0;
  let accum = 0;
  let sweep = -1;
  const start = (i: number): void => {
    alg = i % SORTS.length;
    arr = shuffled(N, 11 + i * 7);
    ops = SORTS[alg].run(arr);
    pos = 0;
    cmps = 0;
    swps = 0;
    hold = 0;
    sweep = -1;
    titles.forEach((tt, k) => (tt.visible = k === alg));
  };
  let round = 0;
  start(round);
  const paint = (a: number, b: number, kind: 'cmp' | 'swap' | 'none'): void => {
    bars.forEach((bar, i) => {
      const v = arr[i];
      bar.scale.y = v * 0.32;
      bar.position.y = 1.2 + (v * 0.32) / 2;
      let mat: THREE.Material = t.cyan;
      if (i <= sweep) mat = t.green;
      else if ((i === a || i === b) && kind === 'cmp') mat = t.amber;
      else if ((i === a || i === b) && kind === 'swap') mat = t.red;
      bar.material = mat;
    });
    cmpSeg.set(cmps);
    swpSeg.set(swps);
  };
  paint(-1, -1, 'none');

  // ================= search board =================
  const qx0 = C.x + 12;
  const cw = 1.05;
  const M = 32;
  sign('LINEAR SEARCH vs BINARY SEARCH', 20, qx0 + (M * cw) / 2, 10.3, zf + 0.05, 0.9);
  bx(g, M * cw + 2, 7.4, 0.12, t.panel, qx0 + (M * cw) / 2, 5.6, zf - 0.03);
  const sorted = Array.from({ length: M }, (_, i) => i + 1);
  const rowsDef = [{ name: 'LINEAR: look at every cell, one by one', y: 8.0 }, { name: 'BINARY: look in the middle, throw half away', y: 4.4 }];
  const cells = rowsDef.map((r) => {
    sign(r.name, 20, qx0 + (M * cw) / 2, r.y + 1.2, zf + 0.05, 0.5);
    return sorted.map((_, i) => bx(g, cw - 0.15, 1.0, 0.3, t.cyan, qx0 + i * cw + cw / 2, r.y - 0.5, zf + 0.1));
  });
  const marker = bx(g, 0.5, 0.5, 0.2, t.red, qx0, 1.9, zf + 0.1);
  sign('TARGET', 2.4, qx0, 1.0, zf + 0.05, 0.4);
  const linSeg = sevenSeg(g, 2, qx0 + M * cw + 2.0, 7.2, zf + 0.04, 0.55, 0xffb703, anim.disposables);
  const binSeg = sevenSeg(g, 2, qx0 + M * cw + 2.0, 3.6, zf + 0.04, 0.55, 0x38e07a, anim.disposables);
  sign('STEPS', 2.6, qx0 + M * cw + 3.0, 5.2, zf + 0.05, 0.45);
  const targets = [27, 5, 19, 32, 12, 23];
  let lastT = -1;
  let steps = { linear: [] as number[], binary: [] as number[] };

  anim.add((tm, dt) => {
    // ---- sorting
    if (pos < ops.length) {
      accum += dt * SORT_RATE;
      while (accum >= 1 && pos < ops.length) {
        accum -= 1;
        const o = ops[pos++];
        if (o.t === 'cmp') cmps++;
        else {
          swps++;
          if (o.t === 'swap') [arr[o.i], arr[o.j]] = [arr[o.j], arr[o.i]];
          else arr[o.i] = o.j;
        }
        paint(o.i, o.t === 'set' ? o.i : o.j, o.t === 'cmp' ? 'cmp' : 'swap');
      }
    } else {
      hold += dt;
      sweep = Math.min(N - 1, Math.floor(hold * 30));
      paint(-1, -1, 'none');
      if (hold > 3.2) start(++round);
    }
    // ---- search (cycle of 9 s per target)
    const cyc = Math.floor(tm / 9);
    const ti = cyc % targets.length;
    if (cyc !== lastT) {
      lastT = cyc;
      steps = searchSteps(sorted, targets[ti]);
    }
    const local = tm - cyc * 9;
    const nL = Math.min(steps.linear.length, Math.floor(local * 5) + 1);
    const nB = Math.min(steps.binary.length, Math.floor(local * 1.2) + 1);
    const target = targets[ti] - 1;
    marker.position.x = qx0 + target * cw + cw / 2;
    cells.forEach((row, r) => {
      const visited = r === 0 ? steps.linear.slice(0, nL) : steps.binary.slice(0, nB);
      row.forEach((c, i) => {
        const v = visited.indexOf(i);
        let mat: THREE.Material = t.cyan;
        if (v >= 0) mat = v === visited.length - 1 ? (i === target ? lamp(0x38e07a) : t.amber) : lamp(0x2a5d8f);
        c.material = mat;
      });
    });
    linSeg.set(nL);
    binSeg.set(nB);
  });
  return { id: 'algo', nameBn: 'Algorithms Hall (Sorting & Searching)', group: g };
}
