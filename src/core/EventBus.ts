import type * as THREE from 'three';

/** All events in the engine. Add new ones here when a new stage needs them. */
export interface EngineEvents {
  'engine:ready': undefined;
  /** Floating origin moved. Everything that stores local coordinates (physics!) must shift by (-dx, -dz). */
  'origin:shift': { dx: number; dz: number; origin: THREE.Vector3 };
  'camera:locked': { locked: boolean };
}

type Handler<T> = (payload: T) => void;

/** Tiny typed publish/subscribe bus. Keeps modules loosely coupled. */
export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(event: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(fn as unknown as Handler<never>);
    return () => this.off(event, fn);
  }

  off<K extends keyof E>(event: K, fn: Handler<E[K]>): void {
    this.handlers.get(event)?.delete(fn as unknown as Handler<never>);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    this.handlers.get(event)?.forEach((h) => (h as unknown as Handler<E[K]>)(payload));
  }
}

export type Bus = EventBus<EngineEvents>;
