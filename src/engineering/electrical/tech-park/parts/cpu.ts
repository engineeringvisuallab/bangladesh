import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building } from '../../../core/prims';
import { every } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { CpuSim, PROGRAM } from '../cpuSim';
import { sevenSeg } from './sevenseg';
import { bx } from './helpers';

/**
 * CPU & Logic Hall: logic gates (AND, OR, XOR, NOT) with live truth tables, a 4-bit binary adder, and a tiny CPU that runs a real program
 * (Fibonacci) through FETCH - DECODE - EXECUTE with glowing buses, registers in decimal and binary, and an ALU.
 */
export function buildCpu({ mats: m, t, anim, lamp }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'cpu';
  const C = L.cpu;
  building(g, m, { x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, open: 'S', door: 'N' });
  const wz = C.z - C.d / 2 + 1.0;
  const zf = wz + 0.25;
  const sign = (text: string, w: number, x: number, y: number, z = zf + 0.05, h = 0.55): void => {
    const s = makeSign(text, w, h);
    s.position.set(x, y, z);
    g.add(s);
  };
  const OFF = t.off;
  const box = (w: number, h: number, mat: THREE.Material, x: number, y: number, z = zf): THREE.Mesh => bx(g, w, h, 0.12, mat, x, y, z);
  const setLamp = (mesh: THREE.Mesh, on: boolean, onColor: number): void => {
    mesh.material = on ? lamp(onColor) : OFF;
  };

  // back wall panel
  bx(g, C.w - 4, 10.5, 0.3, t.plate, C.x, 5.5, wz);

  // =============== A. logic gates ===============
  const gx0 = C.x - 52;
  sign('LOGIC GATES: INPUTS A, B -> OUTPUT Q', 30, gx0 + 12, 10.6, zf + 0.05, 0.8);
  type Gate = { name: string; f: (a: number, b: number) => number; two: boolean };
  const gates: Gate[] = [
    { name: 'AND', f: (a, b) => a & b, two: true },
    { name: 'OR', f: (a, b) => a | b, two: true },
    { name: 'XOR', f: (a, b) => a ^ b, two: true },
    { name: 'NOT', f: (a) => 1 - a, two: false },
  ];
  const gateUpdaters: ((k: number) => void)[] = [];
  gates.forEach((gt, gi) => {
    const x = gx0 + gi * 8.2;
    sign(gt.name, 3, x, 9.4, zf + 0.05, 0.7);
    // switches / input lamps
    const aL = box(0.9, 0.9, OFF, x - 2.6, 7.6);
    const bL = gt.two ? box(0.9, 0.9, OFF, x - 2.6, 5.4) : null;
    sign('A', 0.8, x - 3.6, 7.6, zf + 0.05, 0.5);
    if (gt.two) sign('B', 0.8, x - 3.6, 5.4, zf + 0.05, 0.5);
    // gate body
    box(2.6, 3.6, t.steel, x, 6.5);
    sign(gt.name, 2.3, x, 6.5, zf + 0.12, 0.6);
    // output
    const qL = box(1.1, 1.1, OFF, x + 3.0, 6.5);
    sign('Q', 0.8, x + 3.0, 7.5, zf + 0.05, 0.5);
    // wires
    const wa = box(1.0, 0.14, t.wireOff, x - 1.9 + 0.0, 7.6 - 0.0);
    wa.scale.x = 1;
    const wb = gt.two ? box(1.0, 0.14, t.wireOff, x - 1.9, 5.4) : null;
    const wq = box(0.9, 0.14, t.wireOff, x + 2.0, 6.5);
    // truth table (current row is highlighted)
    const rows = gt.two ? 4 : 2;
    const tableBars: THREE.Mesh[] = [];
    const rowLamps: { a: THREE.Mesh; b: THREE.Mesh | null; q: THREE.Mesh; av: number; bv: number; qv: number }[] = [];
    for (let r = 0; r < rows; r++) {
      const av = gt.two ? (r >> 1) & 1 : r;
      const bv = gt.two ? r & 1 : 0;
      const qv = gt.f(av, bv);
      const y = 3.7 - r * 0.8;
      tableBars.push(box(6.6, 0.7, t.panel, x, y, zf - 0.02));
      const al = box(0.45, 0.45, OFF, x - 2.2, y, zf + 0.04);
      const bl = gt.two ? box(0.45, 0.45, OFF, x - 0.8, y, zf + 0.04) : null;
      const ql = box(0.45, 0.45, OFF, x + 1.6, y, zf + 0.04);
      setLamp(al, av === 1, 0xffb703);
      if (bl) setLamp(bl, bv === 1, 0xffb703);
      setLamp(ql, qv === 1, 0x38e07a);
      rowLamps.push({ a: al, b: bl, q: ql, av, bv, qv });
    }
    sign('A', 0.6, x - 2.2, 4.5, zf + 0.05, 0.4);
    if (gt.two) sign('B', 0.6, x - 0.8, 4.5, zf + 0.05, 0.4);
    sign('Q', 0.6, x + 1.6, 4.5, zf + 0.05, 0.4);
    gateUpdaters.push((k) => {
      const a = gt.two ? (k >> 1) & 1 : k & 1;
      const b = gt.two ? k & 1 : 0;
      const q = gt.f(a, b);
      setLamp(aL, a === 1, 0xffb703);
      if (bL) setLamp(bL, b === 1, 0xffb703);
      setLamp(qL, q === 1, 0x38e07a);
      wa.material = a ? lamp(0xffb703) : t.wireOff;
      if (wb) wb.material = b ? lamp(0xffb703) : t.wireOff;
      wq.material = q ? lamp(0x38e07a) : t.wireOff;
      const cur = gt.two ? k : k & 1;
      tableBars.forEach((bar, r) => {
        bar.material = r === cur ? t.blue : t.panel;
      });
    });
  });

  // =============== B. 4-bit binary adder ===============
  const ax0 = C.x - 12;
  sign('4-BIT BINARY ADDER', 14, ax0 + 4.5, 10.6, zf + 0.05, 0.8);
  const pairs: [number, number][] = [[5, 3], [9, 6], [7, 7], [12, 15], [1, 14], [10, 10]];
  const rowsA = [{ n: 'A', y: 8.2 }, { n: 'B', y: 6.4 }, { n: 'SUM', y: 3.8 }];
  const bitLamps: THREE.Mesh[][] = rowsA.map((r) => {
    sign(r.n, 2.2, ax0 - 4.2, r.y, zf + 0.05, 0.6);
    return [4, 3, 2, 1, 0].map((bit) => box(0.9, 0.9, OFF, ax0 - 0.2 + (4 - bit) * 1.4, r.y));
  });
  sign('16   8   4   2   1', 7.6, ax0 + 2.8, 9.2, zf + 0.05, 0.45);
  box(14, 0.12, t.steel, ax0 + 3, 5.2); // the "+" line
  sign('+', 0.8, ax0 - 4.2, 5.6, zf + 0.05, 0.6);
  const dec = rowsA.map((r) => {
    const s = sevenSeg(g, 2, ax0 + 8.6, r.y - 0.9, zf + 0.04, 0.5, 0x38e07a, anim.disposables);
    return s;
  });
  const carry: THREE.Mesh[] = [1, 2, 3, 4].map((i) => box(0.5, 0.5, OFF, ax0 - 0.2 + (4 - i) * 1.4 + 0.7 + 0.0, 5.6 - 0.0 + 0.0));
  sign('CARRY', 2, ax0 - 3.4, 5.0, zf + 0.05, 0.4);
  const setBits = (row: number, v: number): void => {
    bitLamps[row].forEach((l, i) => setLamp(l, ((v >> (4 - i)) & 1) === 1, row === 2 ? 0x38e07a : 0xffb703));
  };

  // =============== C. tiny CPU ===============
  const cx0 = C.x + 28;
  const cpu = new CpuSim();
  sign('A TINY CPU RUNNING A PROGRAM', 26, cx0 + 12, 10.6, zf + 0.05, 0.8);
  // memory (the program)
  box(8.2, 7.4, t.panel, cx0 - 2.2, 6.4, zf - 0.02);
  sign('MEMORY (PROGRAM)', 7.8, cx0 - 2.2, 9.8, zf + 0.05, 0.5);
  const memLamps: THREE.Mesh[] = [];
  PROGRAM.forEach((ins, i) => {
    const y = 9.0 - i * 0.95;
    memLamps.push(box(0.4, 0.4, OFF, cx0 - 5.7, y, zf + 0.04));
    sign(`${i}: ${ins.text}`, 6.4, cx0 - 2.0, y, zf + 0.06, 0.55);
  });
  // blocks
  const blk = (title: string, w: number, h: number, x: number, y: number): THREE.Mesh => {
    const b = box(w, h, t.panel, x, y, zf - 0.02);
    sign(title, w - 0.3, x, y + h / 2 - 0.35, zf + 0.05, 0.45);
    return b;
  };
  const pcBlk = blk('PC (counter)', 4, 2.4, cx0 + 4.8, 8.6);
  const irBlk = blk('IR (instruction)', 4.4, 2.4, cx0 + 4.8, 5.8);
  const cuBlk = blk('CONTROL UNIT', 4.6, 2.4, cx0 + 10.6, 7.4);
  const aluBlk = blk('ALU (adds)', 4.2, 2.8, cx0 + 17.4, 7.4);
  const outBlk = blk('OUTPUT', 4, 2.4, cx0 + 22.6, 7.4);
  const regBlk = blk('REGISTERS', 7.6, 4.8, cx0 + 14.0, 3.0);
  const pcSeg = sevenSeg(g, 1, cx0 + 4.1, 7.5, zf + 0.04, 0.5, 0xffb703, anim.disposables);
  const outSeg = sevenSeg(g, 3, cx0 + 21.4, 6.6, zf + 0.04, 0.4, 0x38e07a, anim.disposables);
  const regSeg = [0, 1, 2].map((r) => {
    sign(`R${r}`, 0.9, cx0 + 10.9, 3.9 - r * 1.3, zf + 0.06, 0.5);
    return sevenSeg(g, 3, cx0 + 11.8, 3.4 - r * 1.3, zf + 0.04, 0.32, 0xffb703, anim.disposables);
  });
  const regBits = [0, 1, 2].map((r) => Array.from({ length: 8 }, (_, b) => box(0.28, 0.28, OFF, cx0 + 15.6 + b * 0.4, 3.55 - r * 1.3, zf + 0.04)));
  const phaseLamps = ['FETCH', 'DECODE', 'EXECUTE'].map((n, i) => {
    sign(n, 2.4, cx0 + 1.6 + i * 2.7, 0.9, zf + 0.06, 0.45);
    return box(0.6, 0.6, OFF, cx0 + 1.6 + i * 2.7, 1.55, zf + 0.04);
  });
  // buses (they glow while data travels)
  const busMem = box(2.2, 0.2, t.wireOff, cx0 + 1.8, 5.8);
  const busPc = box(0.2, 1.2, t.wireOff, cx0 + 4.8, 7.0);
  const busCtl = box(3.6, 0.2, t.wireOff, cx0 + 7.8, 6.9);
  const busReg = box(0.2, 2.6, t.wireOff, cx0 + 10.6, 5.2);
  const busAlu = box(3.2, 0.2, t.wireOff, cx0 + 14.9, 5.6);
  const busOut = box(1.8, 0.2, t.wireOff, cx0 + 20.4, 7.4);
  void pcBlk; void irBlk; void regBlk;
  const bitsOf = (v: number, row: THREE.Mesh[]): void => row.forEach((l, i) => setLamp(l, ((v >> (7 - i)) & 1) === 1, 0xffb703));

  // =============== run: the gates and the adder change every 1.6 s / 3.2 s; the CPU makes one phase every 0.9 s ===============
  let lastK = -1;
  let lastPair = -1;
  every(anim, (tm) => {
    const k = Math.floor(tm / 1.6) % 4;
    if (k !== lastK) {
      lastK = k;
      gateUpdaters.forEach((u) => u(k));
    }
    const pi = Math.floor(tm / 3.2) % pairs.length;
    if (pi !== lastPair) {
      lastPair = pi;
      const [a, b] = pairs[pi];
      setBits(0, a);
      setBits(1, b);
      setBits(2, a + b);
      dec[0].set(a);
      dec[1].set(b);
      dec[2].set(a + b);
      // carries between bit columns (a carry goes to the next column when the bits below overflow)
      let c = 0;
      for (let bit = 0; bit < 4; bit++) {
        const s = ((a >> bit) & 1) + ((b >> bit) & 1) + c;
        c = s > 1 ? 1 : 0;
        setLamp(carry[3 - bit], c === 1, 0xff6a2b);
      }
    }
  });
  let lastPhase = -1;
  anim.add((tm) => {
    const ph = Math.floor(tm / 0.9);
    if (ph === lastPhase) return;
    lastPhase = ph;
    cpu.advance();
    memLamps.forEach((l, i) => setLamp(l, i === cpu.pc, 0xffb703)); // the lamp marks the instruction the program counter points at
    pcSeg.set(cpu.pc);
    outSeg.set(cpu.out);
    cpu.reg.forEach((v, r) => {
      regSeg[r].set(v);
      bitsOf(v, regBits[r]);
    });
    const p = cpu.phase; // the phase that will run next (0 fetch, 1 decode, 2 execute)
    phaseLamps.forEach((l, i) => setLamp(l, i === (p + 2) % 3, 0xffd23f)); // the phase that has just been done
    const op = cpu.ir?.op;
    busMem.material = p === 1 ? lamp(0x4cc9f0) : t.wireOff; // just fetched: instruction travelled memory -> IR
    busPc.material = p === 1 ? lamp(0xffb703) : t.wireOff;
    busCtl.material = p === 2 ? lamp(0x4cc9f0) : t.wireOff;
    busReg.material = p === 0 && (op === 'ADD' || op === 'MOV' || op === 'LDI') ? lamp(0x38e07a) : t.wireOff;
    busAlu.material = p === 0 && op === 'ADD' ? lamp(0x38e07a) : t.wireOff;
    busOut.material = p === 0 && op === 'OUT' ? lamp(0x38e07a) : t.wireOff;
    aluBlk.material = p === 0 && op === 'ADD' ? lamp(0x1d6f42) : t.panel;
    cuBlk.material = p === 2 ? lamp(0x1d4f8a) : t.panel;
    outBlk.material = p === 0 && op === 'OUT' ? lamp(0x1d6f42) : t.panel;
  });
  void L;
  return { id: 'cpu', nameBn: 'CPU & Logic Hall', group: g };
}
