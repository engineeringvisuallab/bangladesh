#!/usr/bin/env python3
"""Integration test for the seam audit using synthetic, non-geographic sample elevations."""
from __future__ import annotations
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from world_grid import GRID_VERSION, TILE_SIZE_METERS, tile_address_at_grid, tile_bounds

TOOLS = Path(__file__).resolve().parent
AUDITOR = TOOLS / "audit_tile_seams.py"
SEGMENTS = 8


def make_tile(row: int, col: int) -> dict:
    address = tile_address_at_grid(row, col)
    heights = []
    mask = []
    width = SEGMENTS + 1
    for j in range(width):
        for i in range(width):
            global_x = col * SEGMENTS + i
            global_y = row * SEGMENTS + (SEGMENTS - j)
            heights.append(round(3.0 + global_x * 0.35 + global_y * 0.7 + ((global_x * global_y) % 7) * 0.1, 3))
            mask.append(False)
    return {
        "schemaVersion": GRID_VERSION,
        "tile": {**address, "bounds": {k: round(v, 8) for k, v in tile_bounds(address).items()}},
        "terrain": {"segments": SEGMENTS, "heights": heights, "nodataMask": mask, "nodataSamples": 0, "sampleCount": len(heights), "source": "synthetic test-only"},
        "osm": {"elements": [], "source": "synthetic test-only"},
    }


def run_audit(path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(AUDITOR), "--tiles", str(path), "--report", str(path / "report.json")], text=True, capture_output=True, check=False)


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="bdow-stage5-test-") as tmp:
        folder = Path(tmp)
        for row in (100, 101):
            for col in (100, 101):
                tile = make_tile(row, col)
                (folder / f"{tile['tile']['key']}.json").write_text(json.dumps(tile), encoding="utf-8")
        passed = run_audit(folder)
        assert passed.returncode == 0, f"Synthetic neighbor seams should pass:\n{passed.stdout}\n{passed.stderr}"
        report = json.loads((folder / "report.json").read_text(encoding="utf-8"))
        assert report["neighborPairsCompared"] == 4, report
        assert report["maxAbsElevationDifferenceM"] == 0, report

        # Deliberately damage one edge: the tool must detect the non-continuity.
        right_path = folder / "r100_c101.json"
        right = json.loads(right_path.read_text(encoding="utf-8"))
        for j in range(SEGMENTS + 1):
            right["terrain"]["heights"][j * (SEGMENTS + 1)] += 12
        right_path.write_text(json.dumps(right), encoding="utf-8")
        failed = run_audit(folder)
        assert failed.returncode == 2, f"Damaged seam should fail, got {failed.returncode}:\n{failed.stdout}\n{failed.stderr}"
        report = json.loads((folder / "report.json").read_text(encoding="utf-8"))
        assert report["edgePairsFailed"] >= 1, report

    print("PASS: synthetic adjacent tiles align; a 12 m edge defect is detected by the seam auditor.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
