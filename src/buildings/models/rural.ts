import { Kit, pick, type BuiltBuilding } from './BuildingKit';

/** RURAL HOUSES: mud hut (মাটির ঘর), bamboo-thatch hut (ছনের ঘর), tin-shed house (টিনশেড), semi-pucca (আধা-পাকা). */

/** মাটির ঘর: clay walls on an earth plinth, hip thatch roof, front veranda on bamboo posts, haystack, bamboo fence. */
export function buildMudHut(seed = 0): BuiltBuilding {
  const k = new Kit({ 0xa9794d: 'mud', 0xb08558: 'mud', 0x9c6e47: 'mud', 0x7e5a3b: 'mud', 0x8a6a4a: 'earth' });
  const clay = pick(seed, [0xa9794d, 0xb08558, 0x9c6e47]);
  const thatchA = 0xc9a24a, thatchB = 0xae8636;

  // earth plinth incl. front veranda
  k.box(0, 0, 0.5, 5.4, 0.4, 5.0, 0x8a6a4a);
  // walls (rounded corners)
  k.box(0, 0.4, 0, 4.6, 2.2, 3.6, clay);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(sx * 2.3, 0.4, sz * 1.8, 0.3, 0.27, 2.2, clay, 8);
  // darker mud skirt at the bottom (rain splash)
  k.box(0, 0.4, 0, 4.72, 0.45, 3.72, 0x7e5a3b);
  // door + window
  k.box(0, 0.4, 1.81, 0.95, 1.75, 0.08, 0x2b1d14);
  k.box(-0.58, 0.4, 1.83, 0.1, 1.85, 0.1, 0x8b6b3d);
  k.box(0.58, 0.4, 1.83, 0.1, 1.85, 0.1, 0x8b6b3d);
  k.box(0, 2.22, 1.83, 1.3, 0.1, 0.1, 0x8b6b3d);
  k.box(-1.6, 1.3, 1.82, 0.5, 0.5, 0.08, 0x2b1d14);
  k.box(2.31, 1.3, 0.4, 0.08, 0.5, 0.5, 0x2b1d14);
  // thatch roof, two layers (looks like bundled straw)
  k.hip(0, 2.45, 0.4, 6.4, 5.6, 2.1, thatchB);
  k.hip(0, 2.95, 0.4, 5.6, 4.8, 1.75, thatchA);
  k.box(0, 4.6, 0.4, 0.5, 0.18, 0.5, 0x8a6a2a);
  // bamboo posts at the veranda
  for (const x of [-2.5, -0.8, 0.8, 2.5]) k.cyl(x, 0.4, 2.75, 0.07, 0.06, 2.1, 0xc7b36a, 6);
  k.box(0, 2.45, 2.75, 5.2, 0.1, 0.1, 0xb59f55);
  // haystack
  k.cyl(4.6, 0, -0.8, 0.9, 0.9, 0.4, 0x8a6a2a, 10);
  k.cyl(4.6, 0.4, -0.8, 0.95, 0.2, 2.0, 0xd0ac52, 10);
  // clay pots
  k.cyl(-3.3, 0, 2.4, 0.3, 0.2, 0.55, 0xb0603a, 8);
  k.cyl(-3.8, 0, 2.2, 0.25, 0.17, 0.45, 0xb0603a, 8);
  // bamboo fence (left + front-left)
  for (let i = 0; i < 9; i++) k.cyl(-3.4 - 0.0, 0, -2.4 + i * 0.6, 0.04, 0.04, 1.2 + (i % 2) * 0.15, 0xc7b36a, 5);
  k.box(-3.4, 0.35, 0.0, 0.05, 0.05, 5.4, 0xb59f55);
  k.box(-3.4, 0.85, 0.0, 0.05, 0.05, 5.4, 0xb59f55);
  return k.finish(9, 7, 4.8);
}

/** ছনের ঘর / বাঁশের ঘর: woven bamboo walls on timber stilts-plinth, steep thatch gable roof, steps. */
export function buildBambooHut(seed = 0): BuiltBuilding {
  const k = new Kit({ 0xd9c08a: 'bamboo', 0xcdb27a: 'bamboo' });
  const wall = pick(seed, [0xd9c08a, 0xcdb27a]);
  const W = 4.4, D = 5.4;
  // raised platform on posts (flood-safe)
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) k.cyl(sx * 2.0, 0, sz * 2.4, 0.12, 0.1, 0.85, 0x6b4a2f, 6);
  k.box(0, 0.85, 0, W + 0.5, 0.14, D + 0.5, 0x8d6a40);
  // woven bamboo walls
  k.box(0, 0.99, 0, W, 2.1, D, wall);
  // vertical ribs
  for (let i = 0; i <= 8; i++) {
    const x = -W / 2 + (W * i) / 8;
    k.box(x, 0.99, D / 2 + 0.02, 0.07, 2.1, 0.05, 0xa88a52);
    k.box(x, 0.99, -D / 2 - 0.02, 0.07, 2.1, 0.05, 0xa88a52);
  }
  for (let i = 0; i <= 10; i++) {
    const z = -D / 2 + (D * i) / 10;
    k.box(W / 2 + 0.02, 0.99, z, 0.05, 2.1, 0.07, 0xa88a52);
    k.box(-W / 2 - 0.02, 0.99, z, 0.05, 2.1, 0.07, 0xa88a52);
  }
  // door (bamboo panel), window
  k.box(0, 0.99, D / 2 + 0.05, 0.9, 1.7, 0.06, 0x7a5c33);
  k.box(1.4, 1.9, D / 2 + 0.05, 0.6, 0.55, 0.06, 0x3a2a1a);
  k.box(W / 2 + 0.05, 1.9, 0.0, 0.06, 0.55, 0.7, 0x3a2a1a);
  // steep thatch roof with eave overhang
  k.gable(0, 2.95, 0, W + 1.8, D + 1.4, 2.5, 0xb8964a);
  k.gable(0, 2.8, 0, W + 2.1, D + 1.7, 1.3, 0xa38139);
  k.box(0, 5.4, 0, 0.3, 0.2, D + 1.5, 0x7d5f28);
  // steps
  for (let i = 0; i < 3; i++) k.box(0, i * 0.28, D / 2 + 0.55 + (2 - i) * 0.3, 1.2, 0.28, 0.3, 0x8d6a40);
  // water pot + sack of paddy
  k.cyl(-2.9, 0, 3.0, 0.32, 0.22, 0.6, 0xb0603a, 8);
  k.cyl(2.9, 0, 3.0, 0.3, 0.3, 0.7, 0xd8c690, 8);
  return k.finish(8, 8, 5.7);
}

