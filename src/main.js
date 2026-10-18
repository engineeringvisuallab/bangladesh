import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const $ = (id) => document.getElementById(id);
const TILE_SIZE = 3000; // coordinate metres across; one streamed world tile
const GRID_VERSION = 2;
const GRID_REFERENCE_LAT = 23.5; // fixed projection reference keeps all neighboring tile edges aligned
const GRID_COS = Math.cos(THREE.MathUtils.degToRad(GRID_REFERENCE_LAT));
const GRID_SEGMENTS = 32; // ~94 m spacing for the broad-resolution GLO-90 DEM
const NEAR_DETAIL_RADIUS_M = 100; // full building geometry inside this camera distance
const TILE_DEMOTE_DISTANCE_M = 3600;
const MAX_RESIDENT_TILES = 17; // keeps a moving 3D world within a bounded memory budget
const TILE_GRID_LAT_ORIGIN = 20.5;
const TILE_GRID_LON_ORIGIN = 88.0;
const DEFAULT_LOCATION = { name: 'Dhaka', lat: 23.8103, lon: 90.4125 };
const PLACES = {
  dhaka: { name: 'Dhaka', lat: 23.8103, lon: 90.4125 },
  gazipur: { name: 'Gazipur', lat: 24.0023, lon: 90.4264 },
  chattogram: { name: 'Chattogram', lat: 22.3569, lon: 91.7832 },
  khulna: { name: 'Khulna', lat: 22.8456, lon: 89.5403 },
  sylhet: { name: 'Sylhet', lat: 24.8949, lon: 91.8687 },
  rajshahi: { name: 'Rajshahi', lat: 24.3745, lon: 88.6042 },
  rangpur: { name: 'Rangpur', lat: 25.7439, lon: 89.2752 },
  barishal: { name: 'Barishal', lat: 22.7010, lon: 90.3535 },
  coxsbazar: { name: "Cox's Bazar", lat: 21.4272, lon: 92.0058 },
  bandarban: { name: 'Bandarban', lat: 22.1953, lon: 92.2184 },
  sundarbans: { name: 'Sundarbans', lat: 21.9497, lon: 89.1833 },
  padma: { name: 'Padma Bridge', lat: 23.4420, lon: 90.2640 },
};

const viewport = $('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x97baca);
scene.fog = new THREE.FogExp2(0x9ab8b7, 0.00014);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 25000);
camera.rotation.order = 'YXZ';
camera.position.set(0, 180, 700);
camera.rotation.set(-0.12, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', '3D world viewport. Click to capture mouse and use WASD to move.');
viewport.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xc3e6f0, 0x3c4b34, 1.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe1b0, 3.2);
sun.position.set(-1200, 1800, -700);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -2200;
sun.shadow.camera.right = 2200;
sun.shadow.camera.top = 2200;
sun.shadow.camera.bottom = -2200;
sun.shadow.bias = -0.00008;
scene.add(sun);
sun.target.position.set(0, 0, 0);
scene.add(sun.target);
const sky = new Sky();
sky.scale.setScalar(12000);
sky.material.uniforms.turbidity.value = 8;
sky.material.uniforms.rayleigh.value = 1.9;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.82;
const sunVector = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(65), THREE.MathUtils.degToRad(210));
sky.material.uniforms.sunPosition.value.copy(sunVector);
scene.add(sky);

const worldGroup = new THREE.Group();
scene.add(worldGroup);
let origin = { lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon };
let activeTile = null; // terrain payload for the tile currently under the player
let activeTileKey = null;
let tileLoading = false; // only used for the first-load/travel overlay; movement is not blocked by background streaming
let hasEntered = false;
let worldReady = false;
const residentTiles = new Map();
const tileLoadPromises = new Map();
const tileRetryAfter = new Map();
let lastStreamCheck = 0;
let lastPrefetchKey = null;
let lastStreamErrorKey = null;
let lookAheadTileKey = null;
let isGroundMode = false;
let panelOpen = true;
let pointerLocked = false;
let yaw = 0;
let pitch = -0.12;
let terrainReal = false;
let osmReal = false;
let lastToastAt = 0;
const keys = new Set();
const clock = new THREE.Clock();

const mats = {
  roadBase: new THREE.MeshStandardMaterial({ color: 0x6a6558, roughness: 0.97, metalness: 0.01, side: THREE.DoubleSide }),
  motorway: new THREE.MeshStandardMaterial({ color: 0x303b3d, roughness: 0.88, side: THREE.DoubleSide }),
  majorRoad: new THREE.MeshStandardMaterial({ color: 0x414a4a, roughness: 0.9, side: THREE.DoubleSide }),
  localRoad: new THREE.MeshStandardMaterial({ color: 0x686f68, roughness: 1, side: THREE.DoubleSide }),
  lane: new THREE.MeshStandardMaterial({ color: 0xf0d5a0, roughness: 0.8, side: THREE.DoubleSide }),
  water: new THREE.MeshStandardMaterial({ color: 0x287f9a, roughness: 0.32, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.94 }),
  waterArea: new THREE.MeshStandardMaterial({ color: 0x2d8094, roughness: 0.25, metalness: 0.06, side: THREE.DoubleSide, transparent: true, opacity: 0.94 }),
  railBed: new THREE.MeshStandardMaterial({ color: 0x373b3b, roughness: 1, side: THREE.DoubleSide }),
  rail: new THREE.MeshStandardMaterial({ color: 0x9a9fa0, roughness: 0.36, metalness: 0.58, side: THREE.DoubleSide }),
  building: new THREE.MeshStandardMaterial({ color: 0x9b9b87, roughness: 0.91, metalness: 0.01 }),
  buildingWarm: new THREE.MeshStandardMaterial({ color: 0xb39b7d, roughness: 0.92, metalness: 0.01 }),
  buildingRoof: new THREE.MeshStandardMaterial({ color: 0x7b776a, roughness: 0.93, side: THREE.DoubleSide }),
};

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  lastToastAt = performance.now();
}
function setStatus(id, value) { $(id).textContent = value; }
function setWorldState(value) { setStatus('worldState', value.toUpperCase()); }
function setLoadingVeil(show, title = 'Building world tile', detail = 'Fetching terrain elevations and mapped geometry…') {
  $('loadingVeil').hidden = !show;
  $('veilTitle').textContent = title;
  $('veilDetail').textContent = detail;
}
function centerWorldCoords(lat, lon, around = origin) {
  // One fixed equirectangular reference avoids row-dependent tile offsets and edge cracks.
  const x = (lon - around.lon) * 111320 * GRID_COS;
  const z = (around.lat - lat) * 111320;
  return { x, z };
}
// Fixed-reference grid v2: the same coordinates always resolve to the same file; every row uses the same longitude step so tile edges align.
function tileAddressAtGrid(row, col) {
  const latStep = TILE_SIZE / 111320;
  const lonStep = TILE_SIZE / (111320 * GRID_COS);
  const centerLat = TILE_GRID_LAT_ORIGIN + (row + 0.5) * latStep;
  const centerLon = TILE_GRID_LON_ORIGIN + (col + 0.5) * lonStep;
  return { row, col, key: `r${row}_c${col}`, origin: { lat: centerLat, lon: centerLon }, sizeMeters: TILE_SIZE, gridVersion: GRID_VERSION };
}
function tileAddressFor(lat, lon) {
  const latStep = TILE_SIZE / 111320;
  const lonStep = TILE_SIZE / (111320 * GRID_COS);
  const row = Math.floor((lat - TILE_GRID_LAT_ORIGIN) / latStep);
  const col = Math.floor((lon - TILE_GRID_LON_ORIGIN) / lonStep);
  return tileAddressAtGrid(row, col);
}
function latLonAtWorld(x, z) {
  return {
    lat: origin.lat - z / 111320,
    lon: origin.lon + x / (111320 * GRID_COS),
  };
}
function currentLatLon() { return latLonAtWorld(camera.position.x, camera.position.z); }
function formatCoord(value, positive, negative) {
  return `${Math.abs(value).toFixed(5)}° ${value >= 0 ? positive : negative}`;
}
function updateHUD() {
  const pos = currentLatLon();
  $('latValue').textContent = formatCoord(pos.lat, 'N', 'S');
  $('lonValue').textContent = formatCoord(pos.lon, 'E', 'W');
  $('altValue').textContent = `${Math.max(0, camera.position.y).toFixed(0)} m`;
  $('modeValue').textContent = isGroundMode ? 'GROUND FOLLOW' : 'DRONE';
}

