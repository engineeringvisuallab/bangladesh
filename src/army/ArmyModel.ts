// ARMY CAMP: three.js wrapper (the only file of the module that imports three). The group is in the local frame, placed at the site.
import * as THREE from 'three';
import { buildArmyMesh } from './ArmyMesh';
import type { ArmyPlan } from './ArmyPlan';
import type { MeshArrays } from '../airport/MeshBuilder';

export interface ArmyModel { group: THREE.Group; dispose(): void }

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

export function createArmyModel(plan: ArmyPlan): ArmyModel {
  const data = buildArmyMesh(plan);
  const groundGeo = toGeometry(data.ground), solidGeo = toGeometry(data.solid);
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = 'army-ground';
  ground.receiveShadow = true;
  const solid = new THREE.Mesh(solidGeo, solidMat);
  solid.name = 'army-solid';
  solid.castShadow = true;
  solid.receiveShadow = true;
  const group = new THREE.Group();
  group.name = 'army-camp';
  group.add(ground, solid);
  group.rotation.y = plan.site.heading;
  return { group, dispose(): void { groundGeo.dispose(); solidGeo.dispose(); groundMat.dispose(); solidMat.dispose(); } };
}
