import type { BuiltBuilding } from './BuildingKit';
import { buildBank, buildCinema, buildHotel3, buildHotel5, buildMall, buildOfficeMid, buildOfficeTower, buildPetrolPump, buildPharmacy, buildRestaurant, buildShopRow, buildSupermarket } from './commercial';
import { buildCollege, buildEngineeringLab, buildHighSchool, buildPrimarySchool, buildUniversityBuilding } from './education';
import { buildClinic, buildDiagnostic, buildHospital } from './health';
import { buildChurch, buildEidgah, buildMosque, buildTemple } from './religious';
import { buildBeachResort, buildCliffMansion, buildLighthouse, buildMarina, buildOverwaterVillas, buildTropicalVilla } from './luxury';
import { buildHillFarm, buildVillageFarm } from './farm';
import { buildCityHall, buildDCOffice, buildDistrictCourt, buildFireStation, buildPoliceStation, buildPostOffice, buildUnionParishad, buildUpazilaComplex } from './admin';
import { buildBaganbari, buildVillageBazaar } from './village';
import { buildBambooHut, buildMudHut, buildTinHouse } from './rural';
import {
  buildApartmentHigh, buildApartmentMid, buildBrickHouse, buildDormitory, buildLaborQuarters,
  buildResidentialTower, buildRowHouse, buildVilla,
} from './urban';

/**
 * Catalogue of the finished 3D building models. NOT connected to the game yet:
 * later a placer calls `BUILDING_MODELS[id].build(seed)` and puts `built.root` where it wants.
 * `cityId` = the id used in src/city/CityPlan.ts BUILDING_TYPES (when one exists).
 */
export interface BuildingModelDef {
  id: string;
  bn: string;
  en: string;
  group: 'residential' | 'commercial' | 'industrial' | 'civic' | 'education' | 'health' | 'religious' | 'utility' | 'transport' | 'recreation';
  /** 1 = poorest/simplest ... 5 = luxury (5-star level). */
  grade: 1 | 2 | 3 | 4 | 5;
  floors: number;
  cityId?: string;
  build: (seed?: number) => BuiltBuilding;
}

