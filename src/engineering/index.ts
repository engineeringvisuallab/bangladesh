/**
 * Public entry of the engineering module. The game (or the preview) only imports from here.
 * To add a new infrastructure: create its folder, export an InfrastructureDef, and add ONE line below.
 */
import { registerInfrastructure } from './core/registry';
import { swtpDef } from './civil/water-supply/swtp';
import { stpDef } from './civil/wastewater/stp';
import { thermalDef, gridDef, techDef } from './electrical';
import { mechDef, autoDef, vehicleDef } from './mechanical';
import { damDef } from './civil';
import { chemDef } from './chemical';
import { renewDef } from './renewable';

export * from './core/types';
export { InfraTour, estimateSpeech } from './core/InfraTour';
export { PIPE_COLORS } from './core/materials';
export { getInfrastructureDef, listInfrastructure, registerInfrastructure } from './core/registry';

export function registerBuiltinInfrastructure(): void {
  registerInfrastructure(swtpDef);
  registerInfrastructure(stpDef);
  registerInfrastructure(thermalDef);
  registerInfrastructure(gridDef);
  registerInfrastructure(mechDef);
  registerInfrastructure(damDef);
  registerInfrastructure(chemDef);
  registerInfrastructure(autoDef);
  registerInfrastructure(renewDef);
  registerInfrastructure(vehicleDef);
  registerInfrastructure(techDef);
  // registerInfrastructure(wtpGroundwaterDef);  // later ...
}
