import * as THREE from 'three';
import { Region, WorldFrame, enToLonLat, tileOf, type RegionDef } from './geo';
import { FlatHeightfield, type Heightfield } from './world/Heightfield';
import { TerrainStreamer } from './world/TerrainStreamer';

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

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 12000);
  camera.rotation.order = 'YXZ';

  // ---- terrain (flat for now; one Heightfield per region) ----
  const heightfields = new Map<string, Heightfield>(regions.map((r) => [r.id, new FlatHeightfield(r.def.terrain.elevationM)]));
  const heightOf = (r: Region): Heightfield => heightfields.get(r.id)!;
  const terrain = new TerrainStreamer(frame, regions, heightOf);
  scene.add(terrain.group);

  const loader = new THREE.TextureLoader();
  for (const r of regions) {
    loader.load(
      `./regions/${r.id}/${r.def.reference.image}`,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        terrain.setReferenceTexture(r.id, tex);
      },
      undefined,
      () => console.warn(`could not load the reference image of ${r.id}`),
    );
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
      pillar.position.set(x, heightOf(r).heightAt(x, z) + 100, z);
      scene.add(pillar);
      checks.push({ name: c.name, x, z });
    }
  }

  // ---- free-fly camera ----
  const start = home.georef.pixelToEN(1405, 583); // the "Bogura" label of the reference image
  camera.position.set(frame.toX(start.e), 260, frame.toZ(start.n) + 420);
  let yaw = 0;
  let pitch = -0.45;
  let speed = 60;
  const keys = new Set<string>();
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyB') terrain.setSatellite(!terrain.satelliteOn);
    if (e.code === 'KeyK') {
      const en = frame.toEN(camera.position.x, camera.position.z);
      const ll = enToLonLat(en.e, en.n);
      void navigator.clipboard?.writeText(`${ll.lat.toFixed(6)}, ${ll.lon.toFixed(6)}`).catch(() => undefined);
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  renderer.domElement.addEventListener('click', () => void renderer.domElement.requestPointerLock());
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * 0.0022;
    pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * 0.0022));
  });
  addEventListener(
    'wheel',
    (e) => {
      speed = Math.max(2, Math.min(3000, speed * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
    },
    { passive: true },
  );
  addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let last = performance.now();
  let hudTimer = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    camera.rotation.set(pitch, yaw, 0);
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, up).normalize();
    const v = speed * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1) * dt;
    if (keys.has('KeyW')) camera.position.addScaledVector(fwd, v);
    if (keys.has('KeyS')) camera.position.addScaledVector(fwd, -v);
    if (keys.has('KeyD')) camera.position.addScaledVector(right, v);
    if (keys.has('KeyA')) camera.position.addScaledVector(right, -v);
    if (keys.has('Space') || keys.has('KeyE')) camera.position.y += v;
    if (keys.has('KeyC') || keys.has('KeyQ')) camera.position.y -= v;
    const ground = heightOf(home).heightAt(camera.position.x, camera.position.z) + 2;
    if (camera.position.y < ground) camera.position.y = ground;

    terrain.update(camera.position.x, camera.position.z);
    renderer.render(scene, camera);

    hudTimer -= dt;
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
      hud.textContent = [
        `${home.name} / ${home.nameBn}  -  stage 1: terrain (flat) + reference map`,
        `E ${en.e.toFixed(1)}   N ${en.n.toFixed(1)}   (national grid, UTM-45N)`,
        `${ll.lat.toFixed(6)} N   ${ll.lon.toFixed(6)} E     tile ${t.i},${t.j}`,
        `height ${camera.position.y.toFixed(0)} m   speed ${speed.toFixed(0)} m/s   tiles ${terrain.loadedCount}/${terrain.tileCount}`,
        `nearest check pillar: ${near}`,
        '',
        'click = look | WASD move | Space/E up | C/Q down | Shift fast | wheel speed | B map on/off | K copy lat,lon',
      ].join('\n');
    }
  });
}

boot().catch((err: unknown) => {
  const hud = document.getElementById('hud');
  if (hud) hud.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