function deterministicNoise(i, j, lat, lon) {
  const n = Math.sin((i + 13.2) * 12.9898 + (j - 3.4) * 78.233 + lat * 6.17 + lon * 1.31) * 43758.5453;
  return n - Math.floor(n);
}

function makeGroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = Math.random();
    const green = 79 + Math.floor(grain * 28);
    image.data[i] = 64 + Math.floor(grain * 24);
    image.data[i + 1] = green;
    image.data[i + 2] = 43 + Math.floor(grain * 15);
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}
const groundTexture = makeGroundTexture();

function fallbackHeight(lat, lon) {
  // Only used when the DEM service is unavailable; the UI explicitly marks this as non-real fallback.
  const wave = Math.sin(lat * 110.7) * 2.2 + Math.cos(lon * 83.3) * 1.4 + Math.sin((lat + lon) * 55) * 1.0;
  return Math.max(0, 6 + wave);
}

function makeFallbackTerrain(originPoint) {
  // Illustrative terrain only; this is never labeled as measured DEM data.
  const segments = GRID_SEGMENTS;
  const points = [];
  const heights = [];
  const nodataMask = [];
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const x = (i / segments - 0.5) * TILE_SIZE;
      const z = (j / segments - 0.5) * TILE_SIZE;
      const lat = originPoint.lat - z / 111320;
      const lon = originPoint.lon + x / (111320 * GRID_COS);
      points.push({ i, j, x, z, lat, lon });
      heights.push(fallbackHeight(lat, lon));
      nodataMask.push(true);
    }
  }
  return { segments, points, heights, nodataMask, sampleCount: heights.length, nodataSamples: heights.length, source: 'fallback — illustrative terrain, NOT measured elevation' };
}

async function fetchPrebuiltTile(address) {
  // Static tiles are served from the repository first. A missing file means this tile has not
  // been built yet, in which case the prototype may fall back to the live public endpoints.
  const configuredBase = window.BDOW_CONFIG?.tileBaseUrl;
  const basePath = configuredBase ? `${String(configuredBase).trim().replace(/\/+$/, '')}/` : null;
  const baseUrl = basePath
    ? new URL(basePath, document.baseURI)
    : new URL('../data/tiles/', import.meta.url);
  const url = new URL(`${address.key}.json`, baseUrl);
  const response = await fetch(url, { cache: 'force-cache' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Prebuilt tile request returned HTTP ${response.status}`);
  const payload = await response.json();
  const terrain = payload?.terrain;
  const elements = payload?.osm?.elements;
  const savedOrigin = payload?.tile?.origin;
  const originMatches = savedOrigin && Number.isFinite(savedOrigin.lat) && Number.isFinite(savedOrigin.lon) &&
    Math.abs(savedOrigin.lat - address.origin.lat) <= 0.000001 &&
    Math.abs(savedOrigin.lon - address.origin.lon) <= 0.000001;
  if (payload?.schemaVersion !== GRID_VERSION || payload?.tile?.gridVersion !== GRID_VERSION ||
      payload?.tile?.key !== address.key || payload?.tile?.row !== address.row || payload?.tile?.col !== address.col ||
      payload?.tile?.sizeMeters !== TILE_SIZE || !originMatches || !Number.isInteger(terrain?.segments) ||
      !Array.isArray(terrain?.heights) || terrain.heights.length !== (terrain.segments + 1) ** 2 ||
      terrain.heights.some((value) => !Number.isFinite(value)) ||
      !Array.isArray(terrain?.nodataMask) || terrain.nodataMask.length !== terrain.heights.length ||
      terrain.nodataMask.some((value) => typeof value !== 'boolean') || !Array.isArray(elements)) {
    throw new Error(`Prebuilt tile ${address.key} uses an old, misplaced, or invalid schema. Rebuild it with the Stage 5 tools (grid v${GRID_VERSION}).`);
  }
  return payload;
}

async function fetchTerrain(originPoint) {
  const segments = GRID_SEGMENTS;
  const points = [];
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const x = (i / segments - 0.5) * TILE_SIZE;
      const z = (j / segments - 0.5) * TILE_SIZE;
      points.push({
        i, j, x, z,
        lat: originPoint.lat - z / 111320,
        lon: originPoint.lon + x / (111320 * GRID_COS),
      });
    }
  }
  const cacheKey = `bdow-dem-v3-grid${GRID_VERSION}-${tileAddressFor(originPoint.lat, originPoint.lon).key}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed.heights) && parsed.heights.length === points.length) {
        const nodataMask = Array.isArray(parsed.nodataMask) && parsed.nodataMask.length === points.length ? parsed.nodataMask : new Array(points.length).fill(false);
        return { segments, points, heights: parsed.heights, nodataMask, nodataSamples: nodataMask.filter(Boolean).length, sampleCount: points.length, source: 'cache' };
      }
    }
  } catch { /* storage disabled or full: simply fetch again */ }

  const chunks = [];
  for (let i = 0; i < points.length; i += 95) chunks.push(points.slice(i, i + 95));
  const allValues = new Array(points.length).fill(null);
  const allNoData = new Array(points.length).fill(false);
  let callsDone = 0;
  for (let chunkStart = 0; chunkStart < chunks.length; chunkStart += 3) {
    const chunkGroup = chunks.slice(chunkStart, chunkStart + 3);
    const responses = await Promise.all(chunkGroup.map(async (chunk, groupIndex) => {
      const firstPointIndex = (chunkStart + groupIndex) * 95;
      const latitudes = chunk.map((p) => p.lat.toFixed(5)).join(',');
      const longitudes = chunk.map((p) => p.lon.toFixed(5)).join(',');
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${latitudes}&longitude=${longitudes}`;
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Elevation service returned HTTP ${response.status}`);
      const json = await response.json();
      if (!Array.isArray(json.elevation) || json.elevation.length !== chunk.length) throw new Error('Elevation response did not match requested grid.');
      return { firstPointIndex, values: json.elevation };
    }));
    for (const response of responses) {
      response.values.forEach((h, index) => {
        const pointIndex = response.firstPointIndex + index;
        const valid = Number.isFinite(h);
        allValues[pointIndex] = valid ? h : 0;
        allNoData[pointIndex] = !valid;
      });
      callsDone++;
    }
    $('veilDetail').textContent = `Sampling real Copernicus GLO-90 elevations… ${Math.min(chunkStart + chunkGroup.length, chunks.length)} / ${chunks.length} batches`;
  }
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ heights: allValues, nodataMask: allNoData })); } catch { /* optional cache */ }
  return { segments, points, heights: allValues, nodataMask: allNoData, nodataSamples: allNoData.filter(Boolean).length, sampleCount: allValues.length, source: 'Open-Meteo / Copernicus GLO-90' };
}

async function fetchOSM(originPoint) {
  const half = TILE_SIZE / 2;
  const south = originPoint.lat - half / 111320;
  const north = originPoint.lat + half / 111320;
  const lonDelta = half / (111320 * GRID_COS);
  const west = originPoint.lon - lonDelta;
  const east = originPoint.lon + lonDelta;
  const bbox = `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`;
  // Per-feature output caps prevent one dense urban tile from exhausting the browser/public API.
  // A capped tile can omit mapped objects; the national product will use preprocessed vector tiles instead.
  const query = `[out:json][timeout:24][maxsize:67108864];way["highway"](${bbox});out geom 3500;way["railway"~"rail|light_rail|subway|narrow_gauge|tram|monorail"](${bbox});out geom 600;way["waterway"~"river|canal|stream|drain|ditch|tidal_channel"](${bbox});out geom 500;way["natural"="water"](${bbox});out geom 250;way["building"](${bbox});out geom 4000;`;
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: query }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`OSM service returned HTTP ${response.status}`);
      const json = await response.json();
      return { elements: Array.isArray(json.elements) ? json.elements : [], bbox };
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('OpenStreetMap geometry could not be loaded.');
}

