import * as THREE from 'three';
import { ball, loft, merge, place, smooth } from '../animals/Loft';
import type { Station } from '../animals/Loft';

/**
 * A better fish for the reef: one smooth lofted body (nose at +Z, length 1), a forked tail, dorsal / anal / pectoral fins and
 * eyes. All species share this ONE geometry; the species look comes from
 *   - a per-instance body aspect (tall angelfish, long barracuda, fat grouper) = the instance scale,
 *   - a per-instance colour (instanceColor) and a per-instance PATTERN id (aPat), drawn procedurally in the fragment shader:
 *       0 silver / counter-shaded   1 vertical bars (angelfish, sergeant)   2 clownfish bands   3 tang (yellow tail + flank stripe)
 *       4 spots (grouper, parrotfish)   5 horizontal stripe (fusilier, wrasse)
 * Nothing is copied from photos: the patterns are maths.
 */

export const PAT = { SILVER: 0, BARS: 1, CLOWN: 2, TANG: 3, SPOTS: 4, STRIPE: 5 } as const;

export function buildReefFishGeometry(): THREE.BufferGeometry {
  const st: Station[] = [
    { z: 0.5, w: 0.02, h: 0.03, y: -0.02, n: 2.2 },
    { z: 0.44, w: 0.07, h: 0.1, y: -0.02, n: 2.2 },
    { z: 0.3, w: 0.135, h: 0.21, y: 0, n: 2.2 },
    { z: 0.08, w: 0.16, h: 0.29, y: 0.01, n: 2.2 },
    { z: -0.15, w: 0.11, h: 0.22, y: 0.01, n: 2.2 },
    { z: -0.34, w: 0.05, h: 0.1, y: 0.0, n: 2.2 },
    { z: -0.46, w: 0.025, h: 0.07, y: 0.0, n: 2.2 },
  ];
  const parts: THREE.BufferGeometry[] = [loft(smooth(st, 2), { seg: 12, tile: 1, shade: 0.6 })];
  // eyes (dark) with a pale ring behind them
  for (const s of [-1, 1]) {
    parts.push(ball(0.022, 0.03, 0.03, s * 0.098, 0.07, 0.34, 0.03));
    parts.push(ball(0.018, 0.04, 0.04, s * 0.092, 0.07, 0.34, 1.25));
  }
  // dorsal fin (long, soft) and anal fin
  parts.push(place(ball(0.006, 0.12, 0.3, 0, 0, 0, 0.82), 0, 0.3, -0.04, -0.12));
  parts.push(place(ball(0.006, 0.07, 0.18, 0, 0, 0, 0.82), 0, -0.27, -0.12, 0.1));
  // pectoral fins
  for (const s of [-1, 1]) parts.push(place(ball(0.1, 0.006, 0.06, 0, 0, 0, 0.9), s * 0.16, -0.02, 0.2, 0, s * 0.35, s * 0.35));
  // tail: two lobes (a fork) at -Z; the shader wags it
  parts.push(place(ball(0.006, 0.19, 0.12, 0, 0, 0, 0.88), 0, 0.09, -0.6, -0.5));
  parts.push(place(ball(0.006, 0.19, 0.12, 0, 0, 0, 0.88), 0, -0.09, -0.6, 0.5));
  const g = merge(parts);
  g.deleteAttribute('uv');
  return g;
}

/** Species look: fish colour multiplies the pattern, so one pattern serves many colours. */
export function buildReefFishMaterial(uTime: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.28, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aPat;\nvarying float vPat;\nvarying vec3 vLoc;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPat = aPat;
        vLoc = position;
        float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 1.3;
        float tailAmt = smoothstep(0.0, -0.55, position.z);
        transformed.x += sin(uTime * 9.0 + ph + position.z * 5.0) * 0.15 * tailAmt * tailAmt;
        transformed.x += sin(uTime * 4.5 + ph) * 0.02 * smoothstep(0.1, 0.5, position.z);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPat;\nvarying vec3 vLoc;\nfloat h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float zz = vLoc.z;
          float yy = vLoc.y;
          float body = smoothstep(-0.44, -0.36, zz) * smoothstep(0.5, 0.42, zz);
          int pat = int(vPat + 0.5);
          // every fish: darker back, paler belly
          diffuseColor.rgb *= mix(1.12, 0.74, smoothstep(-0.02, 0.26, yy));
          if (pat == 1) {
            float f = fract(zz * 4.2 + 0.2);
            float bar = smoothstep(0.0, 0.07, f) * smoothstep(0.46, 0.38, f);
            diffuseColor.rgb *= mix(1.0, 0.16, bar * body);
          } else if (pat == 2) {
            float c = 0.0;
            c += smoothstep(0.045, 0.03, abs(zz - 0.22));
            c += smoothstep(0.04, 0.026, abs(zz - 0.0));
            c += smoothstep(0.03, 0.018, abs(zz + 0.34));
            float e = smoothstep(0.07, 0.04, abs(zz - 0.22)) + smoothstep(0.065, 0.036, abs(zz)) + smoothstep(0.05, 0.026, abs(zz + 0.34));
            diffuseColor.rgb *= mix(1.0, 0.3, clamp(e - c, 0.0, 1.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.25, 1.25, 1.2), clamp(c, 0.0, 1.0));
          } else if (pat == 3) {
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.6, 1.35, 0.15), smoothstep(-0.36, -0.5, zz));
            float s = smoothstep(0.035, 0.0, abs(yy - 0.03 + zz * 0.12)) * smoothstep(-0.3, -0.1, zz) * smoothstep(0.4, 0.2, zz);
            diffuseColor.rgb *= mix(1.0, 0.18, s);
          } else if (pat == 4) {
            vec3 q = vLoc * vec3(22.0, 22.0, 30.0);
            vec3 id = floor(q);
            vec3 lc = fract(q) - 0.5;
            float r = h31(id);
            float d = length(lc * vec3(1.0, 1.0, 1.0));
            float spot = step(0.45, r) * smoothstep(0.34, 0.22, d);
            diffuseColor.rgb *= mix(1.0, 0.45, spot * body);
          } else if (pat == 5) {
            float s = smoothstep(0.06, 0.02, abs(yy - 0.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.55, 1.45, 0.45), s * body);
            float u = smoothstep(0.03, 0.0, abs(yy + 0.12));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.2, 1.2, 1.25), u * body * 0.8);
          }
        }`,
      );
  };
  m.customProgramCacheKey = () => 'evc-reeffish-v1';
  return m;
}

export function attachPattern(geo: THREE.BufferGeometry, count: number): THREE.InstancedBufferAttribute {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  geo.setAttribute('aPat', a);
  return a;
}
