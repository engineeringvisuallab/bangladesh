import type * as THREE from 'three';
import type { InfraBuildOptions } from './options';
import type { SolidShape } from './solids';
export type { InfraBuildOptions, SolidShape };

/**
 * MERGE CONTRACT (read README.md): everything under src/engineering depends ONLY on `three`.
 * No Engine, no Config, no game imports. The game talks to an infrastructure through these types.
 * Units: metres. Local frame of `root`: x east, y up, z south, origin = site centre, ground y = 0.
 */
export type InfraCategory = 'civil' | 'mechanical' | 'electrical' | 'chemical' | 'energy';

export interface InfraPart {
  id: string;
  nameBn: string;
  group: THREE.Group;
}

/** Camera position relative to the target. azimuth 0 = camera on the +z (south) side looking north. */
export interface CameraShot {
  azimuthDeg: number;
  elevationDeg: number;
  distance: number;
  /** local (root) coordinates; default = centre of the part's bounding box */
  target?: [number, number, number];
}

export interface TourStop {
  id: string;
  partId?: string;
  titleBn: string;
  /** key of the voice line (also the future mp3 file name: public/assets/voice/bn/swtp/<voiceId>.mp3) */
  voiceId: string;
  text: string;
  shot: CameraShot;
  /** local box [minX,minY,minZ,maxX,maxY,maxZ] the camera looks at and the yellow highlight wraps; default = part bounding box */
  focus?: [number, number, number, number, number, number];
}

/**
 * The game's VoiceManager already satisfies this (speakText(text) + stop()), so it can be passed in directly.
 * The promise may resolve when speech STARTS or ENDS: the tour also waits an estimated reading time.
 */
export type NarrationLang = 'bn' | 'en';

export interface Narrator {
  /** `lang` defaults to 'bn'. (The game's VoiceManager also picks the voice from the script of the text, so English text always gets an English voice.) */
  speakText(text: string, voiceId?: string, lang?: NarrationLang): Promise<void>;
  stop(): void;
}

export interface Infrastructure {
  readonly id: string;
  /** Language of the tour text and labels. Default 'bn'. */
  readonly narrationLang?: NarrationLang;
  readonly nameBn: string;
  readonly category: InfraCategory;
  /** Add this to the scene. Move/rotate the root to place the site in the world. */
  readonly root: THREE.Group;
  readonly parts: InfraPart[];
  readonly tour: TourStop[];
  /** site boundary size in metres (for placing it on a terrain pad) */
  /** pipe kinds (see PIPE_COLORS) shown in the on-screen legend */
  readonly legend: readonly string[];
  /** collision shapes in local coordinates (walls, tank walls, buildings, columns, fence) */
  solids(): SolidShape[];
  readonly footprint: { width: number; depth: number };
  setLabelsVisible(visible: boolean): void;
  /** Optional: advance the plant's own animation (spinning rotors, flowing pipe dots, steam plumes). The game calls it only while the plant is near. */
  update?(dt: number): void;
  dispose(): void;
}

export interface InfrastructureDef {
  id: string;
  nameBn: string;
  category: InfraCategory;
  create(options?: InfraBuildOptions): Infrastructure;
}
