import type { RoadKind } from '../roads/RoadTypes';
import type { WorldZoneKind } from '../city/WorldZones';
import type { ZoneKind } from '../city/CityPlan';

/**
 * WHERE A VEHICLE BELONGS. Every VehicleSpec has a `use` (the compiler refuses a new vehicle without one), and AI traffic obeys it:
 *  - a vehicle only appears on a road kind / in a world zone it is allowed in,
 *  - and its route never leaves them (at a junction it simply does not turn onto a road it may not use).
 * Example: a cycle rickshaw lives on local streets of residential / village / commercial areas - never on an arterial or a freeway.
 * A CNG auto serves residential streets and collector roads. A bus runs the main roads. Adding a vehicle = pick one of the presets below
 * (or write a new one), nothing else to wire up.
 */
export interface VehicleUse {
  /** How often it appears compared with the others (0 = never in AI traffic). */
  weight: number;
  /** Road kinds it may drive on: highway (freeway), arterial, collector, local (residential street), roundabout. */
  roads: readonly RoadKind[];
  /** World zones (see city/WorldZones) it may appear in / drive through OUTSIDE the planned cities; 'any' = every zone. */
  zones: readonly WorldZoneKind[] | 'any';
  /** Planned city areas (see city/CityPlan: residential, commercial, industrial, education ...) it may appear in / drive through INSIDE a city. */
  areas: readonly ZoneKind[] | 'any';
}

/**
 * MASTER SWITCH. true = every AI-traffic vehicle (car, bike, rickshaw, auto, bus, truck, shuttle, buggy) may drive on every road kind in every
 * place, by its `weight`. false = the per-vehicle rules of each preset below (road kinds / zones / areas) apply again.
 * Vehicles with weight 0 (military, special) never appear in traffic either way.
 */
export const ALL_VEHICLES_EVERYWHERE = true;

export function canUseRoad(u: VehicleUse, road: RoadKind): boolean {
  if (ALL_VEHICLES_EVERYWHERE) return true;
  return u.roads.includes(road);
}

/**
 * Is this place OK for the vehicle? Inside a planned city the city AREA decides (homes, bazaar, campus ...),
 * everywhere else the world ZONE (farmland, village, industrial ...).
 */
export function canUsePlace(u: VehicleUse, zone: WorldZoneKind, area: ZoneKind | null): boolean {
  if (ALL_VEHICLES_EVERYWHERE) return true;
  if (area) return u.areas === 'any' || u.areas.includes(area);
  return u.zones === 'any' || u.zones.includes(zone);
}

/** Is this vehicle allowed on this kind of road at this place? */
export function canUse(u: VehicleUse, road: RoadKind, zone: WorldZoneKind, area: ZoneKind | null): boolean {
  return u.weight > 0 && canUseRoad(u, road) && canUsePlace(u, zone, area);
}

const ALL_ROADS: readonly RoadKind[] = ['highway', 'arterial', 'collector', 'local', 'roundabout'];
const MAIN_ROADS: readonly RoadKind[] = ['highway', 'arterial', 'collector', 'roundabout'];
const CITY_ROADS: readonly RoadKind[] = ['arterial', 'collector', 'local', 'roundabout']; // everything except the freeway
const STREETS: readonly RoadKind[] = ['collector', 'local', 'roundabout']; // neighbourhood roads
const HOME_ZONES: readonly WorldZoneKind[] = ['residential', 'village', 'education', 'commercial'];
const HOME_AREAS: readonly ZoneKind[] = ['residential', 'commercial', 'mixed', 'education', 'health'];

export const USE = {
  /** Cars and SUVs: every road, every place. */
  car: (weight: number): VehicleUse => ({ weight, roads: ALL_ROADS, zones: 'any', areas: 'any' }),
  /** Motorbikes: everything except the freeway. */
  bike: (weight: number): VehicleUse => ({ weight, roads: CITY_ROADS, zones: 'any', areas: 'any' }),
  /** CNG auto-rickshaws: neighbourhood roads of homes, bazaars, campuses, hospitals (not freeways, not arterials, not factories). */
  auto: (weight: number): VehicleUse => ({
    weight,
    roads: STREETS,
    zones: [...HOME_ZONES, 'urban-core', 'civic'],
    areas: [...HOME_AREAS, 'civic', 'recreation', 'transport'],
  }),
  /** Cycle rickshaws: local streets only, in residential, bazaar / shop, campus and hospital areas. */
  rickshaw: (weight: number): VehicleUse => ({ weight, roads: ['local'], zones: HOME_ZONES, areas: HOME_AREAS }),
  /** Buses: the main road network (freeway, arterial, collector), every place. */
  bus: (weight: number): VehicleUse => ({ weight, roads: MAIN_ROADS, zones: 'any', areas: 'any' }),
  /** Trucks / pickups: main roads, working places (industry, depots, utilities, markets, farmland, ports). */
  truck: (weight: number): VehicleUse => ({
    weight,
    roads: MAIN_ROADS,
    zones: ['industrial', 'logistics', 'seaport', 'airport', 'utility', 'farmland', 'commercial', 'urban-core', 'village'],
    areas: ['industrial', 'transport', 'utility', 'commercial', 'mixed'],
  }),
  /** Golf-cart shuttles: slow neighbourhood roads inside campuses, parks, hospitals, civic and residential areas. */
  shuttle: (weight: number): VehicleUse => ({
    weight,
    roads: ['local', 'collector'],
    zones: ['education', 'park', 'civic', 'residential', 'airport', 'coast'],
    areas: ['education', 'recreation', 'civic', 'health', 'residential'],
  }),
  /** Utility buggies: local roads in farmland, villages, parks, green belts, utility sites. */
  buggy: (weight: number): VehicleUse => ({
    weight,
    roads: ['local', 'collector'],
    zones: ['farmland', 'village', 'park', 'utility', 'wetland'],
    areas: ['green', 'recreation', 'utility'],
  }),
  /** Never in AI traffic (military, special). */
  none: (): VehicleUse => ({ weight: 0, roads: ALL_ROADS, zones: 'any', areas: 'any' }),
};
