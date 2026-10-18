#!/usr/bin/env python3
"""Audit terrain-edge continuity for schema-v2 Bangladesh Open World tiles.

Reads one tile at a time (with a small cache), compares shared height samples across every
resident east/west and north/south tile pair, skips samples marked as no-data, and writes JSON.
Exit codes: 0 = pass, 1 = invalid input/schema, 2 = edge discontinuity above fail threshold.
"""
from __future__ import annotations
import argparse
import json
import math
import re
import statistics
from collections import OrderedDict
from pathlib import Path
from typing import Any

from world_grid import GRID_VERSION, TILE_SIZE_METERS, tile_address_at_grid

KEY_RE = re.compile(r"^r(-?\d+)_c(-?\d+)\.json$")


class TileStore:
    def __init__(self, directory: Path, cache_size: int = 8):
        self.directory = directory
        self.cache_size = cache_size
        self.cache: OrderedDict[str, dict[str, Any]] = OrderedDict()

    def load(self, key: str) -> dict[str, Any]:
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        path = self.directory / f"{key}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        if len(self.cache) >= self.cache_size:
            self.cache.popitem(last=False)
        self.cache[key] = data
        return data


def schema_errors(path: Path, data: dict[str, Any]) -> list[str]:
    errors = []
    tile = data.get("tile") or {}
    terrain = data.get("terrain") or {}
    if data.get("schemaVersion") != GRID_VERSION:
        errors.append(f"schemaVersion must be {GRID_VERSION}; rebuild this old tile")
    if tile.get("gridVersion") != GRID_VERSION:
        errors.append(f"tile.gridVersion must be {GRID_VERSION}; rebuild this old tile")
    match = KEY_RE.match(path.name)
    if not match or tile.get("key") != path.stem:
        errors.append("filename/tile.key must be r<row>_c<col>.json")
        return errors
    row, col = int(match.group(1)), int(match.group(2))
    if tile.get("row") != row or tile.get("col") != col:
        errors.append("tile.row/col do not match file name")
    expected = tile_address_at_grid(row, col)
    origin = tile.get("origin") or {}
    for axis in ("lat", "lon"):
        value = origin.get(axis)
        if not isinstance(value, (int, float)) or abs(value - expected["origin"][axis]) > 1e-6:
            errors.append(f"tile.origin.{axis} is not aligned to grid v{GRID_VERSION}")
            break
    if tile.get("sizeMeters") != TILE_SIZE_METERS:
        errors.append(f"tile.sizeMeters must be {int(TILE_SIZE_METERS)}")
    segments = terrain.get("segments")
    heights = terrain.get("heights")
    mask = terrain.get("nodataMask")
    if not isinstance(segments, int) or segments < 1:
        errors.append("terrain.segments must be a positive integer")
        return errors
    expected_count = (segments + 1) ** 2
    if not isinstance(heights, list) or len(heights) != expected_count:
        errors.append(f"terrain.heights must contain {expected_count} samples")
    elif any(not isinstance(h, (int, float)) or not math.isfinite(h) for h in heights):
        errors.append("terrain.heights contains non-finite/non-numeric values")
    if not isinstance(mask, list) or len(mask) != expected_count or any(not isinstance(v, bool) for v in mask):
        errors.append(f"terrain.nodataMask must contain {expected_count} boolean values")
    return errors


def edge_samples(data: dict[str, Any], side: str) -> tuple[list[float], list[bool]]:
    terrain = data["terrain"]
    s = terrain["segments"]
    width = s + 1
    heights = terrain["heights"]
    mask = terrain["nodataMask"]
    if side == "west":
        ids = [j * width for j in range(width)]
    elif side == "east":
        ids = [j * width + s for j in range(width)]
    elif side == "north":
        ids = list(range(width))  # j=0 is the geographic north edge
    elif side == "south":
        ids = list(range(s * width, (s + 1) * width))
    else:
        raise ValueError(side)
    return [float(heights[i]) for i in ids], [bool(mask[i]) for i in ids]


