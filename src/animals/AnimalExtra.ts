import * as THREE from 'three';
import { ball, curveTube, hang, loft, merge, place, smooth, spike, tint, type Station } from './Loft';
import { accMaterial, LOOKS, PEACOCK_TRAIN, skinOf } from './AnimalSkins';
import { cachedGeo, DARK, mesh, type Rig } from './AnimalRig';
import type { Species } from './Species';

/**
 * Birds that walk (chicken, duck, peacock), the dolphin, and the fish geometry (instanced by the manager).
 * Same conventions as AnimalModel: faces +Z, lofted bodies, pivots for the manager. Bird bodies pivot over their hips,
 * so the whole body can tip forward to peck.
 */

const YELLOW = [0.88, 0.7, 0.2], ORANGE = [0.92, 0.5, 0.12], RED = [0.75, 0.08, 0.08], GREY = [0.55, 0.55, 0.52];

function birdLeg(key: string, hipY: number, up: number, lo: number, w: number, col: number[], webbed: boolean): { hip: THREE.Group; knee: THREE.Group } {
  const hip = new THREE.Group();
  hip.position.y = hipY;
  const knee = new THREE.Group();
  knee.position.y = -up;
  hip.add(knee);
  const acc = accMaterial();
  mesh(hip, cachedGeo(`${key}:thigh`, () => tint(hang(loft([{ z: 0, w: w * 1.8, h: w * 1.8 }, { z: up, w, h: w }], { seg: 6, shade: 0 })), col)), acc);
  mesh(knee, cachedGeo(`${key}:shank`, () => {
    const parts: THREE.BufferGeometry[] = [tint(hang(loft([{ z: 0, w, h: w }, { z: lo, w: w * 0.85, h: w * 0.85 }], { seg: 6, shade: 0 })), col)];
    if (webbed) parts.push(ball(w * 5, w * 0.5, w * 6.5, 0, -lo, w * 3.5, col));
    else for (const a of [-0.5, 0, 0.5]) parts.push(place(spike(w * 0.7, w * 0.7, w * 5, col, 4), 0, -lo, 0, Math.PI / 2, a * 0.8, 0), place(spike(w * 0.6, w * 0.6, w * 2.5, col, 4), 0, -lo, 0, -Math.PI / 2, 0, 0));
    return merge(parts);
  }), acc);
  return { hip, knee };
}

