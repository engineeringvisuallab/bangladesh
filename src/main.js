import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const $ = (id) => document.getElementById(id);
const TILE_SIZE = 3000; // metres across; one streamed world tile
const GRID_SEGMENTS = 32; // ~94 m spacing for the broad-resolution GLO-90 DEM
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
let activeTile = null;
let tileLoading = false;
let hasEntered = false;
let isGroundMode = false;
let panelOpen = true;
let pointerLocked = false;
let yaw = 0;
let pitch = -0.12;
let terrainReal = false;
let osmReal = false;
let lastRebaseAt = 0;
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
  const x = (lon - around.lon) * 111320 * Math.cos(THREE.MathUtils.degToRad(around.lat));
  const z = (around.lat - lat) * 111320;
  return { x, z };
}
// Fixed geographic grid: the same coordinates always resolve to the same static tile file.
// Each row's longitude spacing is adjusted for its latitude so tiles remain approximately 3 km wide.
function tileAddressFor(lat, lon) {
  const latStep = TILE_SIZE / 111320;
  const row = Math.floor((lat - TILE_GRID_LAT_ORIGIN) / latStep);
  const centerLat = TILE_GRID_LAT_ORIGIN + (row + 0.5) * latStep;
  const lonStep = TILE_SIZE / (111320 * Math.cos(THREE.MathUtils.degToRad(centerLat)));
  const col = Math.floor((lon - TILE_GRID_LON_ORIGIN) / lonStep);
  const centerLon = TILE_GRID_LON_ORIGIN + (col + 0.5) * lonStep;
  return { row, col, key: `r${row}_c${col}`, origin: { lat: centerLat, lon: centerLon } };
}
function currentLatLon() {
  return {
    lat: origin.lat - camera.position.z / 111320,
    lon: origin.lon + camera.position.x / (111320 * Math.cos(THREE.MathUtils.degToRad(origin.lat))),
  };
}
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

async function fetchPrebuiltTile(address) {
  // Static tiles are served from the repository first. A missing file means this tile has not
  // been built yet, in which case the prototype may fall back to the live public endpoints.
  const url = new URL(`../data/tiles/${address.key}.json`, import.meta.url);
  const response = await fetch(url, { cache: 'force-cache' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Prebuilt tile request returned HTTP ${response.status}`);
  const payload = await response.json();
  const terrain = payload?.terrain;
  const elements = payload?.osm?.elements;
  if (payload?.tile?.key !== address.key || !Number.isFinite(terrain?.segments) ||
      !Array.isArray(terrain?.heights) || terrain.heights.length !== (terrain.segments + 1) ** 2 ||
      !Array.isArray(elements)) {
    throw new Error(`Prebuilt tile ${address.key} has an invalid schema. Rebuild it with tools/build_tile.py.`);
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
        lon: originPoint.lon + x / (111320 * Math.cos(THREE.MathUtils.degToRad(originPoint.lat))),
      });
    }
  }
  const cacheKey = `bdow-dem-v2-${tileAddressFor(originPoint.lat, originPoint.lon).key}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed.heights) && parsed.heights.length === points.length) {
        return { segments, points, heights: parsed.heights, source: 'cache' };
      }
    }
  } catch { /* storage disabled or full: simply fetch again */ }

  const chunks = [];
  for (let i = 0; i < points.length; i += 95) chunks.push(points.slice(i, i + 95));
  const allValues = new Array(points.length).fill(null);
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
      response.values.forEach((h, index) => { allValues[response.firstPointIndex + index] = Number.isFinite(h) ? h : 0; });
      callsDone++;
    }
    $('veilDetail').textContent = `Sampling real Copernicus GLO-90 elevations… ${Math.min(chunkStart + chunkGroup.length, chunks.length)} / ${chunks.length} batches`;
  }
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ heights: allValues })); } catch { /* optional cache */ }
  return { segments, points, heights: allValues, source: 'Open-Meteo / Copernicus GLO-90' };
}

async function fetchOSM(originPoint) {
  const half = TILE_SIZE / 2;
  const south = originPoint.lat - half / 111320;
  const north = originPoint.lat + half / 111320;
  const lonDelta = half / (111320 * Math.cos(THREE.MathUtils.degToRad(originPoint.lat)));
  const west = originPoint.lon - lonDelta;
  const east = originPoint.lon + lonDelta;
  const bbox = `${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)}`;
  // Per-feature output caps prevent one dense urban tile from exhausting the browser/public API.
  // A capped tile can omit mapped objects; the national product will use preprocessed vector tiles instead.
  const query = `[out:json][timeout:24][maxsize:67108864];way["highway"](${bbox});out geom 3500;way["waterway"~"river|canal|stream|drain|ditch"](${bbox});out geom 500;way["natural"="water"](${bbox});out geom 250;way["building"](${bbox});out geom 4000;`;
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
function createWaterArea(element, tile) {
  if (!Array.isArray(element.geometry) || element.geometry.length < 4) return null;
  const source = element.geometry;
  const first = source[0], last = source[source.length - 1];
  if (Math.abs(first.lat - last.lat) > 0.00001 || Math.abs(first.lon - last.lon) > 0.00001) return null;
  const points = source.map((p) => centerWorldCoords(p.lat, p.lon, tile.origin));
  if (points.some((p) => Math.abs(p.x) > TILE_SIZE * .52 || Math.abs(p.z) > TILE_SIZE * .52)) return null;
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, -points[0].z);
  for (let i = 1; i < points.length - 1; i++) shape.lineTo(points[i].x, -points[i].z);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.rotateX(-Math.PI / 2);
  let averageLat = 0, averageLon = 0;
  source.forEach((p) => { averageLat += p.lat; averageLon += p.lon; });
  averageLat /= source.length; averageLon /= source.length;
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, mats.waterArea);
  mesh.position.y = heightForGeo(tile, averageLat, averageLon) + 0.25;
  mesh.receiveShadow = true;
  return mesh;
}

