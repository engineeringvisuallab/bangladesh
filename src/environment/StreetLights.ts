// STREET LIGHTS on every road (highway, arterial, collector, local street, roundabout, bridge deck) and at every engineered junction.
//
//   planStreetLights(roads)   pure placement (no three.js scene): where every pole stands, which way its arm points, how high it is
//   StreetLights              the 3D layer. Everything is INSTANCED, so the whole map costs 4 draw calls:
//                               poles  : pole + arm + lamp housing (one shape, one grey material)
//                               lamps  : the glowing underside of the housing (dull by day, warm white at night)
//                               pools  : a soft pool of light on the road under each lamp (additive, only drawn at night)
//                               halos  : a glow around each lamp seen from far away (additive points, only drawn at night)
//
// Placement rules: poles alternate left / right along the road (so every side is lit), the spacing depends on the road class, they stand on
// the edge of the carriageway (the gravel shoulder; on a bridge the deck edge), the arm reaches over the road. Poles are skipped where
// another road's asphalt is (crossing roads) and inside a junction pad; each junction gets its own poles at the kerb-return corners instead.
// Children use ABSOLUTE world coordinates (parent = world.root), like the traffic signals.
import * as THREE from 'three';
import type { RoadNetwork } from '../roads';
import type { RoadKind } from '../roads/RoadTypes';

export interface LampSpot {
  /** Foot of the pole (world metres). */
  x: number;
  y: number;
  z: number;
  /** Unit vector (x, z) from the pole towards the road centre = the way the arm points. */
  ix: number;
  iz: number;
  /** Unit tangent of the road at the lamp (x, y, z): the light pool is stretched along it and tilted with the road grade. */
  tx: number;
  ty: number;
  tz: number;
  /** Pole height scale (1 = 8 m) and light pool radius (m). */
  scale: number;
  pool: number;
}

interface Class {
  /** Distance between two consecutive poles along the road (they alternate sides). */
  step: number;
  scale: number;
  pool: number;
}
const CLASS: Record<RoadKind, Class> = {
  highway: { step: 36, scale: 1.25, pool: 12 },
  arterial: { step: 34, scale: 1.1, pool: 10.5 },
  collector: { step: 40, scale: 1.0, pool: 9.5 },
  roundabout: { step: 24, scale: 1.0, pool: 9 },
  local: { step: 32, scale: 0.85, pool: 8 },
};
/** The arm of a pole (scale 1) reaches this far over the road; the lamp hangs at its end. */
const ARM = 2.4;
const POLE_H = 8;
/** Skip a pole this far from a junction centre beyond the pad's flat core (the pad has its own poles). */
const PAD_SKIP = 3;

const wrap = (a: number): number => {
  const t = Math.PI * 2;
  return ((a % t) + t) % t;
};