export function buildBird(sp: Species, variant: number): Rig {
  const looks = LOOKS[sp];
  const v = variant % looks.length;
  const key = `${sp}:${v}`;
  const M = skinOf(key, looks[v]);
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const duck = sp === 'duck', peacock = sp === 'peacock';
  const rooster = sp === 'chicken' && v === 1;
  // all sizes in metres; bodies pivot over the hips (by)
  const by = duck ? 0.1 : peacock ? 0.3 : 0.2;
  const bodyH = duck ? 0.15 : peacock ? 0.4 : 0.27;
  const body = new THREE.Group();
  body.position.y = by;
  group.add(body);
  const dy = bodyH - by; // body centre height relative to the pivot

  const S: Station[] = duck
    ? [{ z: -0.27, w: 0.02, h: 0.03, y: dy + 0.05 }, { z: -0.18, w: 0.07, h: 0.07, y: dy + 0.03 }, { z: -0.02, w: 0.1, h: 0.09, y: dy }, { z: 0.12, w: 0.085, h: 0.085, y: dy + 0.01 }, { z: 0.22, w: 0.04, h: 0.06, y: dy + 0.04 }]
    : peacock
      ? [{ z: -0.2, w: 0.015, h: 0.025, y: dy + 0.03 }, { z: -0.12, w: 0.055, h: 0.07, y: dy + 0.02 }, { z: 0.0, w: 0.075, h: 0.095, y: dy }, { z: 0.12, w: 0.06, h: 0.09, y: dy + 0.01 }, { z: 0.2, w: 0.03, h: 0.07, y: dy + 0.04 }]
      : [{ z: -0.2, w: 0.02, h: 0.035, y: dy + 0.06 }, { z: -0.12, w: 0.08, h: 0.1, y: dy + 0.03 }, { z: 0.0, w: 0.115, h: 0.13, y: dy }, { z: 0.12, w: 0.1, h: 0.13, y: dy + 0.01 }, { z: 0.2, w: 0.05, h: 0.1, y: dy + 0.04 }];
  mesh(body, cachedGeo(`${key}:body`, () => {
    const parts: THREE.BufferGeometry[] = [loft(smooth(S, 3), { seg: 14, tile: 0.8 })];
    // folded wings
    for (const s of [-1, 1]) parts.push(ball(duck ? 0.02 : 0.018, duck ? 0.055 : 0.065, duck ? 0.14 : 0.12, s * (S[2].w * 0.92), dy + 0.01, -0.01, 0.82).rotateZ(0));
    return merge(parts);
  }), M.fur);

  // neck + head
  const nl = duck ? 0.14 : peacock ? 0.38 : 0.15;
  const nw = duck ? 0.03 : peacock ? 0.022 : 0.035;
  const up = duck ? 0.75 : peacock ? 0.2 : 0.35;
  const neck = new THREE.Group();
  neck.position.set(0, dy + (duck ? 0.06 : 0.08), 0.15);
  neck.rotation.x = -up;
  body.add(neck);
  mesh(neck, cachedGeo(`${key}:neck`, () => loft(smooth([{ z: -0.03, w: nw * 1.3, h: nw * 1.4 }, { z: nl * 0.5, w: nw, h: nw }, { z: nl, w: nw * 0.8, h: nw * 0.8 }], 2), { seg: 10, tile: 0.8 })), M.fur);
  const head = new THREE.Group();
  head.position.set(0, 0, nl);
  const tilt = 0.1;
  head.rotation.x = up + tilt;
  neck.add(head);
  const hs = duck ? 0.034 : peacock ? 0.026 : 0.03;
  mesh(head, cachedGeo(`${key}:head`, () => loft(smooth([{ z: -hs * 0.8, w: hs * 0.8, h: hs * 0.8 }, { z: hs * 0.4, w: hs, h: hs }, { z: hs * 1.6, w: hs * 0.7, h: hs * 0.7 }], 2), { seg: 10, tile: 0.5 })), M.fur);
  mesh(head, cachedGeo(`${key}:headacc`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) parts.push(ball(hs * 0.2, hs * 0.2, hs * 0.16, s * hs * 0.8, hs * 0.2, hs * 0.5, DARK));
    if (duck) parts.push(tint(loft(smooth([{ z: hs * 1.3, w: hs * 0.62, h: hs * 0.3, y: -hs * 0.2 }, { z: hs * 2.2, w: hs * 0.7, h: hs * 0.25, y: -hs * 0.3 }, { z: hs * 3.3, w: hs * 0.6, h: hs * 0.2, y: -hs * 0.35 }], 2), { seg: 8, shade: 0 }), ORANGE));
    else parts.push(place(spike(hs * 0.45, hs * 0.35, hs * (peacock ? 1.1 : 1.3), peacock ? GREY : YELLOW, 6), 0, -hs * 0.15, hs * 1.4, Math.PI / 2));
    if (sp === 'chicken') {
      const n = rooster ? 5 : 3;
      for (let i = 0; i < n; i++) parts.push(ball(hs * 0.18, hs * (rooster ? 0.55 : 0.32) * (1 - Math.abs(i - (n - 1) / 2) * 0.15), hs * 0.3, 0, hs * 1.05, hs * (0.9 - i * 0.28), RED));
      parts.push(ball(hs * 0.16, hs * 0.5, hs * 0.2, 0, -hs * 0.7, hs * 1.3, RED));
    }
    if (peacock) for (let i = -2; i <= 2; i++) {
      parts.push(place(spike(0.002, 0.002, 0.06, [0.1, 0.3, 0.7], 4), 0, hs * 0.9, -hs * 0.1, -0.15, 0, i * 0.28));
      parts.push(ball(0.007, 0.007, 0.005, Math.sin(i * 0.28) * -0.06 * 0.9 * -1, hs * 0.9 + Math.cos(i * 0.28) * 0.06, -hs * 0.1 - 0.008, [0.1, 0.55, 0.5]));
    }
    return merge(parts);
  }), M.acc);

  // tail
  const tail = new THREE.Group();
  tail.position.set(0, dy + (duck ? 0.06 : 0.08), -0.19);
  body.add(tail);
  if (peacock) {
    const trainSkin = skinOf('peacock:train', PEACOCK_TRAIN);
    mesh(tail, cachedGeo('peacock:train', () => {
      const pts: Station[] = [{ z: 0, w: 0.04, h: 0.008, y: 0 }, { z: -0.3, w: 0.2, h: 0.008, y: -0.06 }, { z: -0.65, w: 0.26, h: 0.008, y: -0.17 }, { z: -1.0, w: 0.16, h: 0.008, y: -0.27 }, { z: -1.15, w: 0.02, h: 0.006, y: -0.3 }];
      return loft(smooth(pts, 3), { seg: 10, tile: 0.6, shade: 0.3 });
    }), trainSkin.fur);
  } else if (rooster) {
    mesh(tail, cachedGeo(`${key}:tail`, () => merge([-1, 0, 1].flatMap((i) => [curveTube([[0, 0, 0], [i * 0.03, 0.1, -0.08], [i * 0.06, 0.2, -0.1], [i * 0.1, 0.28, -0.02]], 0.022, 0.006, 0.45, 6, 0.3)]))), M.fur);
  } else {
    mesh(tail, cachedGeo(`${key}:tail`, () => merge([-1, 0, 1].map((i) => place(ball(0.014, duck ? 0.04 : 0.07, 0.04, 0, duck ? 0.03 : 0.05, 0, 0.8), 0, 0, -0.01, -0.5, 0, i * 0.3)))), M.fur);
  }

  // legs
  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  const up2 = duck ? 0.04 : peacock ? 0.12 : 0.08;
  const lo = by - up2 - 0.005;
  for (const s of [-1, 1]) {
    const l = birdLeg(`${key}:leg`, by, up2, lo, duck ? 0.011 : peacock ? 0.009 : 0.009, duck ? ORANGE : peacock ? GREY : YELLOW, duck);
    l.hip.position.set(s * (duck ? 0.045 : 0.05), by, duck ? -0.04 : 0);
    group.add(l.hip);
    legs.push(l.hip);
    knees.push(l.knee);
  }

  return {
    kind: 'bird', group, body, neck, head, tail, legs, knees, legRest: [0, 0], kneeRest: [0, 0], hipY: by, length: 0.4,
    side: 0.1, neckRest: -up, grazeRange: up + (duck ? 1.2 : peacock ? 1.1 : 1.15), headRest: up + tilt, headComp: 0.45, swing: 0.55, tailHang: false,
    floatDepth: duck ? 0.06 : 0.0,
  };
}

