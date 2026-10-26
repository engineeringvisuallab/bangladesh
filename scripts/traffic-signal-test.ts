// Headless test of the traffic signals (src/traffic/TrafficSignals.ts): which junctions get one, the phase plan never shows two
// conflicting greens, the AI brake limit stops cars at red, and a vehicle that crosses a stop line on red is booked (once).
// npx tsx scripts/traffic-signal-test.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RoadGraph } from '../src/traffic/RoadGraph';
import { TrafficSignals } from '../src/traffic/TrafficSignals';
import { GoldConfig, accidentFine } from '../src/economy/Gold';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};

const gen = new TerrainGenerator(Config.world.seed);
const graph = new RoadGraph(gen.roads);
const sg = new TrafficSignals(graph);
const pads = gen.roads.pads;
const multi = pads.filter((p) => p.arms.length >= 3).length;
console.log(`pads ${pads.length}, with 3+ legs ${multi}, with signals ${sg.pads.length}`);

ok(sg.pads.length > 40 && sg.pads.length === multi, `signals on ${sg.pads.length} of ${multi} junctions with 3+ legs: the WHOLE map is covered`);
ok(sg.pads.every((s) => s.arms.length >= 3 && s.arms.length === s.pad.arms.length), 'every signal junction has a lamp pole for each of its legs');
ok(sg.pads.every((s) => s.arms.every((a) => a.stopS > 3 && a.stopS < s.pad.rCore + 2)), 'every stop line lies inside the levelled junction pad');
ok(sg.pads.every((s) => s.arms.every((a) => Math.hypot(a.poleX - s.pad.x, a.poleZ - s.pad.z) < s.pad.rCore + 6)), 'every pole stands on / right next to the pad');
ok(sg.pads.every((s) => s.arms.every((a) => Number.isFinite(a.poleY) && Math.abs(a.poleY - s.pad.y) < 12)), 'every pole has a sane ground height');
const nGroups = (s: (typeof sg.pads)[number]): number => new Set(s.arms.map((a) => a.group)).size;
ok(sg.pads.filter((s) => s.pad.arms.length === 3).every((s) => nGroups(s) === 2 || nGroups(s) === 3), 'a T-junction has 2 phases (through road + stem), 3 if its legs are not in line');
ok(sg.pads.filter((s) => s.pad.arms.length === 4).every((s) => nGroups(s) === 2 || nGroups(s) === 3), 'a 4-way junction has 2 phases (opposite legs together), 3 if it is a skewed one');
ok(sg.pads.filter((s) => s.pad.arms.length === 4 && nGroups(s) === 2).length >= 20, 'most 4-way junctions are plain 2-phase crossings');

// the incoming lane side: a point of the road lane 24 m before the centre must be on the side the pole stands on
let sideBad = 0;
const tmp = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
for (const s of sg.pads) {
  for (const a of s.arms) {
    const st = graph.stations(a.roadId).find((q) => q.pad === s.padId);
    if (!st) continue;
    graph.at(a.roadId, st.s, 1, 0, tmp);
    const toward = tmp.hx * -a.dx + tmp.hz * -a.dz >= 0 ? 1 : -1;
    const c0 = { x: 0, z: 0, y: 0, hx: 0, hz: 0 };
    graph.at(a.roadId, st.s - toward * 24, toward as 1 | -1, 0, c0);
    graph.at(a.roadId, st.s - toward * 24, toward as 1 | -1, graph.laneOffset(a.roadId), tmp);
    const lat = (tmp.x - c0.x) * a.lx + (tmp.z - c0.z) * a.lz; // lane relative to the road centre line
    if (Math.sign(lat) !== a.side) sideBad++;
  }
}
ok(sideBad === 0, `the pole of every leg is on the kerb of the incoming (left-hand) lane (${sideBad} wrong)`);

// phases: never two conflicting greens, every group gets a green, nobody is green during the all-red gap
let conflict = 0;
let neverGreen = 0;
let shortest = Infinity;
for (const s of sg.pads) {
  const seen = new Set<number>();
  for (let t = 0; t < s.cycle; t += 0.25) {
    const greens = new Set<number>();
    for (const a of s.arms) {
      const l = sg.groupLight(s, a.group, t);
      if (l !== 'red') greens.add(a.group);
      if (l === 'green') seen.add(a.group);
    }
    if (greens.size > 1) conflict++;
  }
  if (seen.size !== new Set(s.arms.map((a) => a.group)).size) neverGreen++;
  shortest = Math.min(shortest, ...s.green);
}
ok(conflict === 0, `no two conflicting groups are ever green / yellow together (${conflict} bad samples)`);
ok(neverGreen === 0, 'every leg gets a green phase in every cycle');
ok(shortest >= 15, `shortest green is ${shortest} s`);
const cyc = sg.pads.map((s) => s.cycle);
console.log(`cycle length ${Math.min(...cyc).toFixed(0)}..${Math.max(...cyc).toFixed(0)} s`);