export interface TinOpts {
  /** 'tin' = full tin walls; 'semi' = brick lower half + tin above (আধা-পাকা). */
  walls: 'tin' | 'semi';
}

/** টিনশেড বাড়ি / আধা-পাকা বাড়ি. */
export function buildTinHouse(o: TinOpts, seed = 0): BuiltBuilding {
  const k = new Kit();
  const semi = o.walls === 'semi';
  const wallTin = pick(seed, [0x6f9fb8, 0x7fae8a, 0xb7a58a, 0x9cb0b6]);
  const roofBase = pick(seed + 1, [0x9a4a2e, 0x8d9aa0, 0x7f5a46]);
  const roofRib = roofBase === 0x8d9aa0 ? 0xb6c0c4 : 0xb5603c;
  const brick = 0xa5513a;
  const W = 6.2, D = 9.4, wallH = 2.6;

  // brick plinth (higher on semi-pucca: it is the lower half of the wall)
  const pl = semi ? 1.3 : 0.6;
  k.box(0, 0, 0, W + 0.3, pl, D + 0.3, semi ? brick : 0x9b8f84);
  // corrugated tin wall above
  const tinH = wallH - (semi ? 1.0 : 0.0);
  k.box(0, pl, 0, W, tinH, D, wallTin);
  const ribs = 22;
  for (let i = 0; i <= ribs; i++) {
    const t = -W / 2 + (W * i) / ribs;
    k.box(t, pl, D / 2 + 0.02, 0.06, tinH, 0.04, dim(wallTin));
    k.box(t, pl, -D / 2 - 0.02, 0.06, tinH, 0.04, dim(wallTin));
  }
  // timber trim
  k.box(0, pl + tinH - 0.08, 0, W + 0.1, 0.12, D + 0.1, 0x5a3f2a);

  // gable roof (ridge along Z), eaves overhang, tin ribs
  k.tinRoof(0, pl + tinH, 0, W + 1.4, D + 1.5, 1.7, roofBase, roofRib);

  // front veranda with timber posts
  k.box(0, 0, D / 2 + 0.9, W + 0.3, 0.45, 1.5, 0x9b8f84);
  for (const x of [-W / 2 + 0.1, -W / 6, W / 6, W / 2 - 0.1]) k.box(x, 0.45, D / 2 + 1.5, 0.14, 2.2, 0.14, 0x5a3f2a);
  k.box(0, 2.65, D / 2 + 1.5, W + 0.3, 0.14, 0.18, 0x5a3f2a);

  // two doors + shuttered windows on the front
  for (const x of [-1.5, 1.5]) {
    k.box(x, pl, D / 2 + 0.05, 1.0, 1.9, 0.08, 0x5a3f2a);
  }
  for (let i = 0; i < 3; i++) {
    const z = -D / 2 + 1.5 + i * 3.1;
    k.glass(W / 2 + 0.03, pl + 0.7, z, 0.05, 0.75, 0.9, 0x24323b);
    k.box(W / 2 + 0.03, pl + 0.6, z - 0.55, 0.05, 0.95, 0.2, 0x5a3f2a);
    k.box(W / 2 + 0.03, pl + 0.6, z + 0.55, 0.05, 0.95, 0.2, 0x5a3f2a);
    k.glass(-W / 2 - 0.03, pl + 0.7, z, 0.05, 0.75, 0.9, 0x24323b);
  }

  // kitchen annex (lean-to, lower roof) at the back + clay chimney pipe
  k.box(W / 2 + 1.3, 0, -D / 2 + 1.7, 2.4, 2.1, 3.0, wallTin);
  k.box(W / 2 + 1.3, 0, -D / 2 + 1.7, 2.45, 0.5, 3.05, brick);
  k.shed(W / 2 + 1.4, 2.1, -D / 2 + 1.7, 3.0, 3.6, 0.15, 0.7, roofBase);
  k.cyl(W / 2 + 1.5, 2.4, -D / 2 + 0.9, 0.16, 0.14, 1.6, 0xb0603a, 8);
  // tube-well (hand pump) in the yard — iconic rural detail
  k.cyl(-W / 2 - 1.4, 0, 1.0, 0.1, 0.1, 0.9, 0x3a4a52, 8);
  k.box(-W / 2 - 1.4, 0.9, 1.0, 0.14, 0.6, 0.14, 0x3a4a52);
  k.box(-W / 2 - 1.4, 1.45, 1.35, 0.06, 0.06, 0.8, 0x2b343a);
  k.box(-W / 2 - 1.4, 0, 1.0, 0.9, 0.12, 0.9, 0x9b8f84);
  return k.finish(W + 5, D + 3, 4.5);
}

/** darker shade of a colour for the corrugation lines. */
function dim(c: number): number {
  const r = ((c >> 16) & 255) * 0.82, g = ((c >> 8) & 255) * 0.82, b = (c & 255) * 0.82;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
