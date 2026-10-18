#!/usr/bin/env python3
"""Merge local Copernicus DEM GeoTIFF tiles into one rasterio-readable mosaic."""
import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Merge a folder of DEM GeoTIFF tiles into one GeoTIFF mosaic.")
    parser.add_argument("input_dir", type=Path, help="Folder containing downloaded .tif/.tiff DEM files")
    parser.add_argument("output", type=Path, help="Output GeoTIFF path, e.g. data/source/bangladesh-dem.tif")
    args = parser.parse_args()
    if not args.input_dir.is_dir():
        parser.error(f"Input folder not found: {args.input_dir}")
    try:
        import rasterio
        from rasterio.merge import merge
    except ImportError as exc:
        raise SystemExit(f"rasterio is required. Install tools/requirements-stage3.txt. Details: {exc}")

    paths = sorted(p for p in args.input_dir.iterdir() if p.is_file() and p.suffix.lower() in {".tif", ".tiff"})
    if not paths:
        parser.error(f"No .tif/.tiff files found in {args.input_dir}")
    srcs = []
    try:
        for path in paths:
            srcs.append(rasterio.open(path))
        crs = srcs[0].crs
        if crs is None or any(ds.crs != crs for ds in srcs):
            raise RuntimeError("All source DEM files must have the same defined CRS. Reproject them before merging.")
        if any(ds.count < 1 for ds in srcs):
            raise RuntimeError("At least one source DEM has no raster bands.")
        array, transform = merge(srcs, nodata=srcs[0].nodata)
        profile = srcs[0].profile.copy()
        profile.update(
            driver="GTiff", height=array.shape[1], width=array.shape[2],
            transform=transform, count=array.shape[0], compress="deflate",
            predictor=2, BIGTIFF="IF_SAFER", tiled=True,
        )
        if srcs[0].nodata is not None:
            profile["nodata"] = srcs[0].nodata
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(args.output, "w", **profile) as dst:
            dst.write(array)
        print(f"Merged {len(srcs)} files into: {args.output}")
        print(f"CRS: {crs}; raster size: {array.shape[2]:,} × {array.shape[1]:,}")
        print("Confirm the mosaic covers Bangladesh and that its vertical units are metres.")
        return 0
    finally:
        for ds in srcs:
            ds.close()


if __name__ == "__main__":
    raise SystemExit(main())
