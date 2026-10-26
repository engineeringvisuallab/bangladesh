/**
 * Central configuration. Every magic number lives here.
 * Units: metres, seconds.
 */
export const Config = {
  world: {
    /** World is exactly 10 km x 10 km (the playable area). */
    size: 10_000,
    /** One chunk = 500 m x 500 m -> exactly 20 x 20 chunks. */
    chunkSize: 500,
    /** Extra chunk rings rendered outside the playable area so the edge is never a visible void. */
    chunkMargin: 2,
    /** Master seed. Same seed -> same world, nothing stored on disk. */
    seed: 20260101,
  },

  terrain: {
    seaLevel: 0,
    /** Highest possible terrain point (rim mountains). Used by shader/snow line and sanity checks. */
    maxHeight: 650,
    /** Skirt depth (m) per LOD: hangs below chunk borders to hide cracks between different LODs. */
    skirtDepth: [8, 16, 32, 64] as number[],
    /** Main island in the southern sea (about 2 km2). Centre in world metres (x east, z south). */
    island: {
      x: -1400,
      z: 4050,
      /** Mean radius (m) of the shoreline; the real outline is bent by noise. pi*830^2 = 2.16 km2 */
      radius: 830,
      /** How strongly noise bends the outline (0 = perfect circle). */
      wobble: 0.26,
      /** Highest hill at the middle of the island (m above sea). */
      peak: 46,
      /** Height (m) of the sand beach shelf right at the shoreline. */
      beach: 1.4,
    },
    river: {
      /** Coarse grid (m) used once at start to route rivers downhill (priority-flood). */
      gridStep: 80,
      /** Drainage area (in grid cells) a cell needs to become a river. Lower = more rivers. */
      accThreshold: 450,
      /** A river never cuts a gorge deeper than this (m); deeper -> river ends in a pond. */
      maxCut: 22,
      maxLakes: 3,
    },
  },

  roads: {
    /**
     * The road network grows tier by tier (one tier per stage), never all at once:
     *   1 = main roads (freeways)  2 = + primary (arterial)  3 = + secondary (collector)  4 = + tertiary (local / city streets).
     * Stage 6A = 1, 6B = 2, 6C = 3.
     */
    activeTier: 4 as 1 | 2 | 3 | 4,
    /** The long bridge to the island and the island's road network (RoadPlan.ISLAND_PLAN). */
    island: true,
  },

  /** STAGE 10: the city (local streets, then buildings). */
  city: {
    localRoads: {
      /** City sites that get local streets so far (Stage 10B step 1 = site 0 only; sites 1 and 2 follow). */
      sites: [0] as number[],
      /** Shortest street piece (m); the junction system needs legs of at least `minArm`. */
      minEdge: 60,
      /** Shortest connector to a main road (m): a local pad and a main-road T pad must not overlap. */
      minConnect: 82,
      /** Longest connector (m) built to join a street group to the network. */
      maxConnect: 420,
      /** Extra connectors to main roads are built for street nodes closer than this (m). */
      extraConnect: 240,
      /** Spacing (m) along a tier 1-3 road between two local T-junctions. */
      mainTSpacing: 120,
      /** Nothing is built within this distance (m) of an existing junction of tier 1-3 (its pad is large). */
      junctionKeepout: 80,
      /** Bridges: no local street within this distance (m). */
      bridgeKeepout: 130,
      /** Free ground (m) between a local street edge and a main-road edge / another street edge. */
      clearMain: 14,
      clearLocal: 24,
      /** Wet test margin (m above the water surface) and sample spacing (m) along a street. */
      wetMargin: 2.5,
      sampleStep: 8,
      /** Steepest allowed street (rise / run). */
      maxGrade: 0.06,
      /** Grade limit (rise / run) the junction system may use to ramp a street back onto its profile after a level pad. */
      rampGrade: 0.1,
      /** Cross slope a pad between local streets may have (rise / run); its plane is fitted through the streets. */
      padTilt: 0.06,
      /** A connector stays level for this length (m) at its T-junction with a main road (the length of the pad stub). */
      mainPlateau: 28,
      /** A T-junction meets the road at least this far from parallel (|cos| of the angle to the road <= value). */
      maxCosSkew: 0.35,
      /** Streets keep this far (m) from the border of their area. */
      areaMargin: 6,
      /** Junction pad limits for local streets (Junctions.ts): shortest leg, spacing local-local, spacing local-main. */
      minArm: 40,
      minPadSpacing: 48,
      mixedPadSpacing: 76,
      /** Footpath (sidewalk) width beside local streets (m), in place of the gravel shoulder. */
      sidewalk: 2,
    },
  },

  /** STAGE 7: vegetation. Step 1 = forest trees (instanced, placed in the chunk worker). */
  vegetation: {
    /** Chunks up to this LOD get trees (0 = nearest only). LOD 0 uses the detailed models, higher LODs the simple ones. */
    maxLod: 1,
    /** Placement grid (m). One tree at most per cell, jittered inside it. 500 / cellSize must be a whole number. */
    cellSize: 10,
    /** Chance (0..1) of a tree per cell: in the middle of a forest / in open land. */
    forestChance: 0.55,
    scatterChance: 0.035,
    /** Size (m) of the forest patches (noise wavelength). */
    forestScale: 520,
    /** No tree on ground steeper than this (degrees), the chance fades out from 60 % of it. */
    maxSlopeDeg: 33,
    /** Free ground (m) above the water surface / above sea level (beach). */
    waterMargin: 1.5,
    seaMargin: 3.5,
    /** Free ground (m) around asphalt, shoulder and junction pads. */
    roadClear: 4,
    /** Trees thin out between these heights (m) and stop above the second one (snow line is ~340 m). */
    treeLineStart: 230,
    treeLineEnd: 330,
    /** Pines replace broadleaf trees between these heights (m); palms grow below `palmBelow` (m). */
    pineFrom: 70,
    pineFull: 150,
    palmBelow: 35,
    /** Tree chance (0..1 of the normal chance) inside a planned city area, by zone kind. Unlisted zones get no trees. */
    cityZoneChance: { green: 0.6, recreation: 0.7 } as Record<string, number>,
    /** Outside the plan of a city the forest grows back over this distance (m). */
    cityFadeOut: 150,
    /** Wind sway (m of sway per metre of tree height). */
    windStrength: 0.02,
    /** Trunks are sunk this far (m) into the ground so coarse LOD terrain never leaves them floating. */
    sink: 0.35,
    /** Trunk colliders (Rapier cylinders): created for trees within `collideRadius` (m) of the player, removed beyond `collideKeep`. */
    collideRadius: 80,
    collideKeep: 110,
    /** Trees are grouped in squares of this size (m) - one fixed body per square. Chunk size / this must be a whole number. */
    collideCell: 50,
    /** Max squares given colliders per physics update (5 Hz), so walking into a forest never hitches. */
    collideBuildPerTick: 8,
    /** Rocks: boulders and outcrops, placed like trees. Rocks at least `collideMinHeight` (m) tall collide (smaller ones can be stepped over). */
    rocks: {
      cellSize: 20,
      baseChance: 0.05,
      /** Extra chance on slopes (rise / run 0.35 .. 0.8) and above the tree line (240 .. 380 m). */
      outcropChance: 0.5,
      alpineChance: 0.25,
      maxChance: 0.6,
      roadClear: 5,
      waterMargin: 0.4,
      minHeight: 1.5,
      collideMinHeight: 0.45,
    },
    /** Grass: tufts in tiles around the player (made by the chunk workers on request), fading out with distance. */
    grass: {
      /** Tile size (m) and cell size (m): one tuft at most per cell. tile / cell must be a whole number. 0.32 m = ~2.4x denser than the old 0.5 m. */
      tile: 32,
      cell: 0.32,
      /** Tiles within `radius` (m) of the player exist, tiles beyond `keep` are removed. */
      radius: 170,
      keep: 190,
      maxInFlight: 6,
      /** Tufts shrink to nothing between these camera distances (m): only at the very edge, so the meadow is always there (like the trees). */
      fadeStart: 140,
      fadeEnd: 168,
      /** Height of every tuft is multiplied by this (the very old grass reached 2+ m). Step 3 used 0.35; now 2x bigger = 0.7: a meadow is ~0.2-0.6 m, tall seed / wild grass up to ~1.8 m. */
      heightScale: 0.7,
      /** Width of every tuft is multiplied by this (1 = as before; 2 = twice as wide, so the meadow is 2x bigger and fuller). */
      widthScale: 2,
      /**
       * Grass LOD rings (like the trees): `to` = up to this distance (m, nearest edge of the tile), `stride` = only every n-th cell gets a tuft
       * (must divide tile / cell = 100: 1, 2, 5), `density` = blades per tuft model, `size` = width of a tuft (fewer tufts, each a bit wider).
       * Far rings have no flowers. The tuft positions of a coarse ring are a subset of the near ring, so nothing jumps when a tile changes ring.
       */
      lods: [
        { to: 40, stride: 1, density: 1, size: 1 },
        { to: 80, stride: 2, density: 0.5, size: 1.4 },
        { to: 170, stride: 5, density: 0.25, size: 2.2 },
      ] as { to: number; stride: number; density: number; size: number }[],
      lodHysteresis: 0.12,
      /** Chance per cell inside a meadow / on bare patches, and the extra thinning inside forests. Higher = denser, fewer bald patches. */
      maxChance: 0.98,
      minChance: 0.6,
      forestThin: 0.3,
      /** Blades per tuft model are multiplied by this (1 = full quality; 0.6 for weak GPUs). */
      bladeDensity: 1,
      /** Wildflowers: share of tufts that carry flowers inside a flower patch / scattered in the open meadow. Patches are ~12-30 m wide. */
      flowerInPatch: 0.14,
      flowerScatter: 0.006,
      /** Steepest ground (rise / run) with grass; it thins out from `slopeFadeFrom`. The terrain shader turns to rock at ~0.5. */
      maxSlope: 0.45,
      slopeFadeFrom: 0.28,
      /** Grass thins out above these heights (m); colour goes from green to dry between dryFrom and dryTo (like the terrain shader). */
      heightFadeStart: 200,
      heightFadeEnd: 300,
      dryFrom: 120,
      dryTo: 280,
      /** Chance factor inside planned city areas (buildings will clear their own ground later). */
      cityChance: 0.5,
      /** No grass is made while the camera is higher than this above the ground (m): free-fly / helicopter. */
      maxAboveGround: 70,
    },
  },

  /** STAGE 9: people on foot. */
  people: {
    /** How many people on foot the world keeps around the player. */
    target: 34,
    spawnEvery: 0.35,
    /** Ring around the player (m) where new people appear / beyond which they are removed. */
    spawnMin: 40,
    spawnMax: 190,
    despawnRadius: 240,
    /** Share of the people who wander in the open (the rest walk along road edges) while the player is in a city zone. */
    wanderShare: 0.4,
    run: 5.2,
  },

  /** Weapons, wanted level and damage balance; player health remains protected. */
  combat: {
    weapons: {
      // Game-balance values for stylised fictional weapons; these are not real-world ballistics.
      pistol:          { interval: 0.30, auto: false, damage: 34, pellets: 1, spread: 0.012, range: 180, gunLength: 0.20, magazine: 12, reserve: 60, reserveMax: 120, reload: 1.4 },
      combatPistol:    { interval: 0.24, auto: false, damage: 39, pellets: 1, spread: 0.010, range: 210, gunLength: 0.22, magazine: 15, reserve: 75, reserveMax: 150, reload: 1.5 },
      heavyPistol:     { interval: 0.38, auto: false, damage: 52, pellets: 1, spread: 0.014, range: 230, gunLength: 0.23, magazine: 8, reserve: 48, reserveMax: 96, reload: 1.8 },
      revolver:        { interval: 0.52, auto: false, damage: 68, pellets: 1, spread: 0.009, range: 260, gunLength: 0.22, magazine: 6, reserve: 36, reserveMax: 72, reload: 2.0 },
      microSmg:        { interval: 0.075, auto: true, damage: 13, pellets: 1, spread: 0.042, range: 125, gunLength: 0.28, magazine: 24, reserve: 144, reserveMax: 288, reload: 1.7 },
      smg:             { interval: 0.085, auto: true, damage: 17, pellets: 1, spread: 0.030, range: 160, gunLength: 0.34, magazine: 30, reserve: 150, reserveMax: 300, reload: 1.9 },
      ak47:            { interval: 0.105, auto: true, damage: 24, pellets: 1, spread: 0.023, range: 270, gunLength: 0.47, magazine: 30, reserve: 180, reserveMax: 360, reload: 2.1 },
      carbineRifle:    { interval: 0.095, auto: true, damage: 22, pellets: 1, spread: 0.018, range: 320, gunLength: 0.46, magazine: 30, reserve: 180, reserveMax: 360, reload: 2.0 },
      shotgun:         { interval: 0.85, auto: false, damage: 14, pellets: 8, spread: 0.065, range: 60, gunLength: 0.50, magazine: 6, reserve: 30, reserveMax: 60, reload: 2.4 },
      sniperRifle:     { interval: 1.15, auto: false, damage: 95, pellets: 1, spread: 0.0035, range: 650, gunLength: 0.62, magazine: 5, reserve: 25, reserveMax: 50, reload: 2.8 },
    },
    /** Q cycles the full fictional GTA-inspired catalogue. */
    order: ['pistol', 'combatPistol', 'heavyPistol', 'revolver', 'microSmg', 'smg', 'ak47', 'carbineRifle', 'shotgun', 'sniperRifle'] as const,
    /** A killed armed person drops this many magazines of his gun (added to the player's reserve ammo). */
    lootMagazines: 1,
    personHealth: 100,
    headshotMultiplier: 3,
    /** Hit cylinder of a person (radius in m; the head starts at this share of the body height). */
    bodyRadius: 0.38,
    headFrom: 0.84,
    /** The gun stays in the hand this long (s) after the last shot / aim. */
    drawSeconds: 4,
    /** While aiming (right mouse button) the camera moves this much closer. */
    aimCameraScale: 0.6,
    /** Aiming makes bullets this much more accurate. */
    aimAccuracy: 0.5,
    /** Bodies stay on the ground this long (s). */
    deadLinger: 25,
    /** Share of the walking people who carry a gun and want to kill the player. */
    thugShare: 0.035,
    /** Armed people see (and start shooting at) the player within this distance (m). */
    sightRange: 38,
    /** They fire only up to this distance (m) and keep this distance (m) while shooting. */
    fireRange: 52,
    keepDistance: 16,
    /** Hit chance of an NPC shot = max(minHit, baseHit - distance * hitFalloff). */
    baseHit: 0.38,
    minHit: 0.05,
    hitFalloff: 0.011,
    /** Damage the player takes per NPC hit - only used for the red screen flash (the player is immortal). */
    npcDamage: 12,
    /** People within this distance (m) of a shot / killing run away (or fight, when armed). */
    alarmRadius: 25,
    fleeSeconds: 10,
    /** Wanted level (time based): crime weight, seconds of crime that keep the window open / each crime adds per weight, fade per second, crime seconds needed for star 1..5, police per star. */
    wanted: { killCivilian: 1, woundCivilian: 0.4, killPolice: 2, shootPolice: 0.6, activeWindow: 20, bonusPerHeat: 0, decay: 2, starAt: [120, 300, 420, 510, 600], policePerStar: 1, spawnMin: 65, spawnMax: 105, spawnEvery: 3.8, leaveAfter: 22 },
  },

  /** STAGE 9: AI traffic. Every vehicle has a driver (a person); there are no empty cars. */
  traffic: {
    target: 12,
    spawnEvery: 0.6,
    spawnMin: 110,
    spawnMax: 260,
    /** Cars farther than this from the player are removed (the physics only runs near the player anyway). */
    despawnRadius: 285,
    /** Minimum free distance (m) to other vehicles when a new car appears. */
    spawnGap: 25,
    /** What kind of vehicle appears, where, and how often: see `use` of each spec in vehicles/VehicleSpec.ts (vehicles/VehicleUse.ts). */
    /** At most this many buses at the same time. */
    maxBuses: 3,
  },

  lod: {
    /**
     * Distance (m, measured to the nearest edge of the chunk) up to which each LOD is used.
     * LOD0 = most detailed ... LOD3 = coarsest. The last value is also the load radius.
     * Near the camera everything is detailed; far away only a coarse, cheap terrain (no trees, no road ribbons) is drawn.
     */
    distances: [380, 900, 1900, 3600] as number[],
    /** Vertices per chunk side for each LOD. */
    vertsPerSide: [128, 64, 32, 16] as number[],
    /** 8 % hysteresis so chunks do not flicker between LODs at the border. */
    hysteresis: 0.08,
  },

  chunk: {
    /** Re-evaluate wanted chunks when the player moved this far (m). */
    reevaluateDistance: 32,
    /** Max chunk requests being generated by workers at the same time. */
    maxInFlight: 10,
    /** Max chunk meshes added to the scene per frame (avoids hitches). */
    maxMeshesPerFrame: 2,
    /** New chunks fade in (dithered) over this many seconds. */
    fadeSeconds: 0.7,
  },

  loop: {
    fixedStep: 1 / 60,
    maxSubSteps: 5,
    /** Frames longer than this are clamped (tab was in background etc.). */
    maxFrameTime: 0.25,
  },

  floatingOrigin: {
    /** When the camera is farther than this from the scene origin (x or z), the origin is re-centred. */
    threshold: 2000,
  },

  environment: {
    /** Fog density (FogExp2). 0.00046 -> ~95 % fogged at the 3.6 km load radius, hides chunk pop-in and the far, coarse terrain. */
    fogDensity: 0.00046,
    shadowExtent: 350,
    shadowMapSize: 4096,
    /** Day / night cycle (see src/environment/DayNight.ts). Night can be switched off in the game with the \ key. */
    dayNight: {
      /** Minutes from sunrise to sunset. */
      dayMinutes: 8,
      /** Minutes from sunset to sunrise (the dusk and dawn colour changes happen inside these times, never as a sudden jump). */
      nightMinutes: 3,
      /** The game starts at this fraction of the day (0 = sunrise, 1 = sunset): mid-morning. */
      startFraction: 0.21,
      /** Seconds the sky needs to fade to full day when the night mode is switched off (and back when it is switched on). */
      switchSeconds: 6,
    },
  },

  player: {
    height: 1.8,
    radius: 0.35,
    /** Metres per second. */
    walk: 4.2,
    run: 8.5,
    swim: 2.6,
    swimSprint: 4.4,
    jump: 5.2,
    /** Feet depth under water (m) to start / stop swimming (hysteresis). */
    swimEnter: 1.25,
    swimExit: 0.75,
    /** Breath under water (seconds), how fast it refills at the surface (per second), seconds at zero before blacking out. */
    oxygenSeconds: 45,
    oxygenRefill: 0.7,
    drownGrace: 5,
    /** Dive speed (m/s) and with Shift. */
    diveSpeed: 2.2,
    diveSprint: 3.4,
    maxSlopeDeg: 55,
    stepHeight: 0.5,
    /** Invisible wall: the player cannot leave the playable area. */
    bound: 5000,
  },

  orbit: {
    startYaw: Math.PI, // looking south (towards the sea)
    startElevation: 0.35,
    distance: 6,
    minDistance: 2.5,
    maxDistance: 25,
    minElevation: -0.25,
    maxElevation: 1.45,
    /** Camera looks at a point this far above the capsule centre (shoulder/head height). */
    targetHeight: 0.55,
    /** On foot the camera sits this far to the RIGHT of the player (m): the crosshair in the screen centre does not sit on his back. */
    shoulder: 0.9,
  },

  camera: {
    fov: 70,
    near: 1,
    far: 16_000,
    startPosition: { x: 0, y: 140, z: 0 },
    startPitch: -0.3,
    mouseSensitivity: 0.0022,
    baseSpeed: 80,
    minSpeed: 2,
    maxSpeed: 3000,
    boostMultiplier: 8,
    /** Free-fly camera never goes closer than this to the ground (m). */
    groundClearance: 2,
  },
};
