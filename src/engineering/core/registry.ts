import type { InfrastructureDef } from './types';

const defs = new Map<string, InfrastructureDef>();

export function registerInfrastructure(def: InfrastructureDef): void {
  defs.set(def.id, def);
}
export function getInfrastructureDef(id: string): InfrastructureDef | undefined {
  return defs.get(id);
}
export function listInfrastructure(): InfrastructureDef[] {
  return [...defs.values()];
}
