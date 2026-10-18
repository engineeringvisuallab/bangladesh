/* Bangladesh 3D Digital Twin — Foundation Prototype
 * Real geospatial content is added only from configured providers or explicit user actions.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const statusEl = $('appStatus');
  const toastEl = $('toast');
  const tokenStorageKey = 'bd3d_cesium_token';
  let toastTimer = null;
  let localOsmEntities = [];
  let importedLayers = [];
  let currentBaseLayer = null;
  let globalOsmBuildings = null;
  let nationalVectorProvider = null;

  const places = {
    bangladesh: { name: 'বাংলাদেশ', lon: 90.35, lat: 23.70, height: 1350000, pitch: -55, keywords: ['bangladesh', 'বাংলাদেশ', 'country'] },
    dhaka: { name: 'ঢাকা', lon: 90.4125, lat: 23.8103, height: 24000, pitch: -48, keywords: ['dhaka', 'ঢাকা'] },
    chattogram: { name: 'চট্টগ্রাম', lon: 91.797, lat: 22.3569, height: 26000, pitch: -48, keywords: ['chattogram', 'chittagong', 'চট্টগ্রাম'] },
    khulna: { name: 'খুলনা', lon: 89.5403, lat: 22.8456, height: 22000, pitch: -48, keywords: ['khulna', 'খুলনা'] },
    sylhet: { name: 'সিলেট', lon: 91.8687, lat: 24.8949, height: 26000, pitch: -48, keywords: ['sylhet', 'সিলেট'] },
    rajshahi: { name: 'রাজশাহী', lon: 88.6042, lat: 24.3745, height: 22000, pitch: -48, keywords: ['rajshahi', 'রাজশাহী'] },
    rangpur: { name: 'রংপুর', lon: 89.2752, lat: 25.7439, height: 22000, pitch: -48, keywords: ['rangpur', 'রংপুর'] },
    barishal: { name: 'বরিশাল', lon: 90.3535, lat: 22.701, height: 22000, pitch: -48, keywords: ['barishal', 'barisal', 'বরিশাল'] },
    mymensingh: { name: 'ময়মনসিংহ', lon: 90.4074, lat: 24.7471, height: 22000, pitch: -48, keywords: ['mymensingh', 'ময়মনসিংহ', 'ময়মনসিংহ'] },
    coxsbazar: { name: 'কক্সবাজার', lon: 91.9811, lat: 21.4272, height: 24000, pitch: -48, keywords: ['coxsbazar', "cox's bazar", 'কক্সবাজার'] },
    bandarban: { name: 'বান্দরবান', lon: 92.2184, lat: 22.1953, height: 30000, pitch: -50, keywords: ['bandarban', 'বান্দরবান'] },
    sundarbans: { name: 'সুন্দরবন', lon: 89.4, lat: 21.95, height: 85000, pitch: -48, keywords: ['sundarbans', 'সুন্দরবন'] },
    padmabridge: { name: 'পদ্মা সেতু', lon: 90.0, lat: 23.44, height: 12000, pitch: -45, keywords: ['padma bridge', 'পদ্মা সেতু'] }
  };

  function setStatus(message) { statusEl.textContent = message; }
  function toast(message, duration = 3600) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
  }

  const sessionToken = sessionStorage.getItem(tokenStorageKey) || '';
  if (sessionToken) Cesium.Ion.defaultAccessToken = sessionToken;

  const viewer = new Cesium.Viewer('cesiumContainer', {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    baseLayer: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    infoBox: false,
    selectionIndicator: false,
    shadows: false,
    shouldAnimate: true,
    terrain: sessionToken ? Cesium.Terrain.fromWorldTerrain({ requestVertexNormals: true }) : undefined,
    terrainProvider: sessionToken ? undefined : new Cesium.EllipsoidTerrainProvider()
  });

  // Satellite imagery is a view-only base layer. Observe the imagery provider's current terms.
  try {
    currentBaseLayer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      credit: new Cesium.Credit('Imagery © Esri and its suppliers')
    }));
    // Remove Cesium's default base imagery, if present, so the selected imagery is unambiguous.
    if (viewer.imageryLayers.length > 1) {
      for (let i = viewer.imageryLayers.length - 2; i >= 0; i--) viewer.imageryLayers.remove(viewer.imageryLayers.get(i), false);
    }
  } catch (error) {
    console.warn('Imagery provider could not initialize:', error);
    toast('Satellite imagery চালু হয়নি। ইন্টারনেট সংযোগ পরীক্ষা করুন।');
  }

  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.depthTestAgainstTerrain = Boolean(sessionToken);
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 80;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 30000000;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#06111b');

  function flyToPlace(placeKey, useLookFrom = false) {
    const place = places[placeKey];
    if (!place) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(place.lon, place.lat, place.height),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(useLookFrom ? -89.5 : place.pitch),
        roll: 0
      },
      duration: 1.6,
      complete: () => setStatus(`${place.name} · Camera ready`)
    });
    $('placeSelect').value = placeKey;
  }

  function normalize(value) { return value.trim().toLocaleLowerCase(); }
  function findPlace(query) {
    const q = normalize(query);
    if (!q) return null;
    for (const [key, place] of Object.entries(places)) {
      if (key === q || normalize(place.name) === q || place.keywords.some(k => normalize(k) === q)) return key;
    }
    for (const [key, place] of Object.entries(places)) {
      if (place.keywords.some(k => normalize(k).includes(q)) || normalize(place.name).includes(q)) return key;
    }
    return null;
  }

  function searchPlace() {
    const query = $('placeSearch').value;
    const key = findPlace(query) || $('placeSelect').value;
    if (!key || (query && !findPlace(query))) {
      toast('এই তালিকায় স্থানটি নেই। তালিকা থেকে একটি স্থান নির্বাচন করুন।');
      return;
    }
    flyToPlace(key);
    toast(`${places[key].name} এর দিকে যাচ্ছি…`);
  }

  $('searchBtn').addEventListener('click', searchPlace);
  $('placeSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') searchPlace(); });
  $('flyBtn').addEventListener('click', () => flyToPlace($('placeSelect').value));
  $('homeBtn').addEventListener('click', () => flyToPlace('bangladesh'));
  $('northBtn').addEventListener('click', () => flyToPlace($('placeSelect').value, true));
  $('zoomInBtn').addEventListener('click', () => viewer.camera.zoomIn(Math.max(500, viewer.camera.positionCartographic.height * 0.28)));
  $('zoomOutBtn').addEventListener('click', () => viewer.camera.zoomOut(Math.max(1000, viewer.camera.positionCartographic.height * 0.35)));
  $('resetCameraBtn').addEventListener('click', () => flyToPlace('bangladesh'));

  function openTerrainModal() {
    $('ionToken').value = sessionStorage.getItem(tokenStorageKey) || '';
    $('terrainModal').hidden = false;
    $('ionToken').focus();
  }
  function closeTerrainModal() { $('terrainModal').hidden = true; }
  $('terrainSettingsBtn').addEventListener('click', openTerrainModal);
  $('terrainInlineBtn').addEventListener('click', openTerrainModal);
  $('closeTerrainModal').addEventListener('click', closeTerrainModal);
  $('terrainModal').addEventListener('click', (event) => { if (event.target === $('terrainModal')) closeTerrainModal(); });
  $('enableTerrainBtn').addEventListener('click', () => {
    const token = $('ionToken').value.trim();
    if (!token) { toast('আগে Cesium ion access token দিন।'); return; }
    sessionStorage.setItem(tokenStorageKey, token);
    toast('Token সেট করা হয়েছে। Terrain চালু করতে পেজ রিলোড হচ্ছে…');
    setTimeout(() => window.location.reload(), 650);
  });
  $('removeTokenBtn').addEventListener('click', () => {
    sessionStorage.removeItem(tokenStorageKey);
    toast('Token মুছে ফেলা হয়েছে। Flat ellipsoid mode-এ রিলোড হচ্ছে…');
    setTimeout(() => window.location.reload(), 650);
  });

  async function loadNationwideVectorLayer() {
    const button = $('loadNationalVectorBtn');
    if (nationalVectorProvider) {
      toast('বাংলাদেশ-wide vector layer ইতিমধ্যে চালু আছে।');
      return;
    }
    if (typeof Cesium.MVTDataProvider === 'undefined') {
      toast('এই CesiumJS build-এ MVT vector tiles পাওয়া যাচ্ছে না।', 5000);
      return;
    }
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Vector tiles সেটআপ হচ্ছে…';
    $('nationalVectorStatus').textContent = 'Initializing Bangladesh extent…';
    setStatus('Initializing nationwide vector tiles…');
    try {
      // Bangladesh extent only: keeps Cesium's runtime tile hierarchy bounded.
      const provider = await Cesium.MVTDataProvider.fromUrl(
        'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf',
        {
          minZoom: 5,
          maxZoom: 13,
          extent: Cesium.Rectangle.fromDegrees(87.7, 20.2, 93.2, 26.9),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          scene: viewer.scene
        }
      );
      if (provider.tileset) {
        provider.tileset.style = new Cesium.Cesium3DTileStyle({
          show: "${class} === 'motorway' || ${class} === 'trunk' || ${class} === 'primary' || ${class} === 'secondary' || ${class} === 'tertiary' || ${class} === 'minor' || ${class} === 'service' || ${class} === 'track' || ${class} === 'path' || ${class} === 'pedestrian' || ${class} === 'rail' || ${class} === 'railway' || ${class} === 'river' || ${class} === 'stream' || ${class} === 'canal' || ${class} === 'drain' || ${class} === 'ditch' || ${class} === 'lake' || ${class} === 'pond' || ${class} === 'reservoir'",
          color: {
            conditions: [
              ["${class} === 'motorway' || ${class} === 'trunk' || ${class} === 'primary'", "color('#f0bf67')"],
              ["${class} === 'rail' || ${class} === 'railway'", "color('#c59cf5')"],
              ["${class} === 'river' || ${class} === 'stream' || ${class} === 'canal' || ${class} === 'drain' || ${class} === 'ditch' || ${class} === 'lake' || ${class} === 'pond' || ${class} === 'reservoir'", "color('#58c9f0')"],
              ["true", "color('#d8e2e7', 0.72)"]
            ]
          },
          lineWidth: "${class} === 'motorway' || ${class} === 'trunk' ? 3.0 : (${class} === 'primary' || ${class} === 'rail' ? 2.3 : 1.4)"
        });
      }
      viewer.scene.primitives.add(provider);
      nationalVectorProvider = provider;
      $('removeNationalVectorBtn').disabled = false;
      $('nationalVectorStatus').textContent = 'Loaded · tiles stream on demand';
      setStatus('Bangladesh-wide vector layer loaded');
      toast('বাংলাদেশের vector layer যুক্ত হয়েছে। ডেটা ভিউ ও জুম অনুযায়ী লোড হবে।', 5000);
    } catch (error) {
      console.error('Could not load nationwide vector layer:', error);
      $('nationalVectorStatus').textContent = 'Load failed · service/network issue';
      setStatus('Nationwide vector layer failed');
      toast('Vector layer লোড হয়নি। ইন্টারনেট, tile service অথবা browser console পরীক্ষা করুন।', 6000);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function removeNationwideVectorLayer() {
    if (nationalVectorProvider) {
      viewer.scene.primitives.remove(nationalVectorProvider);
      nationalVectorProvider = null;
    }
    $('removeNationalVectorBtn').disabled = true;
    $('nationalVectorStatus').textContent = 'Off · streaming vector tiles';
    setStatus('Bangladesh-wide vector layer off');
    toast('বাংলাদেশ-wide vector layer বন্ধ করা হয়েছে।');
  }
  $('loadNationalVectorBtn').addEventListener('click', loadNationwideVectorLayer);
  $('removeNationalVectorBtn').addEventListener('click', removeNationwideVectorLayer);

  async function loadGlobalOsmBuildings() {
    const button = $('loadBuildingsBtn');
    if (globalOsmBuildings) {
      toast('OSM 3D Buildings লেয়ার ইতিমধ্যে চালু আছে।');
      return;
    }
    const token = sessionStorage.getItem(tokenStorageKey) || '';
    if (!token) {
      toast('3D Buildings-এর জন্য Cesium ion token দরকার। সেটআপ খুলছি…', 4200);
      openTerrainModal();
      return;
    }
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '3D Buildings লোড হচ্ছে…';
    $('buildingStatus').textContent = 'Loading streamed 3D Tiles…';
    setStatus('Loading Cesium OSM Buildings…');
    try {
      const tileset = await Cesium.createOsmBuildingsAsync();
      viewer.scene.primitives.add(tileset);
      globalOsmBuildings = tileset;
      $('removeBuildingsBtn').disabled = false;
      $('buildingStatus').textContent = 'Loaded · available coverage varies';
      setStatus('OSM 3D Buildings layer loaded');
      toast('OSM 3D Buildings লেয়ার চালু হয়েছে। কাছাকাছি জুম করে ডেটা দেখুন।', 5000);
    } catch (error) {
      console.error('Could not load OSM 3D Buildings:', error);
      $('buildingStatus').textContent = 'Load failed · check token/network';
      setStatus('OSM buildings failed to load');
      toast('3D Buildings লোড হয়নি। Token permission, internet এবং ion quota পরীক্ষা করুন।', 5500);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function removeGlobalOsmBuildings() {
    if (globalOsmBuildings) {
      viewer.scene.primitives.remove(globalOsmBuildings);
      globalOsmBuildings = null;
    }
    $('removeBuildingsBtn').disabled = true;
    $('buildingStatus').textContent = 'Off · Cesium ion token needed';
    setStatus('OSM 3D Buildings layer off');
    toast('3D Buildings লেয়ার বন্ধ করা হয়েছে।');
  }
  $('loadBuildingsBtn').addEventListener('click', loadGlobalOsmBuildings);
  $('removeBuildingsBtn').addEventListener('click', removeGlobalOsmBuildings);

  function getViewCenter() {
    const canvas = viewer.scene.canvas;
    const point = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const cartesian = viewer.camera.pickEllipsoid(point, viewer.scene.globe.ellipsoid);
    if (cartesian) return Cesium.Cartographic.fromCartesian(cartesian);
    return viewer.camera.positionCartographic;
  }

  function clearLocalOsm() {
    localOsmEntities.forEach(entity => viewer.entities.remove(entity));
    localOsmEntities = [];
    $('clearOsmBtn').disabled = true;
  }

  async function loadOsmNearView() {
    const button = $('loadOsmBtn');
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = 'OSM ডেটা আনা হচ্ছে…';
    setStatus('OpenStreetMap data request…');
    try {
      const center = getViewCenter();
      const lat = Cesium.Math.toDegrees(center.latitude);
      const lon = Cesium.Math.toDegrees(center.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85) throw new Error('Map center is not available. বাংলাদেশের কোনো শহর আগে নির্বাচন করুন।');
      const radiusKm = Number($('osmRadius').value) || 4;
      const dLat = radiusKm / 111.32;
      const dLon = radiusKm / (111.32 * Math.max(0.18, Math.cos(center.latitude)));
      const south = (lat - dLat).toFixed(5), west = (lon - dLon).toFixed(5);
      const north = (lat + dLat).toFixed(5), east = (lon + dLon).toFixed(5);
      const bbox = `${south},${west},${north},${east}`;
      const query = `[out:json][timeout:35];(way["highway"](${bbox});way["waterway"](${bbox});way["railway"](${bbox}););out geom;`;
      const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
      ];
      let payload = null;
      let lastError = null;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: new URLSearchParams({ data: query }) });
          if (!response.ok) throw new Error(`OSM service returned ${response.status}`);
          payload = await response.json();
          break;
        } catch (err) { lastError = err; }
      }
      if (!payload) throw lastError || new Error('OpenStreetMap service not responding');
      clearLocalOsm();
      let roads = 0, waterways = 0, railways = 0;
      for (const way of (payload.elements || [])) {
        if (!way.geometry || way.geometry.length < 2 || !way.tags) continue;
        const positionsArray = [];
        for (const point of way.geometry) positionsArray.push(point.lon, point.lat);
        const positions = Cesium.Cartesian3.fromDegreesArray(positionsArray);
        const isWater = Boolean(way.tags.waterway);
        const isRail = Boolean(way.tags.railway);
        const highway = way.tags.highway || '';
        const major = ['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link', 'primary_link'].includes(highway);
        const color = isWater ? '#5fc8ff' : isRail ? '#d6a4ff' : (major ? '#ffd27d' : '#eff5ef');
        const width = isWater ? 2.6 : isRail ? 2.1 : (major ? 3.0 : 1.45);
        const entity = viewer.entities.add({
          polyline: {
            positions,
            width,
            material: Cesium.Color.fromCssColorString(color),
            clampToGround: true,
            arcType: Cesium.ArcType.GEODESIC
          },
          properties: {
            source: 'OpenStreetMap',
            osmId: way.id,
            featureType: isWater ? 'waterway' : isRail ? 'railway' : 'highway',
            name: way.tags.name || '',
            highway: way.tags.highway || '',
            waterway: way.tags.waterway || '',
            railway: way.tags.railway || ''
          }
        });
        localOsmEntities.push(entity);
        if (isWater) waterways++; else if (isRail) railways++; else roads++;
      }
      $('clearOsmBtn').disabled = localOsmEntities.length === 0;
      if (localOsmEntities.length === 0) toast('এই এলাকার জন্য OSM-এ রাস্তা/নদী/রেলের ডেটা পাওয়া যায়নি। অন্য শহর চেষ্টা করুন।');
      else toast(`OpenStreetMap লেয়ার লোড হয়েছে: ${roads} রাস্তা, ${waterways} জলপথ, ${railways} রেললাইন সেগমেন্ট।`, 5200);
      setStatus(`OSM local overlay · ${roads} roads · ${waterways} waterways · ${railways} railways`);
    } catch (error) {
      console.error(error);
      toast(`ডেটা লোড হয়নি: ${error.message || 'Network error'}`, 5000);
      setStatus('OSM overlay failed · check connection or try again');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
  $('loadOsmBtn').addEventListener('click', loadOsmNearView);
  $('clearOsmBtn').addEventListener('click', () => { clearLocalOsm(); setStatus('Local OSM layer cleared'); toast('লোকাল রাস্তা/নদীর লেয়ার মুছে ফেলা হয়েছে।'); });

  function readEntityProperties(entity) {
    try {
      if (!entity.properties) return {};
      const now = Cesium.JulianDate.now();
      const value = entity.properties.getValue(now) || {};
      const result = {};
      for (const [key, property] of Object.entries(value)) {
        try { result[key] = property && typeof property.getValue === 'function' ? property.getValue(now) : property; }
        catch (_) { result[key] = property; }
      }
      // Dynamic property bags can expose raw properties differently by data source.
      for (const key of (entity.properties.propertyNames || [])) {
        if (result[key] === undefined) {
          try { result[key] = entity.properties[key].getValue(now); } catch (_) { /* not available */ }
        }
      }
      return result;
    } catch (_) { return {}; }
  }

  async function importGeoJSON(file) {
    if (!file) return;
    $('importStatus').textContent = `${file.name} পড়া হচ্ছে…`;
    try {
      const geojsonText = await file.text();
      const geojsonObject = JSON.parse(geojsonText);
      const source = await Cesium.GeoJsonDataSource.load(geojsonObject, {
        clampToGround: true,
        stroke: Cesium.Color.fromCssColorString('#5fe0d3'),
        strokeWidth: 2,
        fill: Cesium.Color.fromCssColorString('#5fe0d3').withAlpha(0.24),
        markerColor: Cesium.Color.fromCssColorString('#e9bd68')
      });
      viewer.dataSources.add(source);
      importedLayers.push(source);
      const now = Cesium.JulianDate.now();
      let buildings = 0;
      source.entities.values.forEach(entity => {
        if (!entity.polygon) return;
        const props = readEntityProperties(entity);
        const heightValue = Number(props.height || props['building:height'] || props.building_height || 0);
        const levels = Number(props['building:levels'] || props.levels || props['building_levels'] || 0);
        const height = heightValue > 0 ? heightValue : (levels > 0 ? levels * 3.1 : 0);
        entity.polygon.height = 0;
        if (height > 0) {
          entity.polygon.extrudedHeight = height;
          entity.polygon.material = Cesium.Color.fromCssColorString('#e8bf78').withAlpha(0.85);
          entity.polygon.outline = true;
          entity.polygon.outlineColor = Cesium.Color.fromCssColorString('#fff0c8');
          buildings++;
        }
      });
      $('importStatus').textContent = `${file.name} · ${source.entities.values.length} feature${source.entities.values.length === 1 ? '' : 's'} loaded${buildings ? ` · ${buildings} extruded polygons` : ''}.`;
      toast('GeoJSON সফলভাবে ম্যাপে যোগ হয়েছে।', 4000);
      setStatus(`Imported GeoJSON · ${source.entities.values.length} features`);
      try { await viewer.flyTo(source, { duration: 1.4 }); } catch (_) { /* Empty geometry can be ignored */ }
    } catch (error) {
      console.error(error);
      $('importStatus').textContent = 'ফাইল পড়া যায়নি। সঠিক GeoJSON ফাইল দিন।';
      toast('GeoJSON import failed: ' + (error.message || 'Invalid file'), 5000);
    } finally {
      $('geojsonInput').value = '';
    }
  }
  $('importGeojsonBtn').addEventListener('click', () => $('geojsonInput').click());
  $('geojsonInput').addEventListener('change', (event) => importGeoJSON(event.target.files && event.target.files[0]));

  function updateReadout() {
    const camera = viewer.camera.positionCartographic;
    $('latReadout').textContent = `${Cesium.Math.toDegrees(camera.latitude).toFixed(4)}°`;
    $('lonReadout').textContent = `${Cesium.Math.toDegrees(camera.longitude).toFixed(4)}°`;
    const altitude = camera.height;
    $('altReadout').textContent = altitude >= 1000000 ? `${(altitude / 1000000).toFixed(2)} Mm` : altitude >= 1000 ? `${(altitude / 1000).toFixed(1)} km` : `${Math.round(altitude)} m`;
  }
  viewer.camera.changed.addEventListener(updateReadout);
  updateReadout();

  if (sessionToken) {
    $('terrainStatus').textContent = 'World Terrain enabled (ion)';
    $('buildingStatus').textContent = 'Ready · token detected';
    $('terrainInlineBtn').textContent = 'Token';
    setStatus('Terrain token detected · loading 3D globe…');
  } else {
    $('terrainStatus').textContent = 'Ellipsoid · token needed for elevation';
    setStatus('Satellite globe ready · terrain token optional');
  }
  flyToPlace('bangladesh');
})();
