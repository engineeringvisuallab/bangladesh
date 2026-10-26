import * as THREE from 'three';
import { bn } from '../i18n';
import type { RailNetwork } from './RailNetwork';
import { STATION_EN, stationSigns, type SignSpot } from './StationSigns';

/**
 * The lettering of the station name boards: the English name and under it the Bangla name, small white letters on both faces of every blue board
 * (platform boards, shelter sign and entrance sign of the stair accesses). One canvas texture per station, one mesh per station.
 * Positions are ABSOLUTE world coordinates (the root is moved by the floating origin). The lettering of a board is only drawn within `RANGE` of the camera,
 * which is where the board exists (the chunk meshes carry the boards in the detailed LODs only).
 */
const RANGE = 200;
const ASPECT = 5; // texture width : height
const BANGLA_FONT = '"Noto Sans Bengali", "Nirmala UI", "Vrinda", "Shonar Bangla", "Kalpurush", sans-serif';

function makeTexture(station: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const W = 1024, H = Math.round(W / ASPECT);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const line = (text: string, y: number, size: number, family: string, weight: string): void => {
    let s = size;
    g.font = `${weight} ${s}px ${family}`;
    while (g.measureText(text).width > W * 0.94 && s > 18) {
      s -= 2;
      g.font = `${weight} ${s}px ${family}`;
    }
    g.fillText(text, W / 2, y);
  };
  line(STATION_EN[station] ?? station, H * 0.3, 64, '"Segoe UI", Arial, Helvetica, sans-serif', '700');
  line(bn.rail.station[station] ?? '', H * 0.7, 58, BANGLA_FONT, '600');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export class StationSignLayer {
  private group = new THREE.Group();
  private parts: { mesh: THREE.Mesh; cx: number; cz: number }[] = [];
  private materials: THREE.MeshBasicMaterial[] = [];

  constructor(
    private root: THREE.Object3D,
    rail: RailNetwork,
    groundAt: (x: number, z: number) => number,
  ) {
    this.group.name = 'station-signs';
    const byStation = new Map<string, SignSpot[]>();
    for (const s of stationSigns(rail, groundAt)) {
      let list = byStation.get(s.station);
      if (!list) byStation.set(s.station, (list = []));
      list.push(s);
    }
    for (const [id, spots] of byStation) {
      const map = makeTexture(id);
      if (!map) continue;
      const mat = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.materials.push(mat);
      // one small mesh per board (2 faces): each can be switched on by its own distance
      for (const s of spots) {
        // lettering plate: 70 % of the board width, keeps the texture aspect, never taller than 80 % of the board
        let pw = s.w * 0.7, ph = pw / ASPECT;
        if (ph > s.h * 0.8) { ph = s.h * 0.8; pw = ph * ASPECT; }
        const nl = Math.hypot(s.nx, s.nz) || 1;
        const nx = s.nx / nl, nz = s.nz / nl;
        const pos: number[] = [], uv: number[] = [], idx: number[] = [];
        for (const face of [1, -1]) {
          const fnx = nx * face, fnz = nz * face; // outward normal of this face
          const rx = fnz, rz = -fnx; // right-hand direction for a viewer looking at the face
          const off = s.thick + 0.012;
          const cx = s.x + fnx * off, cz = s.z + fnz * off;
          const base = pos.length / 3;
          for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
            pos.push(cx + rx * pw * u, s.y + ph * v, cz + rz * pw * u);
            uv.push(u + 0.5, v + 0.5);
          }
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'station-sign-' + id;
        mesh.visible = false;
        this.group.add(mesh);
        this.parts.push({ mesh, cx: s.x, cz: s.z });
      }
    }
    root.add(this.group);
  }

  /** Camera position in absolute world metres: lettering only near its board. */
  update(camX: number, camZ: number): void {
    for (const p of this.parts) p.mesh.visible = Math.hypot(camX - p.cx, camZ - p.cz) < RANGE;
  }

  dispose(): void {
    this.root.remove(this.group);
    for (const p of this.parts) p.mesh.geometry.dispose();
    for (const m of this.materials) {
      m.map?.dispose();
      m.dispose();
    }
    this.parts.length = 0;
    this.materials.length = 0;
  }
}
