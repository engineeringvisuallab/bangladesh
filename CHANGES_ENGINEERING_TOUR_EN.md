# Engineering Tour (replaces the helicopter / car Tour)

Click **Tour** (top-left) -> pick an engineering site -> that site's guided tour starts by itself
(camera cuts to the site, narrated stops run on their own). While it runs the button reads "Stop tour".
Same tour as pressing Y next to a site; `.` next, `,` back, `Y` stop. Esc closes the picker.

## Removed (whole old Tour)
- Tour helicopter + tour car dispatch, boarding, road autopilot, destination list, yellow tour markers.
- DELETE these 2 files by hand (run `delete-old-tour-files.bat`): `src/tour/TourRoadPilot.ts`, `src/tour/TourRoadPlanner.ts`.
- Tour-only code in VehicleManager / Vehicle / TrafficManager / Helicopter / HelicopterManager / HUD / bn.ts.
- Kept on purpose: the autopilot that police helicopters and cars and the farm crew use (`Vehicle.tourInput`, helicopter autopilot).

## New / changed
- `src/tour/TourManager.ts`, `src/ui/TourUI.ts`: new Tour button + site picker (11 sites, from the world's site list).
- `InfraManager`: `listTours()`, `startById(id)`, `stopTour()`.
- `Engine.ts`: wiring; a tour now also refuses to start while riding a train / plane.
- `Helicopter.releaseAutopilot()` replaces `setTourParked(false)` (gravity back on).
- `scripts/engineering-tour-test.ts` (in `npm run test:infra`).
