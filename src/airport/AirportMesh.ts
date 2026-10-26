/**
 * Airport — plan -> geometry (typed arrays, local frame, no three.js).
 * Three layers so the renderer can give each its own material:
 *   ground : pavement + paint   (receives shadows, polygon-offset)
 *   solid  : buildings & props  (casts shadows)
 *   lights : emissive points    (unlit material, night-dimmable)
 */

import { AIRPORT_COLORS as C, AIRPORT_SPEC as S } from './AirportSpec';
import type { RGB } from './AirportSpec';
import type { AirportPlan, LightColor, PavementKind } from './AirportPlan';
import { MeshBuilder } from './MeshBuilder';
import type { MeshArrays } from './MeshBuilder';

export interface AirportMeshData {
  ground: MeshArrays;
  solid: MeshArrays;
  lights: MeshArrays;
}

const PAVEMENT_COLOR: Record<PavementKind, RGB> = {
  shoulder: C.shoulder, runway: C.runway, taxiway: C.taxiway, connector: C.taxiway,
  apron: C.apron, parking: C.parking, road: C.road,
};

const LIGHT_COLOR: Record<LightColor, RGB> = {
  white: C.lightWhite, green: C.lightGreen, red: C.lightRed, blue: C.lightBlue, amber: C.lightAmber,
};

export function buildAirportMesh(plan: AirportPlan): AirportMeshData {
  const ground = new MeshBuilder();
  const solid = new MeshBuilder();
  const lights = new MeshBuilder();

  // ---------------------------------------------------------------- ground
  for (const p of plan.pavements) {
    const y = p.kind === 'runway' ? S.y.runway : S.y.pavement;
    ground.rect(p.cx, p.cz, p.w, p.d, y, PAVEMENT_COLOR[p.kind]);
  }

  // helipad disc (ring + dark centre)
  const hp = plan.helipad;
  ground.disc(hp.x, hp.z, hp.radius, S.y.marking, C.white);
  ground.disc(hp.x, hp.z, hp.radius - 1.2, S.y.marking2, C.helipadDisc);

  for (const m of plan.markings) {
    const y = m.layer === 2 ? S.y.marking3 : m.layer === 1 ? S.y.marking2 : S.y.marking;
    ground.rect(m.cx, m.cz, m.w, m.d, y, m.color === 'yellow' ? C.yellow : C.white);
  }

  // ---------------------------------------------------------------- solid
  for (const b of plan.buildings) {
    switch (b.kind) {
      case 'terminal': {
        solid.box(b.cx, 0, b.cz, b.w, b.h, b.d, C.terminal);
        solid.box(b.cx, b.h, b.cz, b.w + 4, 0.8, b.d + 4, C.terminalRoof); // roof slab
        // glass bands front/back
        solid.box(b.cx, 2, b.cz - b.d / 2 - 0.08, b.w - 6, 6, 0.2, C.glass);
        solid.box(b.cx, 2, b.cz + b.d / 2 + 0.08, b.w - 6, 6, 0.2, C.glass);
        break;
      }
      case 'jetbridge': {
        solid.box(b.cx, 3.2, b.cz, b.w, b.h, b.d, C.jetbridge);
        solid.box(b.cx, 2.6, b.cz - b.d / 2, 4.6, 5.6, 4.6, C.jetbridge); // docking cab
        solid.box(b.cx, 0, b.cz - b.d / 2, 0.5, 2.6, 0.5, C.pole); // support leg
        break;
      }
      case 'tower': {
        const shaftH = b.h;
        solid.box(b.cx, 0, b.cz, b.w, shaftH, b.d, C.towerShaft);
        solid.frustum(b.cx, shaftH, b.cz, b.w, b.d, S.tower.cab, S.tower.cab, 3.5, C.towerCab);
        solid.box(b.cx, shaftH + 3.5, b.cz, S.tower.cab, S.tower.cabH, S.tower.cab, C.glass);
        solid.box(b.cx, shaftH + 3.5 + S.tower.cabH, b.cz, S.tower.cab + 1.5, 0.8, S.tower.cab + 1.5, C.terminalRoof);
        solid.box(b.cx, shaftH + 3.5 + S.tower.cabH + 0.8, b.cz, 0.4, 5, 0.4, C.pole); // mast
        break;
      }
      case 'hangar': {
        const roof = C.hangarRoofs[b.tint % C.hangarRoofs.length] ?? C.terminalRoof;
        solid.gable(b.cx, 0, b.cz, b.w, b.d, b.h, S.hangar.roofH, C.hangarWall, roof);
        solid.box(b.cx, 0, b.cz - b.d / 2 - 0.1, b.w * 0.75, b.h * 0.8, 0.3, C.hangarDoor); // door (taxiway side)
        break;
      }
    }
  }

  // floodlight poles
  for (const p of plan.poles) {
    solid.box(p.x, 0, p.z, 0.5, p.h, 0.5, C.pole);
    solid.box(p.x, p.h, p.z, 3, 0.6, 1.6, C.pole);
  }

  // windsock
  const ws = plan.windsock;
  solid.box(ws.x, 0, ws.z, 0.3, 7, 0.3, C.pole);
  solid.box(ws.x + 0.9, 6.2, ws.z, 1.5, 0.6, 0.6, C.sockOrange);
  solid.box(ws.x + 2.4, 6.2, ws.z, 1.5, 0.6, 0.6, C.sockWhite);
  solid.box(ws.x + 3.9, 6.2, ws.z, 1.5, 0.6, 0.6, C.sockOrange);

  // perimeter fence (axis-aligned segments)
  for (const f of plan.fence) {
    const t = S.fence.thickness;
    const cx = (f.x0 + f.x1) / 2;
    const cz = (f.z0 + f.z1) / 2;
    const w = Math.abs(f.x1 - f.x0) || t;
    const d = Math.abs(f.z1 - f.z0) || t;
    solid.box(cx, 0, cz, w, S.fence.height, d, C.fence);
  }

  // ---------------------------------------------------------------- lights
  for (const l of plan.lights) {
    lights.box(l.x, l.y - 0.2, l.z, 0.45, 0.4, 0.45, LIGHT_COLOR[l.color]);
  }

  return { ground: ground.build(), solid: solid.build(), lights: lights.build() };
}
