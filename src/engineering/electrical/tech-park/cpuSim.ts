/**
 * A tiny 8-bit computer (pure TypeScript). It runs a real program, one phase at a time: FETCH (read the instruction at the program counter),
 * DECODE (the control unit works out what it means) and EXECUTE (the ALU / registers do it). The 3D hall just shows what happens.
 * The program prints the Fibonacci numbers 1, 2, 3, 5, 8, 13 ... (each is the sum of the two before).
 */
export type OpName = 'LDI' | 'ADD' | 'MOV' | 'OUT' | 'JMP';
export interface Instr {
  op: OpName;
  a: number;
  b: number;
  c: number;
  text: string;
}
export const PROGRAM: Instr[] = [
  { op: 'LDI', a: 0, b: 0, c: 0, text: 'LDI R0, 0' },
  { op: 'LDI', a: 1, b: 1, c: 0, text: 'LDI R1, 1' },
  { op: 'ADD', a: 2, b: 0, c: 1, text: 'ADD R2, R0, R1' },
  { op: 'OUT', a: 2, b: 0, c: 0, text: 'OUT R2' },
  { op: 'MOV', a: 0, b: 1, c: 0, text: 'MOV R0, R1' },
  { op: 'MOV', a: 1, b: 2, c: 0, text: 'MOV R1, R2' },
  { op: 'JMP', a: 2, b: 0, c: 0, text: 'JMP 2' },
];

export type Phase = 0 | 1 | 2; // fetch, decode, execute

export class CpuSim {
  pc = 0;
  ir: Instr | null = null;
  reg = [0, 0, 0];
  out = 0;
  phase: Phase = 0;
  /** which block is busy now (for the glowing blocks) */
  aluBusy = false;
  memBusy = false;
  cycles = 0;

  /** Advance by ONE phase. */
  advance(): void {
    this.aluBusy = false;
    this.memBusy = false;
    if (this.phase === 0) {
      this.ir = PROGRAM[this.pc];
      this.memBusy = true;
      this.phase = 1;
    } else if (this.phase === 1) {
      this.phase = 2; // decode: nothing changes in the registers
    } else {
      const i = this.ir as Instr;
      let nextPc = this.pc + 1;
      switch (i.op) {
        case 'LDI':
          this.reg[i.a] = i.b;
          break;
        case 'ADD':
          this.reg[i.a] = (this.reg[i.b] + this.reg[i.c]) & 255;
          this.aluBusy = true;
          break;
        case 'MOV':
          this.reg[i.a] = this.reg[i.b];
          break;
        case 'OUT':
          this.out = this.reg[i.a];
          break;
        case 'JMP':
          nextPc = i.a;
          break;
      }
      this.pc = nextPc;
      this.phase = 0;
      this.cycles++;
    }
  }
}
