import * as THREE from 'three';
import { Config } from '../core/Config';
import type { Environment } from '../environment';
import type { TerrainGenerator } from '../terrain';
import type { TerrainMaterials } from '../terrain';
import type { TerrainSample } from '../terrain/Lakes';
import { GodRays } from './GodRays';
import { BigMarine } from './BigMarine';
import { MarineLife } from './MarineLife';
import { SeabedDecor } from './SeabedDecor';
import { SplashRings } from './SplashRings';
import type { WaterMaterial } from './WaterMaterial';
import { WaterParticles } from './WaterParticles';
import { waveHeight, waveScale } from './WaterWaves';

export interface WaterFXDeps {
  /** World root: everything below lives in ABSOLUTE world coordinates here. */
  root: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  terrain: TerrainGenerator;
  terrainMaterials: TerrainMaterials;
  environment: Environment;
  water: WaterMaterial;
  /** The element the game canvas lives in (the underwater screen overlay goes in here). */
  container: HTMLElement;
  /** Height of the drawing buffer in pixels (point sizes). */
  pxHeight: () => number;
}

const CSS = `
.evw-overlay { position:absolute; inset:0; pointer-events:none; z-index:6; opacity:0; transition:none; mix-blend-mode:normal;
  background:radial-gradient(ellipse at 50% 45%, rgba(30,140,160,0.06) 35%, rgba(4,52,72,0.32) 75%, rgba(1,22,38,0.62) 100%); }
.evw-overlay::after { content:''; position:absolute; inset:-6%; opacity:.5; mix-blend-mode:screen;
  background:repeating-linear-gradient(100deg, rgba(120,220,230,0) 0px, rgba(120,220,230,.05) 30px, rgba(120,220,230,0) 70px);
  animation:evw-sway 7s ease-in-out infinite alternate; }
@keyframes evw-sway { from { transform:translateX(-3%) skewX(-2deg); } to { transform:translateX(3%) skewX(2deg); } }
.evw-drown { position:absolute; inset:0; pointer-events:none; z-index:7; opacity:0;
  background:radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(120,0,10,.55) 85%, rgba(30,0,0,.9) 100%); }
.evw-top { position:absolute; left:0; right:0; top:0; height:0; pointer-events:none; z-index:6; opacity:0;
  background:linear-gradient(to bottom, rgba(210,245,255,.0), rgba(210,245,255,.28)); }
`;

/**
 * Everything that happens in and under the water, in one place. Each frame it works out whether the camera is under the
 * (wavy) surface and, if it is: blue-green fog and darker light (Environment), the screen overlay, sun beams, marine snow,
 * seabed caustics (terrain shader). Near water it also grows the sea floor (seaweed, coral, rocks) and the life in it (fish,
 * jellyfish, turtles). Splashes, bubbles for divers. Quality 0 / 1 / 2 scales all of it.
 */
export class WaterFX {
  private overlay = document.createElement('div');
  private drown = document.createElement('div');
  private top = document.createElement('div');
  private style = document.createElement('style');
  private particles: WaterParticles;
  private rays: GodRays;
  private rings: SplashRings;
  private decor: SeabedDecor;
  private life: MarineLife;
  private big: BigMarine;
  private sc: TerrainSample;
  private quality = 1;
  private camW = new THREE.Vector3();
  private smoothDepth = 0;
  private underAmt = 0;
  private bubbleTimer = 0;
  private lastSurface = 0;

  /** True while the camera is below the water surface. */
  cameraUnder = false;
  /** Smooth 0..1 version of cameraUnder. */
  get under(): number {
    return this.underAmt;
  }
  /** Water surface height under the camera (m), NaN when there is no water there. */
  surfaceY = NaN;

  constructor(private d: WaterFXDeps) {
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.overlay.className = 'evw-overlay';
    this.drown.className = 'evw-drown';
    this.top.className = 'evw-top';
    const host = d.container;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(this.overlay, this.drown, this.top);
    this.sc = d.terrain.makeSample();
    this.particles = new WaterParticles(d.root);
    this.rays = new GodRays(d.root);
    this.rings = new SplashRings(d.root);
    this.decor = new SeabedDecor(d.root, d.terrain);
    this.life = new MarineLife(d.root, d.terrain);
    this.big = new BigMarine(d.root, d.terrain);
    this.setQuality(1);
  }

  /** 0 low, 1 medium, 2 high. */
  setQuality(q: number): void {
    this.quality = Math.max(0, Math.min(2, Math.round(q)));
    this.d.water.setQuality(this.quality);
    this.particles.setQuality(this.quality);
    this.rays.setQuality(this.quality);
    this.decor.setQuality(this.quality);
    this.life.setQuality(this.quality);
    this.big.setQuality(this.quality);
  }

  get qualityLevel(): number {
    return this.quality;
  }

  /** A body hits the water at absolute world (x, z): foam rings and spray. strength 0..1+ */
  splash(x: number, z: number, strength: number): void {
    this.d.terrain.sample(x, z, this.sc);
    if (Number.isNaN(this.sc.water)) return;
    const y = this.sc.water + waveHeight(x, z, waveScale(this.sc.water, Math.hypot(this.sc.fx, this.sc.fz), Math.max(0, this.sc.water - this.sc.h)));
    this.rings.trigger(x, y, z, strength);
    this.particles.emitSpray(x, y, z, strength);
    // a puff of bubbles under the impact
    this.particles.emitBubbles(x, y - 0.4, z, Math.round(6 + strength * 14), 0.5);
  }

