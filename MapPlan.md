Ready for review
Select text to add comments on the plan
Plan: Migrate map.tsx from react-native-maps (PROVIDER_GOOGLE) to @rnmapbox/maps
Context
The app currently uses react-native-maps@1.20.1 with PROVIDER_GOOGLE. The navigation experience has documented conflicts with Google Maps' internal rendering engine:

The 130ms nav-camera setInterval calls animateCamera() which fights Google Maps' own animation queue → occasional snap-back and visual stutter on Android
PROVIDER_GOOGLE rasterizes custom <Marker> React Native views into bitmaps; during zoom/tile reloads these bitmaps are recycled and markers vanish (why ReportLayer and NavIndicator were already moved to RN View overlays above the map)
The <UrlTile> Mapbox raster overlay + Google base layer creates seam artifacts during camera rotation in offline mode
Google Maps limits pitch control in certain zoom bands; heading-up mode shows jitter
Goal: Replace the Google Maps rendering engine with @rnmapbox/maps while keeping all Google Maps data APIs (Places Autocomplete, reverse geocoding, directions). Mapbox renders; Google provides data.

@rnmapbox/maps is not yet installed. This is a fresh migration.

What stays unchanged
All Google data services in services/map.ts (Places Autocomplete, reverseGeocode, getPlaceDetails) — no changes
All RN overlay components: NavIndicator, ReportLayer, MapFloatingUI, JourneyDetailsSheet, NearestStopsSheet, ReportSheet, ReportDetailCard, IntermStopInfoCard, SaveWall, MapLayersSheet, OfflineNotice — pure RN Views above the MapView; only pointForCoordinate call sites need swapping
useNavigation.ts, useHeadingTracker.ts, headingStore.ts, journeyStore.ts
utils/mapHelpers.ts, components/map/types.ts
services/offlineTiles.ts — tile download logic unchanged; only rendering changes
All bottom sheets and sheet data flows
Critical API differences
Concept	react-native-maps	@rnmapbox/maps
Coordinate order	{latitude, longitude}	[longitude, latitude] (GeoJSON)
Camera ref	mapRef (MapView ref)	separate cameraRef (<Camera ref>)
Animate camera	mapRef.animateCamera({center:{lat,lng}, zoom, heading, pitch}, {duration})	cameraRef.setCamera({centerCoordinate:[lng,lat], zoomLevel, heading, pitch, animationDuration, animationMode})
Fit to coords	mapRef.fitToCoordinates(coords, {edgePadding, animated})	cameraRef.fitBounds([minLng,minLat], [maxLng,maxLat], [top,right,bottom,left], duration)
Point projection	mapRef.pointForCoordinate({lat,lng}) → {x,y}	mapRef.getPointInView([lng,lat]) → [x,y]
Region change	{latitude, longitude, latitudeDelta, longitudeDelta} + details.isGesture	GeoJSON feature: geometry.coordinates:[lng,lat], properties:{zoomLevel, heading, isUserInteraction}
Polyline	<Polyline coordinates={[{lat,lng}]} />	<ShapeSource> + <LineLayer> with GeoJSON
Marker	<Marker coordinate={{lat,lng}}><View /></Marker>	<PointAnnotation coordinate={[lng,lat]}><View /></PointAnnotation>
Raster tiles	<UrlTile urlTemplate tileSize />	<RasterSource tiles={[]} tileSize><RasterLayer /></RasterSource>
Map style	customMapStyle={googleStyleJson}	styleURL="mapbox://styles/..."
Zoom extraction	zoomFromDelta(region.latitudeDelta)	feature.properties.zoomLevel (direct)
Animation mode	implicit easing	explicit: 'linearTo' (rapid updates), 'easeTo' (smooth), 'moveTo' (instant)
Phase 0 — Install & native setup
Files: navigo/package.json, navigo/app.config.js, navigo/app/_layout.tsx

