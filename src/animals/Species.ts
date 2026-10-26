import type { WorldZoneKind } from '../city/WorldZones';

/**
 * Every animal of the game (data only): where it lives, how it behaves, how fast it is.
 * AnimalModel builds the body, AnimalManager spawns and drives them.
 */
export type Species =
  // farm and village
  | 'cow' | 'buffalo' | 'goat' | 'sheep' | 'horse' | 'dog' | 'cat' | 'chicken' | 'duck'
  // wild herbivores
  | 'deer' | 'boar' | 'rabbit' | 'elephant' | 'zebra' | 'giraffe' | 'rhino' | 'hippo'
  // predators and omnivores
  | 'tiger' | 'lion' | 'leopard' | 'wolf' | 'fox' | 'bear'
  // birds, reptiles, sea
  | 'peacock' | 'crocodile' | 'dolphin';

export type Role =
  /** Runs from predators and from the player (deer, zebra, rabbit, boar). */
  | 'prey'
  /** Hunts the species in `hunts`. */
  | 'predator'
  /** Calm big animals: they only step aside (elephant, giraffe, rhino, bear). */
  | 'grazer'
  /** Farm and village animals: stay near their home, hardly afraid of the player. */
  | 'domestic'
  /** Small birds that walk (chicken, duck, peacock). */
  | 'bird'
  /** Lies about near the water and slides in when disturbed (crocodile, hippo). */
  | 'amphibian'
  /** Lives in open water only. */
  | 'marine';

export interface SpeciesDef {
  id: Species;
  bn: string;
  role: Role;
  /** Herd / flock size (inclusive). */
  group: [number, number];
  /** Walking and running speed (m/s). */
  walk: number;
  run: number;
  /** Individual size variation (1 = the model's size). */
  size: [number, number];
  /** The player this close (m) makes it step aside / run. */
  shy: number;
  /** Maximum alive at once. */
  cap: number;
  /** Typical walking distance between two resting places (m). */
  roam: number;
  /** Deepest water it can stand / swim in (m). Land-only animals have no value. */
  swim?: number;
  /** Spawns in or beside water. */
  needsWater?: boolean;
  /** Species a predator goes after. */
  hunts?: Species[];
  /** Fraction of the time it spends resting / grazing instead of walking (0..1). */
  idle: number;
}

const D = (d: SpeciesDef): SpeciesDef => d;

export const SPECIES: Record<Species, SpeciesDef> = {
  cow: D({ id: 'cow', bn: 'গরু', role: 'domestic', group: [3, 7], walk: 0.9, run: 5.5, size: [0.92, 1.08], shy: 5, cap: 14, roam: 30, idle: 0.6 }),
  buffalo: D({ id: 'buffalo', bn: 'মহিষ', role: 'domestic', group: [2, 5], walk: 0.9, run: 6, size: [0.95, 1.1], shy: 6, cap: 9, roam: 30, swim: 1.6, idle: 0.6 }),
  goat: D({ id: 'goat', bn: 'ছাগল', role: 'domestic', group: [3, 7], walk: 1.1, run: 7, size: [0.85, 1.1], shy: 5, cap: 14, roam: 28, idle: 0.5 }),
  sheep: D({ id: 'sheep', bn: 'ভেড়া', role: 'domestic', group: [4, 9], walk: 1.0, run: 7.5, size: [0.9, 1.1], shy: 7, cap: 14, roam: 28, idle: 0.55 }),
  horse: D({ id: 'horse', bn: 'ঘোড়া', role: 'domestic', group: [1, 3], walk: 1.5, run: 14, size: [0.95, 1.08], shy: 8, cap: 6, roam: 40, idle: 0.5 }),
  dog: D({ id: 'dog', bn: 'কুকুর', role: 'domestic', group: [1, 3], walk: 1.4, run: 9, size: [0.8, 1.15], shy: 3, cap: 8, roam: 45, idle: 0.35 }),
  cat: D({ id: 'cat', bn: 'বিড়াল', role: 'domestic', group: [1, 2], walk: 1.0, run: 7, size: [0.9, 1.1], shy: 6, cap: 8, roam: 20, idle: 0.6 }),
  chicken: D({ id: 'chicken', bn: 'মুরগি', role: 'bird', group: [4, 9], walk: 0.6, run: 3.6, size: [0.9, 1.1], shy: 5, cap: 16, roam: 14, idle: 0.55 }),
  duck: D({ id: 'duck', bn: 'হাঁস', role: 'bird', group: [4, 10], walk: 0.6, run: 3.2, size: [0.9, 1.1], shy: 6, cap: 16, roam: 25, swim: 3, needsWater: true, idle: 0.4 }),
  deer: D({ id: 'deer', bn: 'হরিণ', role: 'prey', group: [4, 6], walk: 1.5, run: 13.5, size: [0.9, 1.1], shy: 28, cap: 16, roam: 40, idle: 0.4 }),
  boar: D({ id: 'boar', bn: 'বন্য শূকর', role: 'prey', group: [3, 6], walk: 1.3, run: 11, size: [0.9, 1.1], shy: 20, cap: 10, roam: 35, idle: 0.5 }),
  rabbit: D({ id: 'rabbit', bn: 'খরগোশ', role: 'prey', group: [2, 4], walk: 0.9, run: 11, size: [0.9, 1.1], shy: 14, cap: 10, roam: 14, idle: 0.6 }),
  elephant: D({ id: 'elephant', bn: 'হাতি', role: 'grazer', group: [2, 5], walk: 1.3, run: 6.5, size: [0.9, 1.08], shy: 14, cap: 7, roam: 50, swim: 2.2, idle: 0.45 }),
  zebra: D({ id: 'zebra', bn: 'জেব্রা', role: 'prey', group: [4, 8], walk: 1.5, run: 15, size: [0.95, 1.06], shy: 30, cap: 14, roam: 45, idle: 0.4 }),
  giraffe: D({ id: 'giraffe', bn: 'জিরাফ', role: 'grazer', group: [2, 4], walk: 1.5, run: 12, size: [0.92, 1.08], shy: 22, cap: 7, roam: 45, idle: 0.45 }),
  rhino: D({ id: 'rhino', bn: 'গণ্ডার', role: 'grazer', group: [1, 2], walk: 1.1, run: 9, size: [0.95, 1.06], shy: 16, cap: 5, roam: 35, idle: 0.55 }),
  hippo: D({ id: 'hippo', bn: 'জলহস্তী', role: 'amphibian', group: [1, 3], walk: 0.9, run: 5, size: [0.95, 1.06], shy: 12, cap: 5, roam: 18, swim: 3.2, needsWater: true, idle: 0.7 }),
  tiger: D({ id: 'tiger', bn: 'বাঘ', role: 'predator', group: [1, 1], walk: 1.7, run: 17, size: [0.95, 1.12], shy: 32, cap: 3, roam: 50, hunts: ['deer', 'boar'], idle: 0.5 }),
  lion: D({ id: 'lion', bn: 'সিংহ', role: 'predator', group: [1, 1], walk: 1.7, run: 17.5, size: [0.95, 1.12], shy: 32, cap: 3, roam: 50, hunts: ['zebra', 'deer'], idle: 0.5 }),
  leopard: D({ id: 'leopard', bn: 'চিতাবাঘ', role: 'predator', group: [1, 1], walk: 1.5, run: 16, size: [0.95, 1.1], shy: 32, cap: 3, roam: 45, hunts: ['deer', 'goat', 'rabbit'], idle: 0.5 }),
  wolf: D({ id: 'wolf', bn: 'নেকড়ে', role: 'predator', group: [1, 1], walk: 1.6, run: 15, size: [0.95, 1.1], shy: 30, cap: 3, roam: 50, hunts: ['deer', 'goat', 'sheep', 'rabbit'], idle: 0.45 }),
  fox: D({ id: 'fox', bn: 'শিয়াল', role: 'predator', group: [1, 1], walk: 1.4, run: 12, size: [0.92, 1.1], shy: 25, cap: 3, roam: 40, hunts: ['rabbit', 'chicken'], idle: 0.45 }),
  bear: D({ id: 'bear', bn: 'ভালুক', role: 'grazer', group: [1, 2], walk: 1.2, run: 9, size: [0.95, 1.1], shy: 30, cap: 3, roam: 40, idle: 0.5 }),
  peacock: D({ id: 'peacock', bn: 'ময়ূর', role: 'bird', group: [2, 4], walk: 0.8, run: 5, size: [0.95, 1.05], shy: 9, cap: 7, roam: 20, idle: 0.55 }),
  crocodile: D({ id: 'crocodile', bn: 'কুমির', role: 'amphibian', group: [1, 2], walk: 0.8, run: 4, size: [0.85, 1.15], shy: 13, cap: 5, roam: 15, swim: 4, needsWater: true, idle: 0.75 }),
  dolphin: D({ id: 'dolphin', bn: 'ডলফিন', role: 'marine', group: [2, 4], walk: 3, run: 8, size: [0.9, 1.1], shy: 0, cap: 8, roam: 80, swim: 99, idle: 0 }),
};

