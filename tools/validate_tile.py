#!/usr/bin/env python3
"""Validate a Bangladesh Open World schema-v2 static tile."""
import argparse
import json
import math
from pathlib import Path
from world_grid import GRID_VERSION, TILE_SIZE_METERS, tile_address_at_grid


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate one Stage 5 world tile JSON file.")
    parser.add_argument("path", type=Path, help="Path to a tile JSON file")
    args = parser.parse_args()
    try:
        data = json.loads(args.path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SystemExit(f"Could not read valid JSON: {exc}")

    errors: list[str] = []
    warnings: list[str] = []
    tile = data.get("tile", {})
    terrain = data.get("terrain", {})
    osm = data.get("osm", {})
    segments = terrain.get("segments")
    heights = terrain.get("heights")
    mask = terrain.get("nodataMask")
    elements = osm.get("elements")

    if data.get("schemaVersion") != GRID_VERSION:
        errors.append(f"schemaVersion must be {GRID_VERSION}; older v1 tiles must be rebuilt")
    if tile.get("gridVersion") != GRID_VERSION:
        errors.append(f"tile.gridVersion must be {GRID_VERSION}; tile positions from the old grid will not align")
    if not isinstance(tile.get("key"), str) or not tile["key"]:
        errors.append("tile.key is missing")
    if args.path.stem != tile.get("key"):
        errors.append("file name must match tile.key")
    row, col = tile.get("row"), tile.get("col")
    if isinstance(row, int) and isinstance(col, int):
        expected = tile_address_at_grid(row, col)
        if tile.get("key") != expected["key"]:
            errors.append("tile.key does not match row/col")
        if not isinstance(tile.get("origin"), dict):
            errors.append("tile.origin must contain lat and lon")
        else:
            for axis in ("lat", "lon"):
                actual = tile["origin"].get(axis)
                expected_value = expected["origin"][axis]
                if not isinstance(actual, (int, float)) or abs(actual - expected_value) > 1e-6:
                    errors.append(f"tile.origin.{axis} does not match the Stage 5 grid")
                    break
    else:
        errors.append("tile.row and tile.col must be integers")
    if tile.get("sizeMeters") != TILE_SIZE_METERS:
        errors.append(f"tile.sizeMeters must be {int(TILE_SIZE_METERS)}")

    if not isinstance(segments, int) or segments < 1:
        errors.append("terrain.segments must be a positive integer")
    elif not isinstance(heights, list) or len(heights) != (segments + 1) ** 2:
        errors.append("terrain.heights length must equal (segments + 1)^2")
    elif any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in heights):
        errors.append("terrain.heights must contain only finite numbers")

    if not isinstance(mask, list) or (isinstance(segments, int) and len(mask) != len(heights or [])):
        errors.append("terrain.nodataMask must match the heights array length")
    elif any(not isinstance(v, bool) for v in mask):
        errors.append("terrain.nodataMask must contain boolean values")
    if isinstance(mask, list) and isinstance(terrain.get("nodataSamples"), int) and sum(mask) != terrain["nodataSamples"]:
        warnings.append("terrain.nodataSamples does not equal the nodataMask count")
    if isinstance(mask, list) and mask and sum(mask) / len(mask) > 0.05:
        warnings.append(f"{sum(mask):,}/{len(mask):,} elevation samples are marked no-data (>5%)")
    if not isinstance(elements, list):
        errors.append("osm.elements must be a list")
    else:
        for idx, item in enumerate(elements):
            if not isinstance(item, dict) or not isinstance(item.get("geometry"), list):
                errors.append(f"osm.elements[{idx}] has no geometry list")
                break
            if any(not isinstance(pt, dict) or not isinstance(pt.get("lat"), (int, float)) or not isinstance(pt.get("lon"), (int, float)) for pt in item["geometry"]):
                errors.append(f"osm.elements[{idx}] has malformed coordinates")
                break
    for warning in warnings:
        print(f"WARNING: {warning}")
    if errors:
        print("Tile validation FAILED:")
        for error in errors:
            print(f" - {error}")
        return 1
    print(f"Tile validation PASSED: {tile['key']} (grid v{GRID_VERSION})")
    print(f"Terrain: {segments + 1} × {segments + 1} samples; no-data: {sum(mask):,}")
    print(f"OSM mapped ways/features: {len(elements):,}")
    print(f"File size: {args.path.stat().st_size / 1024:,.1f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
