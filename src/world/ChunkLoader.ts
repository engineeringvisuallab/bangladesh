import { Config } from '../core/Config';
import type { ChunkRequest, ChunkResult, GrassRequest, GrassResult } from '../workers/messages';
import { chunkKey } from './WorldGrid';

export interface IChunkLoader {
  request(cx: number, cz: number, lod: number): Promise<ChunkResult>;
  dispose(): void;
}

/** Small pool of Web Workers that generate chunk data. */
export class ChunkLoader implements IChunkLoader {
  private workers: Worker[] = [];
  private pending = new Map<string, { resolve: (r: ChunkResult) => void; reject: (e: unknown) => void }>();
  private grassPending = new Map<string, { resolve: (r: GrassResult) => void; reject: (e: unknown) => void }>();
  private next = 0;

  constructor(private seed: number) {
    const count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('../workers/chunk.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<ChunkResult | GrassResult>) => {
        const r = e.data;
        if (r.type === 'grass') {
          const gid = `${r.tx},${r.tz},${r.stride}`;
          const gp = this.grassPending.get(gid);
          if (gp) {
            this.grassPending.delete(gid);
            gp.resolve(r);
          }
          return;
        }
        const id = `${r.key}@${r.lod}`;
        const p = this.pending.get(id);
        if (p) {
          this.pending.delete(id);
          p.resolve(r);
        }
      };
      w.onerror = (ev) => console.error('[chunk.worker] error', ev.message);
      this.workers.push(w);
    }
  }

  request(cx: number, cz: number, lod: number): Promise<ChunkResult> {
    const key = chunkKey(cx, cz);
    const id = `${key}@${lod}`;
    return new Promise<ChunkResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg: ChunkRequest = {
        type: 'generate',
        key,
        cx,
        cz,
        lod,
        seed: this.seed,
        vertsPerSide: Config.lod.vertsPerSide[lod],
        skirtDepth: Config.terrain.skirtDepth[lod],
      };
      this.workers[this.next++ % this.workers.length].postMessage(msg);
    });
  }

  /** STAGE 7: grass tufts of one tile, made by a worker (same terrain function as the chunks). */
  requestGrass(tx: number, tz: number, stride = 1): Promise<GrassResult> {
    const id = `${tx},${tz},${stride}`;
    return new Promise<GrassResult>((resolve, reject) => {
      this.grassPending.set(id, { resolve, reject });
      const msg: GrassRequest = { type: 'grass', tx, tz, seed: this.seed, stride };
      this.workers[this.next++ % this.workers.length].postMessage(msg);
    });
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers.length = 0;
    for (const p of this.pending.values()) p.reject(new Error('ChunkLoader disposed'));
    this.pending.clear();
    for (const p of this.grassPending.values()) p.reject(new Error('ChunkLoader disposed'));
    this.grassPending.clear();
  }
}
