// footprint (W, D) in metres of each model in src/buildings/models (from BuiltBuilding.width / depth); used by place-buildings.ts
export const SIZES: Record<string, [number, number]> = {
  'mud-hut': [9, 7], 'bamboo-hut': [8, 8], 'house-tin': [11, 12], 'house-semi-pucca': [11, 12], 'house-brick-2': [13, 16], 'house-brick-3': [13, 16], 'row-house': [21, 10],
  villa: [24, 28], 'apartment-mid': [18, 13], 'apartment-high': [27, 20], 'tower-residential': [45, 45], dormitory: [33, 33], 'labor-quarters': [40, 11],
  'village-bazaar': [64, 48], baganbari: [52, 52], 'shop-row': [26, 11], pharmacy: [9, 11], restaurant: [24, 26], 'petrol-pump': [30, 24], bank: [26, 24], supermarket: [33, 36],
  mall: [61, 60], cinema: [27, 35], 'office-mid': [27, 26], 'office-tower': [45, 45], 'hotel-3star': [39, 32], 'hotel-5star': [80, 70],
  'primary-school': [40, 36], 'high-school': [56, 60], college: [70, 46], 'university-building': [70, 54], 'engineering-lab': [64, 50],
  hospital: [80, 62], clinic: [22, 25], diagnostic: [24, 18], mosque: [48, 52], temple: [40, 44], church: [36, 52], eidgah: [72, 54],
  overwater_villas: [76, 80], cliff_mansion: [64, 70], marina: [84, 80], beach_resort: [100, 110], tropical_villa: [56, 56], lighthouse: [56, 56],
  village_farm: [124, 108], hill_farm: [104, 112], union_parishad: [44, 40], upazila_complex: [90, 70], fire_station: [54, 46], post_office: [38, 34],
  district_court: [80, 66], dc_office: [96, 76], city_hall: [100, 84],
};

/** Compact models (FILL_BUILDING_MODELS, src/buildings/models/compact.ts): ceil of BuiltBuilding.width / depth. Separate from SIZES: placements-test expects SIZES = the 55 hand placed models. */
export const FILL_SIZES: Record<string, [number, number]> = {
  'slim-tower-20': [20, 21], 'slim-tower-30': [21, 22], 'office-slim-12': [21, 20], 'mixed-use-6': [19, 16], 'hotel-boutique': [17, 18], 'bank-compact': [16, 18],
  'apt-slim-9': [15, 14], 'apt-slim-14': [16, 15], 'townhouse-3': [10, 12], 'shop-house-3': [13, 12], 'shop-house-4': [11, 11],
};
