import { Config } from '../core/Config';
import { Seed, mulberry32 } from '../world/Seed';
import { Noise2D } from './Noise';
import { RiverNetwork } from './RiverNetwork';
import { LakeSet, type TerrainSample } from './Lakes';
import { RoadNetwork } from '../roads/RoadNetwork';
import { RailNetwork } from '../rail/RailNetwork';
import { RailFormation } from '../rail/RailFormation';
import { islandHeight } from './Island';
import { AirportSite, SEA_AIRPORT_DEF } from '../airport/AirportSite';
import { ArmySite } from '../army/ArmySite';
import { AgroSite } from '../agro/AgroSite';
import { PortFormation } from '../port/PortFormation';
import { MallSite, MALL_PLOT } from '../mall/MallSite';
import { EVLabSite } from '../evlab/EVLabSite';
import { LibrarySite, LIBRARY_PLOT } from '../library/LibrarySite';
import { ProtoSite, PROTO_PLOT } from '../buildings/ProtoSite';
import { InfraSite, INFRA_PLACEMENTS } from '../engineering/InfraSites';

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface CitySite {
  x: number;
  z: number;
  /** Height (m above sea) of the flat ground. */
  height: number;
  /** Fully flat inside this radius. */
  coreRadius: number;
  /** Terrain blends back to natural beyond this radius. */
  blendRadius: number;
}

/**
 * The shape of the world. `heightAt(x, z)` is a pure function of world coordinates (metres) and the seed,
 * so every chunk, LOD level, collider and worker agrees on the same ground - no cracks, nothing stored.
 *
 * Layers: domain-warped fBm hills, ridged mountain ranges, flat plains, flat city sites,
 * mountain rim around N/E/W edges, and sea along the whole southern edge (sea level = 0).
 *
 * STAGE 3: rivers (RiverNetwork) and lakes (LakeSet) are carved into this function in `sample()`.
 */
export class TerrainGenerator {
  private noise: Noise2D;
  readonly sites: CitySite[];
  readonly rivers: RiverNetwork;
  readonly lakes: LakeSet;
  /** STAGE 6: roads + bridges. Cut & fill is applied inside sample(), so every chunk/worker/collider sees the same road. */
  readonly roads: RoadNetwork;
  /** STAGE 12: the railway (plan, long section, structures) and its earthworks, applied after the roads in sample(). */
  readonly rail: RailNetwork;
  readonly railForm: RailFormation;
  /** STAGE 14: the sea port (quay decks, dredged basin, breakwater), applied after the railway in sample(). */
  readonly portForm: PortFormation;
  /** City Mall: a level building pad next to the spawn crossing (applied last in sample(), so it is the same in every chunk, worker and collider). */
  readonly mall = new MallSite();
  private mallMask = new Float32Array(2);
  /** EVLab research campus: a big level pad north-west of the spawn crossing (applied last in sample(), same in every chunk, worker and collider). */
  readonly evlab = new EVLabSite();
  private evlabMask = new Float32Array(2);
  /** City Library: a level building pad south of the F7 road, west of the railway viaduct (applied last in sample(), same in every chunk, worker and collider). */
  readonly library = new LibrarySite();
  private libraryMask = new Float32Array(2);
  /** Prototype building (police station) on the field south of F6, west of F5: a level pad (applied last in sample(), same in every chunk, worker and collider). */
  readonly protoBuilding = new ProtoSite();
  private protoMask = new Float32Array(2);
  /** Airport (north-east): only its own pad + skirt is levelled (applied late in sample(), same in every chunk, worker and collider). */
  readonly airport = new AirportSite();
  /** The SEA AIRPORT (reclaimed land in the sea south of the coast): its own pad + skirt + causeway, filled up to SEA_AIRPORT_FLOOR. */
  readonly airportSea = new AirportSite(SEA_AIRPORT_DEF);
  private airportSeaMask = new Float32Array(2);
  private airportMask = new Float32Array(2);
  /** Army camp (north-west, on the low flat land at the foot of the big hill): only its own pad + skirt is levelled, same rules as the airport. */
  readonly army = new ArmySite();
  private armyMask = new Float32Array(2);
  /** EV Agro Research Institute (west farmland): a level pad for the building and the research field (applied late in sample(), same in every chunk, worker and collider). */
  readonly agro = new AgroSite();
  private agroMask = new Float32Array(2);
  private scratch: TerrainSample = { h: 0, water: NaN, fx: 0, fz: 0 };
  /** The building pads (mall, evlab, library) only exist once their floor heights are known: roads + railway are planned on natural ground. */
  private padsReady = false;
  /** The SWTP (water treatment) and STP (sewage treatment) pads: each digs its own ground, see engineering/InfraSites.ts */
  readonly infra: InfraSite[] = INFRA_PLACEMENTS.map((p) => new InfraSite(p));
  private readonly infraMask = new Float32Array(4);

