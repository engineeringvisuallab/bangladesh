import { GeoRef, type Bounds, type Gcp } from './GeoRef';
import { TILE_SIZE_M, type TileIndex } from './Tiles';

/** A named place on the reference image whose position we want to double-check (shown as a pillar in the viewer). */
export interface CheckpointDef {
  id: string;
  name: string;
  px: number;
  py: number;
}

/** What `public/regions/<id>/region.json` contains. Everything about a city lives in its own folder. */
export interface RegionDef {
  id: string;
  name: string;
  nameBn?: string;
  reference: {
    /** File name inside the region folder. */
    image: string;
    width: number;
    height: number;
    gcps: Gcp[];
    checkpoints?: CheckpointDef[];
    note?: string;
  };
  terrain: {
    type: 'flat';
    /** Ground height of the flat terrain above the scene datum (m). Replaced by a real height-map later. */
    elevationM: number;
  };
}

export class Region {
  readonly id: string;
  readonly name: string;
  readonly nameBn: string;
  readonly georef: GeoRef;
  readonly bounds: Bounds;
  readonly def: RegionDef;

  constructor(def: RegionDef) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.nameBn = def.nameBn ?? def.name;
    this.georef = GeoRef.fit(def.reference.gcps, def.reference.width, def.reference.height);
    this.bounds = this.georef.bounds();
  }

  get center(): { e: number; n: number } {
    return { e: (this.bounds.minE + this.bounds.maxE) / 2, n: (this.bounds.minN + this.bounds.maxN) / 2 };
  }

  contains(e: number, n: number): boolean {
    const b = this.bounds;
    return e >= b.minE && e <= b.maxE && n >= b.minN && n <= b.maxN;
  }

  /** Every global tile that touches this region's reference image. */
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
    return (this.def.reference.checkpoints ?? []).map((c) => {
      const p = this.georef.pixelToEN(c.px, c.py);
      return { id: c.id, name: c.name, e: p.e, n: p.n };
    });
  }
}
