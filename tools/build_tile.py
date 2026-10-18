#!/usr/bin/env python3
"""Build one static Bangladesh Open World tile from real elevation + OpenStreetMap data.

This is a pilot tile builder. It runs on the user's PC, writes one self-contained JSON file,
and the browser will load that file before attempting any live API calls.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
TILE_SIZE_METERS = 3000
GRID_ORIGIN_LAT = 20.5
GRID_ORIGIN_LON = 88.0
ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
USER_AGENT = "BangladeshOpenWorldPrototype/0.2 (static tile data builder)"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def tile_address(lat: float, lon: float, tile_size: int = TILE_SIZE_METERS) -> dict:
    """Keep this arithmetic in sync with tileAddressFor() in src/main.js."""
    lat_step = tile_size / 111320.0
    row = math.floor((lat - GRID_ORIGIN_LAT) / lat_step)
    center_lat = GRID_ORIGIN_LAT + (row + 0.5) * lat_step
    cos_lat = math.cos(math.radians(center_lat))
    if abs(cos_lat) < 1e-6:
        raise ValueError("Latitude is too close to a pole for this local tile grid.")
    lon_step = tile_size / (111320.0 * cos_lat)
    col = math.floor((lon - GRID_ORIGIN_LON) / lon_step)
    center_lon = GRID_ORIGIN_LON + (col + 0.5) * lon_step
    return {
        "key": f"r{row}_c{col}",
        "row": row,
        "col": col,
        "origin": {"lat": round(center_lat, 8), "lon": round(center_lon, 8)},
        "sizeMeters": tile_size,
    }


def geo_at_local(origin: dict, x: float, z: float) -> tuple[float, float]:
    lat = origin["lat"] - z / 111320.0
    lon_scale = 111320.0 * math.cos(math.radians(origin["lat"]))
    lon = origin["lon"] + x / lon_scale
    return lat, lon


def http_json(url: str, *, data: bytes | None = None, content_type: str | None = None, timeout: int = 60):
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if content_type:
        headers["Content-Type"] = content_type
    req = Request(url, data=data, headers=headers, method="POST" if data is not None else "GET")
    with urlopen(req, timeout=timeout) as response:
        raw = response.read()
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Service returned invalid JSON for {url}") from exc


def retry_call(label, fn, attempts: int = 4):
    last_error = None
    for attempt in range(attempts):
        try:
            return fn()
        except (HTTPError, URLError, TimeoutError, RuntimeError) as exc:
            last_error = exc
            if attempt + 1 < attempts:
                delay = 1.5 * (2 ** attempt)
                print(f"{label}: {exc}; retrying in {delay:.1f}s ({attempt + 2}/{attempts})", file=sys.stderr)
                time.sleep(delay)
    raise RuntimeError(f"{label} failed after {attempts} attempts: {last_error}") from last_error


def fetch_elevations(origin: dict, segments: int) -> tuple[list[float], int]:
    grid_points: list[tuple[float, float]] = []
    for j in range(segments + 1):
        for i in range(segments + 1):
            x = (i / segments - 0.5) * TILE_SIZE_METERS
            z = (j / segments - 0.5) * TILE_SIZE_METERS
            grid_points.append(geo_at_local(origin, x, z))

    # Batch sizes intentionally stay below 100 coordinates per call for API compatibility.
    chunk_size = 90
    chunks = [grid_points[i:i + chunk_size] for i in range(0, len(grid_points), chunk_size)]
    heights: list[float] = []
    for index, chunk in enumerate(chunks, start=1):
        query = urlencode({
            "latitude": ",".join(f"{lat:.6f}" for lat, _ in chunk),
            "longitude": ",".join(f"{lon:.6f}" for _, lon in chunk),
        })
        url = f"{ELEVATION_URL}?{query}"
        result = retry_call(f"Elevation batch {index}/{len(chunks)}", lambda u=url: http_json(u))
        values = result.get("elevation")
        if not isinstance(values, list) or len(values) != len(chunk):
            raise RuntimeError(f"Elevation batch {index} returned an unexpected number of values.")
        for value in values:
            try:
                numeric = float(value)
                heights.append(numeric if math.isfinite(numeric) else 0.0)
            except (TypeError, ValueError):
                heights.append(0.0)
        print(f"Elevation: {index}/{len(chunks)} batches complete")
        time.sleep(0.15)
    return heights, len(chunks)


def fetch_osm(origin: dict) -> tuple[dict, str]:
    half = TILE_SIZE_METERS / 2
    south = origin["lat"] - half / 111320.0
    north = origin["lat"] + half / 111320.0
    lon_delta = half / (111320.0 * math.cos(math.radians(origin["lat"])))
    west = origin["lon"] - lon_delta
    east = origin["lon"] + lon_delta
    bbox = f"{south:.7f},{west:.7f},{north:.7f},{east:.7f}"
    # These per-class output caps protect shared Overpass infrastructure and the browser.
    query = (
        f"[out:json][timeout:30][maxsize:67108864];"
        f'way["highway"]({bbox});out geom 3500;'
        f'way["waterway"~"river|canal|stream|drain|ditch"]({bbox});out geom 500;'
        f'way["natural"="water"]({bbox});out geom 250;'
        f'way["building"]({bbox});out geom 4000;'
    )
    encoded = urlencode({"data": query}).encode("utf-8")
    last_error = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            result = retry_call(
                f"OpenStreetMap query ({endpoint})",
                lambda ep=endpoint: http_json(
                    ep,
                    data=encoded,
                    content_type="application/x-www-form-urlencoded; charset=UTF-8",
                    timeout=90,
                ),
                attempts=2,
            )
            elements = result.get("elements")
            if not isinstance(elements, list):
                raise RuntimeError("Overpass response did not include an elements array.")
            print(f"OpenStreetMap: received {len(elements)} mapped ways")
            return {"elements": elements, "source": "OpenStreetMap Overpass API", "bbox": bbox}, bbox
        except Exception as exc:  # try the alternate public endpoint
            last_error = exc
            print(f"Endpoint failed: {endpoint}: {exc}", file=sys.stderr)
    raise RuntimeError(f"All Overpass endpoints failed: {last_error}") from last_error


def main() -> int:
    parser = argparse.ArgumentParser(description="Prebuild a static 3 km Bangladesh Open World data tile.")
    parser.add_argument("--lat", type=float, required=True, help="Latitude of the desired place, e.g. 23.8103")
    parser.add_argument("--lon", type=float, required=True, help="Longitude of the desired place, e.g. 90.4125")
    parser.add_argument("--segments", type=int, default=32, help="Terrain mesh segments per side (default: 32, about 94 m spacing)")
    parser.add_argument("--output-dir", default=str(ROOT / "data" / "tiles"), help="Output directory (default: data/tiles)")
    parser.add_argument("--skip-osm", action="store_true", help="Only build terrain; OSM features will be empty")
    parser.add_argument("--skip-elevation", action="store_true", help="Only build OSM; terrain heights will be zero (not recommended)")
    args = parser.parse_args()

    if not (-90 <= args.lat <= 90 and -180 <= args.lon <= 180):
        parser.error("Latitude/longitude are out of range.")
    if not (8 <= args.segments <= 128):
        parser.error("--segments must be between 8 and 128 to avoid accidentally huge requests.")

    address = tile_address(args.lat, args.lon)
    origin = address["origin"]
    segments = args.segments
    print(f"Building {address['key']} centered at {origin['lat']:.6f}, {origin['lon']:.6f}")
    print(f"Tile size: {TILE_SIZE_METERS} m; terrain grid: {segments + 1} × {segments + 1}")
    print("This tool requests one tile only. Do not loop over the whole country against public APIs.")

    if args.skip_elevation:
        heights = [0.0] * ((segments + 1) ** 2)
        elevation_source = "not included — zero-height placeholder, NOT real terrain"
        elevation_batches = 0
    else:
        heights, elevation_batches = fetch_elevations(origin, segments)
        elevation_source = "Copernicus DEM GLO-90 via Open-Meteo Elevation API"

    if args.skip_osm:
        osm = {"elements": [], "source": "not included"}
        bbox = None
    else:
        osm, bbox = fetch_osm(origin)

    output_dir = Path(args.output_dir).expanduser()
    if not output_dir.is_absolute():
        output_dir = (ROOT / output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / f"{address['key']}.json"

    payload = {
        "schemaVersion": 1,
        "tile": {
            **address,
            "bounds": {
                "south": round(origin["lat"] - (TILE_SIZE_METERS / 2) / 111320.0, 8),
                "north": round(origin["lat"] + (TILE_SIZE_METERS / 2) / 111320.0, 8),
                "west": round(origin["lon"] - (TILE_SIZE_METERS / 2) / (111320.0 * math.cos(math.radians(origin["lat"]))), 8),
                "east": round(origin["lon"] + (TILE_SIZE_METERS / 2) / (111320.0 * math.cos(math.radians(origin["lat"]))), 8),
            },
            "generatedAt": utc_now(),
        },
        "terrain": {
            "segments": segments,
            "heights": [round(h, 2) for h in heights],
            "source": elevation_source,
            "batches": elevation_batches,
        },
        "osm": {
            "elements": osm.get("elements", []),
            "source": osm.get("source", "OpenStreetMap Overpass API"),
            "bbox": bbox or osm.get("bbox"),
            "retrievedAt": utc_now(),
        },
        "provenance": {
            "osm": "© OpenStreetMap contributors, ODbL; https://www.openstreetmap.org/copyright",
            "elevation": "Copernicus DEM GLO-90 accessed via Open-Meteo Elevation API; https://open-meteo.com/en/docs/elevation-api",
            "builder": "Bangladesh Open World Stage 2 tile builder",
            "note": "OSM output is capped by feature class for a prototype. Inspect coverage before claiming completeness.",
        },
    }

    tmp = destination.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(destination)
    size_kb = destination.stat().st_size / 1024
    print(f"\nSaved: {destination}")
    print(f"Size: {size_kb:,.1f} KiB")
    print(f"OpenStreetMap ways: {len(payload['osm']['elements']):,}")
    print("Next: commit this JSON file with the site, then reload the same tile in the browser.")
    if args.skip_elevation:
        print("WARNING: --skip-elevation created a zero-height placeholder, not a real terrain tile.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Cancelled by user.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
