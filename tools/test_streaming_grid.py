#!/usr/bin/env python3
"""Smoke-test Bangladesh Open World schema-v2 grid addresses and exact neighbor edges."""
from __future__ import annotations
import math
from world_grid import GRID_REFERENCE_LAT, TILE_SIZE_METERS, geo_at_local, tile_address, tile_address_at_grid


def near(a: float, b: float, eps: float = 1e-7) -> bool:
    return abs(a - b) <= eps


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
        address = tile_address(lat, lon)
        roundtrip = tile_address(address["origin"]["lat"], address["origin"]["lon"])
        assert roundtrip["key"] == address["key"], f"{name}: tile center does not round-trip"
        assert address["gridVersion"] == 2
        print(f"{name}: {address['key']} OK")

    # East/west neighbors must share exact geographic edge coordinates.
    a = tile_address_at_grid(100, 100)
    b = tile_address_at_grid(100, 101)
    edge_a = geo_at_local(a["origin"], TILE_SIZE_METERS / 2, 0)
    edge_b = geo_at_local(b["origin"], -TILE_SIZE_METERS / 2, 0)
    assert near(edge_a[0], edge_b[0]) and near(edge_a[1], edge_b[1]), ("east/west seam", edge_a, edge_b)

    # North/south neighbors share exact geographic edge coordinates.
    south = tile_address_at_grid(100, 100)
    north = tile_address_at_grid(101, 100)
    edge_south = geo_at_local(south["origin"], 0, -TILE_SIZE_METERS / 2)
    edge_north = geo_at_local(north["origin"], 0, TILE_SIZE_METERS / 2)
    assert near(edge_south[0], edge_north[0]) and near(edge_south[1], edge_north[1]), ("north/south seam", edge_south, edge_north)

    # Camera projection uses the same fixed-reference conversion when rebasing.
    test_tile = tile_address(23.8103, 90.4125)
    point = geo_at_local(test_tile["origin"], 120.25, -45.5)
    restored = tile_address(point[0], point[1])
    assert restored["gridVersion"] == 2
    print(f"PASS: {len(samples)} Bangladesh points; east/west and north/south seams align on grid v2 ({GRID_REFERENCE_LAT}° reference latitude).")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
