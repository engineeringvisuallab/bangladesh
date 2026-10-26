import { Config } from '../core/Config';
import type { CitySite } from '../terrain';
import { ZONE_COLOR, type CityPlan } from '../city/CityPlan';
import { AIRPORT, AIRPORT_SEA, SEAPORT, WORLD_ZONE_COLOR, rasterizeWorldZones } from '../city/WorldZones';
import { ENGINEERING_AREAS, ENGINEERING_GROUP_COLOR } from '../city/EngineeringZones';
import type { RailNetwork } from '../rail';
import type { ExpresswayNetwork } from '../expressway';
import { bn, bnDigits, bnSigned } from '../i18n';
import type { MinimapRequest, MinimapResult } from '../workers/minimap.worker';
import { UI_FONT } from './theme';

export type MapMarkerKind = 'foot' | 'car' | 'heli' | 'boat' | 'train';

export interface MapMarker {
  x: number;
  z: number;
  /** Degrees clockwise from north. */
  heading: number;
  kind: MapMarkerKind;
  color?: string;
  /** Car marker size: length and width factor (bike small, bus long, tank wide). Default 1. */
  len?: number;
  wide?: number;
}

export interface MapState {
  /** The thing you are controlling: on foot, in a car, in the helicopter or in a boat. */
  me: MapMarker;
  /** Camera view direction in degrees (shows the view cone when on foot). */
  viewHeading: number | null;
  /** Everything else (parked vehicles, helicopters, boats). */
  others: MapMarker[];
  /** Bus stops (world x, z). */
  stops?: { x: number; z: number }[];
  /** City Mall (world x, z): always shown, so the player can find the shop. */
  mall?: { x: number; z: number };
  /** City Library (world x, z): always shown. */
  library?: { x: number; z: number };
  /** Prototype building (police station) (world x, z): always shown. */
  building?: { x: number; z: number };
  /** All placed building models (world x, z + dot colour): small dots, always shown. */
  buildings?: { x: number; z: number; color: string }[];
  /** EV Agro Research Institute (world x, z): always shown. */
  agro?: { x: number; z: number };
  /** SWTP / STP plants (world x, z): always shown. */
  infra?: { x: number; z: number; id: string; color: string; mark: string }[];
  /** The camera's world position: shown as numbers under the map. */
  camera?: { x: number; y: number; z: number };
  /** Time of day in hours (0 .. 24): shown as a faint clock next to the map. */
  hours?: number;
}

const PERIODS: [number, string][] = [[4, 'রাত'], [6, 'ভোর'], [12, 'সকাল'], [15, 'দুপুর'], [17, 'বিকেল'], [19, 'সন্ধ্যা'], [24, 'রাত']];

/** 8.52 -> { time: '০৮:৩১', period: 'সকাল' } (12-hour clock with the Bangla part of the day). */
export function formatClock(hours: number): { time: string; period: string } {
  const total = Math.floor(((hours % 24) + 24) % 24 * 60);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h24 % 12 || 12;
  const period = PERIODS.find(([end]) => h24 < end)![1];
  return { time: bnDigits(`${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}`), period };
}

/** false = clean map: terrain, zones, railway (no names), trains and you. true = also bus stops, parked vehicles, station names, city-core circles. */
const MAP_CLUTTER = false;

const BASE_SIZE = 1024;
const ZOOM_SPANS = [2400, 6000, 10600]; // metres across: close / medium / whole world

/**
 * The site map: always on screen (top-right), north is up, centred on you.
 * The terrain picture is painted once in a Web Worker. The U key cycles close / medium / whole world.
 * Shows rivers, lakes, sea, the city zones, you (with view cone) and the parked vehicles.
 */