function createBuilding(element, tile) {
  const coords = element.geometry;
  if (!Array.isArray(coords) || coords.length < 4 || !closedRing(coords)) return null;
  const local = coords.map((p) => centerWorldCoords(p.lat, p.lon, tile.origin));
  if (local.some((p) => Math.abs(p.x) > TILE_SIZE * .53 || Math.abs(p.z) > TILE_SIZE * .53)) return null;
  let twiceArea = 0;
  for (let i = 0; i < local.length - 1; i++) twiceArea += local[i].x * local[i + 1].z - local[i + 1].x * local[i].z;
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
  const shape = new THREE.Shape();
  shape.moveTo(local[0].x, -local[0].z);
  for (let i = 1; i < local.length - 1; i++) shape.lineTo(local[i].x, -local[i].z);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  const centerLat = coords.reduce((sum, p) => sum + p.lat, 0) / coords.length;
  const centerLon = coords.reduce((sum, p) => sum + p.lon, 0) / coords.length;
  const mesh = new THREE.Mesh(geometry, /industrial|warehouse|commercial|retail/.test(tags.building || '') ? mats.buildingWarm : mats.building);
  mesh.position.y = heightForGeo(tile, centerLat, centerLon) + 0.15;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.heightEstimated = estimated;
  mesh.userData.osmId = element.id;
  mesh.name = estimated ? 'OSM_BUILDING_ESTIMATED_HEIGHT' : 'OSM_BUILDING_REPORTED_HEIGHT';
  return mesh;
}

function createOSMGeometry(tile, osm) {
  const group = new THREE.Group();
  const elements = osm?.elements || [];
  let roads = 0, waterways = 0, buildings = 0, waterAreas = 0;
  const MAX_ROAD_WAYS = 3500, MAX_WATERWAYS = 500, MAX_WATER_AREAS = 250, MAX_BUILDINGS = 4000;
  const buckets = { roadBase: [], motorway: [], majorRoad: [], localRoad: [], water: [] };
  for (const element of elements) {
    if (element.type !== 'way' || !Array.isArray(element.geometry)) continue;
    const tags = element.tags || {};
    if (tags.highway) {
      if (roads >= MAX_ROAD_WAYS) continue;
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
      const mesh = createBuilding(element, tile);
      if (mesh) { group.add(mesh); buildings++; }
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
  return { group, roads, waterways, buildings, waterAreas };
}

function disposeGroup(group) {
  group.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material && !Object.values(mats).includes(object.material)) {
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material.dispose();
    }
    // Shared OSM materials and the shared terrain texture intentionally remain alive.
  });
}