/** Dolphin: a front body with the beak, a rear body + flukes on its own pivot that beats up and down (spine[1]). */
export function buildDolphin(variant: number): Rig {
  const looks = LOOKS.dolphin;
  const v = variant % looks.length;
  const key = `dolphin:${v}`;
  const M = skinOf(key, looks[v]);
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const body = new THREE.Group();
  group.add(body);
  mesh(body, cachedGeo(`${key}:body`, () => {
    const st: Station[] = [
      { z: 1.15, w: 0.02, h: 0.02, y: -0.03, n: 2.2 }, { z: 0.9, w: 0.045, h: 0.04, y: -0.04, n: 2.2 }, { z: 0.68, w: 0.08, h: 0.075, y: -0.03, n: 2.2 },
      { z: 0.5, w: 0.16, h: 0.18, y: 0.0, n: 2.2 }, { z: 0.1, w: 0.24, h: 0.26, y: 0.0, n: 2.2 }, { z: -0.3, w: 0.2, h: 0.22, y: 0.0, n: 2.2 }, { z: -0.6, w: 0.13, h: 0.15, y: 0.0, n: 2.2 },
    ];
    const parts: THREE.BufferGeometry[] = [loft(smooth(st, 3), { seg: 16, tile: 2.4, shade: 0.5 })];
    parts.push(place(ball(0.018, 0.1, 0.12, 0, 0, 0, 0.85), 0, 0.24, -0.08, -0.55));
    for (const s of [-1, 1]) parts.push(place(ball(0.02, 0.16, 0.07, 0, -0.1, -0.02, 0.8), s * 0.22, -0.12, 0.35, -0.5, 0, s * 0.8));
    return merge(parts);
  }), M.fur);
  const neck = new THREE.Group();
  body.add(neck);
  const head = new THREE.Group();
  neck.add(head);
  const tail = new THREE.Group();
  tail.position.set(0, 0, -0.6);
  body.add(tail);
  mesh(tail, cachedGeo(`${key}:tail`, () => {
    const st: Station[] = [{ z: 0, w: 0.13, h: 0.15, y: 0 }, { z: -0.3, w: 0.09, h: 0.11, y: 0 }, { z: -0.6, w: 0.05, h: 0.07, y: 0 }, { z: -0.82, w: 0.03, h: 0.05, y: 0 }];
    const parts: THREE.BufferGeometry[] = [loft(smooth(st, 3), { seg: 12, tile: 2.4, shade: 0.5 })];
    parts.push(place(ball(0.2, 0.014, 0.08, 0, 0, 0, 0.82), 0.2, 0, -0.9), place(ball(0.2, 0.014, 0.08, 0, 0, 0, 0.82), -0.2, 0, -0.9));
    return merge(parts);
  }), M.fur);
  const eyes = new THREE.Group();
  body.add(eyes);
  mesh(eyes, cachedGeo(`${key}:eyes`, () => merge([-1, 1].map((s) => ball(0.022, 0.022, 0.018, s * 0.145, 0.05, 0.62, DARK)))), M.acc);
  return {
    kind: 'dolphin', group, body, neck, head, tail, legs: [], knees: [], legRest: [], kneeRest: [], hipY: 0, length: 2.2, side: 0.25,
    neckRest: 0, grazeRange: 0, headRest: 0, headComp: 0, swing: 0, tailHang: false, spine: [body, tail], floatDepth: 0.2,
  };
}