  constructor(seed: number) {
    this.noise = new Noise2D(seed);
    this.sites = TerrainGenerator.makeSites(seed);
    const base = (x: number, z: number) => this.baseHeightAt(x, z);
    this.rivers = new RiverNetwork(base);
    this.lakes = new LakeSet(seed, base, this.sites, this.rivers);
    // roads are planned on the natural ground INCLUDING the island (the island roads and the long bridge to the island need it)
    this.roads = new RoadNetwork(this.sites, (x, z, o) => this.sampleGround(x, z, o));
    // the port needs the finished roads (it keeps clear of them); it is ready before the railway is planned
    this.portForm = new PortFormation(this.roads);
    // the railway is planned on natural ground + the finished roads (it never touches road earthworks)
    this.rail = new RailNetwork(this);
    this.railForm = new RailFormation(this.rail);
    // the mall floor = the natural ground height at the plot centre (the plot is nearly level there, +-0.4 m)
    // the mall floor = the MEDIAN natural ground over its (bent) plot
    {
      const mh: number[] = [];
      for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
        const x = MALL_PLOT.x0 + ((MALL_PLOT.x1 - MALL_PLOT.x0) * i) / 12, z = MALL_PLOT.z0 + ((MALL_PLOT.z1 - MALL_PLOT.z0) * j) / 12;
        if (!this.mall.onPlot(x, z)) continue;
        this.sampleGround(x, z, this.scratch);
        mh.push(this.scratch.h);
      }
      mh.sort((a, b) => a - b);
      this.mall.floorY = mh[mh.length >> 1];
    }
    // the EVLab floor = the MEDIAN natural ground over the plot (the basin is level; only the far north-west corner climbs into the foothills)
    const hs: number[] = [];
    for (let i = -8; i <= 8; i++) {
      for (let j = -8; j <= 8; j++) {
        this.sampleGround(this.evlab.x + (i * this.evlab.halfX) / 8, this.evlab.z + (j * this.evlab.halfZ) / 8, this.scratch);
        hs.push(this.scratch.h);
      }
    }
    hs.sort((a, b) => a - b);
    this.evlab.floorY = hs[hs.length >> 1];
    // the library floor = the MEDIAN natural ground over its plot (the field is level to a few cm)
    const lh: number[] = [];
    for (let i = 0; i <= 8; i++) {
      for (let j = 0; j <= 8; j++) {
        this.sampleGround(LIBRARY_PLOT.x0 + ((LIBRARY_PLOT.x1 - LIBRARY_PLOT.x0) * i) / 8, LIBRARY_PLOT.z0 + ((LIBRARY_PLOT.z1 - LIBRARY_PLOT.z0) * j) / 8, this.scratch);
        lh.push(this.scratch.h);
      }
    }
    lh.sort((a, b) => a - b);
    this.library.floorY = lh[lh.length >> 1];
    // the prototype building floor = the MEDIAN natural ground over its plot
    {
      const ph: number[] = [];
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
        this.sampleGround(PROTO_PLOT.x0 + ((PROTO_PLOT.x1 - PROTO_PLOT.x0) * i) / 8, PROTO_PLOT.z0 + ((PROTO_PLOT.z1 - PROTO_PLOT.z0) * j) / 8, this.scratch);
        ph.push(this.scratch.h);
      }
      ph.sort((a, b) => a - b);
      this.protoBuilding.floorY = ph[ph.length >> 1];
    }
    // the plants' floor = the MEDIAN natural ground over the pad (the pad is nearly level, a few metres of cut and fill at most)
    for (const site of this.infra) {
      const fh: number[] = [];
      const R = site.rect;
      const pt = { x: 0, z: 0 };
      for (let i = 0; i <= 10; i++) {
        for (let j = 0; j <= 10; j++) {
          site.toWorld(R.x0 + ((R.x1 - R.x0) * i) / 10, R.z0 + ((R.z1 - R.z0) * j) / 10, pt);
          this.sampleGround(pt.x, pt.z, this.scratch);
          fh.push(this.scratch.h);
        }
      }
      fh.sort((a, b) => a - b);
      site.floorY = fh[fh.length >> 1] + site.lift;
    }
    // the airport floor = the MEDIAN natural ground over its pad (rolling land: the pad is cut and filled to this level)
    {
      const R = this.airport.rect, ah: number[] = [];
      for (let i = 0; i <= 30; i++) for (let j = 0; j <= 12; j++) {
        this.sampleGround(R.x0 + ((R.x1 - R.x0) * i) / 30, R.z0 + ((R.z1 - R.z0) * j) / 12, this.scratch);
        ah.push(this.scratch.h);
      }
      ah.sort((a, b) => a - b);
      this.airport.floorY = ah[ah.length >> 1];
    }
    // the sea airport floor = the MEDIAN natural ground over its pad, but never below its fill height (the pad stands in the sea)
    {
      const R = this.airportSea.rect, ah: number[] = [];
      for (let i = 0; i <= 30; i++) for (let j = 0; j <= 12; j++) {
        this.sampleGround(R.x0 + ((R.x1 - R.x0) * i) / 30, R.z0 + ((R.z1 - R.z0) * j) / 12, this.scratch);
        ah.push(this.scratch.h);
      }
      ah.sort((a, b) => a - b);
      this.airportSea.floorY = Math.max(ah[ah.length >> 1], this.airportSea.def.minFloor ?? -1e9);
    }
    // the army camp floor = the MEDIAN natural ground over its pad
    {
      const R = this.army.rect, ah: number[] = [];
      for (let i = 0; i <= 30; i++) for (let j = 0; j <= 12; j++) {
        this.sampleGround(R.x0 + ((R.x1 - R.x0) * i) / 30, R.z0 + ((R.z1 - R.z0) * j) / 12, this.scratch);
        ah.push(this.scratch.h);
      }
      ah.sort((a, b) => a - b);
      this.army.floorY = ah[ah.length >> 1];
    }
    // the Agro institute floor = the MEDIAN natural ground over its pad (farmland: a few metres of cut and fill)
    {
      const R = this.agro.rect, gh: number[] = [];
      for (let i = 0; i <= 24; i++) for (let j = 0; j <= 12; j++) {
        this.sampleGround(R.x0 + ((R.x1 - R.x0) * i) / 24, R.z0 + ((R.z1 - R.z0) * j) / 12, this.scratch);
        gh.push(this.scratch.h);
      }
      gh.sort((a, b) => a - b);
      this.agro.floorY = gh[gh.length >> 1];
    }
    this.padsReady = true;
  }

  makeSample(): TerrainSample {
    return { h: 0, water: NaN, fx: 0, fz: 0 };
  }

  /**
   * Full ground + water information at (x, z):
   *   out.h     ground height (rivers, valleys and lakes already carved in)
   *   out.water water surface height, or NaN if there is no water nearby (water is visible where h < water)
   *   out.fx/fz flow velocity of the water (m/s), 0 for lakes and sea
   */
  sample(x: number, z: number, out: TerrainSample): void {
    this.sampleGround(x, z, out);
    this.roads.apply(x, z, out);
    this.railForm.apply(x, z, out);
    this.portForm.apply(x, z, out); // STAGE 14: sea port earthworks
    // EVLab pad: a road / junction pad keeps its own ground
    if (this.padsReady && this.evlab.near(x, z)) {
      this.roads.maskAt(x, z, 1, this.evlabMask);
      const k = 1 - this.evlabMask[1];
      if (k > 0) out.h = this.evlab.height(x, z, out.h, k);
    }
    // City Mall pad: after the EVLab pad (it has priority where the two skirts meet), and it gives way wherever a road / junction pad covers the ground, so roads stay exactly as planned
    if (this.padsReady && this.mall.near(x, z)) {
      this.roads.maskAt(x, z, 1, this.mallMask);
      const k = 1 - this.mallMask[1];
      if (k > 0) out.h = this.mall.height(x, z, out.h, k);
    }
    // City Library pad: also gives way to roads / junction pads
    if (this.padsReady && this.library.near(x, z)) {
      this.roads.maskAt(x, z, 1, this.libraryMask);
      const k = 1 - this.libraryMask[1];
      if (k > 0) out.h = this.library.height(x, z, out.h, k);
    }
    // Prototype building pad: also gives way to roads / junction pads
    if (this.padsReady && this.protoBuilding.near(x, z)) {
      this.roads.maskAt(x, z, 1, this.protoMask);
      const k = 1 - this.protoMask[1];
      if (k > 0) out.h = this.protoBuilding.height(x, z, out.h, k);
    }
    // Airport pad: gives way to roads and to the railway corridor (the airport branch runs just south of it)
    if (this.padsReady && this.airport.near(x, z) && !this.railForm.inCorridor(x, z, 6)) {
      this.roads.maskAt(x, z, 1, this.airportMask);
      const k = 1 - this.airportMask[1];
      if (k > 0) out.h = this.airport.height(x, z, out.h, k);
    }
    // Sea airport pad + causeway: filled up out of the sea; gives way to roads (the causeway meets the coast road) and to the railway corridor
    if (this.padsReady && this.airportSea.near(x, z) && !this.railForm.inCorridor(x, z, 6)) {
      this.roads.maskAt(x, z, 1, this.airportSeaMask);
      const k = 1 - this.airportSeaMask[1];
      if (k > 0) out.h = this.airportSea.height(x, z, out.h, k);
    }
    // Army camp pad: gives way to roads and to the railway corridor, like the airport
    if (this.padsReady && this.army.near(x, z) && !this.railForm.inCorridor(x, z, 6)) {
      this.roads.maskAt(x, z, 1, this.armyMask);
      const k = 1 - this.armyMask[1];
      if (k > 0) out.h = this.army.height(x, z, out.h, k);
    }
    // Agro institute pad: gives way to roads / junction pads, like the library
    if (this.padsReady && this.agro.near(x, z)) {
      this.roads.maskAt(x, z, 1, this.agroMask);
      const k = 1 - this.agroMask[1];
      if (k > 0) out.h = this.agro.height(x, z, out.h, k);
    }
    // SWTP / STP pads (far from every other pad and road): the ground under the plate is dug out, the skirt grades back to natural ground
    if (this.padsReady) {
      for (const site of this.infra) {
        if (!site.near(x, z)) continue;
        this.roads.maskAt(x, z, 1, this.infraMask);
        const k = 1 - this.infraMask[1];
        if (k > 0) out.h = site.height(x, z, out.h, k);
      }
    }
  }

  /** Natural ground + the main island (no roads): the ground the roads are planned and cut into. */
  sampleGround(x: number, z: number, out: TerrainSample): void {
    this.sampleNatural(x, z, out);
    this.applyIsland(x, z, out);
  }

  /**
   * The main island (Island.ts) is added after rivers and lakes but BEFORE the roads (the island has its own roads and the bridge).
   * Rivers / lakes are planned on baseHeightAt(). Far from the island islandHeight() returns its input.
   */
  private applyIsland(x: number, z: number, out: TerrainSample): void {
    const I = Config.terrain.island;
    if (Math.hypot(x - I.x, z - I.z) > I.radius * (1 + I.wobble) * 1.6) return; // far away: nothing to do
    out.h = islandHeight(this.noise, x, z, out.h);
    if (Number.isNaN(out.water) && out.h < 0.6) out.water = Config.terrain.seaLevel; // sea around the island
  }

  /** Natural ground + water (hills, rivers, lakes, sea) WITHOUT roads. Roads are planned on this. */
  sampleNatural(x: number, z: number, out: TerrainSample): void {
    out.h = this.baseHeightAt(x, z);
    out.water = NaN;
    out.fx = 0;
    out.fz = 0;
    this.rivers.apply(x, z, out);
    this.lakes.apply(x, z, out);
    if (Number.isNaN(out.water) && out.h < 0.6) out.water = Config.terrain.seaLevel; // sea
  }

  /** Terrain height in metres at world position (x, z), including rivers and lakes. */
  heightAt(x: number, z: number): number {
    this.sample(x, z, this.scratch);
    return this.scratch.h;
  }

  /** Deterministic flat zones reserved for future cities. Site 0 is always the map centre (spawn). */
  static makeSites(seed: number): CitySite[] {
    const rng = mulberry32(new Seed(seed).chunkSeed(7, 7));
    const mk = (x: number, z: number): CitySite => ({
      x,
      z,
      height: 14 + rng() * 12,
      coreRadius: 600,
      blendRadius: 1200,
    });
    const sites = [mk(0, 0)];
    let tries = 0;
    while (sites.length < 3 && tries++ < 100) {
      const x = (rng() * 2 - 1) * 3000;
      const z = -3200 + rng() * 4000;
      if (sites.every((s) => Math.hypot(s.x - x, s.z - z) > 2400)) sites.push(mk(x, z));
    }
    return sites;
  }

  /** Natural land only (hills, mountains, plains, cities, coast) - before rivers and lakes are carved in. */
  baseHeightAt(x: number, z: number): number {
    const n = this.noise;
    const half = Config.world.size / 2;

    // Domain warping: bends all features so nothing looks grid-aligned.
    const wx = x + 140 * n.fbm(x * 0.0008 + 17.3, z * 0.0008 - 4.1, 3);
    const wz = z + 140 * n.fbm(x * 0.0008 - 9.7, z * 0.0008 + 31.9, 3);

    // Large-scale masks
    const mMask = smoothstep(-0.14, 0.26, n.fbm(wx * 0.00032 + 100, wz * 0.00032 - 40, 3));
    const plain = smoothstep(0.02, 0.38, -n.fbm(wx * 0.00022 - 70, wz * 0.00022 + 30, 2)) * (1 - mMask);
    const lowN = n.fbm(wx * 0.00018, wz * 0.00018, 2);
    const ridge = n.ridged(wx * 0.00085 + 5, wz * 0.00085 + 9, 5);
    const hills = n.fbm(wx * 0.0026, wz * 0.0026, 4);
    const detail = n.fbm(x * 0.011, z * 0.011, 3);

    // Coast line: sea occupies the southern edge (+z). The line wiggles so it is not straight.
    const coastLine = 2300 + 380 * n.fbm(x * 0.0006 + 3, z * 0.0006 + 3, 3);
    const landMul = 1 - 0.92 * smoothstep(coastLine - 1000, coastLine + 100, z);

    // Base land + rolling hills + fine detail
    let h = 30 + lowN * 8;
    h += hills * 32 * (1 - 0.88 * plain) * landMul;
    h += detail * 2.2;

    // Mountain ranges (ridged noise)
    h += mMask * (40 + 360 * Math.pow(ridge, 1.2)) * landMul;

    // Flat plains
    h = lerp(h, 14 + lowN * 3 + detail * 1.2, plain * 0.85);

    // Flat, gentle zones reserved for cities
    for (const s of this.sites) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d >= s.blendRadius) continue;
      const t = 1 - smoothstep(s.coreRadius, s.blendRadius, d);
      h = lerp(h, s.height + detail * 0.8 + hills * 1.5, t);
    }

    // Mountain rim along north, east and west edges (hides the end of the world)
    const e = Math.min(z + half, half - x, half + x);
    const rim = 1 - smoothstep(-800, 1500, e);
    h += rim * rim * (200 + 260 * ridge);

    // Soft ceiling so nothing exceeds Config.terrain.maxHeight
    const top = Config.terrain.maxHeight - 250;
    if (h > top) h = top + 250 * Math.tanh((h - top) / 250);

    // Sea along the southern edge
    const t = smoothstep(coastLine, coastLine + 1400, z);
    const seaFloor = -45 - 45 * smoothstep(coastLine + 1400, coastLine + 3200, z);
    h = h * (1 - t) + seaFloor * t;

    return h;
  }
}
