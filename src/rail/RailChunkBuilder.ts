import * as THREE from 'three';
import type { RailMeshData } from './RailMesh';

/**
 * Procedural surface textures of the railway (GLSL, no image files): ballast stones, concrete with stains / formwork joints / platform tiles,
 * steel rails with a shiny head and rusty sides, concrete sleepers, painted metal, wood grain, tunnel lining tiles, rail clips, tactile bumps.
 * The face's surface class is packed into the `glow` attribute (glow + 4 * class, see RailMesh SURF). Patterns use the CHUNK-LOCAL position, which never
 * moves, so nothing swims when the floating origin shifts.
 */
const TEX_GLSL = /* glsl */ `
varying float vGlow;
varying float vSurf;
varying vec3 vP;
varying vec3 vN;
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float vn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return 0.5 * vn(p) + 0.25 * vn(p * 2.03) + 0.125 * vn(p * 4.01) + 0.0625 * vn(p * 8.05); }
vec3 cell2(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
    vec2 g = vec2(float(x), float(y));
    vec3 q = vec3(i + g, 3.7);
    vec2 o = vec2(h31(q), h31(q + 19.0));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = h31(q + 7.0); } else if (d < d2) { d2 = d; }
  }
  return vec3(d1, d2, id);
}
vec3 railTex(float s, vec3 p, vec3 n) {
  if (s < 0.5) return vec3(1.0);
  vec3 an = abs(n);
  if (s < 1.5) { // ballast: angular stones, dark crevices, a few pale and rusty ones
    vec2 uv = (an.y > 0.5 ? p.xz : (an.x > an.z ? p.zy : p.xy)) * 6.0;
    vec3 c = cell2(uv);
    float edge = 1.0 - smoothstep(0.0, 0.16, c.y - c.x);
    float tone = 0.62 + 0.75 * c.z;
    vec3 col = mix(vec3(1.0), vec3(1.12, 0.98, 0.86), step(0.82, c.z));
    return col * tone * (1.0 - 0.55 * edge) * (0.9 + 0.2 * vn(p * 30.0));
  }
  if (s < 2.5) { // concrete: soft stains, pores, formwork joints (walls) and 1.2 m slabs (tops)
    float st = fbm(p * 0.45);
    float k = 0.8 + 0.4 * st;
    k *= 1.0 - 0.18 * step(0.9, vn(p * 38.0));
    if (an.y > 0.6) {
      vec2 g = abs(fract(p.xz / 1.2) - 0.5);
      k *= 1.0 - 0.22 * max(smoothstep(0.482, 0.5, g.x), smoothstep(0.482, 0.5, g.y));
      k *= 0.92 + 0.16 * vn(vec3(p.xz * 2.0, 1.0));
    } else {
      float ly = abs(fract(p.y / 1.1) - 0.5);
      k *= 1.0 - 0.2 * smoothstep(0.484, 0.5, ly);
      k *= 1.0 - 0.22 * smoothstep(0.55, 0.9, vn(vec3(p.x * 1.5 + p.z * 1.5, p.y * 0.25, 2.0))) * smoothstep(1.2, 0.0, fract(p.y * 0.1));
    }
    return vec3(k);
  }
  if (s < 3.5) { // rail steel: bright head, rust-brown sides
    float r = smoothstep(0.5, 0.8, fbm(p * 5.0));
    if (an.y > 0.7) return vec3(1.35, 1.35, 1.4) * (0.9 + 0.2 * vn(p * 20.0));
    return mix(vec3(1.0), vec3(1.55, 0.85, 0.5), 0.8 * r) * (0.85 + 0.2 * vn(p * 14.0));
  }
  if (s < 4.5) { // concrete sleeper
    return vec3((0.82 + 0.3 * vn(p * 28.0)) * (0.9 + 0.2 * fbm(p * 3.0)));
  }
  if (s < 5.5) { // painted metal: faint brushing and wear
    return vec3((0.9 + 0.18 * fbm(p * vec3(3.0, 14.0, 3.0))) * (1.0 - 0.1 * step(0.93, vn(p * 25.0))));
  }
  if (s < 6.5) { // wood grain
    float g = sin((p.x + p.z) * 22.0 + fbm(p * 3.0) * 7.0) * 0.5 + 0.5;
    return vec3(0.72 + 0.4 * g);
  }
  if (s < 7.5) { // tunnel lining: 0.6 m tiles
    vec2 uv = an.y > 0.5 ? p.xz : (an.x > an.z ? p.zy : p.xy);
    vec2 g = abs(fract(uv / 0.6) - 0.5);
    return vec3((1.0 - 0.2 * max(smoothstep(0.47, 0.5, g.x), smoothstep(0.47, 0.5, g.y))) * (0.9 + 0.15 * fbm(p * 2.0)));
  }
  if (s < 8.5) { // rusty clip
    return vec3(0.7 + 0.6 * vn(p * 60.0));
  }
  vec2 g = fract(p.xz / 0.075) - 0.5; // tactile bumps
  return vec3(0.68 + 0.5 * smoothstep(0.34, 0.2, length(g)));
}
`;

/** One shared, lit, vertex-coloured material for all railway meshes (ballast, steel, concrete, wires ...), with procedural surface textures. */
export class RailMaterial extends THREE.MeshLambertMaterial {
  constructor() {
    super({ vertexColors: true });
    this.name = 'rail';
    // Tunnel lining and lamps light themselves (per-vertex `glow`): a lit tube by day and by night, with no real light sources.
    this.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;\nvarying float vSurf;\nvarying vec3 vP;\nvarying vec3 vN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat sid = floor(glow / 4.0 + 0.001);\nvGlow = glow - sid * 4.0;\nvSurf = sid;\nvP = position;\nvN = normal;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + TEX_GLSL)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= railTex(floor(vSurf + 0.5), vP, normalize(vN));')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 1.5;');
    };
    this.customProgramCacheKey = () => 'rail-glow-tex';
  }
}

/** Turns the worker's railway geometry into a mesh (chunk-local coordinates, parented to the chunk group). */
export class RailChunkBuilder {
  constructor(private material: RailMaterial) {}

  build(data: RailMeshData): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setAttribute('glow', new THREE.BufferAttribute(data.glow, 1));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = 'rail';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
