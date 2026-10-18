"""Smoke-test the JS viewer's documented tile grid against the national Python builder.

This test only checks deterministic grid addressing; it does not validate source geography
or prove that external tile services are available.
"""
from __future__ import annotations

import math

TILE_SIZE = 3000.0
GRID_ORIGIN_LAT = 20.5
GRID_ORIGIN_LON = 88.0


def tile_address(lat: float, lon: float) -> tuple[int, int, float, float]:
    lat_step = TILE_SIZE / 111320.0
    row = math.floor((lat - GRID_ORIGIN_LAT) / lat_step)
    center_lat = GRID_ORIGIN_LAT + (row + 0.5) * lat_step
    lon_step = TILE_SIZE / (111320.0 * math.cos(math.radians(center_lat)))
    col = math.floor((lon - GRID_ORIGIN_LON) / lon_step)
    center_lon = GRID_ORIGIN_LON + (col + 0.5) * lon_step
    return row, col, center_lat, center_lon


def main() -> int:
    samples = {
        "Dhaka": (23.8103, 90.4125),
        "Gazipur": (24.0023, 90.4264),
        "Chattogram": (22.3569, 91.7832),
        "Sylhet": (24.8949, 91.8687),
        "Cox's Bazar": (21.4272, 92.0058),
        "Rangpur": (25.7439, 89.2752),
        "Sundarbans": (21.9497, 89.1833),
        "Bandarban": (22.1953, 92.2184),
    }
    for name, (lat, lon) in samples.items():
        row, col, center_lat, center_lon = tile_address(lat, lon)
        roundtrip = tile_address(center_lat, center_lon)
        assert roundtrip[:2] == (row, col), f"{name}: tile center does not round-trip"
        assert center_lat - 1 < lat < center_lat + 1, f"{name}: unexpected row center"
        assert abs(center_lon - lon) < 1.0, f"{name}: unexpected column center"
        print(f"{name}: r{row}_c{col} OK")
    print(f"PASS: {len(samples)} Bangladesh locations match the national tile-grid formula.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