export const BUILDING_MODELS: BuildingModelDef[] = [
  { id: 'mud-hut', bn: 'মাটির ঘর (ছন/খড়ের চাল)', en: 'Mud hut', group: 'residential', grade: 1, floors: 1, build: buildMudHut },
  { id: 'bamboo-hut', bn: 'বাঁশের ঘর (ছনের চাল)', en: 'Bamboo-thatch hut', group: 'residential', grade: 1, floors: 1, build: buildBambooHut },
  { id: 'house-tin', bn: 'টিনশেড বাড়ি', en: 'Tin-shed house', group: 'residential', grade: 2, floors: 1, cityId: 'house-tin', build: (s) => buildTinHouse({ walls: 'tin' }, s) },
  { id: 'house-semi-pucca', bn: 'আধা-পাকা বাড়ি', en: 'Semi-pucca house', group: 'residential', grade: 2, floors: 1, build: (s) => buildTinHouse({ walls: 'semi' }, s) },
  { id: 'house-brick-2', bn: 'ইটের/পাকা বাড়ি (২ তলা)', en: 'Brick house, 2 floors', group: 'residential', grade: 3, floors: 2, cityId: 'house-brick', build: (s) => buildBrickHouse(2, s) },
  { id: 'house-brick-3', bn: 'ইটের/পাকা বাড়ি (৩ তলা)', en: 'Brick house, 3 floors', group: 'residential', grade: 3, floors: 3, cityId: 'house-brick', build: (s) => buildBrickHouse(3, s) },
  { id: 'row-house', bn: 'সারি বাড়ি (টাউনহাউস)', en: 'Row house', group: 'residential', grade: 3, floors: 3, cityId: 'row-house', build: buildRowHouse },
  { id: 'villa', bn: 'ভিলা / ডুপ্লেক্স', en: 'Villa', group: 'residential', grade: 5, floors: 2, cityId: 'villa', build: buildVilla },
  { id: 'apartment-mid', bn: 'ফ্ল্যাট বিল্ডিং (৬ তলা)', en: 'Apartment block, 6 floors', group: 'residential', grade: 3, floors: 7, cityId: 'apartment-mid', build: buildApartmentMid },
  { id: 'apartment-high', bn: 'বহুতল ফ্ল্যাট (১২ তলা)', en: 'High-rise apartment', group: 'residential', grade: 4, floors: 13, cityId: 'apartment-high', build: buildApartmentHigh },
  { id: 'tower-residential', bn: 'আবাসিক টাওয়ার (২৮ তলা)', en: 'Residential tower', group: 'residential', grade: 5, floors: 31, cityId: 'tower-residential', build: buildResidentialTower },
  { id: 'dormitory', bn: 'হোস্টেল / মেস', en: 'Hostel / mess', group: 'residential', grade: 2, floors: 4, cityId: 'dormitory', build: buildDormitory },
  { id: 'labor-quarters', bn: 'শ্রমিক কোয়ার্টার', en: 'Labour quarters', group: 'residential', grade: 1, floors: 2, cityId: 'labor-quarters', build: buildLaborQuarters },
  { id: 'village-bazaar', bn: 'গ্রামের হাট-বাজার', en: 'Village bazaar', group: 'commercial', grade: 2, floors: 2, cityId: 'bazaar-stall', build: buildVillageBazaar },
  { id: 'baganbari', bn: 'বাগানবাড়ি', en: 'Garden house estate', group: 'recreation', grade: 4, floors: 1, cityId: 'garden', build: buildBaganbari },
  { id: 'shop-row', bn: 'দোকান সারি (২ তলা)', en: 'Town shop row', group: 'commercial', grade: 2, floors: 2, cityId: 'shop-row', build: buildShopRow },
  { id: 'pharmacy', bn: 'ফার্মেসি', en: 'Pharmacy', group: 'commercial', grade: 3, floors: 1, cityId: 'pharmacy', build: buildPharmacy },
  { id: 'restaurant', bn: 'রেস্টুরেন্ট', en: 'Restaurant', group: 'commercial', grade: 3, floors: 1, cityId: 'restaurant', build: buildRestaurant },
  { id: 'petrol-pump', bn: 'পেট্রোল পাম্প', en: 'Petrol pump', group: 'commercial', grade: 3, floors: 1, cityId: 'petrol-pump', build: buildPetrolPump },
  { id: 'bank', bn: 'ব্যাংক', en: 'Bank', group: 'commercial', grade: 4, floors: 2, cityId: 'bank', build: buildBank },
  { id: 'supermarket', bn: 'সুপারমার্কেট', en: 'Supermarket', group: 'commercial', grade: 3, floors: 1, cityId: 'supermarket', build: buildSupermarket },
  { id: 'mall', bn: 'শপিং মল', en: 'Shopping mall', group: 'commercial', grade: 4, floors: 4, cityId: 'mall', build: buildMall },
  { id: 'cinema', bn: 'সিনেমা হল', en: 'Cinema hall', group: 'commercial', grade: 3, floors: 2, cityId: 'cinema', build: buildCinema },
  { id: 'office-mid', bn: 'অফিস ভবন (৮ তলা)', en: 'Office building', group: 'commercial', grade: 4, floors: 8, cityId: 'office-mid', build: buildOfficeMid },
  { id: 'office-tower', bn: 'অফিস টাওয়ার (৩০ তলা)', en: 'Office tower', group: 'commercial', grade: 5, floors: 33, cityId: 'office-tower', build: buildOfficeTower },
  { id: 'hotel-3star', bn: 'হোটেল (৩-স্টার)', en: '3-star hotel', group: 'commercial', grade: 3, floors: 8, cityId: 'hotel', build: buildHotel3 },
  { id: 'hotel-5star', bn: 'পাঁচ তারা হোটেল (৫-স্টার)', en: '5-star hotel resort', group: 'commercial', grade: 5, floors: 22, cityId: 'hotel', build: buildHotel5 },
  { id: 'primary-school', bn: 'প্রাথমিক বিদ্যালয়', en: 'Primary school', group: 'education', grade: 2, floors: 1, cityId: 'primary-school', build: buildPrimarySchool },
  { id: 'high-school', bn: 'উচ্চ বিদ্যালয়', en: 'High school', group: 'education', grade: 3, floors: 3, cityId: 'high-school', build: buildHighSchool },
  { id: 'college', bn: 'কলেজ', en: 'College', group: 'education', grade: 4, floors: 4, cityId: 'college', build: buildCollege },
  { id: 'university-building', bn: 'বিশ্ববিদ্যালয় ভবন', en: 'University building', group: 'education', grade: 5, floors: 6, cityId: 'university-building', build: buildUniversityBuilding },
  { id: 'engineering-lab', bn: 'ইঞ্জিনিয়ারিং ল্যাব', en: 'Engineering lab', group: 'education', grade: 4, floors: 3, cityId: 'engineering-lab', build: buildEngineeringLab },
  { id: 'hospital', bn: 'হাসপাতাল', en: 'Hospital', group: 'health', grade: 5, floors: 8, cityId: 'hospital', build: buildHospital },
  { id: 'clinic', bn: 'ক্লিনিক', en: 'Clinic', group: 'health', grade: 3, floors: 2, cityId: 'clinic', build: buildClinic },
  { id: 'diagnostic', bn: 'ডায়াগনস্টিক সেন্টার', en: 'Diagnostic centre', group: 'health', grade: 4, floors: 4, cityId: 'diagnostic', build: buildDiagnostic },
  { id: 'mosque', bn: 'মসজিদ', en: 'Mosque', group: 'religious', grade: 4, floors: 2, cityId: 'mosque', build: buildMosque },
  { id: 'temple', bn: 'মন্দির', en: 'Hindu temple', group: 'religious', grade: 3, floors: 2, cityId: 'temple', build: buildTemple },
  { id: 'church', bn: 'গির্জা', en: 'Church', group: 'religious', grade: 3, floors: 3, cityId: 'church', build: buildChurch },
  { id: 'eidgah', bn: 'ঈদগাহ', en: 'Eidgah', group: 'religious', grade: 3, floors: 1, cityId: 'eidgah', build: buildEidgah },
  { id: 'overwater_villas', bn: 'সমুদ্রের ওপর ভিলা', en: 'Overwater villas', group: 'commercial', grade: 5, floors: 1, build: buildOverwaterVillas },
  { id: 'cliff_mansion', bn: 'ক্লিফ-টপ ম্যানশন', en: 'Cliff-top mansion', group: 'residential', grade: 5, floors: 3, build: buildCliffMansion },
  { id: 'marina', bn: 'মেরিনা ইয়ট ক্লাব', en: 'Marina yacht club', group: 'recreation', grade: 5, floors: 2, build: buildMarina },
  { id: 'beach_resort', bn: 'বিচ রিসোর্ট', en: 'Beach resort', group: 'commercial', grade: 5, floors: 12, build: buildBeachResort },
  { id: 'tropical_villa', bn: 'ট্রপিক্যাল বিচ ভিলা', en: 'Tropical beach villa', group: 'residential', grade: 5, floors: 1, build: buildTropicalVilla },
  { id: 'lighthouse', bn: 'বাতিঘর', en: 'Lighthouse', group: 'utility', grade: 3, floors: 1, build: buildLighthouse },
  { id: 'village_farm', bn: 'গ্রামের খামার (উঁচু-নিচু জমি)', en: 'Village farm (undulating land)', group: 'residential', grade: 2, floors: 1, build: buildVillageFarm },
  { id: 'hill_farm', bn: 'পাহাড়ি ঢালের খামার', en: 'Hill terrace farm', group: 'residential', grade: 2, floors: 1, build: buildHillFarm },
  { id: 'union_parishad', bn: 'ইউনিয়ন পরিষদ কার্যালয়', en: 'Union Parishad office', group: 'civic', grade: 2, floors: 1, build: buildUnionParishad },
  { id: 'upazila_complex', bn: 'উপজেলা পরিষদ কমপ্লেক্স', en: 'Upazila Parishad complex', group: 'civic', grade: 3, floors: 3, build: buildUpazilaComplex },
  { id: 'police_station', bn: 'থানা', en: 'Police station (thana)', group: 'civic', grade: 3, floors: 2, build: buildPoliceStation },
  { id: 'fire_station', bn: 'ফায়ার সার্ভিস স্টেশন', en: 'Fire service station', group: 'civic', grade: 3, floors: 2, build: buildFireStation },
  { id: 'post_office', bn: 'ডাকঘর', en: 'Post office', group: 'civic', grade: 3, floors: 2, build: buildPostOffice },
  { id: 'district_court', bn: 'জেলা জজ আদালত', en: 'District judge court', group: 'civic', grade: 4, floors: 3, build: buildDistrictCourt },
  { id: 'dc_office', bn: 'জেলা প্রশাসকের কার্যালয়', en: 'DC office (Deputy Commissioner)', group: 'civic', grade: 4, floors: 6, build: buildDCOffice },
  { id: 'city_hall', bn: 'সিটি হল', en: 'City hall', group: 'civic', grade: 5, floors: 6, build: buildCityHall },
];

export const BUILDING_MODEL_BY_ID: Record<string, BuildingModelDef> = Object.fromEntries(BUILDING_MODELS.map((m) => [m.id, m]));