def compare_edges(a: dict[str, Any], side_a: str, b: dict[str, Any], side_b: str, warn_m: float) -> dict[str, Any]:
    ah, am = edge_samples(a, side_a)
    bh, bm = edge_samples(b, side_b)
    if len(ah) != len(bh):
        return {"samplesCompared": 0, "skippedNoData": 0, "maxAbsDifferenceM": None, "meanAbsDifferenceM": None, "p95AbsDifferenceM": None, "status": "incompatible-resolution"}
    diffs = [abs(x - y) for x, y, xbad, ybad in zip(ah, bh, am, bm) if not xbad and not ybad]
    skipped = len(ah) - len(diffs)
    if not diffs:
        return {"samplesCompared": 0, "skippedNoData": skipped, "maxAbsDifferenceM": None, "meanAbsDifferenceM": None, "p95AbsDifferenceM": None, "status": "all-edge-samples-no-data"}
    sorted_diffs = sorted(diffs)
    p95 = sorted_diffs[min(len(sorted_diffs) - 1, math.ceil(0.95 * len(sorted_diffs)) - 1)]
    maximum = max(diffs)
    return {
        "samplesCompared": len(diffs),
        "skippedNoData": skipped,
        "maxAbsDifferenceM": round(maximum, 4),
        "meanAbsDifferenceM": round(statistics.fmean(diffs), 4),
        "p95AbsDifferenceM": round(p95, 4),
        "status": "warn" if maximum > warn_m else "pass",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare shared elevation edges in neighboring Stage 5 world tiles.")
    parser.add_argument("--tiles", type=Path, required=True, help="Folder of r<row>_c<col>.json tile files")
    parser.add_argument("--report", type=Path, help="Report JSON path (default: <tiles>/seam-report.json)")
    parser.add_argument("--warn-meters", type=float, default=1.0, help="Warn if shared edge elevations differ by more than this (default 1 m)")
    parser.add_argument("--fail-meters", type=float, default=5.0, help="Fail if a shared edge differs by more than this (default 5 m)")
    args = parser.parse_args()
    if not args.tiles.is_dir():
        parser.error(f"Tile directory not found: {args.tiles}")
    if args.warn_meters < 0 or args.fail_meters <= args.warn_meters:
        parser.error("Require 0 <= --warn-meters < --fail-meters")

    paths = sorted(p for p in args.tiles.glob("r*_c*.json") if KEY_RE.match(p.name))
    if not paths:
        print(f"No world tile files found in {args.tiles}")
        return 1

    # First pass: validate every tile and build a tiny grid index without keeping terrain arrays in RAM.
    index: dict[tuple[int, int], str] = {}
    errors: list[dict[str, Any]] = []
    for path in paths:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            found = schema_errors(path, data)
            if found:
                errors.append({"file": path.name, "errors": found})
                continue
            row, col = int(data["tile"]["row"]), int(data["tile"]["col"])
            cell = (row, col)
            if cell in index:
                errors.append({"file": path.name, "errors": [f"duplicate row/col also found in {index[cell]}"]})
                continue
            index[cell] = path.stem
        except Exception as exc:
            errors.append({"file": path.name, "errors": [str(exc)]})
    if errors:
        print(f"Tile schema/grid errors: {len(errors)}. Fix/rebuild these before seam checking.")
        for error in errors[:20]:
            print(f" - {error['file']}: {'; '.join(error['errors'])}")
        report = {"schemaVersion": GRID_VERSION, "tilesDirectory": str(args.tiles), "tilesSeen": len(paths), "validTiles": len(index), "schemaErrors": errors}
        report_path = args.report or (args.tiles / "seam-report.json")
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        return 1

    store = TileStore(args.tiles)
    edge_reports: list[dict[str, Any]] = []
    pair_count = 0
    failures = 0
    warnings = 0
    for (row, col), key in sorted(index.items()):
        data = store.load(key)
        # Compare only east and north to avoid duplicate pair reports.
        for neighbor_cell, a_side, b_side, label in (
            ((row, col + 1), "east", "west", "east-west"),
            ((row + 1, col), "north", "south", "north-south"),
        ):
            neighbor_key = index.get(neighbor_cell)
            if not neighbor_key:
                continue
            neighbor = store.load(neighbor_key)
            result = compare_edges(data, a_side, neighbor, b_side, args.warn_meters)
            pair_count += 1
            if result["status"] == "warn":
                warnings += 1
            if result["status"] == "incompatible-resolution" or (result["maxAbsDifferenceM"] is not None and result["maxAbsDifferenceM"] > args.fail_meters):
                failures += 1
                result["status"] = "fail"
            result.update({"tileA": key, "tileB": neighbor_key, "orientation": label})
            edge_reports.append(result)

    compared = [item for item in edge_reports if isinstance(item.get("maxAbsDifferenceM"), (int, float))]
    max_diff = max((item["maxAbsDifferenceM"] for item in compared), default=None)
    report = {
        "schemaVersion": GRID_VERSION,
        "grid": {"projection": "fixed-reference equirectangular", "referenceLatitude": 23.5, "tileSizeMeters": int(TILE_SIZE_METERS)},
        "tilesDirectory": str(args.tiles),
        "tilesSeen": len(paths),
        "validTiles": len(index),
        "neighborPairsCompared": pair_count,
        "edgePairsWithWarnings": warnings,
        "edgePairsFailed": failures,
        "maxAbsElevationDifferenceM": max_diff,
        "warnThresholdM": args.warn_meters,
        "failThresholdM": args.fail_meters,
        "edges": edge_reports,
        "note": "No-data samples are excluded. This checks only shared terrain heights, not roads/buildings/visual artifacts. Unbuilt boundary-neighbor tiles are not automatically an error.",
    }
    report_path = args.report or (args.tiles / "seam-report.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Tiles validated: {len(index):,}")
    print(f"Neighbor edges compared: {pair_count:,}")
    print(f"Warnings (> {args.warn_meters:g} m): {warnings:,}; failures (> {args.fail_meters:g} m): {failures:,}")
    print(f"Maximum shared-edge elevation difference: {max_diff if max_diff is not None else 'N/A'} m")
    print(f"Report: {report_path}")
    if pair_count == 0:
        print("WARNING: no adjacent tile pairs were present; build at least two neighboring tiles to test seams.")
    return 2 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