npm install @rnmapbox/maps
In app.config.js add the plugin block (replaces the commented-out react-native-maps plugin):
["@rnmapbox/maps", { RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN }]
RNMAPBOX_MAPS_DOWNLOAD_TOKEN already exists in .env — no new env var needed
Initialize Mapbox token at app boot in app/_layout.tsx:
import MapboxGL from '@rnmapbox/maps';
MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);
Run npx expo run:android / npx expo run:ios to rebuild native modules
Phase 1 — Map styles
Files: navigo/lib/map_style.json, navigo/lib/map_style_dark.json

Current files are Google Maps styles (featureType/elementType/stylers format) — not Mapbox GL. Replace with Mapbox style URL references:

Light: value of EXPO_PUBLIC_MAPBOX_STYLE_URL from .env (already set)
Dark: "mapbox://styles/mapbox/dark-v11" or a paired custom hosted style
These are the same styles used for offline tile downloads, so the offline map will visually match the online base layer — eliminating the current seam mismatch.

Phase 2 — useMapCamera.ts rewrite
File: navigo/hooks/useMapCamera.ts

Accept both mapRef (MapView) and cameraRef (Camera):

export function useMapCamera(
  mapRef: React.RefObject<MapboxGL.MapView>,
  cameraRef: React.RefObject<MapboxGL.Camera>
) {
  const animateTo = useCallback(({ center, zoom, heading, pitch, duration = 400 }: AnimateToParams) => {
    cameraRef.current?.setCamera({
      centerCoordinate: [center.longitude, center.latitude],
      zoomLevel: zoom,
      ...(heading !== undefined ? { heading } : {}),
      pitch: pitch ?? 0,
      animationDuration: duration,
      animationMode: duration <= 100 ? 'linearTo' : 'easeTo',
    });
  }, [cameraRef]);

  const fitCoordinates = useCallback((coords: LatLng[], padding: EdgePadding, duration = 500) => {
    const lngs = coords.map(c => c.longitude);
    const lats = coords.map(c => c.latitude);
    cameraRef.current?.fitBounds(
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
      [padding.top, padding.right, padding.bottom, padding.left],
      duration,
    );
  }, [cameraRef]);

  return { animateTo, fitCoordinates };
}
Remove zoomFromDelta() from hook usage — Mapbox gives zoomLevel directly.

Phase 3 — map.tsx: MapView swap & Camera ref
File: navigo/app/(tabs)/map.tsx

3a. Import swap
// Remove:
import MapView, { Marker, PROVIDER_GOOGLE, UrlTile } from 'react-native-maps';
// Add:
import MapboxGL from '@rnmapbox/maps';
3b. Add cameraRef alongside mapRef
const mapRef    = useRef<MapboxGL.MapView>(null);
const cameraRef = useRef<MapboxGL.Camera>(null);
const camera    = useMapCamera(mapRef, cameraRef);
3c. MapView JSX
<MapboxGL.MapView
  ref={mapRef}
  style={{ flex: 1 }}
  styleURL={dark ? 'mapbox://styles/mapbox/dark-v11' : EXPO_PUBLIC_MAPBOX_STYLE_URL}
  logoEnabled={false}
  compassEnabled={false}
  attributionEnabled={false}
  onTouchStart={() => { isUserGesturingRef.current = true; }}
  onRegionIsChanging={handleRegionChange}
  onRegionDidChange={onRegionChangeComplete}
  onLongPress={handleLongPress}
>
  <MapboxGL.Camera
    ref={cameraRef}
    defaultSettings={{ centerCoordinate: [DEFAULT_LNG, DEFAULT_LAT], zoomLevel: 13 }}
  />

  {!isOnline && offlinePack && (
    <MapboxGL.RasterSource
      id="offline-tiles"
      tiles={[dark ? TILE_URL_DARK : TILE_URL_LIGHT]}
      tileSize={256}
    >
      <MapboxGL.RasterLayer id="offline-raster" />
    </MapboxGL.RasterSource>
  )}

  <RouteOverlay ... />
  {longPressCoord && !activeJourney && (
    <MapboxGL.PointAnnotation
      id="dropped-pin"
      coordinate={[longPressCoord.longitude, longPressCoord.latitude]}
    >
      <DestinationPin name={longPressName} />
    </MapboxGL.PointAnnotation>
  )}
  {!activeJourney && <StopsLayer ... />}
