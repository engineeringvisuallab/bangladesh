# Automation & Robotics Plant (eng-automation)

Code: src/engineering/mechanical/automation/   Narration: src/i18n/voice/automation.en.ts   Tour: 13 stops (press Y near the plant). Minimap mark: cyan "A".

## What students see (everything is live)
- Sensor Lab: inductive sensor (detects the steel block, ignores the plastic one), through-beam photo-eye with a box counter, ultrasonic sensor with outgoing/returning sound rings and a distance readout.
- Production line: hopper -> conveyor (moving belt) -> photo-eye counter -> height beam -> pneumatic pusher that rejects tall boxes -> 3-joint robot arm (real inverse kinematics) that picks the good boxes and stacks them on a pallet -> AGV (spinning lidar, amber light) carries full pallets to a 6-place rack. The rack is emptied when full.
- PLC & Control Room: the PLC cabinet LEDs, a ladder-logic screen (rungs light up when true), a scan-cycle indicator and a SCADA map all show the SAME signals as the machines.
- Process Control Lab: a water tank with a real PID controller. Live chart (level vs target), P / I / D / output bars, a disturbance valve.
- All text (labels, signs, narration, tour titles) is English.

## Technical notes
- sim.ts is a plain-TypeScript simulation of the line (no 3D). The 3D parts only draw it, so what the screens show is what the machines do. It is stepped once per frame by the plant.
- solveIK() in sim.ts is the robot's inverse kinematics; it was checked against forward kinematics over 5 simulated minutes (error 0, always in reach).
- TankSim in parts/pid.ts is the PID tank; it settles within about 1 % of the target between changes.
- Pad 380 x 175 m in the flat north-centre of the area (two public roads east, hills north-west and south); the gate faces the east road.
- Tests: scripts/automation-test.ts (also added to npm run test:infra).
