// Adapter: the real terrain (heights, water, roads, rail, pads) + world zones + planned buildings -> the planner's FarmGround.
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { getWorldZoneAt } from '../city/WorldZones';
import { agroKeepout } from '../agro/AgroSite';
import { placementContains } from '../buildings/Placements';
import type { FarmGround, Probe } from './FarmPlan';

export function terrainGround(t: TerrainGenerator): FarmGround {
  const s = t.makeSample();
  const m = new Float32Array(4);
  const pads = [t.agro, t.army, t.mall, t.evlab, t.library, t.protoBuilding, t.airport, ...t.infra] as { near(x: number, z: number): boolean }[];
  return {
    probe(x: number, z: number, o: Probe): void {
      t.sample(x, z, s);
      o.h = s.h;
      o.wet = !Number.isNaN(s.water) && s.h < s.water + 0.5;
      t.roads.maskAt(x, z, 1, m);
      let blocked = m[0] > 0 || m[1] > 0 || t.railForm.inCorridor(x, z, 10) || agroKeepout(x, z) || placementContains(x, z, 8);
      for (let i = 0; i < pads.length && !blocked; i++) blocked = pads[i].near(x, z);
      o.blocked = blocked;
    },
    zone: (x, z) => {
      const h = getWorldZoneAt(x, z);
      return { id: h.id, kind: h.kind };
    },
  };
}
