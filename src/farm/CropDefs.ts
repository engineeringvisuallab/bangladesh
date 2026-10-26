// CROP CATALOG for the open world (pure data, no three.js / DOM: the planner, the tests and the chunk workers can use it).
//
// A FIELD has one crop, one STAGE and one ACTIVITY. Stage = what the land looks like; activity = what people / machines are doing on it.
// Stage order is the life of a crop: prepared -> sown -> seedling -> growing -> mature -> ripe -> harvesting -> harvested -> fallow.

export const Stage = { prepared: 0, sown: 1, seedling: 2, growing: 3, mature: 4, ripe: 5, harvesting: 6, harvested: 7, fallow: 8 } as const;
export const STAGE_COUNT = 9;
export const STAGE_BN = ['জমি তৈরি', 'বীজ বোনা', 'চারা', 'বাড়ন্ত', 'ফুল-ফল ধরা', 'পাকা (কাটার সময়)', 'ফসল কাটা চলছে', 'কাটা হয়ে গেছে', 'পতিত জমি'] as const;

export const Act = {
  none: 0,
  plow: 1, // tractor / power tiller / ox plough
  sow: 2, // hand broadcasting
  transplant: 3, // paddy seedlings planted by hand (bent workers in a line)
  irrigate: 4, // pump + water channel
  spray: 5, // drone spraying
  weed: 6, // weeding by hand
  harvestCombine: 7,
  harvestHand: 8, // sickle: workers + bundles
  pick: 9, // fruit / vegetable picking into baskets
  thresh: 10, // threshing + straw stacks
  haul: 11, // tractor + trolley loading
  graze: 12, // cows on the stubble / fallow
} as const;
export const ACT_BN = ['', 'চাষ (লাঙল)', 'বীজ ছিটানো', 'চারা রোপণ', 'সেচ', 'ড্রোনে স্প্রে', 'নিড়ানি', 'কম্বাইন হারভেস্টার', 'কাস্তে দিয়ে ধান কাটা', 'ফল-সবজি তোলা', 'মাড়াই', 'ফসল পরিবহন', 'গরু চরানো'] as const;

/** Where the crop likes to grow. */
export type Env = 'paddy' | 'lowland' | 'upland' | 'hill' | 'homestead';
export type Shape = 'tuft' | 'stalk' | 'bush' | 'vine' | 'tree' | 'palm' | 'banana' | 'tea';
export type Group = 'cereal' | 'fibre' | 'oil' | 'pulse' | 'tuber' | 'vegetable' | 'cash' | 'fruit';

export interface CropDef {
  id: string;
  bn: string;
  en: string;
  group: Group;
  shape: Shape;
  env: Env[];
  /** Plant height (m) when ripe. */
  h: number;
  /** Row / plant spacing (m). Bigger = fewer instances. */
  gap: number;
  /** Leaf colour at stage seedling, growing, mature, ripe (hex). Harvested fields use `stubble`. */
  leaf: [number, number, number, number];
  /** Flower / fruit / grain colour shown at stage mature and ripe (0 = none). */
  fruit: number;
  stubble: number;
  /** How the ripe crop is cut. */
  cut: 'combine' | 'hand' | 'pick' | 'none';
  /** Flooded in the first stages (paddy). */
  flooded?: boolean;
  /** Grown on a trellis (macha). */
  trellis?: boolean;
  /** Relative chance of each stage (index = Stage). Orchards are always standing, so they only use 3..5. */
  weights: number[];
  /** Tree crops: trunk height fraction + crown radius (m) at full age. */
  crown?: number;
}