/** Where every street light stands. Deterministic. */
export function planStreetLights(roads: RoadNetwork): LampSpot[] {
  const out: LampSpot[] = [];
  const pads = roads.pads;
  // grid of pad centres for the "inside a pad" test
  const cell = 120;
  const grid = new Map<string, number[]>();
  const key = (cx: number, cz: number): string => cx + ',' + cz;
  pads.forEach((p, i) => {
    const r = p.rCore + PAD_SKIP;
    for (let cx = Math.floor((p.x - r) / cell); cx <= Math.floor((p.x + r) / cell); cx++)
      for (let cz = Math.floor((p.z - r) / cell); cz <= Math.floor((p.z + r) / cell); cz++) {
        const k = key(cx, cz);
        const l = grid.get(k);
        if (l) l.push(i);
        else grid.set(k, [i]);
      }
  });
  const inPad = (x: number, z: number): boolean => {
    const l = grid.get(key(Math.floor(x / cell), Math.floor(z / cell)));
    if (!l) return false;
    for (const i of l) if (Math.hypot(x - pads[i].x, z - pads[i].z) < pads[i].rCore + PAD_SKIP) return true;
    return false;
  };
  const bridgeHalf = new Map<number, number>();
  for (const b of roads.bridges) bridgeHalf.set(b.id, b.deckHalfWidth);

  for (const r of roads.roads) {
    const c = CLASS[r.kind];
    const n = r.xs.length;
    if (n < 2) continue;
    let side = r.id % 2 ? 1 : -1; // neighbouring roads do not all start on the same side
    let target = c.step * 0.5;
    let i = 0;
    while (target < r.length) {
      while (i < n - 2 && r.cum[i + 1] < target) i++;
      const seg = r.cum[i + 1] - r.cum[i];
      const f = seg > 1e-6 ? Math.min(1, Math.max(0, (target - r.cum[i]) / seg)) : 0;
      target += c.step;
      const x = r.xs[i] + (r.xs[i + 1] - r.xs[i]) * f;
      const z = r.zs[i] + (r.zs[i + 1] - r.zs[i]) * f;
      const y = r.ys[i] + (r.ys[i + 1] - r.ys[i]) * f;
      let nx = r.nx[i] + (r.nx[i + 1] - r.nx[i]) * f;
      let nz = r.nz[i] + (r.nz[i + 1] - r.nz[i]) * f;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      side = -side;
      if (inPad(x, z)) continue;
      const bid = r.bridgeOf[f < 0.5 ? i : i + 1];
      const edge = bid >= 0 ? (bridgeHalf.get(bid) ?? r.halfWidth) - 0.35 : r.halfWidth + Math.max(0.6, r.shoulder * 0.5);
      const px = x + nx * edge * side;
      const pz = z + nz * edge * side;
      // another road's asphalt (a crossing that is not a pad): no pole here
      if (bid < 0 && roads.surfaceAt(px, pz) === 1) continue;
      let tx = r.xs[i + 1] - r.xs[i];
      let tz = r.zs[i + 1] - r.zs[i];
      const ty = r.ys[i + 1] - r.ys[i];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      tz /= tl;
      out.push({ x: px, y, z: pz, ix: -nx * side, iz: -nz * side, tx, ty: ty / tl, tz, scale: c.scale, pool: c.pool });
    }
  }

  // junctions: one pole on every corner (between two neighbouring legs), just outside the kerb return, arm over the junction
  for (const p of pads) {
    if (p.arms.length < 3) continue;
    const th = p.arms.map((a) => wrap(a.theta)).sort((a, b) => a - b);
    for (let k = 0; k < th.length; k++) {
      const a = th[k];
      const b = k + 1 < th.length ? th[k + 1] : th[0] + Math.PI * 2;
      const gap = b - a;
      if (gap < 0.5) continue;
      const ang = a + gap / 2;
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      const reach = rayExit(p.gravel.length ? p.gravel : p.outline, p.x, p.z, dx, dz);
      if (reach <= 0) continue;
      const rr = reach + 0.6;
      const px = p.x + dx * rr;
      const pz = p.z + dz * rr;
      const y = p.y + p.a * (px - p.x) + p.b * (pz - p.z);
      // tangent: along the corner (perpendicular to the ray) with the pad's slope, just for the pool's orientation
      const tx = -dz;
      const tz = dx;
      out.push({ x: px, y, z: pz, ix: -dx, iz: -dz, tx, ty: 0, tz, scale: 1.1, pool: 11 });
    }
  }
  return out;
}

/** Farthest distance from (cx, cz) along the unit ray (dx, dz) at which it leaves the polygon (x, z pairs); 0 if it never crosses. */
function rayExit(poly: Float32Array, cx: number, cz: number, dx: number, dz: number): number {
  const n = poly.length / 2;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = poly[i * 2] - cx;
    const az = poly[i * 2 + 1] - cz;
    const ex = poly[j * 2] - poly[i * 2];
    const ez = poly[j * 2 + 1] - poly[i * 2 + 1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (ax * ez - az * ex) / den; // along the ray
    const u = (ax * dz - az * dx) / den; // along the edge
    if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
  }
  return best;
}

