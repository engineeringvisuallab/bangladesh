# Small local prototype tiles

The viewer can load `data/tiles/<tile-key>.json` as a local prototype tile. Stage 3's nationwide outputs are written to `data/national-tiles/` by default so they are kept separate. Do not commit a whole national tile set to the app repository; use a static object host/CDN and configure `tileBaseUrl` in the root `config.js`.
