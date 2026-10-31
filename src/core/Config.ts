/**
 * Trimmed copy of EVCity's Config: only the keys the copied vehicle / camera / input code reads.
 * Add keys here when you port more systems.
 */
export const Config = {
  floatingOrigin: {
    /** Never re-centre for now: the Bogura region is small (+-8 km). Lower this when cities far apart are streamed together. */
    threshold: 1e9,
  },
  orbit: {
    startYaw: Math.PI,
    startElevation: 0.35,
    distance: 6,
    minDistance: 2.5,
    maxDistance: 25,
    minElevation: -0.25,
    maxElevation: 1.45,
    targetHeight: 0.55,
    shoulder: 0.9,
  },
  camera: {
    fov: 70,
    near: 0.3,
    far: 12_000,
    mouseSensitivity: 0.0022,
  },
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
  },
};
