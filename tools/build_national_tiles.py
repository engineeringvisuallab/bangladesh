#!/usr/bin/env python3
"""Build nationwide static 3 km Bangladesh Open World tiles from local OSM PBF + DEM GeoTIFF.

Requires: pyosmium, rasterio, numpy. OSM way geometry is tiled to the same grid as src/main.js.
The script intentionally processes local files rather than repeatedly querying shared public APIs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from world_grid import (GRID_ORIGIN_LAT, GRID_ORIGIN_LON, GRID_REFERENCE_LAT, GRID_VERSION, TILE_SIZE_METERS, geo_at_local, tile_address, tile_address_at_grid, tile_bounds, tile_lat_step, tile_lon_step)

TILE_SIZE = TILE_SIZE_METERS
OSM_ATTRIBUTION = "© OpenStreetMap contributors, ODbL; https://www.openstreetmap.org/copyright"
DEM_ATTRIBUTION = "Copernicus DEM GLO-90; see the Copernicus Data Space DEM terms and attribution"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def approx_distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = a; lat2, lon2 = b
    mean_lat = math.radians((lat1 + lat2) / 2)
    dx = (lon2 - lon1) * 111320.0 * math.cos(mean_lat)
    dz = (lat2 - lat1) * 111320.0
    return math.hypot(dx, dz)


def parse_poly(path: Path) -> list[dict]:
    """Read the simple .poly polygon format used by Geofabrik: lon lat coordinate rings."""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    if len(lines) < 4:
        raise ValueError(f"Boundary .poly file is unexpectedly short: {path}")
    rings: list[dict] = []
    current_label: str | None = None
    current: list[tuple[float, float]] = []
    for raw in lines[1:]:
        line = raw.strip()
        if not line:
            continue
        if line.upper() == "END":
            if current_label is not None:
                if len(current) >= 4:
                    rings.append({"hole": current_label.startswith("!"), "points": current})
                current_label, current = None, []
            else:
                break
            continue
        bits = line.split()
        if len(bits) == 1:
            # Ring label such as "1" or "!2".
            if current_label is not None and current:
                rings.append({"hole": current_label.startswith("!"), "points": current})
            current_label, current = bits[0], []
            continue
        try:
            lon, lat = float(bits[0]), float(bits[1])
        except (ValueError, IndexError):
            continue
        current.append((lat, lon))
    if current_label is not None and len(current) >= 4:
        rings.append({"hole": current_label.startswith("!"), "points": current})
    if not any(not r["hole"] for r in rings):
        raise ValueError("No outer polygon ring found in .poly boundary file.")
    return rings


def point_in_ring(lat: float, lon: float, ring: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i]  # latitude, longitude
        yj, xj = ring[j]
        crosses = ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-30) + xi)
        if crosses:
            inside = not inside
        j = i
    return inside


def point_in_country(lat: float, lon: float, rings: list[dict]) -> bool:
    in_outer = any(point_in_ring(lat, lon, r["points"]) for r in rings if not r["hole"])
    if not in_outer:
        return False
    return not any(point_in_ring(lat, lon, r["points"]) for r in rings if r["hole"])


def all_ring_points(rings: list[dict]) -> list[tuple[float, float]]:
    return [point for ring in rings for point in ring["points"]]


def make_candidate_grid(rings: list[dict], tile_size: float = TILE_SIZE) -> dict[str, dict]:
    points = all_ring_points(rings)
    south = min(p[0] for p in points); north = max(p[0] for p in points)
    west = min(p[1] for p in points); east = max(p[1] for p in points)
    lat_step = tile_lat_step(tile_size)
    row_start = math.floor((south - GRID_ORIGIN_LAT) / lat_step) - 1
    row_end = math.floor((north - GRID_ORIGIN_LAT) / lat_step) + 1
    candidates: dict[str, dict] = {}
    lon_step = tile_lon_step(tile_size)
    for row in range(row_start, row_end + 1):
        col_start = math.floor((west - GRID_ORIGIN_LON) / lon_step) - 1
        col_end = math.floor((east - GRID_ORIGIN_LON) / lon_step) + 1
        for col in range(col_start, col_end + 1):
            address = tile_address_at_grid(row, col, tile_size)
            bounds = tile_bounds(address, tile_size)
            # Reject tiles whose rectangle cannot touch the poly's bounding rectangle.
            if bounds["north"] < south or bounds["south"] > north or bounds["east"] < west or bounds["west"] > east:
                continue
            address["bounds"] = bounds
            candidates[address["key"]] = address
    return candidates


def boundary_tile_keys(rings: list[dict], candidates: dict[str, dict], tile_size: float = TILE_SIZE) -> set[str]:
    """Sample polygon boundaries every 500m so narrow coastal/island edge tiles are retained."""
    result: set[str] = set()
    for ring in rings:
        pts = ring["points"]
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            length = approx_distance_m(a, b)
            steps = max(1, math.ceil(length / 500.0))
            for j in range(steps + 1):
                f = j / steps
                lat = a[0] + (b[0] - a[0]) * f
                lon = a[1] + (b[1] - a[1]) * f
                key = tile_address(lat, lon, tile_size)["key"]
                if key in candidates:
                    result.add(key)
    return result


def scanline_intersections(latitude: float, ring: list[tuple[float, float]]) -> list[float]:
    """Return longitude crossings for a horizontal latitude scan across one polygon ring."""
    xs: list[float] = []
    for i in range(len(ring) - 1):
        lat1, lon1 = ring[i]
        lat2, lon2 = ring[i + 1]
        if (lat1 > latitude) != (lat2 > latitude):
            xs.append(lon1 + (latitude - lat1) * (lon2 - lon1) / (lat2 - lat1))
    xs.sort()
    return xs



def candidate_addresses_in_bbox(south: float, west: float, north: float, east: float,
                                candidates: dict[str, dict], tile_size: float = TILE_SIZE) -> Iterable[dict]:
    """Iterate only candidate tiles near a geographic bbox; used for big water polygons."""
    lat_step = tile_lat_step(tile_size)
    row_start = math.floor((south - GRID_ORIGIN_LAT) / lat_step) - 1
    row_end = math.floor((north - GRID_ORIGIN_LAT) / lat_step) + 1
    lon_step = tile_lon_step(tile_size)
    for row in range(row_start, row_end + 1):
        col_start = math.floor((west - GRID_ORIGIN_LON) / lon_step) - 1
        col_end = math.floor((east - GRID_ORIGIN_LON) / lon_step) + 1
        for col in range(col_start, col_end + 1):
            item = candidates.get(f"r{row}_c{col}")
            if item:
                b = item["bounds"]
                if b["north"] >= south and b["south"] <= north and b["east"] >= west and b["west"] <= east:
                    yield item


def select_country_tiles(rings: list[dict], candidates: dict[str, dict], tile_size: float = TILE_SIZE) -> dict[str, dict]:
    """Use row-wise scanline fill plus sampled boundary cells to select country grid tiles."""
    selected: dict[str, dict] = {}
    boundary = boundary_tile_keys(rings, candidates, tile_size)
    # Calculate polygon longitude intervals only once per row, rather than ray-casting every
    # tile corner against every boundary vertex (which is prohibitively slow for a national grid).
    rows: dict[int, list[dict]] = {}
    for address in candidates.values():
        rows.setdefault(address["row"], []).append(address)
    outer_rings = [r["points"] for r in rings if not r["hole"]]
    hole_rings = [r["points"] for r in rings if r["hole"]]
    for row, addresses in rows.items():
        lat = addresses[0]["origin"]["lat"]
        outer_crossings = [scanline_intersections(lat, ring) for ring in outer_rings]
        hole_crossings = [scanline_intersections(lat, ring) for ring in hole_rings]
        for address in addresses:
            lon = address["origin"]["lon"]
            inside_outer = any(any(xs[i] <= lon < xs[i + 1] for i in range(0, len(xs) - 1, 2)) for xs in outer_crossings)
            in_hole = any(any(xs[i] <= lon < xs[i + 1] for i in range(0, len(xs) - 1, 2)) for xs in hole_crossings)
            if inside_outer and not in_hole or address["key"] in boundary:
                selected[address["key"]] = address
    return selected


def sampled_line_keys(coords: list[tuple[float, float]], candidates: dict[str, dict], tile_size: float = TILE_SIZE) -> set[str]:
    keys: set[str] = set()
    for i in range(len(coords) - 1):
        a, b = coords[i], coords[i + 1]
        distance = approx_distance_m(a, b)
        steps = max(1, math.ceil(distance / 600.0))
        for j in range(steps + 1):
            f = j / steps
            lat = a[0] + (b[0] - a[0]) * f
            lon = a[1] + (b[1] - a[1]) * f
            key = tile_address(lat, lon, tile_size)["key"]
            if key in candidates:
                keys.add(key)
    if len(coords) == 1:
        key = tile_address(coords[0][0], coords[0][1], tile_size)["key"]
        if key in candidates:
            keys.add(key)
    return keys


def polygon_keys(coords: list[tuple[float, float]], candidates: dict[str, dict], tile_size: float = TILE_SIZE) -> set[str]:
    """Assign closed polygons to boundary cells and the cells whose centers lie inside them."""
    keys = sampled_line_keys(coords, candidates, tile_size)
    lats = [p[0] for p in coords]; lons = [p[1] for p in coords]
    south, north, west, east = min(lats), max(lats), min(lons), max(lons)
    for address in candidate_addresses_in_bbox(south, west, north, east, candidates, tile_size):
        lat, lon = address["origin"]["lat"], address["origin"]["lon"]
        if point_in_ring(lat, lon, coords):
            keys.add(address["key"])
    return keys


def bounds_filter(coords: list[tuple[float, float]], bounds: tuple[float, float, float, float]) -> bool:
    south, west, north, east = bounds
    return any(south <= lat <= north and west <= lon <= east for lat, lon in coords)


def feature_render_priority(element: dict) -> tuple:
    """Stable ordering so viewer-side per-class limits preserve major mapped features first."""
    tags = element.get("tags", {})
    if tags.get("highway"):
        road_rank = {"motorway": 0, "motorway_link": 1, "trunk": 2, "trunk_link": 3,
                     "primary": 4, "primary_link": 5, "secondary": 6, "secondary_link": 7,
                     "tertiary": 8, "tertiary_link": 9, "unclassified": 10, "residential": 11}
        return (0, road_rank.get(tags.get("highway"), 12), int(element.get("id", 0)))
    if tags.get("railway"):
        return (1, 0, int(element.get("id", 0)))
    if tags.get("waterway"):
        return (2, 0, int(element.get("id", 0)))
    if tags.get("natural") == "water":
        return (3, 0, int(element.get("id", 0)))
    if tags.get("building"):
        # Keep buildings with reported height/levels earlier when viewer caps are reached.
        levels_raw = str(tags.get("building:levels", "0") or "0").strip()
        levels = float(levels_raw) if levels_raw.replace(".", "", 1).isdigit() else 0.0
        height_raw = str(tags.get("height", "0") or "0").replace("m", "").strip()
        height = float(height_raw) if height_raw.replace(".", "", 1).isdigit() else 0.0
        return (4, -(height or levels), int(element.get("id", 0)))
    return (9, 0, int(element.get("id", 0)))


def parse_bounds(value: str) -> tuple[float, float, float, float]:
    try:
        vals = tuple(float(x.strip()) for x in value.split(","))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Bounds must be south,west,north,east") from exc
    if len(vals) != 4 or not (-90 <= vals[0] < vals[2] <= 90 and -180 <= vals[1] < vals[3] <= 180):
        raise argparse.ArgumentTypeError("Bounds must be south,west,north,east with valid geographic values")
    return vals


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Bangladesh static world tiles from a national OSM PBF and a DEM GeoTIFF mosaic.")
    parser.add_argument("--osm-pbf", required=True, type=Path, help="Geofabrik Bangladesh .osm.pbf extract")
    parser.add_argument("--country-poly", type=Path, help="Geofabrik .poly boundary file (defaults to sibling bangladesh.poly)")
    parser.add_argument("--dem", required=True, type=Path, help="Merged DEM GeoTIFF for Bangladesh (GLO-90 recommended for a first national build)")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "national-tiles-v2", help="Output grid-v2 tile folder, separate from legacy grid-v1 outputs")
    parser.add_argument("--work-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "national-build-v2", help="Temporary grid-v2 SQLite work folder")
    parser.add_argument("--segments", type=int, default=32, help="Terrain samples per side minus one; 32 yields 33 x 33 heights per tile")
    parser.add_argument("--tile-size", type=int, default=3000, help="Must remain 3000 to match this game engine")
    parser.add_argument("--max-tiles", type=int, default=0, help="Optional pilot limit; 0 means all Bangladesh tiles")
    parser.add_argument("--dry-run", action="store_true", help="Only report candidate tile count; don't process PBF/DEM")
    parser.add_argument("--resume-features", action="store_true", help="Reuse a previously populated tile_features.sqlite; use only if the source PBF did not change")
    args = parser.parse_args()

    if args.tile_size != int(TILE_SIZE):
        parser.error("--tile-size must be 3000 because browser and builder tile grids must match.")
    if not 8 <= args.segments <= 64:
        parser.error("--segments must be from 8 to 64 for manageable national data volume.")
    if not args.osm_pbf.is_file():
        parser.error(f"OSM PBF not found: {args.osm_pbf}")
    country_poly = args.country_poly or args.osm_pbf.with_name("bangladesh.poly")
    if not country_poly.is_file():
        parser.error(f"Boundary .poly not found: {country_poly}. Download it from Geofabrik beside the PBF.")

    rings = parse_poly(country_poly)
    candidates = make_candidate_grid(rings, TILE_SIZE)
    tiles = select_country_tiles(rings, candidates, TILE_SIZE)
    print(f"Boundary: {country_poly.name}; retained world tiles: {len(tiles):,}")
    print(f"Terrain samples (if complete): {len(tiles) * (args.segments + 1) ** 2:,}")
    if args.max_tiles:
        if args.max_tiles < 1:
            parser.error("--max-tiles must be positive")
        # Pilot output is deliberately deterministic: closest-to-Dhaka tiles first.
        dhaka = (23.8103, 90.4125)
        ordered = sorted(tiles.values(), key=lambda a: approx_distance_m(dhaka, (a["origin"]["lat"], a["origin"]["lon"])))
        tiles = {t["key"]: t for t in ordered[:args.max_tiles]}
        print(f"PILOT MODE: limited to {len(tiles):,} tile(s) nearest Dhaka; this is not a nationwide output.")
    if args.dry_run:
        print("Dry run complete; no source data has been processed or tile files created.")
        return 0
    if not args.dem.is_file():
        parser.error(f"DEM GeoTIFF not found: {args.dem}")

    try:
        import numpy as np
        import osmium
        import rasterio
        from rasterio.warp import transform as transform_coords
        from rasterio.transform import rowcol
    except ImportError as exc:
        print("Missing dependencies. Run: python -m pip install -r tools/requirements-stage3.txt", file=sys.stderr)
        print(f"Details: {exc}", file=sys.stderr)
        return 2

    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.work_dir.mkdir(parents=True, exist_ok=True)
    db_path = args.work_dir / "tile_features.sqlite"
    if args.resume_features and not db_path.is_file():
        parser.error(f"--resume-features was set but database does not exist: {db_path}")
    db = sqlite3.connect(str(db_path))
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=NORMAL")
    db.execute("PRAGMA temp_store=FILE")
    db.execute("CREATE TABLE IF NOT EXISTS tile_features (tile_key TEXT NOT NULL, osm_id INTEGER NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(tile_key, osm_id))")
    db.execute("CREATE INDEX IF NOT EXISTS idx_tile_features_key ON tile_features(tile_key)")
    db.execute("CREATE TABLE IF NOT EXISTS build_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    selected_keys = set(tiles)
    tile_signature = hashlib.sha256((f"grid-v{GRID_VERSION}|ref-lat={GRID_REFERENCE_LAT}|tile={TILE_SIZE}\n" + "\n".join(sorted(selected_keys))).encode("utf-8")).hexdigest()
    pbf_signature = f"{args.osm_pbf.resolve()}|{args.osm_pbf.stat().st_size}|{args.osm_pbf.stat().st_mtime_ns}"
    poly_signature = f"{country_poly.resolve()}|{country_poly.stat().st_size}|{country_poly.stat().st_mtime_ns}"

    if args.resume_features:
        meta = dict(db.execute("SELECT key, value FROM build_meta"))
        if meta.get("status") != "complete":
            parser.error("No completed feature pass is available to resume. Run without --resume-features first.")
        if meta.get("pbf_signature") != pbf_signature or meta.get("poly_signature") != poly_signature:
            parser.error("The OSM PBF or boundary file changed since the feature database was built. Re-run without --resume-features.")
        if meta.get("tile_signature") != tile_signature:
            parser.error("The tile selection changed (for example pilot vs full-country). Re-run without --resume-features.")
    else:
        db.execute("DELETE FROM tile_features")
        db.execute("DELETE FROM build_meta")
        db.commit()
        node_index = args.work_dir / "node_locations.cache"
        if node_index.exists():
            try:
                node_index.unlink()
            except OSError:
                print(f"Could not remove old node-location cache {node_index}; the next PBF pass may fail. Close any other process using it.", file=sys.stderr)
        counters = {"ways_seen": 0, "ways_kept": 0, "tile_feature_rows": 0, "invalid_geometry": 0}

        class TileHandler(osmium.SimpleHandler):
            def __init__(self):
                super().__init__()
                self.pending: list[tuple[str, int, str, str]] = []

            def way(self, way):
                counters["ways_seen"] += 1
                tags = {t.k: t.v for t in way.tags}
                if "highway" in tags:
                    kind = "road"
                elif tags.get("railway") in {"rail", "light_rail", "subway", "narrow_gauge", "tram", "monorail"}:
                    kind = "railway"
                elif tags.get("waterway") in {"river", "canal", "stream", "drain", "ditch", "tidal_channel"}:
                    kind = "waterway"
                elif tags.get("natural") == "water" and len(way.nodes) >= 4:
                    kind = "water_area"
                elif "building" in tags and len(way.nodes) >= 4:
                    kind = "building"
                else:
                    return

                coords: list[tuple[float, float]] = []
                for node in way.nodes:
                    if not node.location.valid():
                        counters["invalid_geometry"] += 1
                        return
                    coords.append((float(node.location.lat), float(node.location.lon)))
                if len(coords) < 2:
                    return
                if kind in {"building", "water_area"} and (coords[0] != coords[-1]):
                    # Polygon way features must be closed to form valid footprints/areas.
                    return
                # Keep the public extract bounded to the Bangladesh outline's geographic envelope first.
                if not bounds_filter(coords, (20.0, 87.0, 27.0, 93.5)):
                    return
                if kind == "building":
                    # Store a footprint in each intersected tile, including edge-crossing
                    # footprints. The viewer clips its polygon before extrusion.
                    keys = polygon_keys(coords, tiles, TILE_SIZE) & selected_keys
                elif kind == "water_area":
                    keys = polygon_keys(coords, tiles, TILE_SIZE)
                    keys &= selected_keys
                else:
                    keys = sampled_line_keys(coords, tiles, TILE_SIZE) & selected_keys
                if not keys:
                    return
                # The game engine expects this OSM-like geometry shape.
                element = {
                    "type": "way", "id": int(way.id), "tags": tags,
                    "geometry": [{"lat": round(lat, 7), "lon": round(lon, 7)} for lat, lon in coords],
                }
                payload = json.dumps(element, ensure_ascii=False, separators=(",", ":"))
                for key in keys:
                    self.pending.append((key, int(way.id), kind, payload))
                counters["ways_kept"] += 1
                counters["tile_feature_rows"] += len(keys)
                if len(self.pending) >= 4000:
                    self.flush()

            def flush(self):
                if self.pending:
                    db.executemany("INSERT OR REPLACE INTO tile_features(tile_key,osm_id,kind,payload) VALUES(?,?,?,?)", self.pending)
                    db.commit()
                    self.pending.clear()

        print(f"Reading OSM PBF: {args.osm_pbf} (may require several GB RAM/disk for node locations)…")
        handler = TileHandler()
        node_index = args.work_dir / "node_locations.cache"
        idx_arg = f"sparse_file_array,{node_index}"
        try:
            handler.apply_file(str(args.osm_pbf), locations=True, idx=idx_arg)
        except Exception as exc:
            print(f"OSM PBF processing failed: {exc}", file=sys.stderr)
            print("Check that pyosmium is installed, the PBF is complete, and the work drive has free space.", file=sys.stderr)
            return 3
        handler.flush()
        db.executemany("INSERT OR REPLACE INTO build_meta(key,value) VALUES(?,?)", [
            ("status", "complete"), ("pbf_signature", pbf_signature),
            ("poly_signature", poly_signature), ("tile_signature", tile_signature),
            ("ways_seen", str(counters["ways_seen"])), ("ways_kept", str(counters["ways_kept"])),
        ])
        db.commit()
        print("OSM pass complete: " + ", ".join(f"{k}={v:,}" for k, v in counters.items()))

    if args.resume_features:
        print(f"Reusing cached tile-feature database: {db_path}")

    timestamp = utc_now()
    tile_manifest: list[dict] = []
    total_features = 0
    total_nodata = 0
    print(f"Sampling DEM and writing {len(tiles):,} tile JSON files…")
    try:
        with rasterio.open(args.dem) as dem:
            if dem.crs is None:
                raise RuntimeError("DEM has no CRS. Re-export it with a defined coordinate system before building.")
            dem_scale = float(dem.scales[0] if dem.scales and dem.scales[0] is not None else 1.0)
            dem_offset = float(dem.offsets[0] if dem.offsets and dem.offsets[0] is not None else 0.0)
            print(f"Reading DEM raster band to memory: {dem.width:,} × {dem.height:,} pixels ({dem.width * dem.height:,} total). Use GLO-90 for the nationwide starter build.")
            dem_array = dem.read(1, masked=True)
            probe_xs, probe_ys = transform_coords("EPSG:4326", dem.crs, [90.4125], [23.8103])
            probe_rows, probe_cols = rowcol(dem.transform, probe_xs, probe_ys)
            probe_r, probe_c = probe_rows[0], probe_cols[0]
            if probe_r < 0 or probe_c < 0 or probe_r >= dem_array.shape[0] or probe_c >= dem_array.shape[1] or np.ma.is_masked(dem_array[probe_r, probe_c]):
                raise RuntimeError("The DEM mosaic does not contain valid elevation data at central Dhaka. Check the mosaic coverage/CRS before building.")
            print(f"Dhaka DEM probe: {float(dem_array[probe_r, probe_c]):.2f} source units; confirm vertical units are metres.")
            for ix, (key, address) in enumerate(sorted(tiles.items()), start=1):
                origin = address["origin"]
                coords_wgs84: list[tuple[float, float]] = []
                for j in range(args.segments + 1):
                    for i in range(args.segments + 1):
                        x = (i / args.segments - 0.5) * TILE_SIZE
                        z = (j / args.segments - 0.5) * TILE_SIZE
                        lat, lon = geo_at_local(origin, x, z)
                        coords_wgs84.append((lon, lat))
                lons = [p[0] for p in coords_wgs84]; lats = [p[1] for p in coords_wgs84]
                xs, ys = transform_coords("EPSG:4326", dem.crs, lons, lats)
                rows, cols = rowcol(dem.transform, xs, ys)
                heights: list[float] = []
                nodata_mask: list[bool] = []
                nodata_count = 0
                for rr, cc in zip(rows, cols):
                    if rr < 0 or cc < 0 or rr >= dem_array.shape[0] or cc >= dem_array.shape[1]:
                        heights.append(0.0); nodata_mask.append(True); nodata_count += 1
                        continue
                    value = dem_array[rr, cc]
                    if np.ma.is_masked(value) or value is None:
                        heights.append(0.0); nodata_mask.append(True); nodata_count += 1
                        continue
                    raw_value = float(value)
                    h = raw_value * dem_scale + dem_offset
                    if not math.isfinite(h) or (dem.nodata is not None and math.isclose(raw_value, float(dem.nodata))):
                        heights.append(0.0); nodata_mask.append(True); nodata_count += 1
                    else:
                        # Copernicus elevation is metres; do not synthesize relief or add random noise.
                        heights.append(round(h, 2)); nodata_mask.append(False)
                rows = db.execute("SELECT payload, kind FROM tile_features WHERE tile_key=? ORDER BY osm_id", (key,)).fetchall()
                elements = [json.loads(row[0]) for row in rows]
                elements.sort(key=feature_render_priority)
                kind_counts: dict[str, int] = {}
                for _, kind in rows:
                    kind_counts[kind] = kind_counts.get(kind, 0) + 1
                total_features += len(elements)
                total_nodata += nodata_count
                tile_bounds_data = {k: round(v, 8) for k, v in address["bounds"].items()}
                payload = {
                    "schemaVersion": GRID_VERSION,
                    "tile": {k: address[k] for k in ("key", "row", "col", "origin", "sizeMeters", "gridVersion")} | {"bounds": tile_bounds_data, "generatedAt": timestamp},
                    "terrain": {
                        "segments": args.segments, "heights": heights, "nodataMask": nodata_mask,
                        "source": f"Copernicus DEM GLO-90 local GeoTIFF mosaic; nodata samples filled with 0 (tile nodata samples: {nodata_count})",
                        "nodataSamples": nodata_count,
                        "sampleCount": len(heights),
                        "batches": 0,
                    },
                    "osm": {
                        "elements": elements,
                        "source": "OpenStreetMap Bangladesh Geofabrik PBF extract",
                        "featureCounts": kind_counts,
                        "retrievedAt": timestamp,
                    },
                    "provenance": {
                        "osm": OSM_ATTRIBUTION,
                        "elevation": DEM_ATTRIBUTION,
                        "builder": "Bangladesh Open World Stage 5 national offline tile compiler",
                        "grid": f"schema v{GRID_VERSION}; fixed-reference equirectangular grid at {GRID_REFERENCE_LAT}° N",
                        "note": "3 km grid tiles; OSM way features only. Unknown building heights are estimated. Rebuild schema v1 tiles and run seam audit before publishing.",
                    },
                }
                out_file = args.output_dir / f"{key}.json"
                tmp_file = out_file.with_suffix(".json.tmp")
                with tmp_file.open("w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
                os.replace(tmp_file, out_file)
                tile_manifest.append({"key": key, "file": out_file.name, "bytes": out_file.stat().st_size, "featureCount": len(elements), "featureCounts": kind_counts, "nodataSamples": nodata_count})
                if ix % 100 == 0 or ix == len(tiles):
                    print(f"  {ix:,}/{len(tiles):,} tiles written; current file {out_file.name}")
    except Exception as exc:
        print(f"DEM sampling/tile output failed: {exc}", file=sys.stderr)
        print("Verify the GeoTIFF mosaic and available disk space.", file=sys.stderr)
        return 4

    manifest = {
        "schemaVersion": GRID_VERSION,
        "gridVersion": GRID_VERSION,
        "dataset": "Bangladesh Open World nationwide tiles",
        "generatedAt": timestamp,
        "tileSizeMeters": int(TILE_SIZE),
        "grid": {"originLatitude": GRID_ORIGIN_LAT, "originLongitude": GRID_ORIGIN_LON, "referenceLatitude": GRID_REFERENCE_LAT, "projection": "fixed-reference equirectangular", "gridVersion": GRID_VERSION, "tileSizeMeters": int(TILE_SIZE)},
        "tileCount": len(tile_manifest),
        "totalFeatureCopies": total_features,
        "totalNodataSamples": total_nodata,
        "sources": {"osm": OSM_ATTRIBUTION, "elevation": DEM_ATTRIBUTION},
        "note": "Schema v2 uses a fixed-reference coordinate grid so neighboring tile edges align. Upload tiles and manifest to a static object host/CDN; run tools/audit_tile_seams.py before publishing. Rebuild older schema v1 tiles.",
        "tiles": tile_manifest,
    }
    manifest_path = args.output_dir / "manifest.json"
    tmp_manifest = manifest_path.with_suffix(".json.tmp")
    tmp_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp_manifest, manifest_path)
    print("\nNATIONAL TILE BUILD COMPLETE")
    print(f"Tiles: {len(tile_manifest):,}")
    print(f"Tile feature copies: {total_features:,}")
    print(f"NoData DEM samples replaced with 0: {total_nodata:,}")
    height_sample_count = len(tile_manifest) * (args.segments + 1) ** 2
    if height_sample_count and total_nodata / height_sample_count > 0.05:
        print("WARNING: more than 5% of the terrain samples are no-data/outside the DEM. Review coverage before uploading the dataset.", file=sys.stderr)
    print(f"Manifest: {manifest_path}")
    print("Next: run tools/audit_tile_seams.py --tiles <output-dir> before publishing to object storage/CDN.")
    db.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Cancelled.", file=sys.stderr)
        raise SystemExit(130)
