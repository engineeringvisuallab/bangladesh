import { GeoRef, type Bounds, type Gcp } from './GeoRef';
import { TILE_SIZE_M, tileOrigin, type TileIndex } from './Tiles';

/** A named place on a reference image whose position we want to double-check (shown as a pillar in the viewer). */
export interface CheckpointDef {
  id: string;
  name: string;
  px: number;
  py: number;
}

/** One georeferenced picture of the ground (photo, screenshot, map). Several can overlap; the finest one is drawn on top. */
export interface ReferenceDef {
  id: string;
  /** File name; the sources live in `sources/<region>/` (not shipped), the game uses the generated `ground/` tiles. */
  image: string;
  width: number;
  height: number;
  gcps: Gcp[];
  checkpoints?: CheckpointDef[];
  note?: string;
}

/** What `public/regions/<id>/region.json` contains. Everything about a city lives in its own folder. */
export interface RegionDef {
  id: string;
  name: string;
  nameBn?: string;
  references: ReferenceDef[];
  terrain: {
    type: 'flat';
    /** Ground height of the flat terrain above the scene datum (m). Replaced by a real height-map later. */
    elevationM: number;
  };
  /** File (in the same folder) with the roads of this city, see roads/RoadData.ts. */
  roads?: string;
}

export class Region {
  readonly id: string;
  readonly name: string;
  readonly nameBn: string;
  /** One georeference per entry of `def.references`, same order. */
  readonly georefs: GeoRef[];
  /** Union of all references. */
  readonly bounds: Bounds;
  readonly def: RegionDef;

  constructor(def: RegionDef) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.nameBn = def.nameBn ?? def.name;
    if (def.references.length === 0) throw new Error(`region ${def.id}: no references`);
    this.georefs = def.references.map((r) => GeoRef.fit(r.gcps, r.width, r.height));
    const bs = this.georefs.map((g) => g.bounds());
    this.bounds = {
      minE: Math.min(...bs.map((b) => b.minE)),
      maxE: Math.max(...bs.map((b) => b.maxE)),
      minN: Math.min(...bs.map((b) => b.minN)),
      maxN: Math.max(...bs.map((b) => b.maxN)),
    };
  }

  get center(): { e: number; n: number } {
    return { e: (this.bounds.minE + this.bounds.maxE) / 2, n: (this.bounds.minN + this.bounds.maxN) / 2 };
  }

  contains(e: number, n: number): boolean {
    const b = this.bounds;
    return e >= b.minE && e <= b.maxE && n >= b.minN && n <= b.maxN;
  }

  /** True if any part of the tile lies inside this region's references. */
  intersectsTile(t: TileIndex): boolean {
    const o = tileOrigin(t);
    const b = this.bounds;
    return o.e < b.maxE && o.e + TILE_SIZE_M > b.minE && o.n < b.maxN && o.n + TILE_SIZE_M > b.minN;
  }

  /** Every global tile that touches this region's references (same set `tools/build_ground.py` writes). */
  tiles(): TileIndex[] {
    const b = this.bounds;
    const i0 = Math.floor(b.minE / TILE_SIZE_M);
    const i1 = Math.ceil(b.maxE / TILE_SIZE_M) - 1;
    const j0 = Math.floor(b.minN / TILE_SIZE_M);
    const j1 = Math.ceil(b.maxN / TILE_SIZE_M) - 1;
    const out: TileIndex[] = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push({ i, j });
    return out;
  }

  checkpoints(): { id: string; name: string; e: number; n: number }[] {
    const out: { id: string; name: string; e: number; n: number }[] = [];
    this.def.references.forEach((ref, k) => {
      for (const c of ref.checkpoints ?? []) {
        const p = this.georefs[k].pixelToEN(c.px, c.py);
        out.push({ id: c.id, name: c.name, e: p.e, n: p.n });
      }
    });
    return out;
  }
}