function heightSampler(tile, x, z) {
  const s = tile.segments;
  const u = clamp((x / TILE_SIZE + 0.5) * s, 0, s);
  const v = clamp((z / TILE_SIZE + 0.5) * s, 0, s);
  const i0 = Math.floor(u), j0 = Math.floor(v);
  const i1 = Math.min(s, i0 + 1), j1 = Math.min(s, j0 + 1);
  const fu = u - i0, fv = v - j0;
  const h00 = tile.heights[j0 * (s + 1) + i0] ?? 0;
  const h10 = tile.heights[j0 * (s + 1) + i1] ?? h00;
  const h01 = tile.heights[j1 * (s + 1) + i0] ?? h00;
  const h11 = tile.heights[j1 * (s + 1) + i1] ?? h00;
  return (h00 * (1 - fu) * (1 - fv)) + (h10 * fu * (1 - fv)) + (h01 * (1 - fu) * fv) + (h11 * fu * fv);
}

function heightForGeo(tile, lat, lon) {
  const local = centerWorldCoords(lat, lon, tile.origin);
  return heightSampler(tile, local.x, local.z);
}

function createTerrain(tile) {
  const count = tile.segments + 1;
  const vertices = [];
  const colors = [];
  const indices = [];
  const minH = Math.min(...tile.heights);
  const maxH = Math.max(...tile.heights);
  for (let j = 0; j < count; j++) {
    for (let i = 0; i < count; i++) {
      const x = (i / tile.segments - 0.5) * TILE_SIZE;
      const z = (j / tile.segments - 0.5) * TILE_SIZE;
      const index = j * count + i;
      const h = tile.heights[index] ?? 0;
      vertices.push(x, h, z);
      const normalHeight = maxH - minH > 0.8 ? (h - minH) / (maxH - minH) : 0.25;
      const noise = deterministicNoise(i, j, tile.origin.lat, tile.origin.lon);
      const color = new THREE.Color().setHSL(0.285 - normalHeight * 0.045, 0.24 + noise * 0.12, 0.27 + noise * 0.10 + normalHeight * 0.11);
      colors.push(color.r, color.g, color.b);
      if (i < tile.segments && j < tile.segments) {
        indices.push(index, index + count, index + 1, index + 1, index + count, index + count + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ map: groundTexture, vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'REAL_DEM_TERRAIN_MESH';
  return mesh;
}

function wayCoords(element, tile) {
  if (!Array.isArray(element.geometry)) return [];
  return element.geometry.map((point) => centerWorldCoords(point.lat, point.lon, tile.origin));
}
function clipSegmentToSquare(a, b, half) {
  const dx = b.x - a.x, dz = b.z - a.z;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dz, dz];
  const q = [a.x + half, half - a.x, a.z + half, half - a.z];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return null; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [
    { x: a.x + t0 * dx, z: a.z + t0 * dz },
    { x: a.x + t1 * dx, z: a.z + t1 * dz },
  ];
}
function clipPolylineToTile(points) {
  const half = TILE_SIZE / 2;
  const paths = [];
  let current = [];
  const flush = () => { if (current.length > 1) paths.push(current); current = []; };
  for (let i = 0; i < points.length - 1; i++) {
    const segment = clipSegmentToSquare(points[i], points[i + 1], half);
    if (!segment) { flush(); continue; }
    const [a, b] = segment;
    if (!current.length) current = [a, b];
    else {
      const last = current[current.length - 1];
      if (Math.hypot(last.x - a.x, last.z - a.z) < 0.5) current.push(b);
      else { flush(); current = [a, b]; }
    }
    if (segment[1].x !== points[i + 1].x || segment[1].z !== points[i + 1].z) flush();
  }
  flush();
  return paths;
}
function roadWidth(tags = {}) {
  const width = Number.parseFloat(tags.width);
  if (Number.isFinite(width) && width > 0 && width < 100) return width;
  const level = tags.highway;
  if (level === 'motorway' || level === 'motorway_link') return 18;
  if (level === 'trunk' || level === 'trunk_link') return 14;
  if (level === 'primary' || level === 'primary_link') return 11;
  if (level === 'secondary' || level === 'secondary_link') return 8;
  if (level === 'tertiary' || level === 'tertiary_link') return 6;
  if (level === 'residential' || level === 'unclassified') return 4.5;
  if (level === 'service' || level === 'living_street') return 3.2;
  if (level === 'footway' || level === 'path' || level === 'pedestrian') return 1.6;
  return 3;
}
function waterWidth(tags = {}) {
  const width = Number.parseFloat(tags.width);
  if (Number.isFinite(width) && width > 0 && width < 500) return width;
  if (tags.waterway === 'river') return 35;
  if (tags.waterway === 'canal') return 12;
  if (tags.waterway === 'stream') return 4;
  if (tags.waterway === 'drain' || tags.waterway === 'ditch') return 2;
  return 8;
}
function ribbonGeometry(points, width, heightAt, lift = 0.2) {
  const positions = [];
  const indices = [];
  let segmentCount = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    const nx = -dz / len * width / 2;
    const nz = dx / len * width / 2;
    const ya = heightAt(a.x, a.z) + lift;
    const yb = heightAt(b.x, b.z) + lift;
    const base = segmentCount * 4;
    positions.push(a.x + nx, ya, a.z + nz, a.x - nx, ya, a.z - nz, b.x + nx, yb, b.z + nz, b.x - nx, yb, b.z - nz);
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    segmentCount++;
  }
  if (!segmentCount) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function closedRing(coords) {
  if (coords.length < 4) return false;
  const first = coords[0], last = coords[coords.length - 1];
  return Math.abs(first.lat - last.lat) < 0.00001 && Math.abs(first.lon - last.lon) < 0.00001;
}
function clipPolygonToTile(points) {
  const half = TILE_SIZE / 2;
  const clipEdges = [
    { inside: p => p.x >= -half, cross: (a, b) => { const t = (-half - a.x) / (b.x - a.x); return { x: -half, z: a.z + t * (b.z - a.z) }; } },
    { inside: p => p.x <= half, cross: (a, b) => { const t = (half - a.x) / (b.x - a.x); return { x: half, z: a.z + t * (b.z - a.z) }; } },
    { inside: p => p.z >= -half, cross: (a, b) => { const t = (-half - a.z) / (b.z - a.z); return { x: a.x + t * (b.x - a.x), z: -half }; } },
    { inside: p => p.z <= half, cross: (a, b) => { const t = (half - a.z) / (b.z - a.z); return { x: a.x + t * (b.x - a.x), z: half }; } },
  ];
  let output = points.slice();
  for (const edge of clipEdges) {
    const input = output;
    output = [];
    if (!input.length) break;
    let previous = input[input.length - 1];
    for (const current of input) {
      const prevIn = edge.inside(previous), currIn = edge.inside(current);
      if (currIn) {
        if (!prevIn) {
          const dx = current.x - previous.x, dz = current.z - previous.z;
          const denominator = (Math.abs(dx) > 1e-9 && (edge === clipEdges[0] || edge === clipEdges[1])) ? dx : dz;
          if (Math.abs(denominator) > 1e-9) output.push(edge.cross(previous, current));
        }
        output.push(current);
      } else if (prevIn) {
        const dx = current.x - previous.x, dz = current.z - previous.z;
        const denominator = (Math.abs(dx) > 1e-9 && (edge === clipEdges[0] || edge === clipEdges[1])) ? dx : dz;
        if (Math.abs(denominator) > 1e-9) output.push(edge.cross(previous, current));
      }
      previous = current;
    }
  }
  return output;
}

function createWaterArea(element, tile) {
  if (!Array.isArray(element.geometry) || element.geometry.length < 4) return null;
  const source = element.geometry;
  const first = source[0], last = source[source.length - 1];
  if (Math.abs(first.lat - last.lat) > 0.00001 || Math.abs(first.lon - last.lon) > 0.00001) return null;
  const unclosed = source.slice(0, -1).map((p) => centerWorldCoords(p.lat, p.lon, tile.origin));
  const points = clipPolygonToTile(unclosed);
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, -points[0].z);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, -points[i].z);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.rotateX(-Math.PI / 2);
  let x = 0, z = 0;
  points.forEach((p) => { x += p.x; z += p.z; });
  x /= points.length; z /= points.length;
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, mats.waterArea);
  mesh.position.y = heightSampler(tile, x, z) + 0.25;
  mesh.receiveShadow = true;
  mesh.userData.osmId = element.id;
  mesh.name = 'OSM_WATER_AREA';
  return mesh;
}