</MapboxGL.MapView>
3d. Region change handlers
const onRegionChangeComplete = useCallback((feature: GeoJSON.Feature) => {
  const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
  const zoom        = feature.properties?.zoomLevel ?? 13;
  const isGesture   = feature.properties?.isUserInteraction ?? false;
  isUserGesturingRef.current = false;
  // ... same zoom/follow logic, using zoom directly instead of zoomFromDelta
}, [navigating, fetchReportsForBounds]);
3e. Navigation camera loop (130ms setInterval — lines 279-416 in current map.tsx)
The internal sensor fusion logic (GPS course + compass EMA, speed-adaptive zoom, forward offset, pitch control) stays 100% unchanged. Only the final animation call changes:

// nav camera: duration=80 → useMapCamera picks animationMode:'linearTo'
// linearTo = linear interpolation, no easing → no snap-back artifact
camera.animateTo({
  center: { latitude: centerLat, longitude: centerLng },
  zoom: finalZoom,
  ...(sendHdg ? { heading: targetHeading } : {}),
  pitch,
  duration: 80,
});
Mapbox's linearTo mode queues cleanly — eliminating the snap-back Google Maps produces when two animateCamera calls overlap.

Phase 4 — RouteOverlay.tsx migration
File: navigo/components/map/RouteOverlay.tsx

Walk legs: <Polyline> → <ShapeSource> + <LineLayer>
<MapboxGL.ShapeSource
  key={leg.id}
  id={`walk-${leg.id}`}
  shape={{ type: 'Feature', geometry: { type: 'LineString',
    coordinates: leg.coords.map(c => [c.longitude, c.latitude]) }}}
>
  <MapboxGL.LineLayer
    id={`walk-line-${leg.id}`}
    style={{
      lineColor: i === currentWalkLegIdx ? '#6B7280' : '#9CA3AF',
      lineWidth: 3,
      lineDasharray: [2, 2],
      lineCap: 'round',
      lineJoin: 'round',
      lineOpacity: i < currentWalkLegIdx ? 0.35 : 1,
    }}
  />
</MapboxGL.ShapeSource>
Transit legs: same ShapeSource + LineLayer pattern
Node markers & intermediate stops: <Marker> → <PointAnnotation>
<MapboxGL.PointAnnotation
  key={node.id}
  id={node.id}
  coordinate={[node.coord.longitude, node.coord.latitude]}
>
  <TrackedNodeMarker ... />
</MapboxGL.PointAnnotation>
Remove all tracksViewChanges props — Mapbox handles view invalidation automatically.

Phase 5 — StopsLayer.tsx migration
File: navigo/components/app/StopsLayer.tsx

Replace manual JS grid-clustering + <Marker> with Mapbox native clustering:

<MapboxGL.ShapeSource
  id="stops"
  cluster
  clusterMaxZoom={14}
  clusterRadius={40}
  shape={stopsGeoJson}   // FeatureCollection built from allStops
  onPress={handleSourcePress}
>
  <MapboxGL.CircleLayer
    id="cluster-circles"
    filter={['has', 'point_count']}
    style={{
      circleColor: ['step', ['get', 'point_count'], ORANGE, 10, '#E65100', 50, '#B71C1C'],
      circleRadius: ['step', ['get', 'point_count'], 15, 10, 20, 50, 25],
      circleOpacity: 0.9,
    }}
  />
  <MapboxGL.SymbolLayer
    id="cluster-counts"
    filter={['has', 'point_count']}
    style={{ textField: '{point_count_abbreviated}', textSize: 12, textColor: '#fff',
             textFont: ['DIN Offc Pro Medium'] }}
  />
  <MapboxGL.SymbolLayer
    id="individual-stops"
    filter={['!', ['has', 'point_count']]}
    minZoomLevel={13}
    style={{
      iconImage: ['case', ['==', ['get', 'id'], selectedId], 'stop-selected', 'stop-icon'],
      iconSize: ['interpolate', ['linear'], ['zoom'], 13, 0.4, 16, 0.8],
      iconAllowOverlap: false,
      iconAnchor: 'bottom',
    }}
  />
