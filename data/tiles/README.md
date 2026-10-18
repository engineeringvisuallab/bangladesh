# Static world tiles

Place generated `r<row>_c<col>.json` tiles in this directory. The browser looks for a tile here first, then falls back to live public APIs if the tile does not exist.

Build a tile from the repository root:

```bash
python tools/build_tile.py --lat 23.8103 --lon 90.4125
```

The tile grid origin and math are shared between `tools/build_tile.py` and `src/main.js`. Don't rename the generated file. One tile covers about 3 km × 3 km and contains a 33 × 33 elevation grid plus capped mapped OSM ways.

Do not commit the entire national dataset as one huge GitHub repository asset. Use this tile format as the prototype, then move to a properly hosted tile/object-storage pipeline for nationwide scale.