function offsetPolyline(path, offset) {
  return path.map((point, index) => {
    const previous = path[Math.max(0, index - 1)];
    const next = path[Math.min(path.length - 1, index + 1)];
    const dx = next.x - previous.x, dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: point.x + (dz / length) * offset, z: point.z - (dx / length) * offset };
  });
}

function createBuilding(element, tile) {
  const coords = element.geometry;
  if (!Array.isArray(coords) || coords.length < 4 || !closedRing(coords)) return null;
  // Clip footprints that cross a 3 km tile edge so they remain visible in both tiles.
  const source = coords.slice(0, -1).map((p) => centerWorldCoords(p.lat, p.lon, tile.origin));
  const local = clipPolygonToTile(source);
  if (local.length < 3) return null;
  let twiceArea = 0;
  for (let i = 0; i < local.length; i++) {
    const a = local[i], b = local[(i + 1) % local.length];
    twiceArea += a.x * b.z - b.x * a.z;
  }
  const area = Math.abs(twiceArea / 2);
  if (area < 8 || area > 45000) return null;
  const tags = element.tags || {};
  const explicitHeight = Number.parseFloat(String(tags.height || '').replace(/[^0-9.\-]/g, ''));
  const levels = Number.parseFloat(tags['building:levels']);
  let height;
  let estimated = false;
  if (Number.isFinite(explicitHeight) && explicitHeight >= 2 && explicitHeight <= 300) height = explicitHeight;
  else if (Number.isFinite(levels) && levels > 0 && levels <= 100) height = levels * 3.2;
  else { estimated = true; height = area > 2500 ? 13 : area > 800 ? 9 : area > 200 ? 6.5 : 4.2; }

  const xs = local.map((point) => point.x), zs = local.map((point) => point.z);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  const width = Math.max(2, Math.max(...xs) - Math.min(...xs));
  const depth = Math.max(2, Math.max(...zs) - Math.min(...zs));
  const shape = new THREE.Shape();
  shape.moveTo(local[0].x, -local[0].z);
  for (let i = 1; i < local.length; i++) shape.lineTo(local[i].x, -local[i].z);
  shape.closePath();
  const nearGeometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  nearGeometry.rotateX(-Math.PI / 2);
  // Recenter the real footprint so THREE.LOD's distance is measured from the building, not tile origin.
  nearGeometry.translate(-centerX, 0, -centerZ);
  nearGeometry.computeVertexNormals();

  const material = /industrial|warehouse|commercial|retail/.test(tags.building || '') ? mats.buildingWarm : mats.building;
  const baseHeight = heightSampler(tile, centerX, centerZ) + 0.15;
  const lod = new THREE.LOD();
  lod.position.set(centerX, baseHeight, centerZ);
  const detailed = new THREE.Mesh(nearGeometry, material);
  detailed.castShadow = true;
  detailed.receiveShadow = true;
  detailed.name = estimated ? 'OSM_BUILDING_REPORTED_FOOTPRINT_ESTIMATED_HEIGHT' : 'OSM_BUILDING_REPORTED_HEIGHT';
  const simplified = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  simplified.position.y = height / 2;
  simplified.castShadow = false;
  simplified.receiveShadow = true;
  simplified.name = 'OSM_BUILDING_FAR_LOD_BLOCK';
  lod.addLevel(detailed, 0);
  lod.addLevel(simplified, NEAR_DETAIL_RADIUS_M);
  lod.userData.heightEstimated = estimated;
  lod.userData.osmId = element.id;
  lod.userData.nearDetailRadius = NEAR_DETAIL_RADIUS_M;
  lod.name = estimated ? 'OSM_BUILDING_LOD_ESTIMATED_HEIGHT' : 'OSM_BUILDING_LOD_REPORTED_HEIGHT';
  return lod;
}


function createFarBuildingBlockGeometry(element, tile) {
  const coords = element.geometry;
  if (!Array.isArray(coords) || coords.length < 4 || !closedRing(coords)) return null;
  const source = coords.slice(0, -1).map((p) => centerWorldCoords(p.lat, p.lon, tile.origin));
  const local = clipPolygonToTile(source);
  if (local.length < 3) return null;
  let twiceArea = 0;
  for (let i = 0; i < local.length; i++) {
    const a = local[i], b = local[(i + 1) % local.length];
    twiceArea += a.x * b.z - b.x * a.z;
  }
  const area = Math.abs(twiceArea / 2);
  if (area < 8 || area > 45000) return null;
  const xs = local.map((point) => point.x), zs = local.map((point) => point.z);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  const width = Math.max(2, Math.max(...xs) - Math.min(...xs));
  const depth = Math.max(2, Math.max(...zs) - Math.min(...zs));
  const tags = element.tags || {};
  const explicitHeight = Number.parseFloat(String(tags.height || '').replace(/[^0-9.\-]/g, ''));
  const levels = Number.parseFloat(tags['building:levels']);
  const height = Number.isFinite(explicitHeight) && explicitHeight >= 2 && explicitHeight <= 300
    ? explicitHeight
    : Number.isFinite(levels) && levels > 0 && levels <= 100
      ? levels * 3.2
      : area > 2500 ? 13 : area > 800 ? 9 : area > 200 ? 6.5 : 4.2;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(centerX, heightSampler(tile, centerX, centerZ) + height / 2 + 0.12, centerZ);
  return geometry;
}