export const ALL_SPECIES = Object.keys(SPECIES) as Species[];

/** 'safari' = the park zone around the safari park (Africa-style big game); the other keys are the world zone kinds. */
export type HabitatKey = WorldZoneKind | 'safari';

/**
 * Where each species lives (relative weights: a bigger number = commoner there). Built-up zones (city, industry, airport,
 * port) have no wildlife at all; birds already fly over them.
 */
export const HABITAT: Partial<Record<HabitatKey, Partial<Record<Species, number>>>> = {
  farmland: { cow: 4, buffalo: 2, goat: 3, sheep: 2, horse: 1.2, chicken: 2, dog: 1, deer: 1, rabbit: 2, duck: 1, peacock: 0.5 },
  village: { cow: 3, goat: 3, chicken: 5, dog: 2, cat: 2.5, duck: 2, sheep: 1, buffalo: 1 },
  forest: { deer: 4, boar: 3, elephant: 1.5, bear: 0.8, peacock: 2, rabbit: 1, hippo: 0.3 },
  wetland: { buffalo: 2, crocodile: 2.5, hippo: 1.2, duck: 3.5, deer: 1.5, boar: 1.5, elephant: 0.5 },
  park: { deer: 3, rabbit: 2, duck: 3, peacock: 1.5, horse: 0.6, dog: 0.6, cat: 0.6 },
  safari: { zebra: 4, giraffe: 2.5, elephant: 1.6, rhino: 1.4, hippo: 1.2, deer: 1.2, boar: 0.6 },
  mountain: { goat: 3, deer: 2, boar: 1, bear: 1.2, sheep: 1 },
  coast: { dog: 1, goat: 1, cow: 1, duck: 1.5, cat: 0.6 },
};

/** Where a predator may live (the zone kinds, 'safari' = the safari park). */
export const PREDATOR_ZONES: Partial<Record<Species, readonly HabitatKey[]>> = {
  tiger: ['forest', 'wetland', 'park', 'mountain', 'farmland'],
  lion: ['safari', 'park'],
  leopard: ['forest', 'mountain', 'farmland', 'safari'],
  wolf: ['mountain', 'forest', 'farmland'],
  fox: ['farmland', 'forest', 'village', 'park'],
};

/** The prey animals (and domestic ones) that predators attack. */
export const isPredator = (sp: Species): boolean => SPECIES[sp].role === 'predator';