async function loadWorldTile(lat, lon, reason = 'travel', keepCamera = false) {
  if (tileLoading) return;
  tileLoading = true;
  setLoadingVeil(true, reason === 'initial' ? 'Building the first world tile' : 'Streaming next world tile', 'Checking local prebuilt data before requesting live map services…');
  setWorldState('LOADING WORLD DATA');
  $('enterButton').disabled = true;
  const savedYaw = yaw, savedPitch = pitch;
  let savedAltitudeAboveGround = 180;
  if (activeTile) savedAltitudeAboveGround = camera.position.y - heightSampler(activeTile, camera.position.x, camera.position.z);
  const address = tileAddressFor(lat, lon);
  const tileOrigin = address.origin;
  const targetLocal = centerWorldCoords(lat, lon, tileOrigin);
  let elevationData;
  let osmData = { elements: [] };
  let osmError = null;
  let dataMode = 'live API';

  try {
    let prebuilt = null;
    try {
      prebuilt = await fetchPrebuiltTile(address);
    } catch (error) {
      console.warn('Prebuilt tile could not be used; trying the live-data fallback.', error);
      toast(`Local tile ${address.key} could not be read; trying live data.`);
    }

    if (prebuilt) {
      elevationData = {
        segments: prebuilt.terrain.segments,
        points: [],
        heights: prebuilt.terrain.heights,
        source: prebuilt.terrain.source || 'prebuilt Copernicus DEM tile',
      };
      osmData = prebuilt.osm;
      terrainReal = !/(fallback|not included|placeholder|not real)/i.test(String(elevationData.source));
      osmReal = !/not included/i.test(String(prebuilt.osm.source || '')); 
      dataMode = 'prebuilt static tile';
      $('veilDetail').textContent = `Using local tile ${address.key}…`;
    } else {
      const results = await Promise.allSettled([fetchTerrain(tileOrigin), fetchOSM(tileOrigin)]);
      if (results[0].status === 'fulfilled') {
        elevationData = results[0].value;
        terrainReal = elevationData.source !== 'fallback';
      } else {
        terrainReal = false;
        elevationData = makeFallbackTerrain(tileOrigin);
        toast('DEM service unavailable; using clearly marked temporary terrain fallback.');
      }
      if (results[1].status === 'fulfilled') { osmData = results[1].value; osmReal = true; }
      else { osmError = results[1].reason; osmReal = false; }
    }
  } catch (error) {
    $('loadingMessage').textContent = `World data error: ${error.message}`;
    throw error;
  }

  const tile = { key: address.key, origin: tileOrigin, ...elevationData };
  const newGroup = new THREE.Group();
  newGroup.name = `WORLD_TILE_${address.key}`;
  newGroup.add(createTerrain(tile));
  const osmBuilt = createOSMGeometry(tile, osmData);
  newGroup.add(osmBuilt.group);
  const previous = worldGroup.children.slice();
  for (const child of previous) { worldGroup.remove(child); disposeGroup(child); }
  worldGroup.add(newGroup);
  activeTile = tile;
  origin = tileOrigin;

  if (!keepCamera) {
    if (reason === 'rebase') {
      const groundAtPlayer = heightSampler(tile, targetLocal.x, targetLocal.z);
      camera.position.set(targetLocal.x, groundAtPlayer + savedAltitudeAboveGround, targetLocal.z);
      yaw = savedYaw; pitch = savedPitch;
    } else {
      const startZ = targetLocal.z + (reason === 'initial' ? 720 : 600);
      const startX = targetLocal.x;
      const startGround = heightSampler(tile, startX, startZ);
      camera.position.set(startX, startGround + (reason === 'initial' ? 185 : 230), startZ);
      yaw = 0;
      pitch = reason === 'initial' ? -0.18 : -0.22;
    }
    camera.rotation.set(pitch, yaw, 0);
  }
  setStatus('terrainState', terrainReal ? `${elevationData.source}` : `UNVERIFIED: ${elevationData.source || 'DEM unavailable'}`);
  setStatus('featureState', osmReal ? `${osmBuilt.roads} road ways · ${osmBuilt.waterways} waterways · ${osmBuilt.waterAreas} water areas · ${dataMode}` : (osmError ? 'OSM request failed · try reloading tile' : 'OSM geometry not included in this tile'));
  setStatus('buildingState', osmReal ? `${osmBuilt.buildings} 3D building footprints` : 'No building geometry included');
  setStatus('tileState', `${address.key} · 3 × 3 km · ${dataMode}`);
  setWorldState('WORLD ONLINE');
  $('enterButton').disabled = false;
  $('loadingMessage').textContent = osmError ? `Terrain loaded; mapped geometry unavailable: ${osmError.message}` : `World tile ${address.key} loaded. Click the scene and use WASD to explore.`;
  setLoadingVeil(false);
  tileLoading = false;
  updateHUD();
  if (osmError) toast('Terrain loaded, but OSM geometry could not be fetched.');
  else toast(`${address.key} ready · ${osmBuilt.roads} roads · ${osmBuilt.buildings} buildings`);
}

function makeFallbackTerrain(tileOrigin) {
  const segments = GRID_SEGMENTS;
  const points = [];
  const heights = [];
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const x = (i / segments - 0.5) * TILE_SIZE;
      const z = (j / segments - 0.5) * TILE_SIZE;
      const lat = tileOrigin.lat - z / 111320;
      const lon = tileOrigin.lon + x / (111320 * Math.cos(THREE.MathUtils.degToRad(tileOrigin.lat)));
      points.push({ i, j, x, z, lat, lon });
      heights.push(fallbackHeight(lat, lon));
    }
  }
  return { segments, points, heights, source: 'fallback' };
}

function shouldRebase() {
  if (!activeTile || tileLoading || !hasEntered) return;
  const pos = currentLatLon();
  const nextAddress = tileAddressFor(pos.lat, pos.lon);
  // Rebase only when crossing into a different fixed grid cell; don't reload the same tile.
  if (nextAddress.key !== activeTile.key) {
    const now = performance.now();
    if (now - lastRebaseAt < 1200) return;
    lastRebaseAt = now;
    loadWorldTile(pos.lat, pos.lon, 'rebase', false).catch(showFatalError);
  }
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
  if (!hasEntered || tileLoading || document.pointerLockElement !== renderer.domElement) return;
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
  } else if (activeTile) {
    camera.position.y = heightSampler(activeTile, camera.position.x, camera.position.z) + 1.75;
  }
}

function toggleGroundMode() {
  if (!activeTile) return;
  isGroundMode = !isGroundMode;
  if (isGroundMode) camera.position.y = heightSampler(activeTile, camera.position.x, camera.position.z) + 1.75;
  else camera.position.y = heightSampler(activeTile, camera.position.x, camera.position.z) + 120;
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
animate();