function createOSMGeometry(tile, osm, quality = 'near') {
  const group = new THREE.Group();
  const elements = osm?.elements || [];
  const farMode = quality === 'far';
  let roads = 0, waterways = 0, railways = 0, buildings = 0, waterAreas = 0;
  const MAX_ROAD_WAYS = 3500, MAX_WATERWAYS = 500, MAX_RAILWAYS = 600, MAX_WATER_AREAS = 250, MAX_BUILDINGS = 4000;
  const buckets = { roadBase: [], motorway: [], majorRoad: [], localRoad: [], water: [], railBed: [], rail: [] };
  const farBuildingGeometries = [];
  for (const element of elements) {
    if (element.type !== 'way' || !Array.isArray(element.geometry)) continue;
    const tags = element.tags || {};
    if (tags.highway) {
      const majorRoad = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link'].includes(tags.highway);
      if (farMode && !majorRoad) continue;
      if (roads >= (farMode ? 500 : MAX_ROAD_WAYS)) continue;
      const points = wayCoords(element, tile);
      const paths = clipPolylineToTile(points);
      if (!paths.length) continue;
      const width = roadWidth(tags);
      const materialKey = ['motorway', 'motorway_link'].includes(tags.highway) ? 'motorway' : ['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link'].includes(tags.highway) ? 'majorRoad' : 'localRoad';
      let drewRoad = false;
      for (const path of paths) {
        const shoulder = ribbonGeometry(path, width + 1.1, (x, z) => heightSampler(tile, x, z), 0.08);
        const surface = ribbonGeometry(path, width, (x, z) => heightSampler(tile, x, z), 0.18);
        if (shoulder) { buckets.roadBase.push(shoulder); drewRoad = true; }
        if (surface) { buckets[materialKey].push(surface); drewRoad = true; }
      }
      if (drewRoad) roads++;
      continue;
    }
    if (tags.railway && ['rail', 'light_rail', 'subway', 'narrow_gauge', 'tram', 'monorail'].includes(tags.railway)) {
      if (railways >= MAX_RAILWAYS) continue;
      const paths = clipPolylineToTile(wayCoords(element, tile));
      let drewRail = false;
      for (const path of paths) {
        const bed = ribbonGeometry(path, 3.8, (x, z) => heightSampler(tile, x, z), 0.12);
        const leftRail = ribbonGeometry(offsetPolyline(path, 0.72), 0.14, (x, z) => heightSampler(tile, x, z), 0.25);
        const rightRail = ribbonGeometry(offsetPolyline(path, -0.72), 0.14, (x, z) => heightSampler(tile, x, z), 0.25);
        if (bed) { buckets.railBed.push(bed); drewRail = true; }
        if (leftRail) { buckets.rail.push(leftRail); drewRail = true; }
        if (rightRail) { buckets.rail.push(rightRail); drewRail = true; }
      }
      if (drewRail) railways++;
      continue;
    }
    if (tags.waterway) {
      if (waterways >= MAX_WATERWAYS) continue;
      const paths = clipPolylineToTile(wayCoords(element, tile));
      let drewWater = false;
      for (const path of paths) {
        const geometry = ribbonGeometry(path, waterWidth(tags), (x, z) => heightSampler(tile, x, z), 0.33);
        if (geometry) { buckets.water.push(geometry); drewWater = true; }
      }
      if (drewWater) waterways++;
      continue;
    }
    if (tags.natural === 'water') {
      if (waterAreas >= MAX_WATER_AREAS) continue;
      const mesh = createWaterArea(element, tile);
      if (mesh) { group.add(mesh); waterAreas++; }
      continue;
    }
    if (tags.building) {
      if (buildings >= MAX_BUILDINGS) continue;
      if (farMode) {
        const geometry = createFarBuildingBlockGeometry(element, tile);
        if (geometry) { farBuildingGeometries.push(geometry); buildings++; }
      } else {
        const mesh = createBuilding(element, tile);
        if (mesh) { group.add(mesh); buildings++; }
      }
    }
  }
  for (const [key, geometries] of Object.entries(buckets)) {
    if (!geometries.length) continue;
    const mergedPositions = [], mergedIndices = [];
    for (const geometry of geometries) {
      const pos = geometry.getAttribute('position').array;
      const offset = mergedPositions.length / 3;
      for (let i = 0; i < pos.length; i++) mergedPositions.push(pos[i]);
      const idx = geometry.getIndex()?.array;
      if (idx) for (let i = 0; i < idx.length; i++) mergedIndices.push(idx[i] + offset);
      geometry.dispose();
    }
    const combined = new THREE.BufferGeometry();
    combined.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
    combined.setIndex(mergedIndices);
    combined.computeVertexNormals();
    const mesh = new THREE.Mesh(combined, mats[key]);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = `OSM_${key.toUpperCase()}_MESH`;
    group.add(mesh);
  }
  if (farBuildingGeometries.length) {
    const mergedPositions = [], mergedIndices = [];
    for (const geometry of farBuildingGeometries) {
      const pos = geometry.getAttribute('position').array;
      const offset = mergedPositions.length / 3;
      for (let i = 0; i < pos.length; i++) mergedPositions.push(pos[i]);
      const idx = geometry.getIndex()?.array;
      if (idx) for (let i = 0; i < idx.length; i++) mergedIndices.push(idx[i] + offset);
      geometry.dispose();
    }
    const combined = new THREE.BufferGeometry();
    combined.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
    combined.setIndex(mergedIndices);
    combined.computeVertexNormals();
    const mesh = new THREE.Mesh(combined, mats.building);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'OSM_BUILDINGS_MERGED_FAR_LOD';
    group.add(mesh);
  }
  return { group, roads, waterways, railways, buildings, waterAreas };
}

function disposeGroup(group) {
  group.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material && !Object.values(mats).includes(object.material)) {
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material.dispose();
    }
    // Shared OSM materials and shared terrain texture intentionally remain alive.
  });
}

function positionResidentTile(record) {
  const offset = centerWorldCoords(record.tile.origin.lat, record.tile.origin.lon, origin);
  record.group.position.set(offset.x, 0, offset.z);
}
function repositionResidentTiles() {
  for (const record of residentTiles.values()) positionResidentTile(record);
}
function tileLocalXZ(record, worldX = camera.position.x, worldZ = camera.position.z) {
  return { x: worldX - record.group.position.x, z: worldZ - record.group.position.z };
}
function recordForAddress(address) { return residentTiles.get(address.key) || null; }
function currentTileRecord() {
  const pos = currentLatLon();
  const address = tileAddressFor(pos.lat, pos.lon);
  return residentTiles.get(address.key) || activeTileKey && residentTiles.get(activeTileKey) || null;
}

function terrainEdgeIndices(tile, side) {
  const segments = tile.segments;
  const width = segments + 1;
  if (side === 'west') return Array.from({ length: width }, (_, j) => j * width);
  if (side === 'east') return Array.from({ length: width }, (_, j) => j * width + segments);
  if (side === 'north') return Array.from({ length: width }, (_, i) => i);
  if (side === 'south') return Array.from({ length: width }, (_, i) => segments * width + i);
  return [];
}

function reconcileTerrainPair(a, sideA, b, sideB) {
  if (!a || !b || a.tile.segments !== b.tile.segments) return false;
  // Do not quietly average extreme edge jumps; those usually mean mismatched or broken source data.
  const MAX_EDGE_BLEND_M = 20;
  const idsA = terrainEdgeIndices(a.tile, sideA);
  const idsB = terrainEdgeIndices(b.tile, sideB);
  let changedA = false;
  let changedB = false;
  let largeMismatchCount = 0;
  let maximumMismatch = 0;
  for (let k = 0; k < idsA.length; k++) {
    const ia = idsA[k], ib = idsB[k];
    const ha = a.tile.heights[ia], hb = b.tile.heights[ib];
    if (!Number.isFinite(ha) || !Number.isFinite(hb)) continue;
    const maskA = Array.isArray(a.tile.nodataMask) ? Boolean(a.tile.nodataMask[ia]) : false;
    const maskB = Array.isArray(b.tile.nodataMask) ? Boolean(b.tile.nodataMask[ib]) : false;
    let target;
    if (!maskA && !maskB) {
      const mismatch = Math.abs(ha - hb);
      if (mismatch > MAX_EDGE_BLEND_M) {
        largeMismatchCount++;
        maximumMismatch = Math.max(maximumMismatch, mismatch);
        continue;
      }
      target = (ha + hb) / 2;
    } else if (!maskA && maskB) {
      target = ha;
    } else if (maskA && !maskB) {
      target = hb;
    } else {
      // Both source samples are marked no-data; use the average of the current fallback values
      // solely for visual continuity, while retaining their no-data flags.
      target = (ha + hb) / 2;
    }
    const diffA = Math.abs(ha - target);
    const diffB = Math.abs(hb - target);
    if (diffA > 0.0001) {
      a.tile.heights[ia] = target;
      a.tile.seamAdjustedMask[ia] = true;
      changedA = true;
    }
    if (diffB > 0.0001) {
      b.tile.heights[ib] = target;
      b.tile.seamAdjustedMask[ib] = true;
      changedB = true;
    }
  }
  if (largeMismatchCount) {
    console.warn(`Terrain edge mismatch (${maximumMismatch.toFixed(2)} m max across ${largeMismatchCount} samples) between ${a.key} and ${b.key}; large differences were kept. Run tools/audit_tile_seams.py.`);
  }
  if (changedA) a.tile.seamAdjustedSamples = a.tile.seamAdjustedMask.filter(Boolean).length;
  if (changedB) b.tile.seamAdjustedSamples = b.tile.seamAdjustedMask.filter(Boolean).length;
  return changedA || changedB;
}

function residentNeighbors(record) {
  const row = record.address.row;
  const col = record.address.col;
  return [
    { record: residentTiles.get(`r${row}_c${col - 1}`), thisSide: 'west', otherSide: 'east' },
    { record: residentTiles.get(`r${row}_c${col + 1}`), thisSide: 'east', otherSide: 'west' },
    // Grid rows increase northward because latitude increases with row.
    { record: residentTiles.get(`r${row - 1}_c${col}`), thisSide: 'south', otherSide: 'north' },
    { record: residentTiles.get(`r${row + 1}_c${col}`), thisSide: 'north', otherSide: 'south' },
  ].filter((item) => item.record);
}

function terrainMeshFor(record) {
  return record.group.children.find((child) => child.name === 'REAL_DEM_TERRAIN_MESH') || null;
}

function rebuildTerrainOnly(record) {
  const previous = terrainMeshFor(record);
  if (previous) {
    record.group.remove(previous);
    disposeGroup(previous);
  }
  record.group.add(createTerrain(record.tile));
}

