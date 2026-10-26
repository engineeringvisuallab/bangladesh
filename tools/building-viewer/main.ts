import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BUILDING_MODELS, BUILDING_MODEL_BY_ID } from '../../src/buildings/models/registry';

// Stand-alone viewer for the building models. Not part of the game.
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4e0);
scene.fog = new THREE.Fog(0x9fc4e0, 150, 500);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x7a7a60, 1.1));
const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.position.set(60, 100, 50);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 400 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ color: 0x8a9a6a }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// 1.75 m person for scale
const person = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.3, 4, 8), new THREE.MeshLambertMaterial({ color: 0xd04030 }));
scene.add(person);

let current: { root: THREE.Object3D; dispose(): void } | null = null;
const sel = document.getElementById('sel') as HTMLSelectElement;
const info = document.getElementById('info')!;
for (const m of BUILDING_MODELS) sel.add(new Option(`${m.id}  —  ${m.bn}`, m.id));

function show(id: string): void {
  const def = BUILDING_MODEL_BY_ID[id];
  if (!def) return;
  if (current) { scene.remove(current.root); current.dispose(); }
  const b = def.build(0);
  scene.add(b.root);
  current = b;
  sel.value = id;
  const size = Math.max(b.width, b.depth, b.height * 0.9);
  person.position.set(b.width / 2 + 1.5, 0.87, b.depth / 2 + 1.5);
  const dist = Math.max(size * 1.2, b.height * 1.5);
  camera.position.set(dist * 0.7, b.height * 0.5 + dist * 0.18, dist * 0.95);
  controls.target.set(0, b.height * 0.4, 0);
  controls.update();
  info.textContent = `${def.bn} · ${def.en} · ${b.width.toFixed(0)}×${b.depth.toFixed(0)} m, h ${b.height.toFixed(0)} m`;
}
sel.onchange = () => show(sel.value);
const step = (d: number) => show(BUILDING_MODELS[(BUILDING_MODELS.findIndex((m) => m.id === sel.value) + d + BUILDING_MODELS.length) % BUILDING_MODELS.length]!.id);
(document.getElementById('prev') as HTMLButtonElement).onclick = () => step(-1);
(document.getElementById('next') as HTMLButtonElement).onclick = () => step(1);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
(window as unknown as { __show: (id: string, az?: number, zoom?: number, tx?: number, tz?: number) => void }).__show = (id, az = 0, zoom = 1, tx = 0, tz = 0) => {
  show(id);
  const p = camera.position.clone().sub(controls.target);
  p.applyAxisAngle(new THREE.Vector3(0, 1, 0), az).multiplyScalar(zoom);
  controls.target.set(tx, controls.target.y * (zoom < 1 ? 0.4 : 1), tz);
  camera.position.copy(controls.target).add(p);
  controls.update();
};
show(new URLSearchParams(location.search).get('id') ?? BUILDING_MODELS[0]!.id);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
