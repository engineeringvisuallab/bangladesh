import * as THREE from 'three';
import { buildArea, buildRibbon, type MeshData } from './RoadGeometry';
import type { RoadClass } from './RoadData';
import type { RoadNetwork } from './RoadNetwork';

/** Metres of road covered by one repeat of the texture, per road class. */
const V_METRES: Record<RoadClass, number> = { highway: 12, access: 12, runway: 60, taxiway: 12 };
const LIFT = 0.06;

function asphalt(ctx: CanvasRenderingContext2D, w: number, h: number, base: string): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h * 0.06; i++) {
    const v = Math.random() * 40 - 20;
    ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 400})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
}

/** One repeat of the road surface: u across (64 px), v along (period V_METRES). Lines in px of a 64-px-wide strip. */
function roadTexture(kind: RoadClass, widthM: number): THREE.CanvasTexture {
  const W = 64;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const pxPerM = W / widthM; // across
  const pxPerMv = H / V_METRES[kind]; // along
  asphalt(ctx, W, H, kind === 'runway' ? '#4a4d50' : kind === 'taxiway' ? '#45484b' : '#3d4144');
  const line = (x: number, wM: number, y0: number, y1: number, col: string): void => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x - (wM * pxPerM) / 2), y0, Math.max(1, Math.round(wM * pxPerM)), y1 - y0);
  };
  if (kind === 'highway') {
    line(W * 0.06, 0.2, 0, H, '#e8e8e8'); // edge lines
    line(W * 0.94, 0.2, 0, H, '#e8e8e8');
    line(W / 2, 0.15, 0, Math.round(4.5 * pxPerMv), '#f2f2f2'); // 4.5 m dash, 7.5 m gap
  } else if (kind === 'runway') {
    line(W * 0.03, 0.45, 0, H, '#f0f0f0'); // edge lines
    line(W * 0.97, 0.45, 0, H, '#f0f0f0');
    line(W / 2, 0.9, 0, Math.round(30 * pxPerMv), '#f5f5f5'); // 30 m dash, 30 m gap
  } else if (kind === 'taxiway') {
    line(W / 2, 0.3, 0, H, '#e8c200'); // yellow centre line
  } else {
    line(W * 0.05, 0.12, 0, H, '#cfcfcf');
    line(W * 0.95, 0.12, 0, H, '#cfcfcf');
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function concreteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  asphalt(ctx, 128, 128, '#7d8083');
  ctx.strokeStyle = 'rgba(40,40,40,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 127, 127); // slab joints every 10 m
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function toGeometry(d: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(d.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(d.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** Draws every road / paved area of the network on the ground (visual only; grip comes from RoadNetwork.surfaceAt). */
export class RoadMeshes {
  readonly group = new THREE.Group();

  constructor(network: RoadNetwork, heightAt: (x: number, z: number) => number) {
    this.group.name = 'Roads';
    const mats = new Map<string, THREE.MeshBasicMaterial>();
    const material = (key: string, tex: THREE.Texture): THREE.MeshBasicMaterial => {
      let m = mats.get(key);
      if (!m) {
        // polygonOffset pulls the road towards the camera so it never flickers against the ground far away
        m = new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        mats.set(key, m);
      }
      return m;
    };
    for (const road of network.roads) {
      const mesh = new THREE.Mesh(
        toGeometry(buildRibbon(road, heightAt, LIFT, V_METRES[road.kind])),
        material(`${road.kind}:${road.width}`, roadTexture(road.kind, road.width)),
      );
      mesh.name = road.id;
      mesh.renderOrder = 1;
      this.group.add(mesh);
    }
    for (const area of network.areas) {
      const tex = concreteTexture();
      tex.repeat.set(1, 1);
      const mesh = new THREE.Mesh(toGeometry(buildArea(area, heightAt, LIFT + 0.01, 10)), material(`area:${area.id}`, tex));
      mesh.name = area.id;
      mesh.renderOrder = 1;
      this.group.add(mesh);
    }
  }
}