function smoothSharedTerrainNormals(a, sideA, b, sideB) {
  const meshA = terrainMeshFor(a), meshB = terrainMeshFor(b);
  if (!meshA || !meshB || a.tile.segments !== b.tile.segments) return;
  const normalA = meshA.geometry.getAttribute('normal');
  const normalB = meshB.geometry.getAttribute('normal');
  if (!normalA || !normalB) return;
  const idsA = terrainEdgeIndices(a.tile, sideA);
  const idsB = terrainEdgeIndices(b.tile, sideB);
  const av = new THREE.Vector3(), bv = new THREE.Vector3(), average = new THREE.Vector3();
  for (let i = 0; i < idsA.length; i++) {
    const ia = idsA[i], ib = idsB[i];
    const heightA = a.tile.heights[ia], heightB = b.tile.heights[ib];
    if (!Number.isFinite(heightA) || !Number.isFinite(heightB) || Math.abs(heightA - heightB) > 20) continue;
    av.fromBufferAttribute(normalA, ia);
    bv.fromBufferAttribute(normalB, ib);
    average.copy(av).add(bv).normalize();
    normalA.setXYZ(ia, average.x, average.y, average.z);
    normalB.setXYZ(ib, average.x, average.y, average.z);
  }
  normalA.needsUpdate = true;
  normalB.needsUpdate = true;
}

function reconcileResidentTerrain(record) {
  const visualsToRebuild = new Set();
  for (const neighborInfo of residentNeighbors(record)) {
    const neighbor = neighborInfo.record;
    const currentRow = record.address.row;
    const currentCol = record.address.col;
    const neighborRow = neighbor.address.row;
    const neighborCol = neighbor.address.col;
    let changed = false;
    if (neighborRow === currentRow && neighborCol === currentCol - 1) {
      changed = reconcileTerrainPair(neighbor, 'east', record, 'west');
    } else if (neighborRow === currentRow && neighborCol === currentCol + 1) {
      changed = reconcileTerrainPair(record, 'east', neighbor, 'west');
    } else if (neighborRow === currentRow - 1 && neighborCol === currentCol) {
      changed = reconcileTerrainPair(neighbor, 'north', record, 'south');
    } else if (neighborRow === currentRow + 1 && neighborCol === currentCol) {
      changed = reconcileTerrainPair(record, 'north', neighbor, 'south');
    }
    if (changed) visualsToRebuild.add(neighbor);
  }
  return visualsToRebuild;
}

function smoothResidentTerrainAround(record) {
  for (const item of residentNeighbors(record)) {
    const neighbor = item.record;
    const row = record.address.row, col = record.address.col;
    if (neighbor.address.row === row && neighbor.address.col === col - 1) smoothSharedTerrainNormals(neighbor, 'east', record, 'west');
    else if (neighbor.address.row === row && neighbor.address.col === col + 1) smoothSharedTerrainNormals(record, 'east', neighbor, 'west');
    else if (neighbor.address.row === row - 1 && neighbor.address.col === col) smoothSharedTerrainNormals(neighbor, 'north', record, 'south');
    else if (neighbor.address.row === row + 1 && neighbor.address.col === col) smoothSharedTerrainNormals(record, 'north', neighbor, 'south');
  }
}
function groundHeightAtCamera() {
  const record = currentTileRecord();
  if (!record) return 0;
  const local = tileLocalXZ(record);
  return heightSampler(record.tile, local.x, local.z);
}
function rebuildTileVisuals(record, quality) {
  for (const child of record.group.children.slice()) {
    record.group.remove(child);
    disposeGroup(child);
  }
  record.group.add(createTerrain(record.tile));
  record.stats = createOSMGeometry(record.tile, record.osmData, quality);
  record.group.add(record.stats.group);
  record.quality = quality;
  positionResidentTile(record);
  smoothResidentTerrainAround(record);
}
function updateActiveTileStatus(record) {
  if (!record) return;
  activeTile = record.tile;
  activeTileKey = record.key;
  const mode = record.dataMode || 'unknown source';
  setStatus('terrainState', record.terrainReal ? `${record.terrainSource}` : `UNVERIFIED: ${record.terrainSource || 'DEM unavailable'}`);
  setStatus('featureState', record.osmReal
    ? `${record.stats.roads} roads · ${record.stats.railways} railways · ${record.stats.waterways} waterways · ${record.stats.waterAreas} water areas · ${mode}`
    : (record.osmError ? 'OSM request failed · trying again when needed' : 'No mapped geometry in this tile'));
  setStatus('buildingState', record.osmReal ? `${record.stats.buildings} 3D building footprints · ${NEAR_DETAIL_RADIUS_M} m full-detail radius` : 'No building geometry included');
  const local = tileLocalXZ(record);
  setStatus('tileState', `${record.key} · ${residentTiles.size} tiles resident · ${record.quality.toUpperCase()} LOD · ${record.tile.seamAdjustedSamples || 0} edge samples aligned`);
}

function distanceToRecord(record) {
  const dx = camera.position.x - record.group.position.x;
  const dz = camera.position.z - record.group.position.z;
  return Math.hypot(dx, dz);
}
function evictDistantTiles() {
  if (residentTiles.size <= MAX_RESIDENT_TILES) return;
  const candidates = [...residentTiles.values()]
    .filter((record) => record.key !== activeTileKey)
    .sort((a, b) => distanceToRecord(b) - distanceToRecord(a));
  while (residentTiles.size > MAX_RESIDENT_TILES && candidates.length) {
    const record = candidates.shift();
    residentTiles.delete(record.key);
    worldGroup.remove(record.group);
    disposeGroup(record.group);
    if (record.key === activeTileKey) activeTile = null;
  }
}

async function loadTileRecord(address, { allowLive = true, quality = 'near' } = {}) {
  const resident = residentTiles.get(address.key);
  if (resident) {
    resident.lastUsed = performance.now();
    if (quality === 'near' && resident.quality !== 'near') rebuildTileVisuals(resident, 'near');
    else if (quality === 'far' && resident.quality !== 'far' && resident.key !== activeTileKey) rebuildTileVisuals(resident, 'far');
    return resident;
  }
  if (tileLoadPromises.has(address.key)) {
    const pending = await tileLoadPromises.get(address.key);
    if (pending && quality === 'near' && pending.quality !== 'near') rebuildTileVisuals(pending, 'near');
    return pending;
  }

  const promise = (async () => {
    let prebuilt = null;
    let elevationData;
    let osmData = { elements: [] };
    let osmError = null;
    let terrainReal = false;
    let osmReal = false;
    let dataMode = 'live API';
    try {
      try { prebuilt = await fetchPrebuiltTile(address); }
      catch (error) {
        console.warn(`Prebuilt tile ${address.key} could not be used.`, error);
        if (!allowLive) return null;
      }
      if (prebuilt) {
        elevationData = {
          segments: prebuilt.terrain.segments,
          points: [],
          heights: prebuilt.terrain.heights,
          nodataMask: prebuilt.terrain.nodataMask,
          nodataSamples: prebuilt.terrain.nodataSamples || 0,
          sampleCount: prebuilt.terrain.sampleCount || prebuilt.terrain.heights.length,
          source: prebuilt.terrain.source || 'prebuilt elevation tile',
        };
        osmData = prebuilt.osm;
        const sourceLooksReal = !/(fallback|not included|placeholder|not real)/i.test(String(elevationData.source));
        const noDataSamples = Number(prebuilt.terrain.nodataSamples || 0);
        const heightSamples = Number(prebuilt.terrain.sampleCount || prebuilt.terrain.heights.length);
        terrainReal = sourceLooksReal && heightSamples > 0 && noDataSamples / heightSamples <= 0.05;
        osmReal = !/not included/i.test(String(prebuilt.osm.source || ''));
        dataMode = 'prebuilt static tile';
      } else {
        if (!allowLive) return null; // prefetch is static-only; never fan out live API calls to eight neighbors
        if (window.BDOW_CONFIG?.allowLiveFallback === false) {
          throw new Error(`Static world tile ${address.key} is not hosted. Build it from the national dataset or enable live fallback in config.js.`);
        }
        const results = await Promise.allSettled([fetchTerrain(address.origin), fetchOSM(address.origin)]);
        if (results[0].status === 'fulfilled') {
          elevationData = results[0].value;
          terrainReal = elevationData.source !== 'fallback';
        } else {
          terrainReal = false;
          elevationData = makeFallbackTerrain(address.origin);
          console.warn(`DEM service failed for ${address.key}; illustrative fallback terrain is being used.`, results[0].reason);
        }
        if (results[1].status === 'fulfilled') { osmData = results[1].value; osmReal = true; }
        else { osmError = results[1].reason; osmReal = false; }
      }
    } catch (error) {
      if (!allowLive) return null;
      throw error;
    }

    const tile = { key: address.key, origin: address.origin, ...elevationData };
    tile.nodataMask = Array.isArray(tile.nodataMask) && tile.nodataMask.length === tile.heights.length
      ? tile.nodataMask : new Array(tile.heights.length).fill(false);
    tile.seamAdjustedMask = new Array(tile.heights.length).fill(false);
    tile.seamAdjustedSamples = 0;
    const group = new THREE.Group();
    group.name = `WORLD_TILE_${address.key}`;
    const record = {
      key: address.key, address, tile, group, osmData, osmError,
      terrainReal, osmReal, terrainSource: elevationData.source || 'unknown elevation source',
      dataMode, quality, stats: null, lastUsed: performance.now(),
    };
    // Register before geometry creation so arriving neighbors can reconcile their shared edge.
    worldGroup.add(group);
    residentTiles.set(record.key, record);
    const neighborsToRebuild = reconcileResidentTerrain(record);
    rebuildTileVisuals(record, quality);
    for (const neighbor of neighborsToRebuild) rebuildTerrainOnly(neighbor);
    smoothResidentTerrainAround(record);
    for (const neighbor of neighborsToRebuild) smoothResidentTerrainAround(neighbor);
    tileRetryAfter.delete(record.key);
    evictDistantTiles();
    return record;
  })();
  tileLoadPromises.set(address.key, promise);
  try { return await promise; }
  finally { tileLoadPromises.delete(address.key); }
}

