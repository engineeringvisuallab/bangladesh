// AIRPLANE: three.js wrapper (the only file of the module that imports three). The group's origin is on the ground under the fuselage centre,
// nose towards local +X. Use `place()` each frame with the state from AirplaneLogic (position, heading, pitch, roll, gear).
import * as THREE from 'three';
import { buildPlaneMesh } from './AirplaneMesh';
import { buildFighterMesh } from './FighterMesh';
import type { MeshArrays } from '../airport/MeshBuilder';

export interface AirplaneModel {
  group: THREE.Group;
  setGear(down: boolean): void;
  /** x, y, z in world metres (y = height of the wheels' ground level); heading in rad (0 = nose towards +X, increasing towards +Z... see AirplaneLogic), pitch + = nose up, roll + = right wing down. */
  place(x: number, y: number, z: number, heading: number, pitch: number, roll: number): void;
  dispose(): void;
}

function toGeometry(a: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.colors, 3));
  g.setIndex(new THREE.BufferAttribute(a.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** 'airliner' (the passenger jet) or 'fighter' (a small military jet). */
export type AirplaneKind = 'airliner' | 'fighter';

export function createAirplaneModel(kind: AirplaneKind = 'airliner'): AirplaneModel {
  const data = kind === 'fighter' ? buildFighterMesh() : buildPlaneMesh();
  const bodyGeo = toGeometry(data.body), gearGeo = toGeometry(data.gear);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
  const body = new THREE.Mesh(bodyGeo, mat), gear = new THREE.Mesh(gearGeo, mat);
  body.castShadow = gear.castShadow = true;
  body.name = 'airplane-body';
  gear.name = 'airplane-gear';
  const group = new THREE.Group();
  group.name = kind === 'fighter' ? 'fighter' : 'airplane';
  group.add(body, gear);
  group.rotation.order = 'YZX'; // yaw, then pitch (about the wing axis), then roll (about the fuselage axis)
  return {
    group,
    setGear(down: boolean): void { gear.visible = down; },
    place(x, y, z, heading, pitch, roll): void {
      group.position.set(x, y, z);
      // three.js rotation.y = +a turns local +X towards -Z; our heading convention: (cos h, sin h) in the (x, z) plane, so rotation.y = -h
      group.rotation.set(roll, -heading, pitch);
    },
    dispose(): void { bodyGeo.dispose(); gearGeo.dispose(); mat.dispose(); },
  };
}
