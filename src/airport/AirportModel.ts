/**
 * Airport — three.js wrapper. The only file in this module that imports three.
 * Returns a Group in the local frame, already placed/rotated at the site.
 * NOTE: nothing here adds the group to a scene — the caller decides that.
 */

import * as THREE from 'three';
import { buildAirportMesh } from './AirportMesh';
import type { AirportPlan } from './AirportPlan';
import type { MeshArrays } from './MeshBuilder';

export interface AirportModel {
  group: THREE.Group;
  /** 0 = day, 1 = full night (dims/brightens the lights) */
  setNight(level: number): void;
  dispose(): void;
}

function toGeometry(a: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.colors, 3));
  g.setIndex(new THREE.BufferAttribute(a.indices, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function createAirportModel(plan: AirportPlan): AirportModel {
  const data = buildAirportMesh(plan);

  const groundGeo = toGeometry(data.ground);
  const solidGeo = toGeometry(data.solid);
  const lightGeo = toGeometry(data.lights);

  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = 'airport-ground';
  ground.receiveShadow = true;

  const solid = new THREE.Mesh(solidGeo, solidMat);
  solid.name = 'airport-solid';
  solid.castShadow = true;
  solid.receiveShadow = true;

  const lights = new THREE.Mesh(lightGeo, lightMat);
  lights.name = 'airport-lights';

  const group = new THREE.Group();
  group.name = 'airport';
  group.add(ground, solid, lights);
  group.position.set(plan.site.cx, plan.site.groundY, plan.site.cz);
  group.rotation.y = plan.site.heading;

  const setNight = (level: number): void => {
    const n = Math.min(1, Math.max(0, level));
    lightMat.color.setScalar(0.35 + 0.65 * n);
  };
  setNight(0);

  return {
    group,
    setNight,
    dispose(): void {
      groundGeo.dispose(); solidGeo.dispose(); lightGeo.dispose();
      groundMat.dispose(); solidMat.dispose(); lightMat.dispose();
    },
  };
}