</MapboxGL.ShapeSource>
Load stop-icon and stop-selected images via MapboxGL.Images at MapView level.

Remove: viewZoom + viewCenter props, manual clustering logic, zoom debounce, bboxFilter pre-filter — all handled by the GL engine.

onPress receives a GeoJSON feature; extract feature.properties.id to find the stop.

Phase 6 — Overlay projections: NavIndicator & ReportLayer
Files: navigo/components/map/NavIndicator.tsx, navigo/components/map/ReportLayer.tsx

// FROM:
const pt = await mapRef.current.pointForCoordinate({ latitude, longitude });
setPos({ x: pt.x, y: pt.y });

// TO:
const [x, y] = await mapRef.current.getPointInView([longitude, latitude]);
setPos({ x, y });
Same swap in ReportLayer's project() method. No other changes to either file.

Phase 7 — Offline tiles
Already covered in Phase 3c. TILE_PATH_TEMPLATE_LIGHT / TILE_PATH_TEMPLATE_DARK from services/offlineTiles.ts are used unchanged — RasterSource accepts the same file:// URL template format as UrlTile.

Phase 8 — LocationPicker in StopDetailsSheet
File: navigo/components/app/StopDetailsSheet.tsx

The LocationPickerModal renders an embedded <MapView provider={PROVIDER_GOOGLE}> with a draggable <Marker>. Replace:

<MapboxGL.MapView style={{flex:1}} styleURL={styleURL}>
  <MapboxGL.Camera
    ref={pickerCameraRef}
    centerCoordinate={[lng, lat]}
    zoomLevel={15}
  />
  <MapboxGL.PointAnnotation
    id="picker-pin"
    coordinate={[pickerCoord.lng, pickerCoord.lat]}
    draggable
    onDragEnd={(e) => {
      const [lng, lat] = e.geometry.coordinates;
      setPickerCoord({ lat, lng });
    }}
  >
    <DestinationPin name="Drop here" />
  </MapboxGL.PointAnnotation>
</MapboxGL.MapView>
Phase 9 — Navigation experience improvements (Mapbox-specific)
These improvements fix the core navigation conflicts and add new capabilities:

9a. linearTo animation mode (via useMapCamera)
Short-duration (≤100ms) setCamera calls use linearTo. Linear interpolation queues cleanly — no snap-back when two calls overlap. This is the primary fix for the Google Maps camera conflict.

9b. 3D buildings during navigation
{navigating && (
  <MapboxGL.FillExtrusionLayer
    id="3d-buildings"
    sourceLayerID="building"
    style={{
      fillExtrusionColor: dark ? '#2C2C2E' : '#D1D5DB',
      fillExtrusionHeight: ['get', 'height'],
      fillExtrusionBase: ['get', 'min_height'],
      fillExtrusionOpacity: 0.7,
    }}
    minZoomLevel={15}
  />
)}
9c. Route progress line gradient (active transit leg)
Use Mapbox lineGradient paint property to gray out the traveled portion:

lineGradient: [
  'interpolate', ['linear'], ['line-progress'],
  0,                '#9CA3AF',   // start: gray (traveled)
  progressFraction, '#9CA3AF',   // up to current position: gray
  progressFraction, routeColor,  // from current position: route color
  1,                routeColor,
]
progressFraction sourced from navState.distanceAlongRoute normalized to 0–1.

9d. Smooth pitch entry/exit
Nav start: animationMode: 'flyTo', duration 800ms, pitch → 45° (walk) / 60° (vehicle). Nav end: pitch → 0°, 600ms easeTo.

9e. MapboxGL.UserLocation
Add <MapboxGL.UserLocation visible={false} /> to keep Mapbox's location manager active, ensuring accurate GPS independent of expo-location where the two conflict.