/** Fish: one slim body, a tail fin at -Z that the shader wags; vertex colours = darker back, pale belly. */
export function buildFishGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.5, 12, 8);
  body.scale(0.36, 0.55, 1.0); // width, height, length (units: body length = 1)
  const tail = new THREE.ConeGeometry(0.34, 0.42, 4);
  tail.rotateX(-Math.PI / 2); // cone tip along -Z... then flatten sideways so it is a vertical fin
  tail.rotateZ(Math.PI / 2);
  tail.scale(1, 1, 1);
  tail.translate(0, 0, -0.62);
  const dorsal = new THREE.ConeGeometry(0.16, 0.34, 3);
  dorsal.rotateX(Math.PI / 2);
  dorsal.scale(0.2, 1, 1);
  dorsal.translate(0, 0.3, 0.02);
  const parts = [body, tail, dorsal];
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const index: number[] = [];
  let o = 0;
  for (const p of parts) {
    const pp = p.getAttribute('position'), pn = p.getAttribute('normal');
    const idx = p.getIndex();
    for (let i = 0; i < pp.count; i++) {
      pos.set([pp.getX(i), pp.getY(i), pp.getZ(i)], (o + i) * 3);
      nor.set([pn.getX(i), pn.getY(i), pn.getZ(i)], (o + i) * 3);
      const k = THREE.MathUtils.clamp(0.5 + pp.getY(i) * 1.6, 0.35, 1);
      col.set([k, k, k], (o + i) * 3);
    }
    if (idx) for (let i = 0; i < idx.count; i++) index.push(idx.getX(i) + o);
    else for (let i = 0; i < pp.count; i++) index.push(o + i);
    o += pp.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  return g;
}

export function buildFishMaterial(uTime: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.25, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 1.3;
        float tailAmt = smoothstep(0.1, -0.6, position.z);
        transformed.x += sin(uTime * 9.0 + ph + position.z * 5.0) * 0.14 * tailAmt;`,
      );
  };
  return m;
}
