# Computer Science & Electronics Park (eng-tech-park)

Code: src/engineering/electrical/tech-park/   Narration: src/i18n/voice/techpark.en.ts   Tour: 16 stops (press Y near the park). Minimap mark: purple "E".

## What students see (all live, all in English)
- CPU & Logic Hall: AND / OR / XOR / NOT gates running through every input with a live truth table; a 4-bit binary adder with carry lamps; a tiny 8-bit CPU running a real Fibonacci program through FETCH - DECODE - EXECUTE (glowing buses, registers in decimal and binary, ALU, output).
- Algorithms Hall: Bubble, Insertion, Merge and Quick sort racing on shuffled lists (comparison and swap counters); linear search vs binary search (steps counted).
- Electronics & Telecom Lab: RC circuit (capacitor charge/discharge curve, LED), fibre optic (total internal reflection + bits as light), radio link (waves from an antenna to a phone).
- Network Hall: DNS lookup, TCP handshake, HTTP request, response in numbered packets that are reassembled.
- Data Centre: server racks with blinking LEDs, cold/hot aisles with airflow, cooling-unit fans, fibre trays, UPS + batteries.
- AI Lab: a perceptron that really learns to separate two groups of points (the line moves, accuracy climbs), and a neural network with signals flowing forward.
- Cell tower with spreading radio waves.

## Technical notes
- cpuSim.ts, sorting.ts and perceptron.ts are plain TypeScript and were tested headless: the CPU prints 1,2,3,5,8,13...; all four sorts sort correctly; binary search needs 5 steps against 27 for linear search; the perceptron reaches 100 % accuracy.
- Pad 350 x 200 m in the flat north part of the zone, gate on the west side. A 7-minute soak test showed no invalid values.
- Test: scripts/techpark-test.ts (also in npm run test:infra).
