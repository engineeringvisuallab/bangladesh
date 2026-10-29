/**
 * One map projection for the whole country: Transverse Mercator on the WGS84 ellipsoid, central meridian 87 E,
 * k0 = 0.9996, false easting 500000 (this is exactly "UTM zone 45N", the grid Google Earth showed you).
 *
 * Bangladesh spans UTM zones 45 and 46. Using ONE projection for every city (never switching zone) means two
 * cities always sit in the same coordinate space and nothing jumps by hundreds of km. The price is a small scale
 * error far from 87 E (about 0.4 % at the far east border), which is irrelevant for a game.
 *
 * Pure functions, no dependencies. Series: Kruger n-series (3rd order), accurate to well below 1 mm here.
 */
const A = 6378137.0;
const F = 1 / 298.257223563;
const N = F / (2 - F);
const K0 = 0.9996;
const FALSE_E = 500000;
const CENTRAL_MERIDIAN = (87 * Math.PI) / 180;

const A1 = (A / (1 + N)) * (1 + (N * N) / 4 + N ** 4 / 64);
const ALPHA = [N / 2 - (2 * N ** 2) / 3 + (5 * N ** 3) / 16, (13 * N ** 2) / 48 - (3 * N ** 3) / 5, (61 * N ** 3) / 240];
const BETA = [N / 2 - (2 * N ** 2) / 3 + (37 * N ** 3) / 96, N ** 2 / 48 + N ** 3 / 15, (17 * N ** 3) / 480];
const DELTA = [2 * N - (2 * N ** 2) / 3 - 2 * N ** 3, (7 * N ** 2) / 3 - (8 * N ** 3) / 5, (56 * N ** 3) / 15];

export interface EN {
  /** Easting, metres. */
  e: number;
  /** Northing, metres. */
  n: number;
}
export interface LonLat {
  lon: number;
  lat: number;
}

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** Longitude / latitude in degrees -> easting / northing in metres. */
export function lonLatToEN(lon: number, lat: number): EN {
  const p = rad(lat);
  const l = rad(lon) - CENTRAL_MERIDIAN;
  const q = (2 * Math.sqrt(N)) / (1 + N);
  const t = Math.sinh(Math.atanh(Math.sin(p)) - q * Math.atanh(q * Math.sin(p)));
  const xi = Math.atan2(t, Math.cos(l));
  const eta = Math.atanh(Math.sin(l) / Math.sqrt(1 + t * t));
  let e = eta;
  let n = xi;
  for (let j = 0; j < 3; j++) {
    const k = 2 * (j + 1);
    e += ALPHA[j] * Math.cos(k * xi) * Math.sinh(k * eta);
    n += ALPHA[j] * Math.sin(k * xi) * Math.cosh(k * eta);
  }
  return { e: FALSE_E + K0 * A1 * e, n: K0 * A1 * n };
}

/** Easting / northing in metres -> longitude / latitude in degrees. */
export function enToLonLat(e: number, n: number): LonLat {
  const xi = n / (K0 * A1);
  const eta = (e - FALSE_E) / (K0 * A1);
  let xp = xi;
  let ep = eta;
  for (let j = 0; j < 3; j++) {
    const k = 2 * (j + 1);
    xp -= BETA[j] * Math.sin(k * xi) * Math.cosh(k * eta);
    ep -= BETA[j] * Math.cos(k * xi) * Math.sinh(k * eta);
  }
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep));
  let lat = chi;
  for (let j = 0; j < 3; j++) lat += DELTA[j] * Math.sin(2 * (j + 1) * chi);
  const lon = CENTRAL_MERIDIAN + Math.atan2(Math.sinh(ep), Math.cos(xp));
  return { lon: deg(lon), lat: deg(lat) };
}
