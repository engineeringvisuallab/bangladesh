#!/usr/bin/env python3
"""Shared grid math for Bangladesh Open World schema v2.

This uses a local equirectangular projection with a fixed reference latitude so every tile
shares one globally consistent metric coordinate grid. It is a Web-game coordinate system,
not a cadastral survey projection; the east-west distance scale is approximate across Bangladesh.
"""
from __future__ import annotations
import math

TILE_SIZE_METERS = 3000.0
GRID_ORIGIN_LAT = 20.5
GRID_ORIGIN_LON = 88.0
GRID_REFERENCE_LAT = 23.5
GRID_VERSION = 2
METERS_PER_DEGREE = 111320.0
GRID_COS = math.cos(math.radians(GRID_REFERENCE_LAT))


def tile_lat_step(tile_size: float = TILE_SIZE_METERS) -> float:
    return tile_size / METERS_PER_DEGREE


def tile_lon_step(tile_size: float = TILE_SIZE_METERS) -> float:
    return tile_size / (METERS_PER_DEGREE * GRID_COS)


def tile_address_at_grid(row: int, col: int, tile_size: float = TILE_SIZE_METERS) -> dict:
    lat_step = tile_lat_step(tile_size)
    lon_step = tile_lon_step(tile_size)
    return {
        "key": f"r{row}_c{col}",
        "row": int(row),
        "col": int(col),
        "origin": {
            "lat": round(GRID_ORIGIN_LAT + (row + 0.5) * lat_step, 8),
            "lon": round(GRID_ORIGIN_LON + (col + 0.5) * lon_step, 8),
        },
        "sizeMeters": int(tile_size),
        "gridVersion": GRID_VERSION,
    }


def tile_address(lat: float, lon: float, tile_size: float = TILE_SIZE_METERS) -> dict:
    lat_step = tile_lat_step(tile_size)
    lon_step = tile_lon_step(tile_size)
    row = math.floor((lat - GRID_ORIGIN_LAT) / lat_step)
    col = math.floor((lon - GRID_ORIGIN_LON) / lon_step)
    return tile_address_at_grid(row, col, tile_size)


def tile_bounds(address: dict, tile_size: float = TILE_SIZE_METERS) -> dict:
    origin = address["origin"]
    half = tile_size / 2
    return {
        "south": origin["lat"] - half / METERS_PER_DEGREE,
        "north": origin["lat"] + half / METERS_PER_DEGREE,
        "west": origin["lon"] - half / (METERS_PER_DEGREE * GRID_COS),
        "east": origin["lon"] + half / (METERS_PER_DEGREE * GRID_COS),
    }


def geo_at_local(origin: dict, x: float, z: float) -> tuple[float, float]:
    lat = origin["lat"] - z / METERS_PER_DEGREE
    lon = origin["lon"] + x / (METERS_PER_DEGREE * GRID_COS)
    return lat, lon


def local_xy(lat: float, lon: float, around: dict) -> tuple[float, float]:
    return (
        (lon - around["lon"]) * METERS_PER_DEGREE * GRID_COS,
        (around["lat"] - lat) * METERS_PER_DEGREE,
    )
