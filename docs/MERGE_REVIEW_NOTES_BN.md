# Merge notes - only gun / police / tour systems

Merged from evcity_only_changed_files.zip (NOT merged: railway, building/structure streaming, city density, animals, birds, boats, wildlife corridor, vegetation, new traffic vehicle types).

## Added
- Guns: new weapon catalogue, unlimited reserve ammo, vehicle/helicopter firing, helicopter bombs (Z)
- Police: PolicePursuitManager (police cars + helicopter at 5 stars), lower aggression
- Tour: new TourManager / TourRoadPilot / TourRoadPlanner / TourUI (old aircraft/TourSystem + HeliAutopilot removed)
- Mobile touch controls (InputManager) kept
- Road: light-concrete intersection pads (RoadMaterial, TerrainMaterial, RoadMesh far-LOD flag)

## Corrections during review
- CombatSystem / HelicopterBombs / TourManager no longer depend on animals / WildlifeCorridor
- RoadGraph.passInfo kept (used by traffic/Route.ts)
- Police cars back out and retry when stuck
- Tests updated for unlimited ammo / 1 police per star; combat test made non-flaky

## Status
tsc OK, vite build OK; tests pass except test:people "AI cars stay on their lane" (also fails on original project).
