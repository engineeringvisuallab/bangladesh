import * as THREE from 'three';
import type { Infrastructure, Narrator, TourStop } from './types';

export type TourState = 'idle' | 'playing' | 'paused';

const TRAVEL_SECONDS = 3.4;
const ORBIT_DEG_PER_SEC = 2.5;

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}
/** Rough speaking time of a Bangla line (seconds). */
export function estimateSpeech(text: string, lang: 'bn' | 'en' = 'bn'): number {
  return Math.max(6, 2 + text.length * (lang === 'en' ? 0.068 : 0.085));
}

/**
 * Narrated camera tour of one infrastructure: for each stop the camera flies to the structure, a yellow box
 * highlights it, the Bangla line is spoken (or only shown as subtitle) and then the tour moves on.
 * It only drives `camera` (position + lookAt). In the game: pause OrbitCamera/player control while state != 'idle'.
 */
export class InfraTour {
  state: TourState = 'idle';
  index = -1;
  onStop: (index: number, stop: TourStop) => void = () => {};
  onState: (state: TourState) => void = () => {};

  private token = 0;
  private t = 0;
  private fromPos = new THREE.Vector3();
  private fromTarget = new THREE.Vector3();
  private toTarget = new THREE.Vector3();
  private dist = 100;
  private el = 0.5;
  private az = 0;
  private lookAt = new THREE.Vector3();
  private readonly highlight = new THREE.Box3Helper(new THREE.Box3(), 0xffd400);
  private timer = 0;

  constructor(private readonly infra: Infrastructure, private readonly camera: THREE.PerspectiveCamera, private readonly narrator: Narrator) {
    this.highlight.visible = false;
    infra.root.add(this.highlight);
  }

  get stops(): TourStop[] {
    return this.infra.tour;
  }

  start(i = 0): void {
    this.goTo(i, true);
  }
  next(): void {
    if (this.index + 1 >= this.stops.length) this.stop();
    else this.goTo(this.index + 1, true);
  }
  prev(): void {
    this.goTo(Math.max(0, this.index - 1), true);
  }
  /** Fly to a stop and (if `speak`) narrate it. */
  goTo(i: number, speak: boolean): void {
    const stop = this.stops[i];
    if (!stop) return;
    this.index = i;
    this.token++;
    window.clearTimeout(this.timer);
    this.setState('playing');
    this.beginTravel(stop);
    this.onStop(i, stop);
    if (speak) void this.narrate(stop, this.token);
  }
  pause(): void {
    if (this.state !== 'playing') return;
    this.token++;
    window.clearTimeout(this.timer);
    this.narrator.stop();
    this.setState('paused');
  }
  resume(): void {
    if (this.state !== 'paused') return;
    this.setState('playing');
    const stop = this.stops[this.index];
    if (stop) void this.narrate(stop, this.token);
  }
  stop(): void {
    this.token++;
    window.clearTimeout(this.timer);
    this.narrator.stop();
    this.highlight.visible = false;
    this.index = -1;
    this.setState('idle');
  }

  /** The game's floating origin moved: shift everything the tour remembers (all in camera-local coordinates). */
  translate(dx: number, dz: number): void {
    for (const v of [this.fromPos, this.fromTarget, this.toTarget, this.lookAt]) {
      v.x += dx;
      v.z += dz;
    }
  }

  update(dt: number): void {
    if (this.state === 'idle' || this.index < 0) return;
    this.t += dt;
    const k = Math.min(1, this.t / TRAVEL_SECONDS);
    if (this.state === 'playing' && k >= 1) this.az += THREE.MathUtils.degToRad(ORBIT_DEG_PER_SEC) * dt;
    const goalTarget = this.toTarget;
    this.lookAt.copy(this.fromTarget).lerp(goalTarget, ease(k));
    const goalPos = this.shotPosition();
    this.camera.position.copy(this.fromPos).lerp(goalPos, ease(k));
    this.camera.lookAt(this.lookAt);
  }

  // ---------------------------------------------------------------------------------------------

  private setState(s: TourState): void {
    if (this.state === s) return;
    this.state = s;
    this.onState(s);
  }

  private shotPosition(): THREE.Vector3 {
    const r = this.dist * Math.cos(this.el);
    return new THREE.Vector3(this.toTarget.x + r * Math.sin(this.az), this.toTarget.y + this.dist * Math.sin(this.el), this.toTarget.z + r * Math.cos(this.az));
  }

  private beginTravel(stop: TourStop): void {
    const root = this.infra.root;
    root.updateWorldMatrix(true, true);
    const part = stop.partId ? this.infra.parts.find((p) => p.id === stop.partId) : undefined;
    const box = new THREE.Box3();
    if (stop.focus) {
      const f = stop.focus;
      box.set(new THREE.Vector3(f[0], f[1], f[2]), new THREE.Vector3(f[3], f[4], f[5])).applyMatrix4(root.matrixWorld);
    } else if (part) this.partBox(part.group, box);
    const target = new THREE.Vector3();
    if (stop.shot.target) target.set(...stop.shot.target).applyMatrix4(root.matrixWorld);
    else if (!box.isEmpty()) box.getCenter(target);
    else root.getWorldPosition(target);
    this.fromPos.copy(this.camera.position);
    this.fromTarget.copy(this.lookAt.lengthSq() > 0 ? this.lookAt : target);
    this.toTarget.copy(target);
    this.dist = stop.shot.distance;
    this.el = THREE.MathUtils.degToRad(stop.shot.elevationDeg);
    this.az = THREE.MathUtils.degToRad(stop.shot.azimuthDeg) + root.rotation.y;
    this.t = 0;
    if (!this.lookAt.lengthSq()) this.lookAt.copy(target);
    if ((part || stop.focus) && !box.isEmpty()) {
      const local = box.clone().applyMatrix4(root.matrixWorld.clone().invert());
      this.highlight.box.copy(local);
      this.highlight.visible = true;
    } else this.highlight.visible = false;
  }

  /** Bounding box of a part. Moving effects (flow dots, plumes: named 'fx') are left out, they would stretch the box. */
  private partBox(group: THREE.Object3D, out: THREE.Box3): void {
    let hasFx = false;
    group.traverse((o) => {
      if (o.name === 'fx') hasFx = true;
    });
    if (!hasFx) {
      out.setFromObject(group, true);
      return;
    }
    const v = new THREE.Vector3();
    group.traverse((o) => {
      if (o.name === 'fx' || !(o as THREE.Mesh).isMesh) return;
      const pos = (o as THREE.Mesh).geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) out.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    });
  }

  private async narrate(stop: TourStop, token: number): Promise<void> {
    const t0 = performance.now();
    try {
      await this.narrator.speakText(stop.text, stop.voiceId, this.infra.narrationLang ?? 'bn');
    } catch {
      /* subtitles only */
    }
    if (token !== this.token) return;
    const left = estimateSpeech(stop.text, this.infra.narrationLang ?? 'bn') * 1000 - (performance.now() - t0);
    this.timer = window.setTimeout(() => {
      if (token === this.token && this.state === 'playing') this.next();
    }, Math.max(1500, left));
  }
}
