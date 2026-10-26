// Headless bird test: npx tsx scripts/bird-test.ts
import * as THREE from 'three';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BirdManager } from '../src/birds/BirdManager';
import { createBirdGeometry } from '../src/birds/BirdModel';
import { Config } from '../src/core/Config';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};
const gen = new TerrainGenerator(Config.world.seed);
const root = new THREE.Group();
const birds = new BirdManager(root, gen, Config.world.seed);
console.log(`${birds.flockCount} flocks, ${birds.total} birds`);
const g = createBirdGeometry();
ok(g.getAttribute('aWing').count === g.getAttribute('position').count, 'every bird vertex has a wing weight');

for (const focus of [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-2400, 20, 150)]) {
  const b = new BirdManager(root, gen, Config.world.seed);
  const p = new THREE.Vector3();
  let bad = 0;
  let minAgl = Infinity;
  let maxDist = 0;
  let near = 0;
  const t0 = performance.now();
  const N = 60 * 240;
  for (let s = 0; s < N; s++) {
    b.update(1 / 60, s / 60, focus);
    if (s % 60 !== 0) continue;
    near = 0;
    for (let i = 0; i < b.total; i++) {
      b.positionOf(i, p);
      if (![p.x, p.y, p.z].every(Number.isFinite)) bad++;
      minAgl = Math.min(minAgl, p.y - Math.max(0, gen.heightAt(p.x, p.z)));
      const d = Math.hypot(p.x - focus.x, p.z - focus.z);
      maxDist = Math.max(maxDist, d);
      if (d < 900) near++;
    }
  }
  const ms = (performance.now() - t0) / N;
  console.log(`focus (${focus.x}, ${focus.z}): min height above ground ${minAgl.toFixed(1)} m, max distance ${maxDist.toFixed(0)} m, ${near}/${b.total} birds within 900 m, ${ms.toFixed(3)} ms per update`);
  ok(bad === 0, 'all bird positions are finite');
  ok(minAgl > 5, 'birds never fly into the ground (> 5 m clearance)');
  ok(maxDist < 1500, 'flocks stay within 1.5 km of the player');
  ok(near > b.total * 0.6, 'most birds are near enough to be seen');
  ok(ms < 1, 'updating all birds costs under 1 ms');
  b.dispose();
}
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
