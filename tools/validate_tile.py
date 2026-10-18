#!/usr/bin/env python3
"""Validate a prebuilt Bangladesh Open World tile JSON file."""
import argparse
import json
import math
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Validate a static world tile JSON file.")
    parser.add_argument("path", type=Path, help="Path to a tile JSON file")
    args = parser.parse_args()
    try:
        data = json.loads(args.path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SystemExit(f"Could not read valid JSON: {exc}")

    errors = []
    tile = data.get("tile", {})
    terrain = data.get("terrain", {})
    osm = data.get("osm", {})
    segments = terrain.get("segments")
    heights = terrain.get("heights")
    elements = osm.get("elements")
    if data.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    if not isinstance(tile.get("key"), str) or not tile["key"]:
        errors.append("tile.key is missing")
    if args.path.stem != tile.get("key"):
        errors.append("file name must match tile.key")
    if not isinstance(tile.get("origin"), dict) or not all(k in tile["origin"] for k in ("lat", "lon")):
        errors.append("tile.origin must contain lat and lon")
    if not isinstance(segments, int) or segments < 1:
        errors.append("terrain.segments must be a positive integer")
    elif not isinstance(heights, list) or len(heights) != (segments + 1) ** 2:
        errors.append("terrain.heights length must equal (segments + 1)^2")
    elif any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in heights):
        errors.append("terrain.heights must contain only finite numbers")
    if not isinstance(elements, list):
        errors.append("osm.elements must be a list")
    else:
        for idx, item in enumerate(elements):
            if not isinstance(item, dict) or not isinstance(item.get("geometry"), list):
                errors.append(f"osm.elements[{idx}] has no geometry list")
                break
            if any(not isinstance(p, dict) or "lat" not in p or "lon" not in p for p in item["geometry"]):
                errors.append(f"osm.elements[{idx}] has malformed coordinates")
                break
    if errors:
        print("Tile validation FAILED:")
        for error in errors:
            print(f" - {error}")
        raise SystemExit(1)
    print(f"Tile validation PASSED: {tile['key']}")
    print(f"Terrain: {segments + 1} × {segments + 1} samples")
    print(f"OSM mapped ways/features: {len(elements):,}")
    print(f"File size: {args.path.stat().st_size / 1024:,.1f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
