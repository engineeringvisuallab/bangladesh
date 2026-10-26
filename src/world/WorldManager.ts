import * as THREE from 'three';
import { Config } from '../core/Config';
import type { Bus } from '../core/EventBus';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainChunkBuilder, TerrainGenerator, TerrainMaterials, TerrainPhysics } from '../terrain';
import { TunnelHoles } from '../rail/RailTunnel';
import { RoadChunkBuilder, RoadMaterial } from '../roads';
import { RailChunkBuilder, RailMaterial } from '../rail';
import { PortChunkBuilder, PortMaterial } from '../port';
import { HorizonSea, WaterChunkBuilder, WaterMaterial, type SkyUniforms } from '../water';
import { GrassAssets, GrassManager, RockAssets, TreeAssets, TreeChunkBuilder, TreePhysics } from '../vegetation';
import { ChunkLoader } from './ChunkLoader';
import { ChunkManager } from './ChunkManager';
import { FloatingOrigin } from './FloatingOrigin';
import { LOD_COUNT } from './LOD';
import { Seed } from './Seed';
import { worldToChunkCoord } from './WorldGrid';

/** Owns everything that makes up "the world": seed, terrain, floating origin, chunk streaming, terrain physics. */
export class WorldManager {
  readonly root = new THREE.Group();
  readonly seed = new Seed(Config.world.seed);
  readonly origin: FloatingOrigin;
  readonly chunks: ChunkManager;
  readonly terrainMaterials = new TerrainMaterials(LOD_COUNT);
  readonly terrainPhysics: TerrainPhysics;
  readonly treePhysics: TreePhysics;
  /** Same terrain function the workers use. Lets the main thread ask "how high is the ground at x,z?". */
  readonly terrain = new TerrainGenerator(this.seed.value);
  /** Where the railway tunnels / boxes are (terrain holes; also tells the player it is inside one). */
  readonly tunnelHoles = new TunnelHoles(this.terrain.rail);

  /** Player/camera position in true world coordinates (updated every frame). */
  readonly playerWorld = new THREE.Vector3();

  private sampleScratch = this.terrain.makeSample();
  private loader: ChunkLoader;
  readonly water: WaterMaterial;
  private roadMaterial = new RoadMaterial();
  private railMaterial = new RailMaterial();
  private portMaterial = new PortMaterial();
  private treeAssets = new TreeAssets();
  private rockAssets = new RockAssets();
  private grassAssets = new GrassAssets();
  readonly grass: GrassManager;
  private horizonSea: HorizonSea;

  constructor(scene: THREE.Scene, bus: Bus, physics: PhysicsWorld, sky: SkyUniforms) {
    this.root.name = 'WorldRoot';
    scene.add(this.root);
    this.water = new WaterMaterial(sky);
    this.horizonSea = new HorizonSea(this.water);
    this.root.add(this.horizonSea.mesh);

    this.origin = new FloatingOrigin(this.root, bus);
    bus.on('origin:shift', ({ origin }) => this.terrainMaterials.setOrigin(origin.x, origin.z));

    this.loader = new ChunkLoader(this.seed.value);
    this.chunks = new ChunkManager(this.root, this.loader, bus, new TerrainChunkBuilder(this.terrainMaterials), new WaterChunkBuilder(this.water), new RoadChunkBuilder(this.roadMaterial), new RailChunkBuilder(this.railMaterial), new PortChunkBuilder(this.portMaterial), new TreeChunkBuilder(this.treeAssets, this.rockAssets));
    this.grass = new GrassManager(this.root, this.loader, this.grassAssets);
    this.terrainPhysics = new TerrainPhysics(physics, this.origin, bus, this.tunnelHoles);
    this.treePhysics = new TreePhysics(physics, this.origin, bus);
  }

  /** Call every frame, after the camera moved. */
  update(dt: number, time: number, camera: THREE.Object3D, clampCamera: boolean): void {
    this.origin.update(camera);
    this.origin.toWorld(camera.position, this.playerWorld);

    if (clampCamera) {
      // Free-fly camera: keep it inside the playable area and above ground/water.
      const lim = Config.world.size / 2;
      const clampedX = Math.max(-lim, Math.min(lim, this.playerWorld.x));
      const clampedZ = Math.max(-lim, Math.min(lim, this.playerWorld.z));
      camera.position.x += clampedX - this.playerWorld.x;
      camera.position.z += clampedZ - this.playerWorld.z;
      this.terrain.sample(clampedX, clampedZ, this.sampleScratch);
      const surface = Math.max(this.sampleScratch.h, Number.isNaN(this.sampleScratch.water) ? -Infinity : this.sampleScratch.water, Config.terrain.seaLevel);
      const minY = surface + Config.camera.groundClearance;
      if (camera.position.y < minY) camera.position.y = minY;
      this.origin.toWorld(camera.position, this.playerWorld);
    }

    this.water.update(time, this.origin.origin.x, this.origin.origin.z);
    this.treeAssets.update(time);
    this.grassAssets.update(time);
    this.grass.update(dt, this.playerWorld.x, this.playerWorld.y, this.playerWorld.z, (x, z) => this.terrain.heightAt(x, z));
    this.chunks.update(dt, this.playerWorld.x, this.playerWorld.z);
    this.terrainPhysics.update(dt, this.playerWorld.x, this.playerWorld.z);
    this.treePhysics.update(dt, this.playerWorld.x, this.playerWorld.z);
  }

  get playerChunk(): { cx: number; cz: number } {
    return worldToChunkCoord(this.playerWorld.x, this.playerWorld.z);
  }

  dispose(): void {
    this.grass.dispose();
    this.treePhysics.dispose();
    this.chunks.dispose();
    this.loader.dispose();
    this.terrainMaterials.dispose();
    this.horizonSea.dispose();
    this.water.dispose();
    this.roadMaterial.dispose();
    this.railMaterial.dispose();
    this.portMaterial.dispose();
    this.treeAssets.dispose();
    this.rockAssets.dispose();
    this.grassAssets.dispose();
  }
}
