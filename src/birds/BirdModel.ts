import * as THREE from 'three';

/**
 * One low-poly bird, faces +Z, wings along X, wingspan 1 (scaled per instance).
 * `aWing` = how far along the wing a vertex is (0 = body, 1 = wing tip): the vertex shader lifts it by sin(time),
 * so every bird flaps on the GPU and the whole flock is ONE draw call.
 */
export function createBirdGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const wing: number[] = [];
  const tri = (a: number[], b: number[], c: number[], wa = 0, wb = 0, wc = 0) => {
    pos.push(...a, ...b, ...c);
    wing.push(wa, wb, wc);
  };
  // body: a stretched bipyramid (nose, tail, ring of four)
  const nose = [0, 0, 0.5];
  const tail = [0, 0.01, -0.42];
  const ring = [[0, 0.09, 0.05], [0.07, 0, 0.05], [0, -0.07, 0.05], [-0.07, 0, 0.05]];
  for (let i = 0; i < 4; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 4];
    tri(nose, a, b);
    tri(tail, b, a);
  }
  // wings: root -> mid -> tip, swept back, each side two quads (4 triangles)
  for (const s of [1, -1]) {
    const r0 = [0.05 * s, 0.02, 0.3];
    const r1 = [0.05 * s, 0.02, -0.25];
    const m0 = [0.28 * s, 0.05, 0.22];
    const m1 = [0.28 * s, 0.05, -0.28];
    const t0 = [0.5 * s, 0.07, 0.0];
    const t1 = [0.46 * s, 0.07, -0.3];
    tri(r0, m0, r1, 0, 0.56, 0);
    tri(m0, m1, r1, 0.56, 0.56, 0);
    tri(m0, t0, m1, 0.56, 1, 0.56);
    tri(t0, t1, m1, 1, 1, 0.56);
  }
  // tail feathers
  tri([0, 0.01, -0.38], [0.11, 0.01, -0.64], [-0.11, 0.01, -0.64]);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.computeVertexNormals();
  return g;
}

/** Lambert material (sun + fog like everything else) with the flapping injected into the vertex shader. */
export function createBirdMaterial(uTime: { value: number }): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWing;\nattribute vec3 aBird;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // aBird = (phase, flap rate rad/s, flap amplitude). Birds alternate between gliding and flapping bursts.
        float burst = smoothstep(-0.3, 0.4, sin(uTime * 0.35 + aBird.x * 3.0));
        float amp = mix(0.1, aBird.z, burst);
        float fl = sin(uTime * aBird.y + aBird.x);
        transformed.y += fl * aWing * amp;
        transformed.z += fl * aWing * aWing * amp * 0.25;`,
      );
  };
  return m;
}
