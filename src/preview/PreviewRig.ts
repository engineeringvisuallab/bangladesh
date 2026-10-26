import * as THREE from 'three';
import { CityLibrary } from '../library';
import { EVLab } from '../evlab';
import { hitsCollider, type Collider, type Structure } from '../structures';

/**
 * Dev-only viewer for CityLibrary / EVLab (not part of the game build).
 * Open /preview-library.html or /preview-evlab.html while `npm run dev` is running.
 */
export function startPreview(kind: 'library' | 'evlab', host: HTMLElement): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;touch-action:none';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbcd7ee);
  scene.fog = new THREE.Fog(0xb4d4ee, kind === 'evlab' ? 250 : 60, kind === 'evlab' ? 1100 : 160);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.2, 2500);
  // three >= r155: light intensities are physical, so these are the old values x PI.
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x8a7a66, 0.9 * Math.PI));
  const sun = new THREE.DirectionalLight(0xfff3d6, 0.7 * Math.PI);
  sun.position.set(200, 300, 150);
  scene.add(sun);

  const s: Structure = kind === 'library' ? new CityLibrary() : new EVLab();
  scene.add(s.group);
  const lib = s instanceof CityLibrary ? s : null;
  const lab = s instanceof EVLab ? s : null;
  if (lib) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x7e9a66 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    scene.add(ground);
  }

  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:8px;top:8px;padding:8px 12px;border-radius:10px;background:rgba(0,0,0,.6);color:#fff;font:14px Arial,sans-serif;max-width:60vw';
  host.appendChild(hud);
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:8px;right:8px;top:56px;display:flex;gap:6px;overflow-x:auto';
  host.appendChild(bar);
  if (lab) {
    const mk = (label: string, fn: () => void): void => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = fn;
      bar.appendChild(b);
    };
    mk('Overview', () => { P.x = 0; P.y = 240; P.z = 420; P.yaw = 0; P.pit = -0.5; P.fly = true; });
    mk('Gate', () => { P.x = 0; P.y = 1.7; P.z = 335; P.yaw = 0; P.pit = 0; P.fly = false; });
    lab.buildings.forEach((b, i) => mk(b.name, () => { const v = lab.viewpoint(i); P.x = v.x; P.z = v.z; P.yaw = v.yaw; P.pit = 0; P.y = 1.7; P.fly = false; }));
  }

  const P = { x: 0, y: 1.7, z: lib ? 20 : 340, yaw: 0, pit: 0, fly: false };
  const keys: Record<string, boolean> = {};
  window.addEventListener('keydown', (e: KeyboardEvent) => { const k = e.key.toLowerCase(); keys[k] = true; if (k === 'f' && lab) { P.fly = !P.fly; if (!P.fly) P.y = 1.7; } });
  window.addEventListener('keyup', (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; });
  let drag = false;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e: PointerEvent) => { drag = true; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointerup', () => { drag = false; });
  el.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drag) return;
    P.yaw -= e.movementX * 0.0027;
    P.pit = Math.max(-1.45, Math.min(1.45, P.pit - e.movementY * 0.0027));
  });

  const cols: readonly Collider[] = s.colliders;
  const free = (x: number, z: number): boolean => {
    if (lib) {
      const inside = lib.contains(x, z);
      const porch = Math.abs(x) < 2.5 && z >= 15 && z < 60;
      if (!inside && !porch) return false;
    } else if (Math.abs(x) > 297 || z > 297 || z < -297) {
      if (!(Math.abs(x) < 9 && z >= 290 && z < 700)) return false;
    }
    return !hitsCollider(cols, x, z);
  };

  const ray = new THREE.Raycaster();
  const resize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let frame = 0;
  let label = '';
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const f = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
    const st = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    P.yaw -= ((keys.arrowright ? 1 : 0) - (keys.arrowleft ? 1 : 0)) * 1.8 * dt;
    const sp = (P.fly ? (keys.shift ? 140 : 45) : keys.shift ? (lib ? 5 : 16) : lib ? 2.4 : 6) * dt;
    const sy = Math.sin(P.yaw);
    const cy = Math.cos(P.yaw);
    const hc = P.fly ? Math.cos(P.pit) : 1;
    const dx = (-sy * f * hc + cy * st) * sp;
    const dz = (-cy * f * hc - sy * st) * sp;
    if (P.fly) {
      P.x += dx;
      P.z += dz;
      P.y = Math.max(3, P.y + Math.sin(P.pit) * f * sp);
    } else {
      if (free(P.x + dx, P.z)) P.x += dx;
      if (free(P.x, P.z + dz)) P.z += dz;
    }
    camera.position.set(P.x, P.y, P.z);
    camera.rotation.set(P.pit, P.yaw, 0, 'YXZ');
    s.update(t);
    if (++frame % 8 === 0) {
      if (lib) {
        ray.setFromCamera(new THREE.Vector2(0, 0), camera);
        const b = lib.bookAt(ray);
        label = b ? `${b.title} - ${b.author} (${b.year}) - ${b.section}` : lib.zoneAt(P.x, P.z) ?? 'Main hall';
      } else if (lab) label = lab.zoneAt(P.x, P.z) + (P.fly ? ' (flying)' : '');
      hud.textContent = label + '   |   WASD move, Shift run, drag to look' + (lab ? ', F fly' : '');
    }
    renderer.render(scene, camera);
  });
}
