# Suprim gari: Shift chhara full speed, flight e level body, rotor ghora, expressway fix

Shudhu ei 6ta file change hoyeche. Tomar game folder e same path e copy kore replace koro.

1. src/vehicles/Vehicle.ts
   - Shift lage na: air, pani, rail shob jaigay W chaplei full power / full speed (Ctrl ekhono dhire kore).
   - Flight mode e body shobshomoy level: samne gele matha uchu hobe na, pichone helbe na, turn e kat hobe na.
   - Ctrl = dhire (drone speed). Space climb er speed ager moto (overshoot hoy na).
   - Pani theke tire uthar shomoy speed ~160 km/h e nambe (noyto gari uRe jay).
2. src/vehicles/VehicleModel.ts
   - Drone er pakha ghurbe. Karon: pakha cross-shape, 90 degree e dekhte ek-ra. Ager speed e frame e ~90 degree ghurto, tai thira mone hoto. Ekhon per-frame step choto, shobshomoy ghurte dekha jay.
3. src/vehicles/VehicleManager.ts + src/core/Engine.ts
   - N menu theke car dakle player jodi expressway/bridge er upor thake, car deck er upor boshe (ager moto neecher mati te boshto na).
4. src/ui/SuprimHUD.ts : hint text theke Shift shoriye deya hoyeche.
5. scripts/suprim-test.ts : notun check (Shift chhara speed, level body). Test: ALL PASSED. tsc + vite build OK.
