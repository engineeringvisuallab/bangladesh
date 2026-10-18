/* Bangladesh Open World configuration (Stage 5 / grid v2).
   - tileBaseUrl: leave empty to load ./data/tiles/<tile-key>.json from this site.
     For nationwide grid-v2 tiles, use a static HTTPS URL whose path contains <tile-key>.json.
     Old Stage 1–4 tile JSON files use the previous grid and must be rebuilt.
     Example: "https://your-public-bucket.example.com/bangladesh-tiles/"
     The tile host must allow cross-origin requests (CORS) from your GitHub Pages domain.
   - allowLiveFallback: false prevents public API requests when a static tile is missing.
*/
window.BDOW_CONFIG = {
  tileBaseUrl: "",
  allowLiveFallback: true
};