async function prefetchNeighborTiles(address) {
  if (lastPrefetchKey === address.key) return;
  lastPrefetchKey = address.key;
  const neighbors = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
    for (let colOffset = -1; colOffset <= 1; colOffset++) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const neighbor = tileAddressAtGrid(address.row + rowOffset, address.col + colOffset);
      if (!residentTiles.has(neighbor.key) && !tileLoadPromises.has(neighbor.key)) neighbors.push(neighbor);
    }
  }
  // Small concurrency protects the static host and browser memory. Neighbors are static-only prefetches.
  let cursor = 0;
  const worker = async () => {
    while (cursor < neighbors.length) {
      const item = neighbors[cursor++];
      try { await loadTileRecord(item, { allowLive: false, quality: 'far' }); }
      catch (error) { console.debug(`Neighbor tile ${item.key} not prefetched:`, error); }
    }
  };
  await Promise.all([worker(), worker()]);
  evictDistantTiles();
}

function rebaseWorldTo(record, playerGeo, altitudeAboveGround = 120) {
  if (!record) return;
  origin = { lat: record.tile.origin.lat, lon: record.tile.origin.lon };
  repositionResidentTiles();
  const targetLocal = centerWorldCoords(playerGeo.lat, playerGeo.lon, origin);
  const tileLocal = centerWorldCoords(playerGeo.lat, playerGeo.lon, record.tile.origin);
  const ground = heightSampler(record.tile, tileLocal.x, tileLocal.z);
  camera.position.set(targetLocal.x, ground + altitudeAboveGround, targetLocal.z);
  activeTile = record.tile;
  activeTileKey = record.key;
  updateActiveTileStatus(record);
}

async function loadWorldTile(lat, lon, reason = 'travel', keepCamera = false) {
  const address = tileAddressFor(lat, lon);
  const isBlocking = !worldReady || reason === 'travel';
  const oldGeo = worldReady ? currentLatLon() : null;
  let altitudeAboveGround = 180;
  const oldRecord = currentTileRecord();
  if (oldRecord) {
    const local = tileLocalXZ(oldRecord);
    altitudeAboveGround = camera.position.y - heightSampler(oldRecord.tile, local.x, local.z);
  }
  if (isBlocking) {
    tileLoading = true;
    setLoadingVeil(true, reason === 'initial' ? 'Building first 3D world area' : 'Traveling to new world area', 'Loading real terrain and mapped features. Background streaming remains enabled during exploration.');
    setWorldState('LOADING WORLD DATA');
    $('enterButton').disabled = true;
  }

  try {
    const record = await loadTileRecord(address, { allowLive: true, quality: 'near' });
    if (!record) throw new Error(`Could not load world tile ${address.key}.`);
    const currentGeo = reason === 'rebase' && worldReady ? currentLatLon() : null;

    if (reason === 'initial') {
      origin = { lat: record.tile.origin.lat, lon: record.tile.origin.lon };
      repositionResidentTiles();
      const targetLocal = centerWorldCoords(lat, lon, origin);
      const localTile = centerWorldCoords(lat, lon, record.tile.origin);
      const startZ = targetLocal.z;
      const startX = targetLocal.x;
      const startGround = heightSampler(record.tile, localTile.x, localTile.z);
      camera.position.set(startX, startGround + 185, startZ);
      yaw = 0; pitch = -0.18;
      camera.rotation.set(pitch, yaw, 0);
      worldReady = true;
    } else if (reason === 'travel') {
      origin = { lat: record.tile.origin.lat, lon: record.tile.origin.lon };
      repositionResidentTiles();
      const targetLocal = centerWorldCoords(lat, lon, origin);
      const localTile = centerWorldCoords(lat, lon, record.tile.origin);
      const startZ = targetLocal.z;
      const startGround = heightSampler(record.tile, localTile.x, localTile.z);
      camera.position.set(targetLocal.x, startGround + 230, startZ);
      yaw = 0; pitch = -0.22;
      camera.rotation.set(pitch, yaw, 0);
      worldReady = true;
    } else if (reason === 'rebase' && currentGeo) {
      const nowAddress = tileAddressFor(currentGeo.lat, currentGeo.lon);
      if (nowAddress.key === record.key) rebaseWorldTo(record, currentGeo, altitudeAboveGround);
    }

    const playerPosition = currentLatLon();
    const playerAddress = tileAddressFor(playerPosition.lat, playerPosition.lon);
    const playerRecord = residentTiles.get(playerAddress.key);
    if (playerRecord) {
      if (playerRecord.key !== activeTileKey) {
        const local = tileLocalXZ(playerRecord);
        const aboveGround = camera.position.y - heightSampler(playerRecord.tile, local.x, local.z);
        rebaseWorldTo(playerRecord, playerPosition, Math.max(2, aboveGround));
      } else updateActiveTileStatus(playerRecord);
    }

    setWorldState('WORLD STREAMING');
    if (isBlocking) {
      $('enterButton').disabled = false;
      $('loadingMessage').textContent = `World tile ${record.key} loaded. Nearby tiles stream automatically. Click the scene and use WASD to explore.`;
      setLoadingVeil(false);
      tileLoading = false;
    }
    updateHUD();
    if (record.osmError) toast('Terrain loaded; mapped features were unavailable in this tile. Streaming can retry in another area.');
    else toast(`${record.key} ready · ${residentTiles.size} world tiles in memory`);
    prefetchNeighborTiles(address).catch((error) => console.debug('Neighbor prefetch skipped:', error));
    return record;
  } catch (error) {
    if (isBlocking) {
      $('loadingMessage').textContent = `World data error: ${error.message}`;
      setLoadingVeil(false);
      tileLoading = false;
      $('enterButton').disabled = false;
    }
    throw error;
  }
}

function updateTileQuality(currentAddress) {
  if (!worldReady) return;
  for (const record of residentTiles.values()) {
    const shouldBeNear = record.key === currentAddress.key || record.key === lookAheadTileKey;
    if (shouldBeNear && record.quality !== 'near') {
      rebuildTileVisuals(record, 'near');
    } else if (!shouldBeNear && record.quality !== 'far' && distanceToRecord(record) > TILE_DEMOTE_DISTANCE_M) {
      rebuildTileVisuals(record, 'far');
    }
  }
}

