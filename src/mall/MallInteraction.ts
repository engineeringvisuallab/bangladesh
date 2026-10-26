// Crosshair / mouse picking for mall products. Click on a product -> its page on the live shop opens in a NEW TAB.
// Reusable inside the main game: new MallInteraction(camera, canvas, mall.pickables, onHover).update() every frame.
import * as THREE from 'three';
import type { PickInfo } from './MallBuilder';

export class MallInteraction {
  hovered: PickInfo | null = null;
  maxDist = 14;
  /** Walls etc.: a product behind one of these cannot be picked. */
  blockers: THREE.Object3D[] = [];
  /** Optional extra rule, e.g. "the product must be close to the player" (the third-person camera sits behind the player). */
  accept: ((hit: THREE.Intersection) => boolean) | null = null;
  private ray = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private ring: THREE.Mesh | null = null;

  constructor(
    private camera: THREE.Camera,
    private dom: HTMLElement,
    public targets: THREE.Object3D[],
    private onHover: (p: PickInfo | null) => void = () => {},
    private onOpen: (p: PickInfo) => void = MallInteraction.openInNewTab,
  ) {
    dom.addEventListener('pointermove', (e) => {
      const r = dom.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
  }

  static openInNewTab(p: PickInfo): void {
    if (!p.url) return;
    const a = document.createElement('a');
    a.href = p.url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /** Call every frame. Uses the screen centre while the pointer is locked, the mouse otherwise. */
  update(): void {
    const locked = document.pointerLockElement === this.dom;
    this.ray.setFromCamera(locked ? new THREE.Vector2(0, 0) : this.mouse, this.camera);
    this.ray.far = this.maxDist;
    let pick: PickInfo | null = null, ring: THREE.Mesh | null = null;
    let hit: THREE.Intersection | undefined = this.ray.intersectObjects(this.targets, true)[0];
    if (hit && this.blockers.length) {
      const wall = this.ray.intersectObjects(this.blockers, false)[0];
      if (wall && wall.distance < hit.distance) hit = undefined;
    }
    if (hit && this.accept && !this.accept(hit)) hit = undefined;
    for (let o: THREE.Object3D | null = hit?.object ?? null; o; o = o.parent) {
      if (o.userData.pick) { pick = o.userData.pick as PickInfo; ring = (o.userData.ring as THREE.Mesh) ?? null; break; }
    }
    if (ring !== this.ring) {
      this.setRing(this.ring, false); this.setRing(ring, true); this.ring = ring;
    }
    if (pick !== this.hovered) { this.hovered = pick; this.onHover(pick); }
  }

  /** Forget the current target (e.g. the player walked out of the mall). */
  clear(): void {
    this.setRing(this.ring, false); this.ring = null;
    if (this.hovered) { this.hovered = null; this.onHover(null); }
  }

  /** Returns true if a product was clicked (and opened). */
  click(): boolean {
    if (!this.hovered) return false;
    this.onOpen(this.hovered);
    return true;
  }

  private setRing(r: THREE.Mesh | null, on: boolean): void {
    if (!r) return;
    const m = r.material as THREE.MeshBasicMaterial;
    m.opacity = on ? 1 : 0.5;
    r.scale.setScalar(on ? 1.08 : 1);
  }
}
