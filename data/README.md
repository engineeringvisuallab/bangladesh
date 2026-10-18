# Data folder

Stage 2 intentionally does not bundle a national geospatial dataset in this GitHub Pages repository. Large country extracts and 3D Tiles are hosted/processed separately.

## Current data sources

- OpenFreeMap / OpenMapTiles vector tiles for the Bangladesh-bounded streamed vector layer: https://openfreemap.org/quick_start/
- OpenStreetMap data via public Overpass services for small on-demand road/waterway/railway overlays. Attribution and ODbL obligations apply: https://www.openstreetmap.org/copyright
- Cesium ion OSM Buildings and World Terrain when the user supplies a suitable client token: https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/
- Esri World Imagery imagery endpoint; review provider licensing and attribution before production use.

## Next: own Bangladesh GIS pipeline

Geofabrik publishes a Bangladesh `.osm.pbf` extract: https://download.geofabrik.de/asia/bangladesh.html

Download it outside GitHub, preprocess with GIS/OSM tooling, keep source date and license metadata, and publish small tiled datasets to static/object storage. Do not bulk-query Overpass for the entire country and do not commit hundreds of megabytes of PBF or giant GeoJSON files into this repo.
