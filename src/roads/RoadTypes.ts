/** Data shapes of the road network. Roads are SPLINES (centreline + width + type), never meshes. */

/** Road hierarchy, built one tier per stage: 1 main (freeway), 2 primary (arterial), 3 secondary (collector), 4 tertiary (local). */
export type RoadTier = 1 | 2 | 3 | 4;
export type RoadKind = 'highway' | 'arterial' | 'collector' | 'local' | 'roundabout';
export type BridgeType = 'beam' | 'arch';
/** What a wheel / foot touches: 0 = natural ground (grass, dirt), 1 = asphalt, 2 = gravel shoulder. */
export type SurfaceKind = 0 | 1 | 2;

export interface RoadSpec {
  id: number;
  tier: RoadTier;
  kind: RoadKind;
  /** Short code for UI / info cards, e.g. "H1", "L3", "R1". */
  name: string;
  /** Earthen (kacha) track: dirt surface, no markings, no traffic, no junction pads. */
  earth?: boolean;
  closed: boolean;
  /** Distance between centreline points (m). */
  step: number;
  /** Half width of the asphalt (m). */
  halfWidth: number;
  /** Extra gravel shoulder on each side (m). */
  shoulder: number;
  lanes: number;
  speedKmh: number;
  /** Max allowed grade (rise/run). */
  maxGrade: number;
  xs: Float64Array;
  zs: Float64Array;
  /** Finished road surface height (m). */
  ys: Float64Array;
  /** Natural ground height under each point before the road was cut in (m). */
  hNat: Float32Array;
  /** Unit "left" normal at each point (x, z). */
  nx: Float32Array;
  nz: Float32Array;
  /** Distance along the road from point 0 (m); `length` is the total. */
  cum: Float64Array;
  length: number;
  /** Bridge id per point, -1 = on the ground. */
  bridgeOf: Int16Array;
  /** Tier 4 only: id of the CityPlan area this street belongs to (connectors: the area of their first node). */
  areaId?: string;
}

export interface BridgeSpec {
  id: number;
  roadId: number;
  /** First / last centreline point index of the deck (inclusive). */
  i0: number;
  i1: number;
  type: BridgeType;
  /** Wet width crossed (m) - the real "span" to bridge. */
  spanM: number;
  /** Deck length incl. approaches on both banks (m). */
  lengthM: number;
  deckHalfWidth: number;
  /** Highest water surface under the deck (m). */
  waterY: number;
  /** Clear height between water and the underside of the deck (m). */
  clearanceM: number;
  /** Structural material key (UI text lives in i18n). */
  material: 'prestressed-concrete' | 'steel';
  /** Design load limit (tonnes) for the Stage 11 info card. */
  maxLoadT: number;
  /** Largest single span between piers (m). */
  maxSpanM: number;
  centerX: number;
  centerZ: number;
}

/** A short river crossing (< 20 m): the road runs on an embankment with a pipe/box culvert underneath. */
export interface CulvertSpec {
  id: number;
  roadId: number;
  x: number;
  z: number;
  widthM: number;
  roadY: number;
  waterY: number;
}

export interface JunctionSpec {
  x: number;
  z: number;
  y: number;
  type: 'T' | '4way' | 'roundabout';
}

export interface RoadInfo {
  roadId: number;
  name: string;
  kind: RoadKind;
  surface: SurfaceKind;
  widthM: number;
  lanes: number;
  speedKmh: number;
  material: 'asphalt';
  bridge: BridgeSpec | null;
}

/**
 * An engineered at-grade intersection ("junction pad"). All arms are straightened and meet at one centre point;
 * the carriageway of the junction is ONE flat polygon (plane y = y + a*(x-x0) + b*(z-z0)) with kerb-return fillets,
 * so roads never overlap each other (no z-fighting, no cut & fill fighting) and every corner has a real turning radius.
 */
export interface PadSpec {
  id: number;
  x: number;
  z: number;
  /** Plane of the pad surface: height(x, z) = y + a * (x - this.x) + b * (z - this.z). */
  y: number;
  a: number;
  b: number;
  /** Terrain is exactly the plane within this radius; it blends back to the natural ground over `emb` metres. */
  rCore: number;
  emb: number;
  /** Asphalt outline (x, z pairs, counter-clockwise) and the gravel shoulder outline (same vertex count, vertex k outside outline k). */
  outline: Float32Array;
  gravel: Float32Array;
  /** Paint quads: 9 floats each = kind (-1 white, -2 yellow), then 4 corners (x, z). */
  marks: Float32Array;
  /** Number of arms and the road ids that meet here (UI / debug). */
  arms: { roadId: number; theta: number; kind: RoadKind }[];
  kind: 'T' | '4way' | 'multi' | 'bend';
}