// AI brake limit + player red-light booking on one real junction
const s0 = sg.pads.find((s) => s.arms.length === 4) ?? sg.pads[0];
const k = 0;
const arm = s0.arms[k];
// choose a time when this leg is red (and has been red for a while), and one when it is green
let tRed = -1;
let tGreen = -1;
for (let t = 0; t < s0.cycle * 2; t += 0.5) {
  sg.now = t;
  if (tRed < 0 && sg.light(s0, k) === 'red' && sg.redFor(s0, k) > 3) tRed = t;
  if (tGreen < 0 && sg.light(s0, k) === 'green') tGreen = t;
}
ok(tRed >= 0 && tGreen >= 0, 'the first leg of the test junction has both a red and a green time');
const fx = -arm.dx;
const fz = -arm.dz; // heading toward the centre
const front = (s: number) => ({ x: s0.pad.x + arm.dx * s + arm.lx * arm.side * 1.5, z: s0.pad.z + arm.dz * s + arm.lz * arm.side * 1.5 });
// car 12 m before the stop line at 12 m/s (front bumper = position + 2.2 m)
const pos = front(arm.stopS + 12 + 2.2);
sg.now = tRed;
const limRed = sg.brakeLimit(pos.x - fx * 2.2, pos.z - fz * 2.2, fx, fz, 12, 2.2);
ok(Number.isFinite(limRed) && limRed > 0 && limRed < 12, `red: a car 12 m before the line may go at most ${limRed.toFixed(1)} m/s (below 12)`);
const near = front(arm.stopS + 0.5);
ok(sg.brakeLimit(near.x - fx * 2.2, near.z - fz * 2.2, fx, fz, 1, 2.2) === 0, 'red: a car at the stop line must stand still (limit 0)');
// stopping physics: from 12 m/s the braking curve must reach the line before it (v^2 = 2 a gap)
const gap = 12 - 0.4;
ok(Math.abs(limRed - Math.sqrt(2 * 2.6 * gap)) < 1.5, 'the limit follows a gentle braking curve toward the line');
sg.now = tGreen;
ok(sg.brakeLimit(pos.x - fx * 2.2, pos.z - fz * 2.2, fx, fz, 12, 2.2) === Infinity, 'green: nothing limits the car');
sg.now = tRed;
const wrongWay = sg.brakeLimit(pos.x + fx * 2.2, pos.z + fz * 2.2, -fx, -fz, 12, 2.2);
ok(wrongWay === Infinity, 'a car driving AWAY from the junction is not stopped');
const past = front(arm.stopS - 6);
ok(sg.brakeLimit(past.x - fx * 2.2, past.z - fz * 2.2, fx, fz, 8, 2.2) === Infinity, 'a car already inside the junction clears it (never stops in the middle)');

// player: crossing on red is booked once, on green not, slowly rolling (<2 m/s) not
sg.now = tRed;
const a0 = front(arm.stopS + 1.2);
const a1 = front(arm.stopS - 0.3);
ok(sg.redLightCrossing(a0.x, a0.z, a1.x, a1.z, 10) !== null, 'red: crossing the stop line at speed is booked');
ok(sg.redLightCrossing(a0.x, a0.z, a1.x, a1.z, 10) === null, 'the same run is not booked twice');
sg.now = tRed + 20;
ok(sg.redLightCrossing(a0.x, a0.z, a1.x, a1.z, 1) === null, 'crawling (<2 m/s) is not booked');
sg.now = tGreen + 40 * s0.cycle;
sg.now = tGreen;
ok(sg.redLightCrossing(a1.x, a1.z, a0.x, a0.z, 10) === null, 'driving out of the junction (wrong direction of the line) is not booked');
const sg2 = new TrafficSignals(graph);
sg2.now = tGreen;
ok(sg2.redLightCrossing(a0.x, a0.z, a1.x, a1.z, 10) === null, 'green: crossing is fine');

// the Gold rules: start 10,000; red light 10; accident 500 x vehicle type + 500 per person killed; criminal reward 200
ok(GoldConfig.startBalance === 10000, 'the player starts with 10,000 Gold');
ok(GoldConfig.signalFine === 10, 'a red light costs 10 Gold');
ok(GoldConfig.criminalReward === 200, 'killing a criminal pays 200 Gold');
ok(accidentFine([], 0) === 500, 'an accident with people only (nobody killed) costs the 500 base');
ok(accidentFine(['sedan'], 0) === 500, 'hitting a sedan costs 500');
ok(accidentFine(['bike'], 0) < 500 && accidentFine(['bus'], 0) > 500 && accidentFine(['hypercar'], 0) > accidentFine(['bus'], 0), 'the fine grows with the type of the vehicle: bike < sedan < bus < hypercar');
ok(accidentFine([], 3) === 500 + 3 * GoldConfig.accidentKillExtra, 'every person killed adds to the fine');
ok(accidentFine(['bus', 'sedan'], 2) === Math.round(500 * (1.6 + 1.0)) + 2 * GoldConfig.accidentKillExtra, 'two vehicles + two dead = both vehicle types and both victims are counted');

console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
