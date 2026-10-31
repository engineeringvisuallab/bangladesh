/** The roads of one city, as stored in `public/regions/<id>/roads.json`. Coordinates are [easting, northing] in metres of the national projection. */
export type RoadClass = 'highway' | 'access' | 'runway' | 'taxiway';

export interface RoadDef {
  id: string;
  name: string;
  kind: RoadClass;
  /** Paved width (m). */
  width: number;
  points: [number, number][];
}

/** A paved surface without a centre line (apron, car park): a convex polygon. */
export interface AreaDef {
  id: string;
  name: string;
  kind: 'apron';
  points: [number, number][];
}

export interface RoadsFile {
  roads: RoadDef[];
  areas: AreaDef[];
}