const W = (...w: number[]) => w;
export const CROPS: readonly CropDef[] = [
  // ---- cereals (open fields; paddy lowland) ----
  { id: 'dhan', bn: 'ধান', en: 'Rice', group: 'cereal', shape: 'tuft', env: ['paddy', 'lowland'], h: 0.95, gap: 1.1, leaf: [0x8fd14f, 0x5fae2f, 0x9bb83a, 0xd9b44a], fruit: 0xe8c65a, stubble: 0xc9b36e, cut: 'combine', flooded: true, weights: W(10, 8, 12, 16, 8, 14, 10, 12, 4) },
  { id: 'gom', bn: 'গম', en: 'Wheat', group: 'cereal', shape: 'tuft', env: ['upland', 'lowland'], h: 0.9, gap: 0.9, leaf: [0x9bd95a, 0x7fb83f, 0xb5b84a, 0xe0b94a], fruit: 0xe9c45a, stubble: 0xcdb56b, cut: 'combine', weights: W(6, 8, 10, 16, 10, 16, 10, 12, 6) },
  { id: 'vutta', bn: 'ভুট্টা', en: 'Maize', group: 'cereal', shape: 'stalk', env: ['upland'], h: 2.2, gap: 1.3, leaf: [0x7fd04a, 0x4f9e32, 0x6aa83a, 0xb8b04a], fruit: 0xf2c94c, stubble: 0xb89f58, cut: 'combine', weights: W(6, 8, 10, 16, 14, 14, 8, 12, 6) },
  // ---- fibre / oil / pulses ----
  { id: 'pat', bn: 'পাট', en: 'Jute', group: 'fibre', shape: 'stalk', env: ['lowland', 'paddy'], h: 2.6, gap: 0.9, leaf: [0x8bd24c, 0x5ea63a, 0x4f9a35, 0x6f9a3a], fruit: 0, stubble: 0x9a8a52, cut: 'hand', weights: W(6, 8, 10, 18, 12, 14, 10, 14, 6) },
  { id: 'sorisha', bn: 'সরিষা', en: 'Mustard', group: 'oil', shape: 'tuft', env: ['upland', 'lowland'], h: 1.0, gap: 0.9, leaf: [0x8fd14f, 0x6bb43a, 0x9fc040, 0xb9b04a], fruit: 0xf7d51d, stubble: 0xb9a45f, cut: 'hand', weights: W(4, 6, 8, 12, 24, 14, 10, 12, 6) },
  { id: 'mug', bn: 'মুগ ডাল', en: 'Mung bean', group: 'pulse', shape: 'bush', env: ['upland', 'lowland'], h: 0.55, gap: 0.8, leaf: [0x8bd650, 0x5aa83a, 0x4d9a34, 0x9a8f45], fruit: 0xf7e07a, stubble: 0xa8935a, cut: 'hand', weights: W(6, 8, 12, 16, 12, 12, 8, 12, 6) },
  { id: 'alu', bn: 'আলু', en: 'Potato', group: 'tuber', shape: 'bush', env: ['upland'], h: 0.55, gap: 0.8, leaf: [0x7ccf48, 0x4f9e34, 0x3f8a30, 0x8f8f45], fruit: 0xf0e9ff, stubble: 0x8a6a42, cut: 'hand', weights: W(6, 8, 12, 18, 12, 10, 12, 12, 6) },
  { id: 'akh', bn: 'আখ', en: 'Sugarcane', group: 'cash', shape: 'stalk', env: ['upland', 'lowland'], h: 3.2, gap: 1.4, leaf: [0x86d04a, 0x5aa532, 0x4e963a, 0x7aa238], fruit: 0, stubble: 0x8a7a45, cut: 'hand', weights: W(4, 6, 8, 20, 16, 14, 10, 12, 6) },
  // ---- vegetables ----
  { id: 'tomato', bn: 'টমেটো', en: 'Tomato', group: 'vegetable', shape: 'bush', env: ['upland', 'homestead'], h: 0.95, gap: 1.0, leaf: [0x7ccf48, 0x4f9e34, 0x3f8a30, 0x4a8a30], fruit: 0xe53935, stubble: 0x8a6a42, cut: 'pick', weights: W(4, 6, 10, 16, 18, 22, 6, 10, 6) },
  { id: 'begun', bn: 'বেগুন', en: 'Brinjal', group: 'vegetable', shape: 'bush', env: ['upland', 'homestead'], h: 0.9, gap: 1.1, leaf: [0x7ccf48, 0x4f9e34, 0x3f8a30, 0x3f7f30], fruit: 0x6a1b9a, stubble: 0x8a6a42, cut: 'pick', weights: W(4, 6, 10, 16, 18, 22, 6, 10, 6) },
  { id: 'morich', bn: 'মরিচ', en: 'Chilli', group: 'vegetable', shape: 'bush', env: ['upland', 'homestead'], h: 0.7, gap: 0.8, leaf: [0x7ccf48, 0x4f9e34, 0x3f8a30, 0x3f7f30], fruit: 0xd32f2f, stubble: 0x8a6a42, cut: 'pick', weights: W(4, 6, 10, 16, 18, 22, 6, 10, 6) },
  { id: 'fulkopi', bn: 'ফুলকপি', en: 'Cauliflower', group: 'vegetable', shape: 'bush', env: ['upland'], h: 0.5, gap: 0.8, leaf: [0x8fd45a, 0x66b043, 0x5aa03c, 0x5a9a3c], fruit: 0xf5f5e6, stubble: 0x7a6a42, cut: 'pick', weights: W(4, 8, 12, 16, 12, 20, 8, 12, 8) },
  { id: 'lau', bn: 'লাউ (মাচা)', en: 'Bottle gourd', group: 'vegetable', shape: 'vine', env: ['homestead', 'upland'], h: 2.0, gap: 1.8, leaf: [0x7ccf48, 0x56ad3a, 0x4a9d35, 0x4a9d35], fruit: 0xb7e08a, stubble: 0x8a7a45, cut: 'pick', trellis: true, weights: W(2, 4, 8, 18, 22, 22, 6, 10, 8) },
  // ---- orchards (always standing; all stages 3..5) ----
  { id: 'aam', bn: 'আম', en: 'Mango', group: 'fruit', shape: 'tree', env: ['homestead', 'upland', 'hill'], h: 8, gap: 9, leaf: [0x3f8a3a, 0x2f7a30, 0x2f7a30, 0x2a6f2c], fruit: 0xf5b82e, stubble: 0, cut: 'pick', crown: 4.2, weights: W(0, 0, 0, 30, 36, 34, 0, 0, 0) },
  { id: 'kathal', bn: 'কাঁঠাল', en: 'Jackfruit', group: 'fruit', shape: 'tree', env: ['homestead', 'hill', 'upland'], h: 9, gap: 9, leaf: [0x3a7f38, 0x2c6f2e, 0x2c6f2e, 0x26642a], fruit: 0x9fae3a, stubble: 0, cut: 'pick', crown: 4.0, weights: W(0, 0, 0, 30, 34, 36, 0, 0, 0) },
  { id: 'lichu', bn: 'লিচু', en: 'Litchi', group: 'fruit', shape: 'tree', env: ['homestead', 'hill', 'upland'], h: 7, gap: 7, leaf: [0x3f8a3a, 0x2f7a30, 0x2f7a30, 0x2a6f2c], fruit: 0xd8324a, stubble: 0, cut: 'pick', crown: 3.4, weights: W(0, 0, 0, 30, 30, 40, 0, 0, 0) },
  { id: 'komola', bn: 'কমলা', en: 'Orange', group: 'fruit', shape: 'tree', env: ['hill'], h: 4, gap: 5, leaf: [0x4a9a3a, 0x3a8a30, 0x3a8a30, 0x347f2c], fruit: 0xf28c1b, stubble: 0, cut: 'pick', crown: 2.2, weights: W(0, 0, 0, 28, 34, 38, 0, 0, 0) },
  { id: 'peyara', bn: 'পেয়ারা', en: 'Guava', group: 'fruit', shape: 'tree', env: ['hill', 'homestead', 'upland'], h: 4, gap: 5, leaf: [0x56a63e, 0x469a34, 0x469a34, 0x3e8e30], fruit: 0xcfe27a, stubble: 0, cut: 'pick', crown: 2.1, weights: W(0, 0, 0, 30, 34, 36, 0, 0, 0) },
  { id: 'lebu', bn: 'লেবু', en: 'Lime', group: 'fruit', shape: 'tree', env: ['hill', 'homestead'], h: 3, gap: 4, leaf: [0x4a9a3a, 0x3a8a30, 0x3a8a30, 0x347f2c], fruit: 0xc9e04a, stubble: 0, cut: 'pick', crown: 1.7, weights: W(0, 0, 0, 30, 34, 36, 0, 0, 0) },
  { id: 'kola', bn: 'কলা', en: 'Banana', group: 'fruit', shape: 'banana', env: ['hill', 'homestead', 'upland'], h: 4, gap: 3.2, leaf: [0x6cc04a, 0x56ad3a, 0x4e9d36, 0x4e9d36], fruit: 0xe9d23a, stubble: 0, cut: 'pick', weights: W(0, 0, 0, 30, 34, 36, 0, 0, 0) },
  { id: 'anarosh', bn: 'আনারস', en: 'Pineapple', group: 'fruit', shape: 'bush', env: ['hill'], h: 0.9, gap: 0.9, leaf: [0x6fb63f, 0x5aa032, 0x5a9a32, 0x5a9a32], fruit: 0xe6a520, stubble: 0, cut: 'pick', weights: W(0, 0, 0, 30, 30, 40, 0, 0, 0) },
  { id: 'narikel', bn: 'নারিকেল', en: 'Coconut', group: 'fruit', shape: 'palm', env: ['homestead'], h: 10, gap: 8, leaf: [0x4e9a3a, 0x3f8a30, 0x3f8a30, 0x3a822c], fruit: 0x8a6a30, stubble: 0, cut: 'pick', weights: W(0, 0, 0, 30, 30, 40, 0, 0, 0) },
  { id: 'shupari', bn: 'সুপারি', en: 'Areca nut', group: 'fruit', shape: 'palm', env: ['homestead'], h: 9, gap: 4.5, leaf: [0x4e9a3a, 0x3f8a30, 0x3f8a30, 0x3a822c], fruit: 0xe08a2a, stubble: 0, cut: 'pick', weights: W(0, 0, 0, 30, 30, 40, 0, 0, 0) },
  { id: 'cha', bn: 'চা', en: 'Tea', group: 'cash', shape: 'tea', env: ['hill'], h: 1.1, gap: 1.2, leaf: [0x76c04a, 0x5fa83a, 0x4f9a34, 0x4f9a34], fruit: 0, stubble: 0, cut: 'hand', weights: W(0, 0, 0, 34, 33, 33, 0, 0, 0) },
];

const BY_ID = new Map(CROPS.map((c) => [c.id, c]));
export const cropById = (id: string): CropDef => {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`unknown crop ${id}`);
  return c;
};
export const isOrchard = (c: CropDef): boolean => c.group === 'fruit' && c.shape !== 'bush';
/** Orchard-like crops stand all year (no sowing / harvest stages). Tea too. */
export const isPerennial = (c: CropDef): boolean => c.weights[0] === 0;