Phase 10 — New Mapbox-enabled features (post-migration enhancements)
Each is additive and does not affect existing functionality:

Feature	Implementation
Traffic layer	Fetch Google Distance Matrix congestion data → HeatmapLayer on corridors
Stop coverage analysis	Backend /network/coverage GeoJSON → FillLayer colored by stop density
Isochrone zones	Mapbox Isochrone API → semi-transparent FillLayer, toggled via mapLayersStore
Native compass + scale	<MapboxGL.Compass /> + <MapboxGL.ScaleBar /> replace current heading display
Files modified
File	Change
navigo/package.json	Add @rnmapbox/maps
navigo/app.config.js	Add @rnmapbox/maps plugin, remove react-native-maps plugin reference
navigo/app/_layout.tsx	MapboxGL.setAccessToken(...) at boot
navigo/lib/map_style.json	Replace Google style JSON → Mapbox style URL
navigo/lib/map_style_dark.json	Same
navigo/hooks/useMapCamera.ts	Full rewrite: animateCamera → setCamera, fitToCoordinates → fitBounds
navigo/app/(tabs)/map.tsx	MapView swap, add cameraRef, region handler updates, UrlTile → RasterSource, coord order fixes
navigo/components/map/RouteOverlay.tsx	<Polyline> → ShapeSource+LineLayer, <Marker> → PointAnnotation, remove tracksViewChanges
navigo/components/app/StopsLayer.tsx	Full rewrite: JS clustering removed, native ShapeSource clustering + SymbolLayer
navigo/components/map/NavIndicator.tsx	pointForCoordinate → getPointInView, coord order fix (2 lines)
navigo/components/map/ReportLayer.tsx	pointForCoordinate → getPointInView, coord order fix (2 lines)
navigo/components/app/StopDetailsSheet.tsx	LocationPickerModal: MapView swap + draggable PointAnnotation
Unchanged: all hooks except useMapCamera, all stores, all services, all bottom sheets except StopDetailsSheet's picker, NavIndicator logic (only API swap), ReportLayer logic (only project() method), navigationEngine.ts.

Execution order
Phase 0 — Install + native build (prerequisite; blocks everything else)
Phase 1 — Map styles (5 min; enables visual testing immediately)
Phase 2 — useMapCamera.ts rewrite (30 min; foundational for all camera work)
Phase 3 — map.tsx MapView swap (1 h; first working Mapbox render)
Phase 4 — RouteOverlay.tsx (1 h; routes visible on Mapbox)
Phase 5 — StopsLayer.tsx (45 min; stops cluster natively)
Phase 6 — NavIndicator + ReportLayer projection fix (15 min)
Phase 8 — StopDetailsSheet location picker (30 min)
Phase 9 — Navigation enhancements (1 h; 3D buildings, line gradient, smooth pitch)
Total estimated effort: ~6 hours of focused implementation.

Verification checklist
 Map renders with Mapbox tiles online — no Google watermark
 Dark mode switches style correctly
 Route polylines render; walk legs dashed; traveled portion grayed via line-gradient
 Boarding/alighting node markers animate (pulse) correctly
 Stop pins appear at zoom ≥ 13; cluster correctly at lower zoom
 Tapping a cluster does not crash; tapping an individual stop opens StopQuickCard
 Navigation starts: camera locks to user, pitch applies, heading-up mode active
 Nav camera runs at 130ms with no snap-back or jitter on Android
 Heading-up ↔ north-up toggle via compass press works
 Offline mode: Mapbox raster tiles render from filesystem; no Google tiles visible
 Long-press dropped pin appears; reverse geocode label populates
 Report layer pins project to correct screen positions during pan/zoom
 NavIndicator dot tracks user position smoothly; cone rotates with heading
 StopDetailsSheet location picker: pin is draggable; coordinates update
 3D buildings appear at zoom ≥ 15 when navigating with pitch > 0
 No react-native-maps import remains in any migrated file