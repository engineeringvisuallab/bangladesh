// Runtime test of FillBuildings (Step 2: instancing + chunk LOD), headless (fake DOM for the building textures).
// It cannot be run with plain tsx (the building textures are .jpg imports): use
//   npm run test:fill-runtime            (bundles with esbuild, then runs with node)
import * as THREE from 'three';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { FillBuildings, FILL_DETAIL_DIST, FILL_PROXY_DIST } from '../src/buildings/FillBuildings';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { BUILDING_MODEL_BY_ID } from '../src/buildings/models/registry';
import { FILL_MODEL_BY_ID, FILL_BUILDING_MODELS } from '../src/buildings/models/fillRegistry';

// minimal DOM so THREE.TextureLoader / canvas helpers do not throw in node
const fakeEl = (): any => ({ addEventListener() {}, removeEventListener() {}, style: {}, getContext: () => null, set src(_v: string) {}, width: 0, height: 0 });
(globalThis as any).document = { createElementNS: fakeEl, createElement: fakeEl };

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// every model id used by the fill exists, and its real footprint (built model, rounded up) is what the placement table says
{
  const bad: string[] = [];
  for (const id of new Set(FILL_PLACEMENTS.map((p) => p.id))) {
    const def = FILL_MODEL_BY_ID[id];
    const p = FILL_PLACEMENTS.find((q) => q.id === id)!;
    if (!def) { bad.push(id + ' (unknown)'); continue; }
    const b = def.build(1);
    if (Math.abs(b.width - p.W) > 1 || Math.abs(b.depth - p.D) > 1) bad.push(`${id} (built ${b.width}x${b.depth}, table ${p.W}x${p.D})`);
    b.dispose();
  }
  ok(bad.length === 0, `model footprints match the placement table (${bad.join(', ') || 'all ok'})`);
  ok(FILL_BUILDING_MODELS.every((m) => !BUILDING_MODEL_BY_ID[m.id]), 'compact models are separate from the 55 hand placed models');
  ok(FILL_BUILDING_MODELS.every((m) => FILL_PLACEMENTS.some((p) => p.id === m.id)), 'every compact model is used by the fill');
}

const terrain = new TerrainGenerator(Config.world.seed);
const root = new THREE.Group();
const pos = new THREE.Vector3(5000, 0, 5000); // far away
const fb = new FillBuildings({ root, terrain, playerWorld: (out) => out.copy(pos) });

const visibleMeshes = (): number => {
  let n = 0;
  root.traverse((o) => {
    let vis = true;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
    if ((o as THREE.InstancedMesh).isInstancedMesh && vis && (o as THREE.InstancedMesh).count > 0) n++;
  });
  return n;
};

const s0 = fb.stats;
ok(s0.buildings === FILL_PLACEMENTS.length, `all ${FILL_PLACEMENTS.length} fill buildings are in chunks (${s0.buildings}), ${s0.chunks} chunks`);

// far away: nothing is drawn
for (let i = 0; i < 5; i++) fb.update();
ok(visibleMeshes() === 0 && fb.stats.drawCalls === 0, 'far away: nothing visible, no draw calls');

// in the middle of the city: boxes first, then full models as templates are warmed up
pos.set(0, 0, 0);
fb.update();
let st = fb.stats;
ok(st.proxy + st.detail > 0, `in the city: chunks are shown straight away (${st.proxy} box chunks, ${st.detail} detail chunks)`);
let frames = 1;
while (frames < 3000 && fb.stats.drawCalls >= 0) {
  fb.update(); frames++;
  const now = fb.stats;
  // done when every chunk within detail range is in detail
  if (now.proxy === 0 || frames > 2500) break;
  // chunks beyond detail range legitimately stay proxy: stop once templates stop growing
  if (frames > 200 && now.templates === st.templates && frames % 50 === 0) break;
  st = now;
}
st = fb.stats;
console.log('after', frames, 'frames:', JSON.stringify(st));
ok(st.detail > 0, `full instanced models appear near the player (${st.detail} chunks)`);
ok(st.templates > 0 && st.templates <= 60 * 4, `models built once and shared (${st.templates} templates for ${st.buildings} buildings)`);
ok(st.shown === st.buildings, `every building is drawn, as model or box (${st.shown} of ${st.buildings})`);
ok(st.drawCalls < st.buildings * 1.5, `draw calls (${st.drawCalls}) well below the ~${Math.round(st.buildings * 6.5)} the same buildings needed one by one`);
ok(visibleMeshes() === st.drawCalls, `stats match the scene (${visibleMeshes()} visible instanced meshes)`);

// detail only close, boxes in the middle distance, nothing beyond
ok(FILL_DETAIL_DIST < FILL_PROXY_DIST, 'detail range is smaller than the box range');

// walk away: everything hides again (after the hysteresis)
pos.set(0, 0, FILL_PROXY_DIST + 3000);
for (let i = 0; i < 20; i++) fb.update();
ok(visibleMeshes() === 0, 'walking away: everything is hidden again');

// walk back: shown again without rebuilding the templates
const tBefore = fb.stats.templates;
pos.set(0, 0, 0);
for (let i = 0; i < 20; i++) fb.update();
ok(visibleMeshes() > 0 && fb.stats.templates === tBefore, 'coming back: shown again, templates are reused');

fb.dispose();
ok(root.children.length === 0, 'dispose removes everything from the scene');
console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
