import * as THREE from 'three';
import { SURFACE_SPEC, type Surface } from './SurfaceMap';

import brickUrl from './textures/brick.jpg';
import plasterUrl from './textures/plaster.jpg';
import concreteUrl from './textures/concrete.jpg';
import tinUrl from './textures/tin.jpg';
import thatchUrl from './textures/thatch.jpg';
import roofTileUrl from './textures/roof_tile.jpg';
import mudUrl from './textures/mud.jpg';
import earthUrl from './textures/earth.jpg';
import stoneUrl from './textures/stone.jpg';
import woodUrl from './textures/wood.jpg';
import bambooUrl from './textures/bamboo.jpg';
import foliageUrl from './textures/foliage.jpg';
import barkUrl from './textures/bark.jpg';
import metalUrl from './textures/metal.jpg';
import grassUrl from './textures/grass.jpg';
import asphaltUrl from './textures/asphalt.jpg';
import waterUrl from './textures/water.jpg';
import glassUrl from './textures/glass.jpg';

/**
 * Shared textured materials for the building models: one material per surface type, created on first use and
 * shared by every building (never disposed per building). Textures are grey-scale and get multiplied with the
 * vertex colour of the part, so colour still comes from the building code.
 */

const URLS: Record<Exclude<Surface, 'plain'>, string> = {
  brick: brickUrl, plaster: plasterUrl, concrete: concreteUrl, tin: tinUrl, thatch: thatchUrl, roofTile: roofTileUrl,
  mud: mudUrl, earth: earthUrl, stone: stoneUrl, wood: woodUrl, bamboo: bambooUrl, foliage: foliageUrl, bark: barkUrl,
  metal: metalUrl, grass: grassUrl, asphalt: asphaltUrl, water: waterUrl, glass: glassUrl,
};

/** Brightness boost: the textures are < 1 on average, this keeps the vertex colours as bright as before. */
const GAIN = 1.28;

const cache = new Map<Surface, THREE.Material>();
let loader: THREE.TextureLoader | null = null;
let maxAniso = 8;

/** Optional: call once with the renderer to get sharper textures at grazing angles. */
export function setBuildingTextureQuality(renderer: THREE.WebGLRenderer): void {
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
}

function loadTexture(url: string): THREE.Texture {
  loader ??= new THREE.TextureLoader();
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

export function getSurfaceMaterial(surface: Surface): THREE.Material {
  let m = cache.get(surface);
  if (m) return m;
  if (surface === 'plain') {
    m = new THREE.MeshLambertMaterial({ vertexColors: true });
  } else if (surface === 'glass') {
    const t = loadTexture(URLS.glass);
    m = new THREE.MeshPhongMaterial({ vertexColors: true, map: t, shininess: 90, specular: 0x7f9fb8 });
  } else {
    const t = loadTexture(URLS[surface]);
    const spec = SURFACE_SPEC[surface];
    const lm = new THREE.MeshLambertMaterial({ vertexColors: true, map: t });
    if (spec.bump > 0.3) {
      lm.bumpMap = t;
      lm.bumpScale = spec.bump;
    }
    lm.color.setRGB(GAIN, GAIN, GAIN);
    m = lm;
  }
  cache.set(surface, m);
  return m;
}