// --------------------------------------------------------------------------------------------------------------------------------------

const WARM = new THREE.Color(1.0, 0.84, 0.55);
const LAMP_DAY = new THREE.Color(0x7d8186);

function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const HALO_VERT = /* glsl */ `
attribute float aSize;
uniform float uScale;
uniform float uOn;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 1.0);
  gl_PointSize = clamp(aSize * uScale / dist, 3.0, 70.0);
  // not glaring when you stand right under it, gone beyond ~5 km
  vA = uOn * smoothstep(6.0, 40.0, dist) * (1.0 - smoothstep(3200.0, 5200.0, dist));
  gl_Position = projectionMatrix * mv;
}
`;
const HALO_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = length(q);
  float a = pow(max(1.0 - r, 0.0), 2.2);
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.5) * a * vA, 1.0);
}
`;

export class StreetLights {
  readonly group = new THREE.Group();
  readonly spots: LampSpot[];
  private poles: THREE.InstancedMesh;
  private lamps: THREE.InstancedMesh;
  private pools: THREE.InstancedMesh;
  private halos: THREE.Points;
  private haloMat: THREE.ShaderMaterial;
  private poolMat: THREE.MeshBasicMaterial;
  private lampMat: THREE.MeshBasicMaterial;
  private poleMat = new THREE.MeshLambertMaterial({ color: 0x5b6066 });
  private geos: THREE.BufferGeometry[] = [];
  private tex: THREE.CanvasTexture;

  constructor(parent: THREE.Object3D, roads: RoadNetwork) {
    this.spots = planStreetLights(roads);
    const n = this.spots.length;

    // one pole shape: tapered pole (1.5 m below the foot, so it never floats on a slope), a slightly rising arm, the lamp housing
    const parts: THREE.BufferGeometry[] = [];
    const pole = new THREE.CylinderGeometry(0.07, 0.12, POLE_H + 1.5, 8);
    pole.translate(0, (POLE_H - 1.5) / 2, 0);
    parts.push(pole);
    const arm = new THREE.BoxGeometry(ARM, 0.1, 0.1);
    arm.translate(ARM / 2, POLE_H - 0.05, 0);
    parts.push(arm);
    const housing = new THREE.BoxGeometry(1.0, 0.16, 0.36);
    housing.translate(ARM, POLE_H + 0.02, 0);
    parts.push(housing);
    const poleGeo = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    this.geos.push(poleGeo);

    const lampGeo = new THREE.PlaneGeometry(0.86, 0.26);
    lampGeo.rotateX(Math.PI / 2); // faces down
    lampGeo.translate(ARM, POLE_H - 0.07, 0);
    this.geos.push(lampGeo);

    const poolGeo = new THREE.PlaneGeometry(1, 1);
    poolGeo.rotateX(-Math.PI / 2);
    this.geos.push(poolGeo);

    this.tex = radialTexture();
    this.lampMat = new THREE.MeshBasicMaterial({ color: LAMP_DAY.clone(), side: THREE.DoubleSide, fog: false });
    this.poolMat = new THREE.MeshBasicMaterial({
      map: this.tex,
      color: new THREE.Color(1.0, 0.8, 0.5),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    this.poles = new THREE.InstancedMesh(poleGeo, this.poleMat, Math.max(1, n));
    this.lamps = new THREE.InstancedMesh(lampGeo, this.lampMat, Math.max(1, n));
    this.pools = new THREE.InstancedMesh(poolGeo, this.poolMat, Math.max(1, n));
    this.poles.count = this.lamps.count = this.pools.count = n;

    const m = new THREE.Matrix4();
    const sc = new THREE.Matrix4();
    const haloPos = new Float32Array(n * 3);
    const haloSize = new Float32Array(n);
    const X = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    const Z = new THREE.Vector3();
    const T = new THREE.Vector3();
    const N = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const s = this.spots[i];
      // pole frame: +X towards the road centre, +Y up, +Z = X x Y
      X.set(s.ix, 0, s.iz);
      Z.set(-s.iz, 0, s.ix);
      m.makeBasis(X, Y, Z).setPosition(s.x, s.y, s.z);
      m.multiply(sc.makeScale(s.scale, s.scale, s.scale));
      this.poles.setMatrixAt(i, m);
      this.lamps.setMatrixAt(i, m);
      // lamp position (world)
      const lx = s.x + s.ix * ARM * s.scale;
      const lz = s.z + s.iz * ARM * s.scale;
      const ly = s.y + (POLE_H - 0.1) * s.scale;
      haloPos[i * 3] = lx;
      haloPos[i * 3 + 1] = ly;
      haloPos[i * 3 + 2] = lz;
      haloSize[i] = 2 + s.scale * 1.5;
      // light pool on the road under the lamp: lies in the road's plane (tangent T with the grade, horizontal sideways S, normal N)
      const sx = s.tz; // horizontal sideways = the horizontal tangent turned by 90 degrees (chosen so that N = T x X points up)
      const sz = -s.tx;
      const sl = Math.hypot(sx, sz) || 1;
      T.set(s.tx, s.ty, s.tz).normalize();
      X.set(sx / sl, 0, sz / sl);
      N.crossVectors(T, X);
      Z.copy(T);
      m.makeBasis(X, N, Z).setPosition(lx, s.y + 0.1, lz);
      m.multiply(sc.makeScale(s.pool * 1.35, 1, s.pool * 2.3));
      this.pools.setMatrixAt(i, m);
    }
    this.poles.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
    this.pools.instanceMatrix.needsUpdate = true;

    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
    haloGeo.setAttribute('aSize', new THREE.BufferAttribute(haloSize, 1));
    haloGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);
    this.geos.push(haloGeo);
    this.haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      uniforms: { uScale: { value: 800 }, uOn: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.halos = new THREE.Points(haloGeo, this.haloMat);

    for (const o of [this.poles, this.lamps, this.pools, this.halos]) {
      o.frustumCulled = false; // spread over the whole map
      o.castShadow = false;
      o.receiveShadow = false;
    }
    this.pools.renderOrder = 2;
    this.halos.renderOrder = 3;
    this.group.add(this.poles, this.lamps, this.pools, this.halos);
    parent.add(this.group);
    this.update(0, 70, 800);
  }

  /** Once per rendered frame. on = 0 (day) .. 1 (night), fovDeg = camera field of view, viewportPx = drawing buffer height. */
  update(on: number, fovDeg: number, viewportPx: number): void {
    this.lampMat.color.copy(LAMP_DAY).lerp(WARM, on).multiplyScalar(1 + on * 0.8);
    this.poolMat.opacity = on * 0.5;
    this.pools.visible = on > 0.01;
    this.haloMat.uniforms.uOn.value = on;
    this.haloMat.uniforms.uScale.value = viewportPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.halos.visible = on > 0.01;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.poles.dispose();
    this.lamps.dispose();
    this.pools.dispose();
    for (const g of this.geos) g.dispose();
    this.poleMat.dispose();
    this.lampMat.dispose();
    this.poolMat.dispose();
    this.haloMat.dispose();
    this.tex.dispose();
  }
}

/** Merge position / normal / uv / index of several indexed geometries into one (no BufferGeometryUtils import, which would pull the examples bundle). */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    vCount += g.getAttribute('position').count;
    iCount += g.getIndex()!.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    pos.set(p.array as Float32Array, vo * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, vo * 3);
    uv.set(g.getAttribute('uv').array as Float32Array, vo * 2);
    const ix = g.getIndex()!.array;
    for (let k = 0; k < ix.length; k++) idx[io + k] = ix[k] + vo;
    vo += p.count;
    io += ix.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
