import { Config } from '../src/core/Config';
import { ACCESS, stationAccesses } from '../src/rail/StationAccess';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';

/**
 * Station shelter posts (headless, no physics): the four posts of every gate shelter stand ON the stair walls (1.66 m either side of the stair axis)
 * and the foot of each rests on the wall top (over the landing: platform + wall height, over the steps: the step under it + wall height), so no post
 * floats in the air or hangs over the steps; the top of every post touches the roof.
 */
let bad = 0;
const fail = (m: string): void => {
  bad++;
  console.log('FAIL', m);
};
const gen = new TerrainGenerator(Config.world.seed);
const list = stationAccesses(gen.rail, (x, z) => gen.heightAt(x, z));
let checked = 0;
for (const a of list) {
  const roof = a.boxes.find((b) => b.kind === 'roof');
  if (!roof) { fail(`${a.station}: no roof`); continue; }
  const roofBottom = roof.y - roof.hh;
  const lat = (x: number, z: number): number => (x - a.top.x) * a.ox + (z - a.top.z) * a.oz; // along the stair axis, 0 = platform centre line
  const across = (x: number, z: number): number => (x - a.top.x) * a.tx + (z - a.top.z) * a.tz;
  for (const b of a.boxes) {
    if (b.kind !== 'post') continue;
    // the two posts of the entrance sign at the foot (1.9 m from the axis, on the ground) are not shelter posts
    if (Math.abs(Math.abs(across(b.x, b.z) - across(roof.x, roof.z)) - (ACCESS.width / 2 + 0.3)) < 0.05) continue;
    checked++;
    const foot = b.y - b.hh;
    const l = lat(b.x, b.z);
    const ac = Math.abs(across(b.x, b.z) - across(roof.x, roof.z));
    if (Math.abs(ac - (ACCESS.width / 2 + ACCESS.wall / 2)) > 0.05) fail(`${a.station}: post is ${ac.toFixed(2)} m from the stair axis, not on the wall`);
    let surf = a.top.y; // landing
    if (a.steps.length && l > lat(a.steps[0].x, a.steps[0].z) - ACCESS.run / 2) {
      let best = 1e9;
      for (const s of a.steps) {
        const d = Math.abs(lat(s.x, s.z) - l);
        if (d < best) { best = d; surf = s.y; }
      }
    }
    const past = a.steps.length > 0 && l > lat(a.steps[a.steps.length - 1].x, a.steps[a.steps.length - 1].z) + ACCESS.run / 2 + 1e-6;
    if (past) {
      // beyond the last step (a short stair on high ground): the post stands on the ground
      if (Math.abs(foot - (gen.heightAt(b.x, b.z) - 0.3)) > 0.05) fail(`${a.station}: post past the stair foot ${foot.toFixed(2)} is not on the ground ${gen.heightAt(b.x, b.z).toFixed(2)}`);
    } else if (Math.abs(foot - (surf + ACCESS.wallH - 0.1)) > 0.25) fail(`${a.station}: post foot ${foot.toFixed(2)} but the wall top there is ${(surf + ACCESS.wallH).toFixed(2)}`);
    if (Math.abs(b.y + b.hh - (roofBottom - 0.0)) > 0.25) fail(`${a.station}: post top ${(b.y + b.hh).toFixed(2)} does not reach the roof ${roofBottom.toFixed(2)}`);
  }
}
console.log(`${list.length} stair accesses, ${checked} shelter posts checked`);
console.log(bad === 0 ? 'ALL OK' : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
