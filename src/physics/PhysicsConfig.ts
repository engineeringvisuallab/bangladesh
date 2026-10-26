/** Physics constants. All physics is done by Rapier; we never write our own. */
export const PhysicsConfig = {
  gravity: -9.81,
  /** 60 Hz fixed timestep. */
  fixedStep: 1 / 60,
  /** Physics only simulates things within this radius (metres) of the player. */
  activeRadius: 300,
};
