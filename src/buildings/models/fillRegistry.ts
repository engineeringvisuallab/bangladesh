import { BUILDING_MODEL_BY_ID, type BuildingModelDef } from './registry';
import { buildAptSlim14, buildAptSlim9, buildBankCompact, buildHotelBoutique, buildMixedUse6, buildOfficeSlim12, buildShopHouse3, buildShopHouse4, buildSlimTower20, buildSlimTower30, buildTownhouse3 } from './compact';

/**
 * COMPACT models (Step A, compact.ts): small footprints, many floors, made for the dense blocks of the city fill (PlacementsFill.ts).
 * They are NOT part of BUILDING_MODELS (that list = one hand placed building each, see Placements.ts), but they carry the `cityId` of the
 * model they sit next to, so every CityPlan zone that lists e.g. 'office-tower' / 'apartment-mid' / 'shop-row' can use them too.
 */
export const FILL_BUILDING_MODELS: BuildingModelDef[] = [
  { id: 'slim-tower-20', bn: 'slim tower (20 floor)', en: 'Slim glass tower, 20 floors', group: 'commercial', grade: 4, floors: 20, cityId: 'office-tower', build: buildSlimTower20 },
  { id: 'slim-tower-30', bn: 'slim tower (30 floor)', en: 'Slim glass tower, 30 floors', group: 'commercial', grade: 5, floors: 30, cityId: 'office-tower', build: buildSlimTower30 },
  { id: 'office-slim-12', bn: 'office (12 floor)', en: 'Slim office slab, 12 floors', group: 'commercial', grade: 4, floors: 12, cityId: 'office-mid', build: buildOfficeSlim12 },
  { id: 'mixed-use-6', bn: 'mixed-use (6 floor)', en: 'Mixed-use block with shops, 6 floors', group: 'commercial', grade: 3, floors: 6, cityId: 'office-mid', build: buildMixedUse6 },
  { id: 'hotel-boutique', bn: 'boutique hotel', en: 'Boutique hotel, 12 floors', group: 'commercial', grade: 4, floors: 12, cityId: 'hotel', build: buildHotelBoutique },
  { id: 'bank-compact', bn: 'bank branch', en: 'Compact bank branch', group: 'commercial', grade: 3, floors: 3, cityId: 'bank', build: buildBankCompact },
  { id: 'apt-slim-9', bn: 'apartment (9 floor)', en: 'Slim apartment block, 9 floors', group: 'residential', grade: 3, floors: 9, cityId: 'apartment-mid', build: buildAptSlim9 },
  { id: 'apt-slim-14', bn: 'apartment (14 floor)', en: 'Slim apartment tower, 14 floors', group: 'residential', grade: 4, floors: 14, cityId: 'apartment-high', build: buildAptSlim14 },
  { id: 'townhouse-3', bn: 'town house', en: 'Town house, 3 floors', group: 'residential', grade: 3, floors: 3, cityId: 'house-brick', build: buildTownhouse3 },
  { id: 'shop-house-3', bn: 'shop house (3 floor)', en: 'Shop house, 3 floors', group: 'commercial', grade: 3, floors: 3, cityId: 'shop-row', build: buildShopHouse3 },
  { id: 'shop-house-4', bn: 'shop house (4 floor)', en: 'Shop house, 4 floors', group: 'commercial', grade: 3, floors: 4, cityId: 'shop-row', build: buildShopHouse4 },
];

/** Any model the city fill may use: the original ones + the compact ones. */
export const FILL_MODEL_BY_ID: Record<string, BuildingModelDef> = { ...BUILDING_MODEL_BY_ID, ...Object.fromEntries(FILL_BUILDING_MODELS.map((m) => [m.id, m])) };
