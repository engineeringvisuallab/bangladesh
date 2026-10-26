import { bn, bnNum, bnSigned } from '../i18n';
import type { PlayerState } from '../characters';
import { UI_FONT } from './theme';

export interface DebugStats {
  fps: number;
  frameMs: number;
  fixedSteps: number;
  world: { x: number; y: number; z: number };
  origin: { x: number; z: number };
  chunk: { cx: number; cz: number };
  loadedChunks: number;
  pendingChunks: number;
  lodCounts: number[];
  physicsBodies: number;
  physicsColliders: number;
  rivers: number;
  riverKm: number;
  lakes: number;
  ponds: number;
  waterfalls: number;
  groundHeight: number;
  wireframe: boolean;
  lodColors: boolean;
  cameraSpeed: number;
  freeFly: boolean;
  playerState: PlayerState;
  playerSpeed: number;
  waterDepth: number;
  highwayKm: number;
  localKm: number;
  bridges: number;
  culverts: number;
  junctions: number;
  surface: number;
  roadLines: boolean;
  railLines: boolean;
  people: number;
  cars: number;
  aiCars: number;
}

/** বাংলা ডিবাগ প্যানেল (উপরে-বামে)। F3 দিয়ে দেখানো/লুকানো। দুই কলামের গ্রিড, তাই বাংলা লেখাতেও লাইন মিলে থাকে। */
export class DebugPanel {
  private root = document.createElement('div');
  private values: HTMLElement[] = [];
  private timer = 1;
  /** Always hidden at start (clean screen); F3 toggles it for developers. */
  private visible = false;

  constructor(parent: HTMLElement) {
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      padding: '8px 12px',
      background: 'rgba(0,0,0,0.58)',
      color: '#d8ecff',
      font: `400 13px/1.55 ${UI_FONT}`,
      pointerEvents: 'none',
      borderRadius: '6px',
      zIndex: '10',
      display: 'grid',
      gridTemplateColumns: 'auto auto',
      columnGap: '14px',
    });
    const d = bn.debug;
    const labels = [
      d.fps, d.physicsSteps, d.position, d.originOffset, d.chunk, d.chunksLoaded, d.byLod,
      d.bodies, d.cameraMode, d.playerState, d.speedDepth, d.rivers, d.lakes, d.waterfalls, d.groundHeight, d.altitude, d.flySpeed, d.wireframe, d.lodColors,
      d.roads, d.bridges, d.surface, d.roadLines, d.railLines, d.people, d.cars,
    ];
    for (const l of labels) {
      const a = document.createElement('div');
      a.textContent = l;
      a.style.color = '#9bc4ec';
      const b = document.createElement('div');
      b.style.textAlign = 'right';
      b.style.whiteSpace = 'nowrap';
      this.root.append(a, b);
      this.values.push(b);
    }
    this.root.style.display = this.visible ? 'grid' : 'none';
    parent.appendChild(this.root);
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.root.style.display = this.visible ? 'grid' : 'none';
  }

  /** Throttled to 4 Hz so the panel itself costs nothing. */
  update(dt: number, get: () => DebugStats): void {
    if (!this.visible) return;
    this.timer += dt;
    if (this.timer < 0.25) return;
    this.timer = 0;

    const s = get();
    const d = bn.debug;
    const m = bn.units.meter;
    const onOff = (b: boolean) => (b ? bn.state.on : bn.state.off);
    const v = [
      `${bnNum(s.fps)}  (${bnNum(s.frameMs, 1)} মি.সে)`,
      bnNum(s.fixedSteps),
      `x ${bnSigned(s.world.x, 0)}  y ${bnSigned(s.world.y, 0)}  z ${bnSigned(s.world.z, 0)} ${m}`,
      `x ${bnSigned(s.origin.x, 0)}  z ${bnSigned(s.origin.z, 0)} ${m}`,
      `${bnNum(s.chunk.cx)}, ${bnNum(s.chunk.cz)}`,
      `${bnNum(s.loadedChunks)}  (${d.pending} ${bnNum(s.pendingChunks)})`,
      s.lodCounts.map((n, i) => `L${bnNum(i)}:${bnNum(n)}`).join('  '),
      `${bnNum(s.physicsBodies)} / ${d.colliders} ${bnNum(s.physicsColliders)}`,
      s.freeFly ? bn.camera.free : bn.camera.player,
      bn.player[s.playerState],
      `${bnNum(s.playerSpeed, 1)} ${bn.units.meterPerSec} / ${bnNum(s.waterDepth, 1)} ${m}`,
      `${bnNum(s.rivers)}  (${bnNum(s.riverKm, 1)} ${bn.units.km})`,
      `${bnNum(s.lakes)} / ${bnNum(s.ponds)}`,
      bnNum(s.waterfalls),
      `${bnSigned(s.groundHeight, 1)} ${m}`,
      `${bnSigned(s.world.y - Math.max(0, s.groundHeight), 0)} ${m}`,
      `${bnNum(s.cameraSpeed)} ${bn.units.meterPerSec}`,
      onOff(s.wireframe),
      onOff(s.lodColors),
      `${bnNum(s.highwayKm, 1)} / ${bnNum(s.localKm, 1)} ${bn.units.km}`,
      `${bnNum(s.bridges)} / ${bnNum(s.culverts)} / ${bnNum(s.junctions)}`,
      bn.road.surface[s.surface],
      onOff(s.roadLines),
      onOff(s.railLines),
      bnNum(s.people),
      `${bnNum(s.cars)} / ${bnNum(s.aiCars)}`,
    ];
    for (let i = 0; i < v.length; i++) this.values[i].textContent = v[i];
  }
}