  /** Bubbles rising from a diver's mouth (call every frame while diving; it rate-limits itself). */
  diverBubbles(dt: number, x: number, y: number, z: number, intensity = 1): void {
    this.bubbleTimer -= dt;
    if (this.bubbleTimer > 0) return;
    this.bubbleTimer = 0.16 / Math.max(0.3, intensity);
    this.particles.emitBubbles(x, y, z, 1 + (Math.random() < 0.4 ? 1 : 0), 0.08);
  }

  /** Red-black vignette while drowning (0..1). */
  setDrowning(amount: number): void {
    this.drown.style.opacity = String(Math.max(0, Math.min(1, amount)));
  }

  /**
   * dt, time = game clock. `focus` = the player (world coordinates). Call every frame AFTER the camera and the floating origin
   * moved and BEFORE Environment.update().
   */
  update(dt: number, time: number, focus: THREE.Vector3): void {
    const { camera, terrain, environment, terrainMaterials, water } = this.d;
    // camera in absolute world coordinates
    this.camW.copy(camera.position);
    this.camW.x -= this.d.root.position.x;
    this.camW.z -= this.d.root.position.z;
    const cx = this.camW.x;
    const cz = this.camW.z;

    terrain.sample(cx, cz, this.sc);
    const sc = this.sc;
    const hasWater = !Number.isNaN(sc.water);
    const wet = hasWater && sc.h < sc.water;
    let surface = NaN;
    if (hasWater) {
      const depthHere = Math.max(0, sc.water - sc.h);
      surface = sc.water + waveHeight(cx, cz, waveScale(sc.water, Math.hypot(sc.fx, sc.fz), depthHere));
    }
    this.surfaceY = surface;
    this.cameraUnder = wet && this.camW.y < surface - 0.02;

    // smooth transition (about 0.2 s)
    const target = this.cameraUnder ? 1 : 0;
    this.underAmt += (target - this.underAmt) * Math.min(1, dt * 9);
    if (Math.abs(target - this.underAmt) < 0.004) this.underAmt = target;
    const camDepth = this.cameraUnder ? Math.max(0, surface - this.camW.y) : 0;
    this.smoothDepth += (camDepth - this.smoothDepth) * Math.min(1, dt * 4);
    if (this.cameraUnder) this.lastSurface = surface;

    // fog: clear tropical water, darker and murkier deeper down
    const deepK = 1 - Math.exp(-this.smoothDepth * 0.04);
    const fogDensity = 0.026 + 0.026 * deepK;
    environment.setUnderwater(this.underAmt, this.smoothDepth, fogDensity);
    water.uUnderColor.value.copy(environment.underwaterColor);

    // terrain shader: water level near the player + caustics (daylight only)
    const daylight = 1 - environment.night;
    const level = hasWater ? sc.water : Config.terrain.seaLevel;
    terrainMaterials.setWater(level, [0, 0.75, 1][this.quality] * (0.25 + 0.75 * daylight), time, camera.position.x, camera.position.z);

    // screen overlay
    this.overlay.style.opacity = String(this.underAmt);
    // a thin bright band at the top of the screen right as the camera is about to cross the surface from below
    const nearTop = this.cameraUnder ? Math.max(0, 1 - this.smoothDepth / 1.2) : 0;
    this.top.style.opacity = String(nearTop * 0.8);
    this.top.style.height = `${Math.round(10 + nearTop * 26)}%`;

    const surfaceForFx = Number.isFinite(surface) ? surface : this.lastSurface;
    this.rays.update(time, this.camW, surfaceForFx, this.underAmt, environment.sunDir, daylight, environment.underwaterColor);
    this.particles.update(dt, time, this.camW, this.underAmt, surfaceForFx, this.d.pxHeight(), camera.fov, 0.35 + 0.65 * daylight);
    this.rings.update(dt);

    // sea floor and its inhabitants: only when water is around
    const nearWater = hasWater || this.hasWaterAround(cx, cz);
    if (nearWater) {
      this.decor.update(dt, time, cx, cz);
      this.life.update(dt, time, this.camW, focus);
      this.big.update(dt, time, this.camW, focus);
    }
  }

  private probeTimer = 0;
  private probeResult = false;
  private probeS: TerrainSample | null = null;

  /** Cheap check (4 samples every half second) whether any water is within ~60 m, so the life under the surface also shows from the shore. */
  private hasWaterAround(cx: number, cz: number): boolean {
    this.probeTimer -= 0.016;
    if (this.probeTimer > 0) return this.probeResult;
    this.probeTimer = 0.5;
    if (!this.probeS) this.probeS = this.d.terrain.makeSample();
    let found = false;
    for (let i = 0; i < 8 && !found; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.d.terrain.sample(cx + Math.cos(a) * 55, cz + Math.sin(a) * 55, this.probeS);
      if (!Number.isNaN(this.probeS.water) && this.probeS.h < this.probeS.water) found = true;
    }
    this.probeResult = found;
    return found;
  }

  /** Debug numbers. */
  get stats(): { plants: number; schools: number; jellyfish: number; turtles: number; big: number } {
    const s = this.life.stats;
    const b = this.big.stats;
    return { plants: this.decor.count, schools: s.schools, jellyfish: s.jellyfish, turtles: s.turtles, big: Object.values(b).reduce((a, n) => a + n, 0) };
  }

  dispose(): void {
    this.particles.dispose();
    this.rays.dispose();
    this.rings.dispose();
    this.decor.dispose();
    this.life.dispose();
    this.big.dispose();
    this.overlay.remove();
    this.drown.remove();
    this.top.remove();
    this.style.remove();
  }
}