function shouldRebase() {
  if (!worldReady) return;
  const now = performance.now();
  if (now - lastStreamCheck < 300) return;
  lastStreamCheck = now;
  const pos = currentLatLon();
  const currentAddress = tileAddressFor(pos.lat, pos.lon);
  const resident = residentTiles.get(currentAddress.key);
  if (resident && activeTileKey !== currentAddress.key) {
    const currentLocal = tileLocalXZ(resident);
    const altitude = camera.position.y - heightSampler(resident.tile, currentLocal.x, currentLocal.z);
    rebaseWorldTo(resident, pos, Math.max(2, altitude));
    prefetchNeighborTiles(currentAddress).catch((error) => console.debug('Neighbor prefetch skipped:', error));
  } else if (!resident && !tileLoadPromises.has(currentAddress.key) && now >= (tileRetryAfter.get(currentAddress.key) || 0)) {
    loadWorldTile(pos.lat, pos.lon, 'rebase', true).catch((error) => {
      tileRetryAfter.set(currentAddress.key, performance.now() + 12000);
      if (lastStreamErrorKey !== currentAddress.key) {
        lastStreamErrorKey = currentAddress.key;
        toast(`World tile ${currentAddress.key} is not ready: ${error.message}`);
      }
    });
  }

  // Look ahead in camera direction. Request the next tile before the player reaches its border.
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const lookAheadMeters = 900;
  const aheadGeo = latLonAtWorld(camera.position.x + forward.x * lookAheadMeters, camera.position.z + forward.z * lookAheadMeters);
  const aheadAddress = tileAddressFor(aheadGeo.lat, aheadGeo.lon);
  lookAheadTileKey = aheadAddress.key !== currentAddress.key ? aheadAddress.key : null;
  if (lookAheadTileKey && !residentTiles.has(aheadAddress.key) && !tileLoadPromises.has(aheadAddress.key) && now >= (tileRetryAfter.get(aheadAddress.key) || 0)) {
    loadTileRecord(aheadAddress, { allowLive: true, quality: 'near' }).then((record) => {
      if (record) {
        positionResidentTile(record);
        evictDistantTiles();
      }
    }).catch((error) => {
      tileRetryAfter.set(aheadAddress.key, performance.now() + 15000);
      if (lastStreamErrorKey !== aheadAddress.key) {
        lastStreamErrorKey = aheadAddress.key;
        console.debug(`Look-ahead tile ${aheadAddress.key} failed:`, error);
      }
    });
  }
  updateTileQuality(currentAddress);
  const active = residentTiles.get(currentAddress.key);
  if (active) updateActiveTileStatus(active);
  evictDistantTiles();
}

function teleportTo(place) {
  if (!place) return;
  if (!hasEntered) {
    $('locationSelect').value = Object.keys(PLACES).find((key) => PLACES[key] === place) || 'dhaka';
    toast(`Selected ${place.name}. Enter the world to load it.`);
    return;
  }
  if (tileLoading) return;
  loadWorldTile(place.lat, place.lon, 'travel', false).catch(showFatalError);
}

function showFatalError(error) {
  console.error(error);
  setLoadingVeil(false);
  tileLoading = false;
  $('enterButton').disabled = false;
  $('fatalError').hidden = false;
  $('fatalError').textContent = `Could not finish building this world tile. ${error?.message || error}. Check your internet connection, then reload the page. Elevation and OpenStreetMap services are external and can be busy. The application code itself does not include a bundled full-country dataset.`;
}

function enterWorld() {
  if (hasEntered || tileLoading) return;
  hasEntered = true;
  $('startScreen').classList.add('hidden');
  $('worldPanel').classList.remove('closed');
  const selected = PLACES[$('locationSelect').value] || DEFAULT_LOCATION;
  loadWorldTile(selected.lat, selected.lon, 'initial', false).catch(showFatalError);
}

function togglePanel(force) {
  panelOpen = typeof force === 'boolean' ? force : !panelOpen;
  $('worldPanel').classList.toggle('closed', !panelOpen);
}

function moveCamera(dt) {
  if (!hasEntered || !worldReady || document.pointerLockElement !== renderer.domElement) return;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  let dx = 0, dz = 0;
  const baseSpeed = isGroundMode ? 24 : 95;
  const speed = baseSpeed * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 7 : 1);
  if (keys.has('KeyW') || keys.has('ArrowUp')) { dx += forward.x; dz += forward.z; }
  if (keys.has('KeyS') || keys.has('ArrowDown')) { dx -= forward.x; dz -= forward.z; }
  if (keys.has('KeyD') || keys.has('ArrowRight')) { dx += right.x; dz += right.z; }
  if (keys.has('KeyA') || keys.has('ArrowLeft')) { dx -= right.x; dz -= right.z; }
  const length = Math.hypot(dx, dz);
  if (length > 0) {
    camera.position.x += dx / length * speed * dt;
    camera.position.z += dz / length * speed * dt;
  }
  if (!isGroundMode) {
    if (keys.has('Space') || keys.has('KeyE')) camera.position.y += speed * 0.78 * dt;
    if (keys.has('KeyC') || keys.has('KeyQ')) camera.position.y -= speed * 0.78 * dt;
    camera.position.y = Math.max(2, camera.position.y);
  } else {
    const record = currentTileRecord();
    if (record) {
      const local = tileLocalXZ(record);
      camera.position.y = heightSampler(record.tile, local.x, local.z) + 1.75;
    }
  }
}

function toggleGroundMode() {
  const record = currentTileRecord();
  if (!record) return;
  isGroundMode = !isGroundMode;
  const local = tileLocalXZ(record);
  const ground = heightSampler(record.tile, local.x, local.z);
  camera.position.y = ground + (isGroundMode ? 1.75 : 120);
  setStatus('modeValue', isGroundMode ? 'GROUND FOLLOW' : 'DRONE');
  toast(isGroundMode ? 'Ground-follow mode enabled' : 'Drone mode enabled');
  updateHUD();
}

$('enterButton').addEventListener('click', enterWorld);
$('travelButton').addEventListener('click', () => teleportTo(PLACES[$('locationSelect').value]));
$('panelToggle').addEventListener('click', () => togglePanel());
$('locationSelect').addEventListener('change', () => {
  const place = PLACES[$('locationSelect').value];
  if (place) setStatus('tileState', `Ready to travel · ${place.name}`);
});
renderer.domElement.addEventListener('click', () => {
  if (hasEntered && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  $('game').classList.toggle('pointer-locked', pointerLocked);
  $('hudMessage').textContent = pointerLocked ? 'Mouse captured · Esc to release' : 'Click the world to look around';
});
document.addEventListener('mousemove', (event) => {
  if (!pointerLocked || !hasEntered) return;
  yaw -= event.movementX * 0.0021;
  pitch -= event.movementY * 0.0018;
  pitch = clamp(pitch, -Math.PI / 2 + 0.025, Math.PI / 2 - 0.025);
  camera.rotation.set(pitch, yaw, 0);
});
document.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'Tab') { event.preventDefault(); togglePanel(); }
  if (event.code === 'KeyF' && !event.repeat) toggleGroundMode();
  if (event.code === 'Escape') { pointerLocked = false; }
  if (event.code === 'KeyH' && !event.repeat && hasEntered) teleportTo(DEFAULT_LOCATION);
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
});

const clockDeltaCap = 0.045;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), clockDeltaCap);
  moveCamera(dt);
  if (activeTile && !isGroundMode) {
    // Keeps flight camera above sea level, while preserving low-altitude exploration.
    camera.position.y = Math.max(2, camera.position.y);
  }
  shouldRebase();
  updateHUD();
  if (performance.now() - lastToastAt > 2600) $('toast').classList.remove('show');
  renderer.render(scene, camera);
}

// The 3D renderer starts immediately, before any network data is requested.
setWorldState('READY TO ENTER');
setStatus('terrainState', 'Waiting to load real elevation');
setStatus('featureState', 'Waiting for mapped OSM geometry');
setStatus('buildingState', 'Waiting for OSM geometry');
setStatus('tileState', '3 km tiles · look-ahead streaming · 100 m building LOD');
animate();
