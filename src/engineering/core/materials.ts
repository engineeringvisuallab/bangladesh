import * as THREE from 'three';

interface MatOpts {
  rough?: number;
  metal?: number;
  opacity?: number;
}
const std = (color: number, o: MatOpts = {}): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0.05 });
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = false;
  }
  return m;
};

/** Pipe colours = what flows inside (explained in the intro narration and the on-screen legend). */
export const PIPE_COLORS = {
  raw: 0x8a6a3b,
  settled: 0xb59a6b,
  filtered: 0x2a7fc4,
  chemical: 0xe8c21a,
  chlorine: 0xa8c61e,
  sludge: 0x4d4a3f,
  backwash: 0x5d7a6a,
  delivery: 0x16508f,
  sewage: 0x7a3f2a,
  effluent: 0x6fb7d6,
  air: 0xaab7c4,
  biogas: 0xe07a1f,
  // thermal power plant
  gas: 0xf4d35e,
  steam: 0xd9dde3,
  feedwater: 0x3a86c8,
  cooling: 0x2ec4b6,
  flue: 0x6b6b6b,
  // hydropower station
  penstock: 0x5f7f9f,
} as const;
export type PipeKind = keyof typeof PIPE_COLORS;

export function createMaterials() {
  const pipe = {} as Record<PipeKind, THREE.MeshStandardMaterial>;
  (Object.keys(PIPE_COLORS) as PipeKind[]).forEach((k) => (pipe[k] = std(PIPE_COLORS[k], { rough: 0.5, metal: 0.25 })));
  return {
    pipe,
    grass: std(0x5f8f4a),
    gravel: std(0xa7a69c, { rough: 1 }),
    asphalt: std(0x3a3d40, { rough: 0.95 }),
    lawn: std(0x6aa04f),
    soil: std(0x7a6a50),
    concrete: std(0xbab8b0),
    concreteDark: std(0x8c8b85),
    wall: std(0xe6e2d6),
    roof: std(0x6b6f73),
    door: std(0x3b5c8a),
    glass: std(0x1e3345, { rough: 0.2, metal: 0.3 }),
    steel: std(0x6e757c, { rough: 0.45, metal: 0.6 }),
    yellow: std(0xe0b020),
    red: std(0xb03a2e),
    white: std(0xf2f2f2),
    motor: std(0x2b63b0, { rough: 0.5, metal: 0.3 }),
    casing: std(0x4f5a63, { rough: 0.5, metal: 0.4 }),
    sand: std(0xd9c58a),
    gravelBed: std(0x8a8f94),
    trunk: std(0x5a4128),
    foliage: std(0x3f7d3a),
    fenceMesh: std(0x9aa3a8, { opacity: 0.28 }),
    sludge: std(0x5a4a36, { rough: 1 }),
    chimney: std(0x7b7f83),
    // water: the colour goes from muddy (river) to clear (treated)
    riverWater: std(0x7a7a55, { opacity: 0.88, rough: 0.2 }),
    waterTurbid: std(0x8d7a52, { opacity: 0.88, rough: 0.2 }),
    waterFloc: std(0x9c8b64, { opacity: 0.85, rough: 0.2 }),
    waterSettled: std(0x7fa3a8, { opacity: 0.82, rough: 0.2 }),
    waterFiltered: std(0x4aa3c9, { opacity: 0.8, rough: 0.2 }),
    waterClear: std(0x3b8fd0, { opacity: 0.8, rough: 0.2 }),
    waterSewage: std(0x5f5440, { opacity: 0.93, rough: 0.3 }),
    waterPrimary: std(0x6f6650, { opacity: 0.92, rough: 0.3 }),
    waterAeration: std(0x8a7650, { opacity: 0.92, rough: 0.3 }),
    foam: std(0xeeeeee, { opacity: 0.7, rough: 1 }),
    membrane: std(0x6aa37a, { rough: 0.7 }),
    concreteDS: Object.assign(std(0xbab8b0), { side: THREE.DoubleSide }),
  };
}
export type Mats = ReturnType<typeof createMaterials>;
