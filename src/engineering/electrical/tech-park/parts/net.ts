import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { building, pipe, V } from '../../../core/prims';
import { every } from '../../../core/anim';
import { makeSign } from '../../../core/Labels';
import type { Ctx } from './ctx';
import { L } from '../layout';
import { bx, mesh } from './helpers';

interface Packet {
  mesh: THREE.Mesh;
  path: THREE.Vector3[];
  start: number;
  dur: number;
  len: number;
  cum: number[];
}

/** Network Hall: what happens when you open a web page. DNS lookup, TCP handshake, HTTP request, and a response that is cut into numbered packets. */
export function buildNet({ mats: m, t, anim, lamp }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'net';
  const C = L.net;
  building(g, m, { x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, open: 'N', door: 'S' });
  // the whole exhibit is built in its own frame (x to the viewer's right, z towards the viewer) and turned to face the open north side
  const board = new THREE.Group();
  board.position.set(C.x, 0, C.z + C.d / 2 - 1.2);
  board.rotation.y = Math.PI;
  g.add(board);
  const sign = (text: string, w: number, x: number, y: number, z = 0.4, h = 0.55): THREE.Mesh => {
    const s = makeSign(text, w, h);
    s.position.set(x, y, z);
    board.add(s);
    return s;
  };
  bx(board, C.w - 4, 10.8, 0.3, t.plate, 0, 5.5, 0);
  sign('HOW A WEB PAGE ARRIVES: DNS -> HANDSHAKE -> REQUEST -> RESPONSE', 40, 0, 10.9, 0.3, 0.9);

  // ---------- devices (x positions along the board)
  const X = { laptop: -38, router: -25, isp: -11, cloud: 4, dns: 20, web: 36 };
  const Y = 4.0;
  // laptop
  bx(board, 4.0, 0.3, 3.0, t.laptop, X.laptop, Y - 1.9, 0.9);
  const screen = bx(board, 3.8, 2.6, 0.2, t.cabinetDark, X.laptop, Y - 1.6, 0.0);
  screen.rotation.x = -0.15;
  sign('YOUR LAPTOP', 4.6, X.laptop, Y + 2.0, 0.3, 0.5);
  sign('192.168.1.5', 4.4, X.laptop, Y - 2.8, 0.4, 0.45);
  // router
  bx(board, 3.6, 0.7, 2.2, t.cabinetDark, X.router, Y - 1.6, 0.4);
  for (const dx of [-1.2, 1.2]) bx(board, 0.12, 1.8, 0.12, t.steel, X.router + dx, Y - 0.9, 0.4);
  const routerLamps = [0, 1, 2].map((i) => bx(board, 0.28, 0.2, 0.1, t.off, X.router - 1 + i * 1, Y - 1.45, 1.52));
  sign('WI-FI ROUTER', 4.4, X.router, Y + 1.2, 0.3, 0.5);
  sign('192.168.1.1', 4.0, X.router, Y - 2.8, 0.4, 0.45);
  // ISP exchange
  bx(board, 4.0, 3.6, 2.4, t.panel, X.isp, Y - 2.0, 0.4);
  for (let r = 0; r < 4; r++) bx(board, 3.4, 0.35, 0.12, t.cabinetDark, X.isp, Y - 1.5 + r * 0.75 - 0.4, 1.66);
  sign('ISP (YOUR INTERNET PROVIDER)', 7.2, X.isp, Y + 2.0, 0.3, 0.5);
  // internet cloud
  for (const [dx, dy, r] of [[-3, 0, 2.2], [0, 1.2, 2.8], [3, 0, 2.3], [-1.2, -1.3, 2.0], [1.6, -1.2, 2.0]] as const) mesh(board, new THREE.SphereGeometry(r, 18, 12), t.cloud, X.cloud + dx, Y + dy, 0.3);
  sign('THE INTERNET (MANY ROUTERS)', 7.6, X.cloud, Y + 4.4, 0.3, 0.5);
  for (const [dx, dy] of [[-3, 0.3], [0, 1.4], [3, 0.3], [0, -1.0]] as const) bx(board, 0.7, 0.7, 0.3, t.steelDark, X.cloud + dx, Y + dy - 0.35, 0.6);
  // DNS server (the phone book of the internet)
  for (let r = 0; r < 3; r++) bx(board, 3.2, 0.9, 1.8, t.cabinetDark, X.dns, 6.6 + r * 1.05, 0.4);
  sign('DNS SERVER: THE PHONE BOOK', 6.6, X.dns, 10.2, 0.3, 0.5);
  sign('8.8.8.8', 2.6, X.dns, 6.0, 0.4, 0.45);
  // web server
  bx(board, 3.4, 5.4, 2.0, t.rack, X.web, Y - 3.3, 0.4);
  const serverLamps = Array.from({ length: 8 }, (_, i) => bx(board, 0.3, 0.2, 0.1, t.off, X.web - 1 + (i % 2) * 2, Y - 3.3 + 0.4 + (i >> 1) * 0.8, 1.45));
  sign('WEB SERVER', 4.0, X.web, Y + 2.4, 0.3, 0.5);
  sign('93.184.216.34', 5.0, X.web, Y - 4.2, 0.4, 0.45);
  // cables
  const link = (a: THREE.Vector3, b: THREE.Vector3): void => pipe(board, [a, b], 0.07, t.copper);
  const P = {
    laptop: V(X.laptop, Y - 0.6, 0.3), router: V(X.router, Y - 0.6, 0.3), isp: V(X.isp, Y - 0.6, 0.3),
    cloud: V(X.cloud, Y - 0.6, 0.3), dns: V(X.dns, 7.3, 0.3), web: V(X.web, Y - 0.6, 0.3),
  };
  const mid = V(X.dns - 6, Y - 0.6, 0.3);
  link(P.laptop, P.router);
  link(P.router, P.isp);
  link(P.isp, P.cloud);
  link(P.cloud, mid);
  link(mid, P.web);
  link(mid, V(X.dns - 6, 7.3, 0.3));
  link(V(X.dns - 6, 7.3, 0.3), P.dns);
  const toDns = [P.laptop, P.router, P.isp, P.cloud, mid, V(X.dns - 6, 7.3, 0.3), P.dns];
  const toWeb = [P.laptop, P.router, P.isp, P.cloud, mid, P.web];
  const rev = (p: THREE.Vector3[]): THREE.Vector3[] => p.slice().reverse();

  // ---------- packets: timeline of one 20 s cycle
  const CYC = 20;
  const pkts: Packet[] = [];
  const addPacket = (path: THREE.Vector3[], start: number, dur: number, color: number, size = 0.5): void => {
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
    const mm = bx(board, size, size, size, lamp(color), 0, 0, 0.8);
    mm.visible = false;
    pkts.push({ mesh: mm, path, start, dur, len: cum[cum.length - 1], cum });
  };
  addPacket(toDns, 0.2, 2.0, 0xffd23f);
  addPacket(rev(toDns), 2.0, 2.0, 0x38e07a); // the answer: the IP address
  addPacket(toWeb, 4.4, 1.8, 0x4c8dff); // SYN
  addPacket(rev(toWeb), 6.0, 1.8, 0x4c8dff); // SYN-ACK
  addPacket(toWeb, 7.6, 1.8, 0x4c8dff); // ACK
  addPacket(toWeb, 9.4, 1.8, 0xff9f1c, 0.7); // HTTP request
  const hues = [0x38e07a, 0x4cc9f0, 0xffd23f, 0xff6a2b, 0xd86bff, 0xff5b8a];
  const arrive = [0, 3, 1, 5, 2, 4]; // the packets take different routes, so they do not arrive in order
  hues.forEach((c, i) => addPacket(rev(toWeb), 11.4 + i * 0.35 + arrive[i] * 0.0, 2.0 + arrive[i] * 0.35, c, 0.5));
  // reassembly strip at the laptop: the 6 pieces are put back in the right order
  const strip = hues.map((c, i) => {
    const sl = bx(board, 0.8, 0.8, 0.12, t.off, X.laptop - 2.5 + i * 1.0, Y - 4.2, 0.3);
    void c;
    return sl;
  });
  sign('PIECES PUT BACK IN ORDER', 6.4, X.laptop + 0.2, Y - 5.0, 0.3, 0.45);

  // ---------- stage lamps
  const stageNames = ['1 DNS LOOKUP', '2 HANDSHAKE', '3 REQUEST', '4 RESPONSE'];
  const stageLamps = stageNames.map((n, i) => {
    sign(n, 5.2, -14 + i * 7.2 + 0.0, 9.1, 0.3, 0.5);
    return bx(board, 5.0, 0.35, 0.12, t.off, -14 + i * 7.2, 8.5, 0.3);
  });
  // a short text for the stage meaning
  const stageInfo = ['"Where is school.example?"  ->  "93.184.216.34"', 'SYN, SYN-ACK, ACK: both sides say hello', 'HTTP GET: "please send me the page"', 'the page comes back in numbered packets'];
  const infoSigns = stageInfo.map((s) => {
    const sg = sign(s, 30, 0, 0.8, 0.3, 0.6);
    sg.visible = false;
    return sg;
  });
  // TCP/IP layer stack, static
  const layers = ['APPLICATION: HTTP, DNS', 'TRANSPORT: TCP (numbers the packets)', 'INTERNET: IP (addresses)', 'LINK: Wi-Fi / cable'];
  layers.forEach((l, i) => {
    bx(board, 8.4, 0.85, 0.14, [t.blue, t.green, t.amber, t.cyan][i], 44.4, 9.2 - i * 0.95, 0.2);
    sign(l, 8.2, 44.4, 9.2 - i * 0.95 + 0.42, 0.3, 0.4);
  });

  every(anim, (tm) => {
    const c = tm % CYC;
    for (const p of pkts) {
      const u = (c - p.start) / p.dur;
      const on = u >= 0 && u <= 1;
      p.mesh.visible = on;
      if (!on) continue;
      const s = u * p.len;
      let k = 1;
      while (k < p.cum.length - 1 && p.cum[k] < s) k++;
      const seg = p.cum[k] - p.cum[k - 1];
      const a = p.path[k - 1];
      const b = p.path[k];
      const f = seg > 1e-6 ? (s - p.cum[k - 1]) / seg : 0;
      p.mesh.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 0.8);
    }
    const stage = c < 4.2 ? 0 : c < 9.2 ? 1 : c < 11.2 ? 2 : c < 18.5 ? 3 : -1;
    stageLamps.forEach((l, i) => (l.material = i === stage ? lamp(0xffd23f) : t.off));
    infoSigns.forEach((s, i) => (s.visible = i === stage));
    // pieces arrive; when all have arrived the page shows on the laptop
    const done = hues.map((_, i) => c > 11.4 + i * 0.35 + 2.0 + arrive[i] * 0.35);
    strip.forEach((s, i) => (s.material = done[i] ? lamp(hues[i]) : t.off));
    const loaded = done.every(Boolean);
    screen.material = loaded ? lamp(0xdff3ff) : stage === 3 || stage === 0 ? lamp(0x1a4f7a) : t.cabinetDark;
    routerLamps.forEach((l, i) => (l.material = Math.sin(tm * 6 + i * 2) > 0 ? lamp(0x38e07a) : t.off));
    serverLamps.forEach((l, i) => (l.material = Math.sin(tm * 4 + i * 1.7) > 0.2 ? lamp(0x38e07a) : t.off));
  });
  return { id: 'net', nameBn: 'Network Hall (How the Internet Works)', group: g };
}