export class Minimap {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private zoom = 1;
  private px = 220;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private worker: Worker;
  private t = 0;
  /** STAGE 11A: the whole-map zones (residential, industrial, airport, seaport ...) as one small picture, 100 m per pixel. */
  private zoneLayer: HTMLCanvasElement;
  /** Camera coordinates under the map, and the time of day as a faint watermark beside it. */
  private coords = document.createElement('div');
  private clock = document.createElement('div');
  private clockTime = document.createElement('div');
  private clockPeriod = document.createElement('div');
  private coordText = '';
  private clockText = '';

  constructor(
    parent: HTMLElement,
    seed: number,
    private sites: CitySite[],
    private plan: CityPlan,
    private rail: RailNetwork,
    private expressway: ExpresswayNetwork | null = null,
  ) {
    this.zoneLayer = Minimap.makeZoneLayer();
    const c = this.canvas;
    this.setSize();
    Object.assign(c.style, {
      position: 'fixed',
      right: '14px',
      top: '14px',
      borderRadius: '14px',
      border: '2px solid rgba(255,255,255,0.55)',
      boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
      background: '#0c1a2a',
      pointerEvents: 'none',
      zIndex: '11',
    });
    parent.appendChild(c);
    this.ctx = c.getContext('2d')!;
    // camera coordinates: a small chip right under the map
    Object.assign(this.coords.style, {
      position: 'fixed', right: '14px', textAlign: 'center', boxSizing: 'border-box', padding: '4px 8px', borderRadius: '9px',
      background: 'rgba(14,22,34,0.66)', border: '1px solid rgba(255,255,255,0.25)', color: '#d8ecff',
      font: `600 12px/1.4 ${UI_FONT}`, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: '11',
    } satisfies Partial<CSSStyleDeclaration>);
    // time of day: big, faint, no box: a watermark on the left side of the map
    Object.assign(this.clock.style, {
      position: 'fixed', top: '14px', textAlign: 'right', color: '#ffffff', opacity: '0.62', pointerEvents: 'none', zIndex: '10',
      textShadow: '0 1px 4px rgba(0,0,0,0.65)', fontFamily: UI_FONT, userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(this.clockTime.style, { font: `700 13px/1.1 ${UI_FONT}`, letterSpacing: '0.5px' });
    Object.assign(this.clockPeriod.style, { font: `500 9px/1.3 ${UI_FONT}` });
    this.clock.append(this.clockTime, this.clockPeriod);
    parent.append(this.coords, this.clock);
    this.layoutInfo();
    window.addEventListener('resize', () => this.setSize());

    this.worker = new Worker(new URL('../workers/minimap.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<MinimapResult>) => {
      const b = document.createElement('canvas');
      b.width = b.height = e.data.size;
      b.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(e.data.rgba.buffer as ArrayBuffer), e.data.size, e.data.size), 0, 0);
      this.base = b;
      this.worker.terminate();
    };
    const half = Config.world.size / 2 + Config.world.chunkMargin * Config.world.chunkSize;
    this.worker.postMessage({ seed, size: BASE_SIZE, half } satisfies MinimapRequest);
  }

  private static makeZoneLayer(): HTMLCanvasElement {
    const z = rasterizeWorldZones(100);
    const c = document.createElement('canvas');
    c.width = c.height = z.n;
    const g = c.getContext('2d')!;
    const img = g.createImageData(z.n, z.n);
    for (let k = 0; k < z.ids.length; k++) {
      const hex = WORLD_ZONE_COLOR[z.kinds[z.ids[k]]];
      img.data[k * 4] = parseInt(hex.slice(1, 3), 16);
      img.data[k * 4 + 1] = parseInt(hex.slice(3, 5), 16);
      img.data[k * 4 + 2] = parseInt(hex.slice(5, 7), 16);
      img.data[k * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** U key: close -> medium -> whole world. Returns the new zoom (0 .. 2). */
  cycleZoom(): number {
    this.zoom = (this.zoom + 1) % ZOOM_SPANS.length;
    return this.zoom;
  }

  get zoomLevel(): number {
    return this.zoom;
  }

  setZoom(z: number): void {
    this.zoom = Math.max(0, Math.min(ZOOM_SPANS.length - 1, Math.round(z)));
  }

  /** Put the coordinate chip under the map and the clock beside it (the map size depends on the window). */
  private layoutInfo(): void {
    this.coords.style.top = `${14 + this.px + 8}px`;
    this.coords.style.width = `${this.px}px`;
    this.clock.style.right = `${14 + this.px + 14}px`;
  }

  private setSize(): void {
    this.px = Math.round(Math.max(150, Math.min(230, Math.min(window.innerWidth, window.innerHeight) * 0.3)));
    this.canvas.width = this.px * this.dpr;
    this.canvas.height = this.px * this.dpr;
    this.canvas.style.width = `${this.px}px`;
    this.canvas.style.height = `${this.px}px`;
    this.layoutInfo();
  }

  update(dt: number, s: MapState): void {
    this.t += dt;
    if (s.camera) {
      const txt = `📷 X ${bnSigned(s.camera.x, 0)} · Y ${bnSigned(s.camera.y, 0)} · Z ${bnSigned(s.camera.z, 0)}`;
      if (txt !== this.coordText) this.coords.textContent = this.coordText = txt;
    }
    if (s.hours !== undefined) {
      const c = formatClock(s.hours);
      const key = `${c.time}|${c.period}|${s.hours >= 6 && s.hours < 18}`;
      if (key !== this.clockText) {
        this.clockText = key;
        this.clockTime.textContent = c.time;
        this.clockPeriod.textContent = `${s.hours >= 6 && s.hours < 18 ? '☀️' : '🌙'} ${c.period}`;
      }
    }
    const c = this.ctx;
    const S = this.canvas.width;
    const span = ZOOM_SPANS[this.zoom];
    const half = Config.world.size / 2 + Config.world.chunkMargin * Config.world.chunkSize;
    const ppm = S / span; // canvas pixels per metre
    const cx = s.me.x;
    const cz = s.me.z;
    const X = (x: number) => (x - cx) * ppm + S / 2;
    const Z = (z: number) => (z - cz) * ppm + S / 2;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0c1a2a';
    c.fillRect(0, 0, S, S);

    if (this.base) {
      // map picture: world [-half, half] -> base [0, BASE_SIZE]
      const k = BASE_SIZE / (2 * half);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(this.base, 0, 0, BASE_SIZE, BASE_SIZE, X(-half), Z(-half), 2 * half * ppm, 2 * half * ppm);
      void k;
      // edge of the playable area
      const e = Config.world.size / 2;
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.lineWidth = Math.max(1, this.dpr);
      c.setLineDash([6 * this.dpr, 5 * this.dpr]);
      c.strokeRect(X(-e), Z(-e), 2 * e * ppm, 2 * e * ppm);
      c.setLineDash([]);
      // whole-map zones (Stage 11A): translucent colour per zone kind over the terrain picture
      {
        const e0 = Config.world.size / 2;
        c.save();
        c.globalAlpha = 0.42;
        c.imageSmoothingEnabled = false;
        c.drawImage(this.zoneLayer, X(-e0), Z(-e0), 2 * e0 * ppm, 2 * e0 * ppm);
        c.restore();
        // airport runway and port quay: thin white outlines so they read even at the whole-world zoom
        c.strokeStyle = '#ffffff';
        c.lineWidth = Math.max(1, this.dpr);
        for (const f of [AIRPORT, AIRPORT_SEA, SEAPORT]) c.strokeRect(X(f.x0), Z(f.z0), (f.x1 - f.x0) * ppm, (f.z1 - f.z0) * ppm);
        // engineering areas: a coloured outline (the colour of the branch group) on top of the zone layer, with the name when zoomed in
        for (const a of ENGINEERING_AREAS) {
          const col = ENGINEERING_GROUP_COLOR[a.group];
          c.fillStyle = col + '40';
          c.fillRect(X(a.x0), Z(a.z0), (a.x1 - a.x0) * ppm, (a.z1 - a.z0) * ppm);
          c.strokeStyle = col;
          c.lineWidth = Math.max(1.5, 1.6 * this.dpr);
          c.strokeRect(X(a.x0), Z(a.z0), (a.x1 - a.x0) * ppm, (a.z1 - a.z0) * ppm);
          if ((a.x1 - a.x0) * ppm > 90 * this.dpr) {
            c.fillStyle = '#ffffff';
            c.font = `${Math.round(11 * this.dpr)}px sans-serif`;
            c.fillText((bn.worldZones.names[a.id] ?? a.id).split(' (')[0], X(a.x0) + 4 * this.dpr, Z(a.z0) + 13 * this.dpr, (a.x1 - a.x0) * ppm - 8 * this.dpr);
          }
        }
        c.strokeStyle = '#ffffff';
        c.lineWidth = Math.max(1, this.dpr);
        for (const ap of [AIRPORT, AIRPORT_SEA]) {
          const rw = ap.areas[0];
          c.fillStyle = '#222';
          c.fillRect(X(rw.x0), Z(rw.z0), (rw.x1 - rw.x0) * ppm, Math.max(2 * this.dpr, (rw.z1 - rw.z0) * ppm));
        }
      }
      // planned city areas (Stage 10A): one translucent colour per zone kind; later areas are drawn first so the first (highest priority) is on top
      for (let i = this.plan.areas.length - 1; i >= 0; i--) {
        const a = this.plan.areas[i];
        c.fillStyle = ZONE_COLOR[a.kind] + (a.shape.t === 'ring' ? '38' : '88');
        if (a.shape.t === 'rect') {
          const s = a.shape;
          c.fillRect(X(a.cx + s.x0), Z(a.cz + s.z0), (s.x1 - s.x0) * ppm, (s.z1 - s.z0) * ppm);
        } else {
          c.beginPath();
          c.arc(X(a.cx), Z(a.cz), a.shape.r1 * ppm, 0, Math.PI * 2);
          if (a.shape.r0 > 0) c.arc(X(a.cx), Z(a.cz), a.shape.r0 * ppm, 0, Math.PI * 2, true);
          c.fill('evenodd');
        }
      }
      // city zones
      c.strokeStyle = '#ffd21f';
      c.lineWidth = 1.6 * this.dpr;
      if (MAP_CLUTTER) {
        for (const site of this.sites) {
          c.beginPath();
          c.arc(X(site.x), Z(site.z), site.coreRadius * ppm, 0, Math.PI * 2);
          c.stroke();
        }
      }
      // railway network (Stage 11B): dark line + white dashes, station areas as rings
      {
        const line = (): void => {
          for (const ed of this.rail.edges) {
            c.beginPath();
            for (let i = 0; i < ed.xs.length; i++) (i ? c.lineTo(X(ed.xs[i]), Z(ed.zs[i])) : c.moveTo(X(ed.xs[i]), Z(ed.zs[i])));
            c.stroke();
          }
        };
        c.lineJoin = 'round';
        c.strokeStyle = '#111';
        c.lineWidth = 1.2 * this.dpr;
        line();
        c.strokeStyle = '#fff';
        c.lineWidth = 0.5 * this.dpr;
        c.setLineDash([4 * this.dpr, 4 * this.dpr]);
        line();
        c.setLineDash([]);
        // elevated cargo expressway: thin orange line (ramps thinner and lighter), drawn under the station rings
        if (this.expressway) {
          c.lineCap = 'round';
          for (const pass of [0, 1]) {
            for (const r of this.expressway.routes) {
              const ramp = r.kind === 'ramp';
              if ((pass === 0) !== ramp) continue;
              c.strokeStyle = ramp ? 'rgba(255,170,110,0.9)' : '#ff6a2b';
              c.lineWidth = (ramp ? 0.8 : 1.5) * this.dpr;
              c.beginPath();
              for (let i = 0; i < r.xs.length; i++) (i ? c.lineTo(X(r.xs[i]), Z(r.zs[i])) : c.moveTo(X(r.xs[i]), Z(r.zs[i])));
              if (r.closed) c.closePath();
              c.stroke();
            }
          }
          c.lineCap = 'butt';
        }
        c.font = `700 ${10 * this.dpr}px ${UI_FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        for (const st of this.rail.stations) {
          c.beginPath();
          c.arc(X(st.x), Z(st.z), Math.max(3.5 * this.dpr, st.radius * ppm), 0, Math.PI * 2);
          c.fillStyle = 'rgba(255,255,255,0.25)';
          c.fill();
          c.strokeStyle = '#fff';
          c.lineWidth = 1.1 * this.dpr;
          c.stroke();
          if (MAP_CLUTTER && this.zoom >= 1) {
            const name = bn.rail.station[st.id] ?? st.id;
            c.strokeStyle = 'rgba(0,0,0,0.75)';
            c.lineWidth = 3 * this.dpr;
            c.strokeText(name, X(st.x), Z(st.z) - 5 * this.dpr);
            c.fillStyle = '#fff';
            c.fillText(name, X(st.x), Z(st.z) - 5 * this.dpr);
          }
        }
      }
    } else {
      // painting the map: a soft moving highlight, no text
      const g = c.createLinearGradient(((this.t * 0.6) % 1.6) * S - S * 0.3, 0, ((this.t * 0.6) % 1.6) * S, S * 0.3);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
    }

    // bus stops: blue square with a white bus window (only on the close / medium maps)
    if (MAP_CLUTTER && s.stops && this.zoom < 2) {
      const d = this.dpr;
      const r = (this.zoom === 0 ? 4.6 : 3.4) * d;
      for (const b of s.stops) {
        const bx = X(b.x);
        const bz = Z(b.z);
        if (bx < -r || bz < -r || bx > S + r || bz > S + r) continue;
        c.fillStyle = '#1456a8';
        c.strokeStyle = '#fff';
        c.lineWidth = 1.2 * d;
        c.beginPath();
        c.roundRect(bx - r, bz - r, 2 * r, 2 * r, 1.5 * d);
        c.fill();
        c.stroke();
        c.fillStyle = '#fff';
        c.fillRect(bx - r * 0.55, bz - r * 0.45, r * 1.1, r * 0.55);
      }
    }

    // City Mall: cyan shopping-bag marker (always visible, every zoom level)
    if (s.mall) {
      const d = this.dpr;
      const r = (this.zoom === 0 ? 7.5 : this.zoom === 1 ? 6 : 5) * d;
      const mx = X(s.mall.x);
      const mz = Z(s.mall.z);
      if (mx > -r && mz > -r && mx < S + r && mz < S + r) {
        c.fillStyle = '#0891b2';
        c.strokeStyle = '#fff';
        c.lineWidth = 1.6 * d;
        c.beginPath();
        c.roundRect(mx - r, mz - r, 2 * r, 2 * r, 3 * d);
        c.fill();
        c.stroke();
        c.fillStyle = '#fff';
        c.fillRect(mx - r * 0.5, mz - r * 0.15, r, r * 0.65); // bag
        c.strokeStyle = '#fff';
        c.lineWidth = 1.3 * d;
        c.beginPath();
        c.arc(mx, mz - r * 0.15, r * 0.3, Math.PI, 0); // handle
        c.stroke();
      }
    }

    // SWTP (blue drop) / STP (brown): always visible, every zoom level
    for (const pl of s.infra ?? []) {
      const d = this.dpr;
      const r = (this.zoom === 0 ? 7.5 : this.zoom === 1 ? 6 : 5) * d;
      const ix = X(pl.x);
      const iz = Z(pl.z);
      if (ix > -r && iz > -r && ix < S + r && iz < S + r) {
        c.save();
        c.fillStyle = pl.color;
        c.strokeStyle = '#fff';
        c.lineWidth = 1.6 * d;
        c.beginPath();
        c.roundRect(ix - r, iz - r, 2 * r, 2 * r, 3 * d);
        c.fill();
        c.stroke();
        c.fillStyle = '#fff';
        c.font = `700 ${Math.round(r * 1.25)}px sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(pl.mark, ix, iz + r * 0.05);
        c.restore();
      }
    }

    // City Library: amber open-book marker (always visible, every zoom level)
    if (s.library) {
      const d = this.dpr;
      const r = (this.zoom === 0 ? 7.5 : this.zoom === 1 ? 6 : 5) * d;
      const lx = X(s.library.x);
      const lz = Z(s.library.z);
      if (lx > -r && lz > -r && lx < S + r && lz < S + r) {
        c.fillStyle = '#a16207';
        c.strokeStyle = '#fff';
        c.lineWidth = 1.6 * d;
        c.beginPath();
        c.roundRect(lx - r, lz - r, 2 * r, 2 * r, 3 * d);
        c.fill();
        c.stroke();
        c.fillStyle = '#fff';
        c.fillRect(lx - r * 0.62, lz - r * 0.4, r * 0.56, r * 0.8); // left page
        c.fillRect(lx + r * 0.06, lz - r * 0.4, r * 0.56, r * 0.8); // right page
      }
    }

    // placed building models: small coloured dots (always visible, every zoom level)
    if (s.buildings) {
      const d = this.dpr;
      const r = (this.zoom === 0 ? 3.2 : 2.6) * d;
      c.lineWidth = 1 * d;
      c.strokeStyle = '#0f172a';
      for (const b of s.buildings) {
        const bx = X(b.x);
        const bz = Z(b.z);
        if (bx < -r || bz < -r || bx > S + r || bz > S + r) continue;
        c.fillStyle = b.color;
        c.beginPath();
        c.arc(bx, bz, r, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    }

    // Prototype building (police station): blue square with a white star (always visible, every zoom level)
    if (s.building) {
      const d = this.dpr;
      const r = (this.zoom === 0 ? 7.5 : this.zoom === 1 ? 6 : 5) * d;
      const bx = X(s.building.x);
      const bz = Z(s.building.z);
      if (bx > -r && bz > -r && bx < S + r && bz < S + r) {
        c.fillStyle = '#1d4ed8';
        c.strokeStyle = '#fff';
        c.lineWidth = 1.6 * d;
        c.beginPath();
        c.roundRect(bx - r, bz - r, 2 * r, 2 * r, 3 * d);
        c.fill();
        c.stroke();
        c.fillStyle = '#fff';
        c.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rr = i % 2 === 0 ? r * 0.72 : r * 0.3;
          if (i === 0) c.moveTo(bx + Math.cos(a) * rr, bz + Math.sin(a) * rr);
          else c.lineTo(bx + Math.cos(a) * rr, bz + Math.sin(a) * rr);
        }
        c.closePath();
        c.fill();
      }
    }

    // EV Agro Research Institute: green leaf marker (always visible, every zoom level)
    if (s.agro) {
      const d = this.dpr;
      const r = (this.zoom === 0 ? 7.5 : this.zoom === 1 ? 6 : 5) * d;
      const ax = X(s.agro.x);
      const az = Z(s.agro.z);
      if (ax > -r && az > -r && ax < S + r && az < S + r) {
        c.fillStyle = '#16a34a';
        c.strokeStyle = '#fff';
        c.lineWidth = 1.6 * d;
        c.beginPath();
        c.roundRect(ax - r, az - r, 2 * r, 2 * r, 3 * d);
        c.fill();
        c.stroke();
        c.fillStyle = '#fff';
        c.beginPath(); // leaf
        c.moveTo(ax - r * 0.55, az + r * 0.5);
        c.quadraticCurveTo(ax - r * 0.6, az - r * 0.55, ax + r * 0.55, az - r * 0.55);
        c.quadraticCurveTo(ax + r * 0.6, az + r * 0.55, ax - r * 0.55, az + r * 0.5);
        c.fill();
      }
    }

    // other vehicles
    for (const o of s.others) if (MAP_CLUTTER || o.kind === 'train') this.drawMarker(c, X(o.x), Z(o.z), o, false);

    // view cone (on foot) + you
    if (s.viewHeading !== null) {
      c.save();
      c.translate(S / 2, S / 2);
      c.rotate((s.viewHeading * Math.PI) / 180);
      const r = 34 * this.dpr;
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, r, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
      c.closePath();
      c.fill();
      c.restore();
    }
    this.drawMarker(c, S / 2, S / 2, s.me, true);

    // north marker (the only letter on the map)
    c.fillStyle = '#fff';
    c.strokeStyle = 'rgba(0,0,0,0.7)';
    c.lineWidth = 3 * this.dpr;
    c.font = `700 ${12 * this.dpr}px ${UI_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.strokeText(bn.map.north, S / 2, 5 * this.dpr);
    c.fillText(bn.map.north, S / 2, 5 * this.dpr);
  }

  private drawMarker(c: CanvasRenderingContext2D, x: number, y: number, m: MapMarker, me: boolean): void {
    const d = this.dpr;
    c.save();
    c.translate(x, y);
    c.rotate((m.heading * Math.PI) / 180);
    if (m.kind === 'foot' || me) {
      const a = (me ? 8 : 5) * d;
      c.fillStyle = me ? '#ff3b30' : (m.color ?? '#fff');
      c.strokeStyle = '#fff';
      c.lineWidth = 1.6 * d;
      c.beginPath();
      c.moveTo(0, -a);
      c.lineTo(a * 0.72, a * 0.85);
      c.lineTo(0, a * 0.42);
      c.lineTo(-a * 0.72, a * 0.85);
      c.closePath();
      c.fill();
      c.stroke();
    } else if (m.kind === 'car') {
      c.fillStyle = m.color ?? '#fff';
      c.strokeStyle = '#fff';
      c.lineWidth = 1.4 * d;
      c.beginPath();
      const hw = 3 * d * (m.wide ?? 1);
      const hh = 5 * d * (m.len ?? 1);
      c.roundRect(-hw, -hh, 2 * hw, 2 * hh, 1.5 * d);
      c.fill();
      c.stroke();
    } else if (m.kind === 'train') {
      // a train: a long amber capsule along the line (always drawn, near or far)
      c.fillStyle = m.color ?? '#f5b82e';
      c.strokeStyle = '#fff';
      c.lineWidth = 1.4 * d;
      c.beginPath();
      c.roundRect(-2.6 * d, -10 * d, 5.2 * d, 20 * d, 2.6 * d);
      c.fill();
      c.stroke();
    } else if (m.kind === 'boat') {
      // pointed hull (bow up), light blue so it reads as "on the water"
      c.fillStyle = m.color ?? '#7fd3ff';
      c.strokeStyle = '#fff';
      c.lineWidth = 1.4 * d;
      c.beginPath();
      c.moveTo(0, -6.5 * d);
      c.lineTo(3.2 * d, -1 * d);
      c.lineTo(2.6 * d, 5 * d);
      c.lineTo(-2.6 * d, 5 * d);
      c.lineTo(-3.2 * d, -1 * d);
      c.closePath();
      c.fill();
      c.stroke();
    } else {
      c.fillStyle = '#fff';
      c.strokeStyle = '#1b2a3a';
      c.lineWidth = 1.4 * d;
      c.beginPath();
      c.arc(0, 0, 4.2 * d, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(-6 * d, 0);
      c.lineTo(6 * d, 0);
      c.moveTo(0, -6 * d);
      c.lineTo(0, 6 * d);
      c.stroke();
    }
    c.restore();
  }
}
