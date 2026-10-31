import * as THREE from 'three';
import { Region, WorldFrame, enToLonLat, tileOf, type RegionDef } from './geo';
import { Config } from './core/Config';
import { EventBus, type EngineEvents } from './core/EventBus';
import { DriveSystem } from './game/DriveSystem';
import { InputManager } from './input/InputManager';
import { OrbitCamera } from './camera/OrbitCamera';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { SPECS } from './vehicles/VehicleSpec';
import type { VehicleDeps } from './vehicles/Vehicle';
import { RoadMeshes } from './roads/RoadMeshes';
import { RoadNetwork } from './roads/RoadNetwork';
import type { RoadsFile } from './roads/RoadData';
import { FloatingOrigin } from './world/FloatingOrigin';
import { FlatHeightfield, type Heightfield } from './world/Heightfield';
import { GroundPhysics } from './world/GroundPhysics';
import { GroundTerrain } from './world/GroundTerrain';
import { TerrainStreamer } from './world/TerrainStreamer';

const FIXED_DT = 1 / 60;

async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  const hud = document.getElementById('hud')!;
  hud.textContent = 'Loading regions...';

  // ---- data: every city listed in regions/index.json ----
  const index = await loadJson<{ regions: string[] }>('./regions/index.json');
  const regions: Region[] = [];
  for (const id of index.regions) regions.push(new Region(await loadJson<RegionDef>(`./regions/${id}/region.json`)));
  if (regions.length === 0) throw new Error('regions/index.json lists no regions');
  const roadFiles: RoadsFile[] = [];
  for (const r of regions) if (r.def.roads) roadFiles.push(await loadJson<RoadsFile>(`./regions/${r.id}/${r.def.roads}`));
  const home = regions[0];
  const frame = WorldFrame.nearest(home.center.e, home.center.n);

  // ---- three.js ----
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ec8ea);
  scene.fog = new THREE.Fog(0xb8d4ea, 2500, 7000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6f8450, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-300, 800, -200);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(Config.camera.fov, window.innerWidth / window.innerHeight, Config.camera.near, Config.camera.far);
  camera.rotation.order = 'YXZ';

  // ---- ground height: one Heightfield per region (flat for now) ----
  const heightfields = new Map<string, Heightfield>(regions.map((r) => [r.id, new FlatHeightfield(r.def.terrain.elevationM)]));
  const heightOf = (r: Region): Heightfield => heightfields.get(r.id)!;
  const groundHeight = (x: number, z: number): number => {
    const e = frame.toE(x);
    const n = frame.toN(z);
    for (const r of regions) if (r.contains(e, n)) return heightOf(r).heightAt(x, z);
    return heightOf(home).heightAt(x, z); // outside every region: continue the home ground
  };

  const terrainView = new TerrainStreamer(frame, regions, heightOf);
  scene.add(terrainView.group);
  terrainView.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  // ---- roads: grip for the physics + meshes on the ground ----
  const roads = new RoadNetwork(roadFiles, frame);
  scene.add(new RoadMeshes(roads, groundHeight).group);

  // ---- physics, input, vehicles ----
  const bus = new EventBus<EngineEvents>();
  hud.textContent = 'Starting physics...';
  const physics = await PhysicsWorld.create(bus);
  const origin = new FloatingOrigin(scene, bus);
  const input = new InputManager(renderer.domElement, bus);
  const terrain = new GroundTerrain(groundHeight, roads);
  const ground = new GroundPhysics(physics, frame, regions, groundHeight);
  const vehicleDeps: VehicleDeps = { physics, terrain, origin, scene, bus };
  const drive = new DriveSystem({
    vehicle: vehicleDeps,
    ground,
    input,
    project: (w) => {
      const p = w.clone().project(camera);
      if (p.z > 1) return null;
      return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight };
    },
  });

  // lineup on the airport apron (two rows, nose along the apron's long side); fallback: the middle of the region
  const apron = roads.area('apron');
  const ids = Object.keys(SPECS) as (keyof typeof SPECS)[];
  const perRow = Math.ceil(ids.length / 2);
  let sx = frame.toX(home.center.e);
  let sz = frame.toZ(home.center.n);
  if (apron && apron.xs.length === 4) {
    const ux = apron.xs[1] - apron.xs[0];
    const uz = apron.zs[1] - apron.zs[0];
    const ul = Math.hypot(ux, uz);
    const vx = apron.xs[3] - apron.xs[0];
    const vz = apron.zs[3] - apron.zs[0];
    const vl = Math.hypot(vx, vz);
    const yaw = Math.atan2(ux, uz); // vehicle nose along the long side
    ids.forEach((id, i) => {
      const a = (8 + (i % perRow) * ((ul - 16) / (perRow - 1))) / ul;
      const b = (vl * 0.25 + Math.floor(i / perRow) * vl * 0.5) / vl;
      drive.spawnParked(SPECS[id], apron.xs[0] + ux * a + vx * b, apron.zs[0] + uz * a + vz * b, yaw);
    });
    sx = apron.xs[0] + ux * 0.5 + vx * 0.5;
    sz = apron.zs[0] + uz * 0.5 + vz * 0.5;
  } else {
    ids.forEach((id, i) => drive.spawnParked(SPECS[id], sx + ((i % perRow) - (perRow - 1) / 2) * 14, sz - 40 - Math.floor(i / perRow) * 18, Math.PI));
  }

  // ---- check-point pillars: fly to one and compare the HUD lat/lon with Google Earth ----
  const checks: { name: string; x: number; z: number }[] = [];
  const pillarGeo = new THREE.CylinderGeometry(4, 4, 200, 8);
  const pillarMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  for (const r of regions) {
    for (const c of r.checkpoints()) {
      const x = frame.toX(c.e);
      const z = frame.toZ(c.n);
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(x, groundHeight(x, z) + 100, z);
      scene.add(pillar);
      checks.push({ name: c.name, x, z });
    }
  }

  // ---- cameras: fly camera ("you") or the orbit camera while driving ----
  const orbit = new OrbitCamera(camera, input, drive.vehicles[0], physics, terrain, origin);
  camera.position.set(sx, groundHeight(sx, sz) + 7, sz + 30); // south of the apron, looking north
  let yaw = 0;
  let pitch = -0.2;
  let flySpeed = 25;
  let messageTimer = 0;
  let hudMessage = '';
  addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const focus = new THREE.Vector3();
  let acc = 0;
  let last = performance.now();
  let hudTimer = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    // fixed-step physics (60 Hz), then interpolate for rendering
    acc += dt;
    let steps = 0;
    while (acc >= FIXED_DT && steps < 5) {
      drive.fixedUpdate(FIXED_DT);
      physics.step();
      drive.afterStep();
      acc -= FIXED_DT;
      steps++;
    }
    if (steps === 5) acc = 0;
    const alpha = acc / FIXED_DT;

    // keys that work everywhere
    if (input.wasPressed('KeyB')) terrainView.setSatellite(!terrainView.satelliteOn);
    if (input.wasPressed('KeyK')) {
      const en = frame.toEN(camera.position.x, camera.position.z);
      const ll = enToLonLat(en.e, en.n);
      void navigator.clipboard?.writeText(`${ll.lat.toFixed(6)}, ${ll.lon.toFixed(6)}`).catch(() => undefined);
    }
    const wasDriving = drive.driver;
    drive.handleKeys(camera.position);
    if (drive.driver && drive.driver !== wasDriving) orbit.setTarget(drive.driver, 8, 3, 30);

    if (drive.driver) {
      input.consumeMouseDelta(); // the orbit camera reads it itself; nothing left over for the fly camera
      orbit.update(dt);
      drive.driver.getWorldPosition(focus);
    } else {
      if (wasDriving) {
        // just got out: stand next to the door, look the way the vehicle points
        const v = wasDriving;
        v.doorPosition(focus);
        camera.position.set(focus.x, groundHeight(focus.x, focus.z) + 1.8, focus.z);
        v.forwardVector(fwd);
        yaw = Math.atan2(-fwd.x, -fwd.z);
        pitch = -0.1;
      }
      const md = input.consumeMouseDelta();
      yaw -= md.x * Config.camera.mouseSensitivity;
      pitch = Math.max(-1.55, Math.min(1.55, pitch - md.y * Config.camera.mouseSensitivity));
      const wheel = input.consumeWheel();
      if (wheel !== 0) flySpeed = Math.max(2, Math.min(3000, flySpeed * (wheel < 0 ? 1.18 : 1 / 1.18)));
      camera.rotation.set(pitch, yaw, 0);
      camera.getWorldDirection(fwd);
      right.crossVectors(fwd, up).normalize();
      const v = flySpeed * (input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? 4 : 1) * dt;
      if (input.isDown('KeyW')) camera.position.addScaledVector(fwd, v);
      if (input.isDown('KeyS')) camera.position.addScaledVector(fwd, -v);
      if (input.isDown('KeyD')) camera.position.addScaledVector(right, v);
      if (input.isDown('KeyA')) camera.position.addScaledVector(right, -v);
      if (input.isDown('Space') || input.isDown('KeyE')) camera.position.y += v;
      if (input.isDown('KeyC') || input.isDown('KeyQ')) camera.position.y -= v;
      const floor = groundHeight(camera.position.x, camera.position.z) + 1.7;
      if (camera.position.y < floor) camera.position.y = floor;
      focus.copy(camera.position);
    }

    ground.update(dt, focus.x, focus.z);
    drive.update(alpha, focus, dt);
    terrainView.update(camera.position.x, camera.position.z);
    renderer.render(scene, camera);
    input.endFrame();

    hudTimer -= dt;
    if (drive.message) {
      messageTimer = 3;
      hudMessage = drive.message;
      drive.message = '';
    }
    messageTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.1;
      const en = frame.toEN(camera.position.x, camera.position.z);
      const ll = enToLonLat(en.e, en.n);
      const t = tileOf(en.e, en.n);
      let near = 'none';
      let best = Infinity;
      for (const c of checks) {
        const d = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
        if (d < best) {
          best = d;
          near = `${c.name} - ${best.toFixed(0)} m`;
        }
      }
      const nr = roads.nearest(camera.position.x, camera.position.z);
      const lines = [
        `${home.name} / ${home.nameBn}  -  stage 2: airport + main road`,
        `E ${en.e.toFixed(1)}   N ${en.n.toFixed(1)}   (national grid, UTM-45N)`,
        `${ll.lat.toFixed(6)} N   ${ll.lon.toFixed(6)} E     tile ${t.i},${t.j}`,
        `tiles ${terrainView.loadedCount}/${terrainView.tileCount}   ground colliders ${ground.activeCount}   nearest check pillar: ${near}`,
        `road: ${nr ? `${nr.road.name} - ${nr.distance.toFixed(0)} m` : 'none'}   surface here: ${roads.surfaceAt(camera.position.x, camera.position.z) ? 'asphalt' : 'ground'}`,
      ];
      if (drive.driver) {
        lines.push('', drive.hudLine(), 'W/S gas+brake  A/D steer  Space handbrake  E/Q gear  G auto  R reset  H horn  F get out');
      } else {
        lines.push('', `fly speed ${flySpeed.toFixed(0)} m/s`, 'click = look | WASD | Space/E up | C/Q down | Shift fast | wheel speed | F get in (within 7 m)');
      }
      lines.push('B map on/off | K copy lat,lon');
      if (messageTimer > 0) lines.push('', hudMessage);
      hud.textContent = lines.join('\n');
    }
  });
}

boot().catch((err: unknown) => {
  const hud = document.getElementById('hud');
  if (hud) hud.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
