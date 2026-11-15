# MAP.md — Deep Analysis: Map Screen & Navigation System

> **Files covered:** `app/(tabs)/map.tsx` · `hooks/useNavigation.ts` · `services/navigationEngine.ts` · `services/voiceGuide.ts` · `services/backgroundLocation.ts` · `hooks/useRouteOverlay.ts` · `hooks/useMapCamera.ts` · `hooks/useHeadingTracker.ts` · `components/map/RouteOverlay.tsx` · `components/map/RouteMarkers.tsx` · `components/map/NavIndicator.tsx` · `components/map/ReportLayer.tsx` · `components/app/StopsLayer.tsx` · `components/map/types.ts`

---

## 1. System Overview

The Navigo map system is built around three design philosophies:

### 1.1 Projection-Based Navigation
Rather than checking "is user close to waypoint N?", the `NavigationEngine` projects the user's GPS coordinate onto the full route polyline to get a single authoritative `distanceAlongRoute` scalar. All navigation metrics (step index, ETA, bearing, off-route) derive from this number. This makes the system robust against GPS noise (5–15 m typical drift) and eliminates false step-skipping.

### 1.2 Overlay-Above-Map Pattern
Android's `PROVIDER_GOOGLE` rasterizes custom `<Marker>` views to bitmaps during tile reloads. The bitmaps are recycled and the new view is never pushed → markers vanish mid-session. To avoid this, two critical overlays — **NavIndicator** (user dot + cone) and **ReportLayer** (incident pins) — are rendered as React Native `<View>` components positioned *above* the `<MapView>`, using `pointForCoordinate()` to convert map coordinates to screen coordinates at 20 Hz.

### 1.3 Sensor Fusion for Heading
The camera heading is not purely GPS-course and not purely magnetometer. It uses a **GPS anchor pattern**: every 2.5 s the latest GPS course is used as the anchor, and the compass delta since that anchor is added in real-time. This gives smooth heading updates at compass frequency (12 Hz) without the GPS-course lag (1 Hz).

### 1.4 EMA Smoothing
Every position, speed, and heading value that feeds the map camera goes through an Exponential Moving Average filter, preventing jittery renders from raw GPS noise.

### Dependency Graph

```
map.tsx
 ├── useNavigation.ts          ← Navigation lifecycle hook
 │    ├── NavigationEngine     ← Projection math
 │    ├── voiceGuide           ← TTS announcements
 │    ├── backgroundLocation   ← GPS subscription
 │    └── navSessionStore      ← Session persistence
 │
 ├── useRouteOverlay           ← Route visual data (legs, markers, steps)
 ├── useMapCamera              ← MapView animation wrapper
 ├── useHeadingTracker         ← Compass sensor → headingStore
 │
 ├── journeyStore              ← Active journey (fromLoc, toLoc, route)
 ├── headingStore              ← Live compass heading (imperative, no re-renders)
 ├── mapLayersStore            ← Layer toggles (reports on/off)
 ├── networkStore              ← Online/offline state
 ├── offlineMapStore           ← Offline tile pack metadata
 ├── savedStore                ← Saved journeys (for isSaved check)
 ├── prefsStore                ← Nav hints, map app, units, navView
 └── authStore                 ← isAuthenticated (for SaveWall, OfflineNotice)
```

---

## 2. Map Layers (Bottom to Top)

The map screen composes 7 layers. Layers 1–5 are rendered inside `<MapView>` (native). Layers 6–7 are React Native `<View>` components positioned via `StyleSheet.absoluteFill` above the map, immune to Android provider lifecycle bugs.

---

### Layer 1 — Google Base Map + Custom Style

| | |
|---|---|
| **Component** | `<MapView provider={PROVIDER_GOOGLE} customMapStyle={mapStyle}>` |
| **File** | `map.tsx`, `lib/map_style.json` |
| **Update triggers** | `region` state on `onRegionChange`; `mapReady` state |

**Custom style (`map_style.json`):**
- All POI pins hidden (`poi` visibility: off) → clean canvas
- Park geometry and labels kept visible
- Transit station symbols hidden (avoids confusion with app's custom stop pins)

**Performance:** Native layer; zero JS rendering cost. Style is a JSON constant at module level in map.tsx and passed once on mount.

---

### Layer 2 — Offline Raster Tiles (UrlTile)

| | |
|---|---|
| **Component** | `<UrlTile urlTemplate={...} maximumZ={16} />` |
| **File** | `map.tsx` ~line 600 |
| **Condition** | Rendered only when `offlinePack` is set AND `!isOnline` |

Uses Mapbox Streets raster tiles pre-downloaded to `{documentDirectory}/offline_tiles/{light|dark}/{z}/{x}/{y}.png` by `services/offlineTiles.ts`. Tiles are served from local filesystem via a `file://` URL template.

**Zoom range:** z12–z16 (covers walking granularity). Below z12, base map tiles would be needed — offline mode degrades gracefully to blank tiles at wider zoom.

---

### Layer 3 — RouteOverlay

| | |
|---|---|
| **Component** | `<RouteOverlay walkLegs transitLegs nodeMarkers locMarkers intermediateStops ...>` |
| **File** | `components/map/RouteOverlay.tsx`, `components/map/RouteMarkers.tsx` |
| **Update triggers** | Any change to `walkLegs`, `transitLegs`, `nodeMarkers`, `locMarkers`, `intermediateStops`, `boardingNodeId`, `currentStepIndex`, `currentWalkLegIdx`, `userLat/Lng` |

**Sub-elements:**

| Sub-element | Component | Style |
|-------------|-----------|-------|
| Walking legs | `<Polyline>` | 3 dp, dashed `[6,5]`, grey `#8E8E93` |
| Transit legs | `<Polyline>` | 5 dp, solid, route color, geodesic |
| Past walk legs | `<Polyline>` | Same, 20% opacity |
| Past transit legs | `<Polyline>` | Same color, 28% opacity, z=1 |
| Upcoming transit legs | `<Polyline>` | Full opacity, z=2 |
| Intermediate stops | `<Marker>` + `<IntermediateStopDot>` | 13×13 dp squares, route color, projected onto polyline |
| Board/alight nodes | `<TrackedNodeMarker>` | 30 dp colored circles, matatu icon |
| Origin | `<Marker>` + `<SquarePin isStart>` | 20×20 dp orange square |
| Destination | `<Marker>` + `<DestinationPin>` | Black square + label pill |

**Active walk leg trimming:** During navigation, `trimPolylineAhead(userLat, userLng, walkLeg.coords)` clips the polyline behind the user so the grey dashed line only extends forward — prevents visual confusion of "where I've been."

**`TrackedNodeMarker` pulse animation:** When `isBoardingStop=true`, an `Animated.Value` loops `1 → 2.2 → 1` at 850 ms with opacity `0.55 → 0` as scale grows. `tracksViewChanges` stays `true` while pulsing (forces native re-read every frame), then turns `false` once boarding is complete.

---

### Layer 4 — StopsLayer

| | |
|---|---|
| **Component** | `<StopsLayer allStops stops viewCenter viewZoom selected onPress>` |
| **File** | `components/app/StopsLayer.tsx` |
| **Update triggers** | `allStops` array, `viewZoom`, `viewCenter`, `selected` |

**Clustering algorithm (zoom-adaptive cell size):**

| Zoom | Cell size | Viewport radius |
|------|-----------|-----------------|
| ≥ 16 | 0 (no cluster) | 550 m |
| ≥ 15 | 0.002° (~220 m) | 900 m |
| ≥ 14 | 0.004° (~440 m) | 1400 m |
| < 14 | 0.008° (~880 m) | 2000 m |

Two-stage filter: bounding-box check (fast) → haversine distance check (exact). Then O(n) grid clustering via `Map<"latCell,lngCell", Stop[]>` with centroid averaging.

**Cluster rendering:** Size scales by count (30/38/46 dp for ≤10/10–50/≥50). Individual markers use 18×18 px matatu icon with `tracksViewChanges` off after image load. Selected stop always rendered at 30×30 px and `zIndex: 99`. Entire result is `useMemo`-d.

---

### Layer 5 — Dropped Pin Marker

| | |
|---|---|
| **Component** | `<Marker>` with orange pin image |
| **File** | `map.tsx` |
| **Condition** | `dropPin !== null` (set on long-press or "Drop pin" button) |

Simple single-marker layer. Triggers location search on press via `StopService.getNearbyStops()` and opens `StopQuickCard`.

---

### Layer 6 — ReportLayer (RN View Overlay)

| | |
|---|---|
| **Component** | `<ReportLayer reports={reports} mapRef={mapRef} regionVersionRef={regionVersionRef} onPress={...}>` |
| **File** | `components/map/ReportLayer.tsx` |
| **Why overlay?** | Android PROVIDER_GOOGLE rasterizes custom Marker views during tile reload → pins disappear |

**Clustering (O(n²) with recency bias):** Groups reports within 30 m of each other. Newest report per cluster is the "primary." Cluster count shows on badge (capped at "9+").

**Projection pattern:**
```
50ms tick (20 Hz):
  if (regionVersionRef.current === lastVer) return  ← short-circuit if map hasn't moved
  pts = await Promise.all(groups.map(g => map.pointForCoordinate(...)))
  if (all pts non-null) → setState(pts); lastVer = regionVersionRef.current
```

`map.tsx` bumps `regionVersionRef` (a ref, not state) inside `onRegionChange`. This triggers ReportLayer to re-project on the next tick without causing a full map re-render.

**Report type → icon/color mapping:**

| Type | Icon | Color |
|------|------|-------|
| traffic_jam | car | `#FF6F00` |
| accident | alert-circle | `#FF3B30` |
| road_blocked | close-circle | `#FF2D55` |
| stage_queue | people | `#FF9500` |
| police_check | shield | `#007AFF` |
| flooded_route | water | `#5856D6` |
| breakdown | build | `#AF52DE` |
| security | alert | `#D32F2F` |
| fare_hike | trending-up | `#30B050` |

---

### Layer 7 — NavIndicator (RN View Overlay)

| | |
|---|---|
| **Component** | `<NavIndicator lat lng navigating isWalking mapRef headingStoreSelector>` |
| **File** | `components/map/NavIndicator.tsx` |
| **Same override reason** | Android PROVIDER_GOOGLE — same as ReportLayer |

**Three rendering modes:**

| Mode | Trigger | Position | Visual |
|------|---------|----------|--------|
| Explore | Not navigating | `pointForCoordinate()` at 20 Hz | Orange radial cone + dot |
| Walk Nav | Navigating, speed ≤ 4 m/s | `pointForCoordinate()` at 20 Hz | Cone points up (forward) |
| Vehicle Nav | Navigating, speed > 4 m/s | Pinned to screen center (60%, SH×0.6) | White chevron, orange border |

**Performance trick:** In nav mode, the heading selector returns a constant `0` instead of the live compass value. This means `headingStore` updates (12 Hz) don't cause NavIndicator re-renders during navigation. The cone simply always points up in walk mode, and is hidden in vehicle mode.

Canvas is 120×120 dp. Dot is 14 dp circle + 2.5 dp border. Cone is a radial gradient with 28° half-angle, 52 dp radius, fading opacity (0.65 → 0.25 → 0).

---

## 3. map.tsx — Function & State Reference

### 3.1 State Variables (33+)

| Variable | Type | Purpose |
|----------|------|---------|
| `dropPin` | `{lat,lng}\|null` | Long-press / "drop pin" coordinate |
| `selectedStop` | `Stop\|null` | Tapped stop (shows StopQuickCard) |
| `nearestOpen` | `boolean` | NearestStopsSheet open state |
| `showIntermStop` | `IntermediateStop\|null` | Tapped intermediate stop info card |
| `navBarVisible` | `boolean` | Whether nav instruction banner shows |
| `followUser` | `boolean` | Camera locked to user position |
| `mapReady` | `boolean` | MapView `onMapReady` has fired |
| `region` | `Region` | Current visible map region |
| `regionVersion` | `number` | Incremented on pan/zoom (for ReportLayer) |
| `reports` | `TransitReport[]` | Live incident reports in viewport |
| `reportReqId` | `number` | Latest-wins dedup ID for report fetches |
| `gpsLost` | `boolean` | GPS signal absent > 8 s |
| `speed` | `number` | EMA-smoothed speed in m/s |
| `heading` | `number` | EMA-smoothed direction 0–360° |
| `userLat / userLng` | `number` | EMA-smoothed GPS position |
| `navigating` | `boolean` | Navigation mode active |
| `stepIndex` | `number` | Current step from NavigationEngine |
| `currentWalkLegIdx` | `number` | Active walk leg index (−1 = not walking) |
| `boardingNodeId` | `string\|null` | Stop ID pulsing in RouteOverlay |
| `etaSecs` | `number` | ETA in seconds (from engine) |
| `distRemM` | `number` | Distance remaining in meters |
| `approachPhase` | `'far'\|'near'\|'imminent'` | Current approach phase |
| `offrRoute` | `boolean` | Engine reports off-route |
| `stepsLeft` | `number` | Remaining stops on current transit leg |
| `lastStopName` | `string\|null` | Most recently passed stop name |
| `navInstruction` | `string` | Current turn-by-turn text |
| `snappedLat / snappedLng` | `number` | Route-projected position for NavIndicator dot |
| `tripStatus` | `TripStatus` | IDLE / WAITING_FOR_BUS / IN_TRANSIT / ARRIVED |
| `showStopDetails` | `boolean` | StopDetailsSheet visibility |
| `nearestStops` | `Stop[]` | Nearby stops for NearestStopsSheet |

### 3.2 Key Refs

| Ref | Purpose |
|-----|---------|
| `mapRef` | MapView instance for camera and coordinate projection |
| `engineRef` | NavigationEngine instance (persists across renders) |
| `navSessionRef` | Latest session data (for background save without closure) |
| `fetchingRouteRef` | Guards deep-link route fetch (prevent double-fetch) |
| `restoredRef` | One-shot guard for session restore on cold start |
| `reportReqIdRef` | Latest-wins counter for debounced report fetches |
| `regionVersionRef` | Bumped on pan/zoom; read by ReportLayer (avoids state update) |
| `lastRegionRef` | Last fetched region (dedup for stop/report API calls) |
| `interpolIdRef` | ID of active interpolation timer |
| `deadReckIdRef` | ID of active dead-reckoning timer |

### 3.3 Camera Interval (130 ms)

Runs every 130 ms when `navigating && followUser`. Pipeline:

```
1. Read smoothed lat/lng (already EMA'd by handleLocationUpdate)
2. Read heading from headingStore.getState() (imperative — no re-render)
3. Compute speed-adaptive zoom:
     speed < 2 m/s   → zoom 17.5 (walking, tight)
     speed < 8 m/s   → zoom 16.5 (slow vehicle)
     speed ≥ 8 m/s   → zoom 15.5 (fast vehicle)
4. Apply forward offset (shift map center ahead of user):
     offset = sin/cos(heading) × speed_factor × sheet_offset_divisor
     (sheet_offset_divisor changes when JourneyDetailsSheet is open)
5. Heading dead-zone: skip camera update if |Δheading| < 2°
6. navView === 'tilted': pitch = 45°, else pitch = 0°
7. animateTo({ center, zoom, heading, pitch }) via useMapCamera
```

### 3.4 handleLocationUpdate (~200 lines)

Called by `useNavigation` on every GPS update. Pipeline:

```
1.  EMA position smoothing (α varies by mode: 0.25 walk, 0.40 transit)
2.  EMA speed smoothing (α=0.35)
3.  Route snapping: if within 45m of route, blend dot toward polyline
      blend = clamp((dist − 30) / 15, 0, 1)  [30–45m blend zone]
4.  NavigationEngine.update() → EngineResult
5.  Update state: stepIndex, distRemM, etaSecs, approachPhase, stepsLeft,
      lastStopName, boardingNodeId, navInstruction, snappedLat/Lng
6.  Off-route check: if status === 'off_route' && !alreadyRerouting → reroute()
7.  Step change detection: compare prevStepIdx vs new stepIndex
      → if changed: urgentAnnounce(), advance currentWalkLegIdx
8.  Arrival: if status === 'arrived' → setTripStatus(ARRIVED), stopNav()
9.  Approach haptics: if phase changed → expo-haptics impact
10. VoiceGuide.buildAnnouncement() → announce if not already said
11. Alight warning: if stepsLeft === 2 → scheduleAlightWarning()
12. Wrong direction: if bearing diff > 135° for 3s → warn
13. Session save: navSessionStore.save() via ref (not closure)
14. Boarding detection: if tripStatus === WAITING_FOR_BUS && speed > 1.5 m/s
      → setTripStatus(IN_TRANSIT)
```

### 3.5 Report Fetch

```
onRegionChangeComplete → debounce 400ms → increment reportReqIdRef
  → fetch getReportsInViewport(bbox)
  → if reqId !== reportReqIdRef.current: discard (stale)
  → else: setReports()
```

The `reportReqId` **ref** (not state) is the latest-wins token. Old in-flight fetches check their captured `myId` against `reportReqIdRef.current` before calling `setReports()`.

Additionally, `regionVersionRef.current++` happens on every `onRegionChange` (not just complete) to trigger ReportLayer reprojection immediately.

### 3.6 Stale-While-Revalidate (Stops)

```
On mount:
  1. Check CacheService "stops_all" (24h TTL)
  2. If hit: setAllStops(cached) immediately (instant render)
  3. Fire background network fetch regardless
  4. On network response: update state + update cache
  5. In-flight dedup via module-level Promise ref (dedupedGet)
```

### 3.7 Deep Link Restore

A `useEffect` watches `useLocalSearchParams()` for `fLat/fLng/tLat/tLng/fName/tName`. On first match, `fetchingRouteRef.current = true` is set to prevent simultaneous session restore from running. Route is calculated, journey is set, and `fetchingRouteRef` is cleared. `restoredRef` prevents re-running on subsequent renders.

---

## 4. useNavigation.ts — Function Reference

### 4.1 EMA Smoothing

All raw GPS values are filtered before use:

```
positionAlpha = tripStatus === IN_TRANSIT ? 0.40 : 0.25   (transit uses more recent GPS)
speedAlpha    = 0.35
headingAlpha  = 0.30  (compass, inside useHeadingTracker)

smoothLat = prevLat * (1 - α) + rawLat * α
```

Circular EMA for heading (handles 0/360 wraparound):
```
delta = ((raw - prev + 540) % 360) - 180
smooth = (prev + α * delta + 360) % 360
```

### 4.2 Sensor Fusion

```
Every 2.5s: anchorHeading = latestGpsCourse; anchorCompass = currentCompass
Every frame: heading = anchorHeading + (currentCompass - anchorCompass)
```

This gives real-time heading at compass frequency (12 Hz) using GPS course for absolute reference. Eliminates GPS course lag on slow curves.

### 4.3 Position Interpolation (300 ms)

Between 1 Hz GPS fixes, the app interpolates the user's position:
```
every 300ms:
  lat += sin(heading) * speed * 0.3
  lng += cos(heading) * speed * 0.3 / cos(lat * π/180)
  → update map dot position (visual only, not fed to engine)
```

Engine only receives real GPS fixes. Interpolation is purely cosmetic for smooth dot movement.

### 4.4 Dead Reckoning

If GPS is absent > 8 s:
```
every 1s:
  engine.deadReckon(lastSpeed, 1.0)  ← advance high water mark
  → extrapolate position by speed × heading
  → gpsLost = true (triggers red pill UI)
```

Clears when next real GPS update arrives.

### 4.5 Background Location

```
startBackgroundTracking() → Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
  accuracy: Balanced,
  timeInterval: 3000,
  distanceInterval: 5,
  showsBackgroundLocationIndicator: true,
  foregroundService: { notificationTitle: "Navigo Navigation", color: "#FF6F00" }
})
```

Updates arrive via `DeviceEventEmitter.addListener(BACKGROUND_LOCATION_TASK, handleLocationUpdate)`.

### 4.6 Session Restore

On cold start, `restoredRef.current` is `false`. A one-shot `useEffect` runs:
```
1. navSessionStore.restore() → session | null
2. If valid (< 2h old, same route):
   a. setJourney(session.fromLoc, session.toLoc, session.route)
   b. setTripStatus(session.tripStatus)
   c. setStepIndex(session.stepIndex)
   d. Construct NavigationEngine from route
   e. engine.restore(session.highWaterMark, session.engineStrikes)
3. restoredRef.current = true
```

`fetchingRouteRef` is checked first — if a deep-link is being processed, session restore is skipped.

---

## 5. NavigationEngine — Algorithm Reference

### 5.1 Constructor

```
1. Deduplicate consecutive identical coordinates
2. Compute segment lengths: segLen[i] = haversine(coords[i], coords[i+1])
3. Compute cumulative distances: cumDist[i] = sum(segLen[0..i-1])
4. totalDistM = sum(all segLen)
5. For each NavStep: find closest polyline offset (step.offset)
6. For each stop in each step: find closest polyline offset
```

### 5.2 update(lng, lat, speedMps, currentStepIndex) → EngineResult

```
1. Project user onto polyline (local search window: 150m back, 500m ahead)
   If projection error > 100m: fallback to full polyline scan
2. Advance high water mark: max(hwm, projectedOffset - 2m threshold)
3. Off-route: if dist_to_route > 45m → strike++
              if dist_to_route ≤ 45m → strike = 0
              if strikes ≥ 3 → status = 'off_route'
4. Step advancement: scan remaining steps forward from currentStepIndex
   if hwm ≥ step.offset - STEP_REACH_M (18m) → advance step
5. ETA: for remaining steps, sum scheduled durations (transit) or
        compute from distance / max(speed, WALK_SPEED_MPS=1.4) (walk)
6. Approach phase:
   distToNextStep < 100m → 'imminent'
   distToNextStep < 300m → 'near'
   else → 'far'
7. Return EngineResult { status, stepIndex, distRemM, etaSecs, approachPhase,
                          routeBearing, distToRoute, lastPassedStopName, ... }
```

### 5.3 restore(highWaterMark, strikes)

Loads persisted session state so engine continues from where it left off after a cold restart.

### 5.4 deadReckon(speedMps, elapsedSecs)

```
advance = speedMps * elapsedSecs
highWaterMark = min(highWaterMark + advance, totalDistM)
```

---

## 6. VoiceGuide

### Functions

| Export | Purpose |
|--------|---------|
| `announce(text)` | Speak; if speaking, queue as pending (depth-1 queue) |
| `urgentAnnounce(text)` | `Speech.stop()` immediately, then speak |
| `stop()` | Halt all speech, clear pending |
| `buildAnnouncement(phase, step, distM, hints)` | Format cue text; respects `navHints` pref (`off`/`concise`/`detailed`) |
| `phaseKey(stepIndex, phase)` | `"${stepIndex}-${phase}"` dedup key for caller |
| `niceDistance(m)` | `"120 metres"` or `"0.3 kilometres"` |

**Queue:** At most one pending item. A new `announce()` replaces pending. `urgentAnnounce()` interrupts mid-speech. Audio mode (`setAudioModeAsync`) is set up lazily on first call and cached as a promise.

---

## 7. Supporting Hooks

### 7.1 useRouteOverlay

Translates `activeJourney.route` into renderable data for `RouteOverlay` and turn-by-turn steps for `RouteStepsList`.

**Returns:** `{ walkLegs, transitLegs, nodeMarkers, locMarkers, intermediateStops, steps, routeInfo, routeLoading }`

**Internal `build()` function:**
```
1. Extract WALK segments → walkLegs (raw coords)
2. Extract non-WALK segments → transitLegs (with route color)
3. From each transit segment: nodeMarkers (board/alight circles)
4. From each transit segment: intermediateStops (middle stops, projected onto polyline)
5. From all segments: steps[] (walk instructions + "Board"/"Alight" steps)
6. Call camera.fitCoordinates() once on first segment coords
7. Batch 8 setters: setWalkLegs(), setTransitLegs(), ...
```

**Known inefficiency:** The 8 separate `useState` setters fire 8 synchronous re-renders instead of 1.

### 7.2 useMapCamera

Thin memoized wrapper:
- `animateTo({ center, zoom, pitch, heading, duration? })` → `mapRef.current.animateCamera()`
- `fitCoordinates(coords, padding?, animated?)` → `mapRef.current.fitToCoordinates()`

Returns a stable object (memoized with `useMemo`) so it's safe to add to effect dependency arrays.

### 7.3 useHeadingTracker

```
Location.watchHeadingAsync() → raw heading events at ~100 Hz
  → throttle to 80ms (12 Hz)
  → circularEMA(prev, raw, α=0.2)
  → headingStore.getState().setHeading(smoothed)
```

Never uses a React selector — updates the store imperatively. No component re-renders triggered.

---

## 8. Zustand Stores — Map Screen Impact

| Store | Key Fields Read by map.tsx | Subscription | Re-render Impact |
|-------|---------------------------|--------------|-----------------|
| `journeyStore` | `activeJourney`, `tripStatus`, `clearJourney` | 3 selectors | Full map re-render on journey change |
| `headingStore` | `heading` | `getState()` imperative only | **Zero re-renders** (by design) |
| `mapLayersStore` | `layers.reports` | 1 selector | Map re-render on layer toggle |
| `networkStore` | `isOnline` | 1 selector | UI re-render (OfflineNotice) |
| `offlineMapStore` | `pack` | 1 selector | UI re-render (tile source) |
| `savedStore` | `journeys` | 1 selector + useMemo | UI re-render (save state badge) |
| `prefsStore` | `prefs` | 1 selector | UI re-render + closure read in camera |
| `authStore` | `isAuthenticated` | 1 selector | UI re-render (SaveWall) |

**`headingStore` design pattern** is the standout: by only using `getState()` imperative reads inside the camera interval (never a React selector), compass updates at 12 Hz cause zero component re-renders. This is the correct pattern for high-frequency sensor data.

---

## 9. Current Issues & Bottlenecks

### Critical

**C1 — 8→10 re-renders on every `setJourney()` call**
`useRouteOverlay` has 8 separate `useState` hooks. When `activeJourney` changes, `build()` fires all 8 setters synchronously → 8 React re-renders → map.tsx + RouteOverlay re-render each time. Estimated 10–15 total re-renders for a single route selection.
> `hooks/useRouteOverlay.ts` — the 8 individual `useState` declarations

**C2 — NavIndicator and ReportLayer run 20 Hz polling unconditionally**
Both use `setInterval(fn, 50)` to poll `pointForCoordinate()` regardless of whether the map has moved. During idle (user reading info), this fires 40 calls/second with no work to do.
> `components/map/NavIndicator.tsx`, `components/map/ReportLayer.tsx`

**C3 — Camera interval captures `prefs.navView` in stale closure**
The camera `setInterval` callback captures `prefs` at setup time. If the user changes `navView` from flat → tilted mid-navigation, the camera won't switch for up to 130 ms per tick, and in practice never until the effect re-runs.
> `map.tsx` camera interval

**C4 — Approach phase has no hysteresis**
`PHASE_NEAR_M = 300`, `PHASE_IMMINENT_M = 100` are hard thresholds. GPS jitter of 5–10 m near these boundaries causes the phase to oscillate, re-triggering the same voice announcement multiple times.
> `services/navigationEngine.ts`

**C5 — `TrackedNodeMarker` pulse animation may not clean up**
The `Animated.loop().start()` in `TrackedNodeMarker` has no reference stored. If `isBoardingStop` toggles rapidly (e.g. reroute during boarding), a second loop starts before the first is stopped → memory accumulation.
> `components/map/RouteMarkers.tsx`

### Performance

**P1 — `journeyStore.updateRoute()` always creates a new object reference**
Every call spreads `activeJourney` into a new object, making all `activeJourney` subscribers re-render even if the actual route data is identical. This happens on every reroute attempt even if OTP returns the same route.

**P2 — `useRouteOverlay` has `camera` in its dependency array**
`camera` is a memoized object from `useMapCamera`, but if `mapRef` changes (unlikely post-mount), the entire `build()` function re-runs — re-parsing the route, re-projecting all stops, firing all 8 setters.

**P3 — O(n²) `StopsLayer` clustering**
Even with viewport pre-filtering, the inner loop checks every stop against every other for clustering. Dense areas (e.g. CBD with 200+ stops in 1 km²) cause 40,000 comparisons per zoom change.

**P4 — `projectOntoPolyline` called per-stop with no caching**
For each intermediate stop, the full segment array is scanned (O(segments × stops)). For a route with 3 transit legs × 10 stops × 300 coords each = 9,000 distance calculations per route render.

**P5 — Full NavigationEngine polyline scan on tunnel exit**
When GPS jumps > 100 m (tunnel exit, GPS re-acquisition), the local search window misses and the engine falls back to O(all segments) scan. On a long route (500+ coordinate pairs) this is 500 haversine calculations in a single JS frame.

**P6 — ETA recalculates every GPS frame**
`update()` walks all remaining steps to sum durations/distances on every call (1–3 Hz). For a route with 20 steps, that's 20 iterations × 3/s = 60 iterations/second of step iteration that could be cached and only recomputed on step change.

### Architecture

**A1 — `savedStore.customLists` manually managed outside persist middleware**
Custom lists are stored in a separate AsyncStorage key (`"navigo:custom_lists"`), not in the Zustand persist partition. If `addCustomList()` succeeds but the app crashes before the AsyncStorage write completes, the in-memory state and persisted state diverge.

**A2 — `authStore.initialize()` has no concurrent-call guard**
If called twice in rapid succession (e.g. double-mounted component in StrictMode dev), both calls reach the `/auth/me` endpoint. No `initializing: boolean` flag prevents the race.

**A3 — VoiceGuide depth-1 queue loses announcements on rapid maneuvers**
If a user makes two quick turns, the second `announce()` call replaces the pending first announcement. On complex intersections this means the user hears only the second cue and misses the first.

---

## 10. Performance Suggestions

### Camera & Navigation Loop

**#1 — Adaptive camera interval based on speed**
Change the fixed 130 ms interval to 60 ms at speed > 8 m/s (vehicle), 130 ms walking, and pause entirely when JourneyDetailsSheet is fully expanded (map not visible). Saves ~50% CPU during walking navigation.

**#2 — Widen heading dead-zone from 2° to 5°**
At walking speed, GPS heading noise exceeds 5°. The current 2° threshold fires camera updates on every fix. Raising to 5° reduces camera bridge calls by ~60% during walking without perceptible smoothness loss.

**#3 — Cache `prefs.navView` in a ref**
Replace the closure-captured `prefs` with a ref updated via `useEffect`:
```ts
const navViewRef = useRef(prefs.navView);
useEffect(() => { navViewRef.current = prefs.navView; }, [prefs.navView]);
// Inside camera interval: navViewRef.current === 'tilted'
```
Fixes the silent bug where mid-navigation preference changes are ignored.

**#4 — Use Reanimated `withSpring` for camera heading in walk mode**
Offload heading interpolation to the UI thread via `react-native-reanimated`. The JS-thread camera interval then only needs to update the target angle, not animate it frame-by-frame.

**#5 — Add hysteresis bands to approach phase thresholds**
```
Enter NEAR when distance < 300m; exit NEAR when distance > 340m
Enter IMMINENT when distance < 100m; exit IMMINENT when distance > 130m
```
Prevents the oscillation zone from causing repeated announcements in GPS jitter conditions.

**#6 — Pre-compute snapped position in NavigationEngine**
Return `{ snappedLat, snappedLng }` directly from `engine.update()`. Currently map.tsx re-projects the user position onto the route independently. Doing it once in the engine eliminates duplicate work.

**#7 — Skip heading camera update when stationary**
If `speed < 0.5 m/s`, compass noise causes the map to spin even when the user is standing still. Skip heading updates below this threshold: `if (speed < 0.5) delete cameraProps.heading`.

**#8 — Use `InteractionManager.runAfterInteractions` before starting background location**
Starting GPS tracking during route animation causes frame drops. Defer via:
```ts
InteractionManager.runAfterInteractions(() => startBackgroundTracking());
```

**#9 — Reduce EMA alpha when stationary**
When `speed < 0.5 m/s`, reduce position EMA alpha from 0.25 to 0.05. This prevents GPS drift (which can be 10–15 m/s of apparent movement while standing still) from shifting the dot on the map.

**#10 — Pause interpolation when app is backgrounded**
Subscribe to `AppState` changes. When state transitions to `background`, clear the 300 ms interpolation timer. Resume on `foreground` to avoid accumulating phantom position advances during background time.

---

### Route Overlay Rendering

**#11 — Wrap `RouteOverlay` in `React.memo` with shallow leg comparator**
```ts
export default React.memo(RouteOverlay, (prev, next) =>
  prev.walkLegs === next.walkLegs &&
  prev.transitLegs === next.transitLegs &&
  prev.boardingNodeId === next.boardingNodeId &&
  prev.currentStepIndex === next.currentStepIndex
);
```
Prevents RouteOverlay from re-rendering when unrelated map.tsx state changes (e.g. `gpsLost` toggling).

**#12 — Move `trimPolylineAhead()` into NavigationEngine**
Rather than computing trimmed walk leg coordinates inside RouteOverlay's render function, return `trimmedWalkLegCoords` from `engine.update()`. The engine already knows the high water mark offset — trimming is O(n) work that shouldn't happen in a component render.

**#13 — Set `needsRedraw={false}` on past transit legs**
Past transit legs (traveled segments) are static — they never change once a step is completed. Adding `needsRedraw={false}` to completed legs tells the native layer to stop checking them for updates.

**#14 — Cull intermediate stops at low zoom**
Below zoom 14, intermediate stop dots overlap and add native marker cost with no visual value. Apply `zoom >= 14` check before rendering `intermediateStops` map.

**#15 — Combine walk and transit polylines with `strokeColors`**
If consecutive legs are the same color, merge them into a single `<Polyline>` using React Native Maps' `strokeColors` prop. Reduces native layer count on simple direct routes from 4+ polylines to 1.

**#16 — Store animation ref in `TrackedNodeMarker` and cancel on cleanup**
```ts
const pulseRef = useRef<Animated.CompositeAnimation | null>(null);
useEffect(() => {
  if (isBoardingStop) {
    pulseRef.current = Animated.loop(Animated.sequence([...]));
    pulseRef.current.start();
  } else {
    pulseRef.current?.stop();
    pulseRef.current = null;
  }
  return () => pulseRef.current?.stop();
}, [isBoardingStop]);
```

**#17 — Pre-sort `nodeMarkers` in `useRouteOverlay`**
Sort nodeMarkers so the boarding node (which needs `tracksViewChanges`) comes last. Native map layers render in array order — placing the animated marker last ensures it's on top and the static ones can be optimized away by the native layer.

**#18 — Defer intermediate stop projection to `InteractionManager`**
`projectOntoPolyline()` is O(coords) per stop. Wrap the intermediate stop projection loop in `InteractionManager.runAfterInteractions()` so it doesn't block the route display animation.

---

### useRouteOverlay

**#19 — Replace 8 separate `useState` with `useReducer`**
```ts
type RouteState = { walkLegs: WalkLeg[]; transitLegs: TransitLeg[]; nodeMarkers: NodeMarker[]; ... };
const [state, dispatch] = useReducer(routeReducer, initialState);
// In build():
dispatch({ type: 'SET_ALL', payload: { walkLegs, transitLegs, nodeMarkers, ... } });
```
One dispatch = one re-render instead of 8. This is the single highest-impact fix in the codebase.

**#20 — Remove `camera` from the `useEffect` dependency array**
`camera.fitCoordinates()` is called once per route in `build()`. It doesn't need to be a dep that re-triggers full re-parsing. Call it through a ref:
```ts
const cameraRef = useRef(camera);
useEffect(() => { cameraRef.current = camera; }, [camera]);
// Inside build(): cameraRef.current.fitCoordinates(...)
// useEffect deps: [activeJourney] only
```

**#21 — Memoize leg extraction with `useMemo`**
Walk leg and transit leg extraction from segments is deterministic given the route. Extract them with `useMemo` keyed on `activeJourney?.route?.segments`, separate from the step generation logic. Lets you update steps (e.g. on step advance) without re-extracting polyline coordinates.

**#22 — Single-pass intermediate stop projection**
Currently projection runs per-segment. Flatten all intermediate stops across segments first, then run one loop with all projections. Reduces function call overhead.

**#23 — Guard `projectOntoPolyline` against empty coordinates**
```ts
if (!seg.coordinates || seg.coordinates.length < 2) continue;
```
Prevents crash on malformed OTP responses with empty geometry.

**#24 — Cache `build()` result by route ID**
Store the last built result keyed by `route.id` (or a hash of segments). Skip re-parsing if the same route is set twice (e.g. after a store re-hydration cycle).

---

### StopsLayer

**#25 — O(n) spatial hash clustering**
Replace the current O(n²) check with a grid hash:
```ts
const cells = new Map<string, Stop[]>();
for (const stop of stops) {
  const key = `${Math.floor(stop.lat / CELL_DEG)},${Math.floor(stop.lng / CELL_DEG)}`;
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key)!.push(stop);
}
```
O(n) insertion + O(cells) aggregation. For 500 stops this reduces work from 250,000 comparisons to ~500.

**#26 — Early-exit in `dMeters` distance filter**
The bounding-box pre-filter already narrows candidates. Add an early return in the haversine check:
```ts
const dLat = Math.abs(stop.lat - center.lat) * 111320;
if (dLat > radius) return false;  // cheap exit
// only then compute full haversine
```

**#27 — Debounce clustering on zoom change**
Pinch-zoom fires dozens of `onRegionChange` events per second. Wrap the clustering `useMemo` trigger in a debounce:
```ts
const [debouncedZoom, setDebouncedZoom] = useDebouncedValue(viewZoom, 100);
```
Prevents 10+ cluster recalculations during a single pinch gesture.

**#28 — Custom memo comparator for `StopsLayer`**
```ts
React.memo(StopsLayer, (prev, next) =>
  prev.allStops.length === next.allStops.length &&
  Math.abs(prev.viewZoom - next.viewZoom) < 0.3 &&
  prev.selected?.id === next.selected?.id
)
```
Avoids re-clustering on sub-0.3 zoom changes (pan without zoom change).

**#29 — Virtualize the stops list modal with `FlashList`**
When `NearestStopsSheet` renders all nearby stops in a `ScrollView`, off-screen items are fully rendered. Replace with `@shopify/flash-list` for O(1) render count regardless of nearby stop count.

---

### ReportLayer / NavIndicator Polling

**#30 — Replace `setInterval` polling with `onRegionChangeComplete`**
The most impactful change for ReportLayer and NavIndicator: pass a callback that fires when projection should run, instead of polling 20 Hz:
```ts
// map.tsx:
const onMapMoved = useCallback(() => {
  reportLayerRef.current?.project();
  navIndicatorRef.current?.project();
}, []);
<MapView onRegionChangeComplete={onMapMoved} ... />
```
Eliminates the 40 Hz background work during idle states.

**#31 — Implement proper request cancellation for `pointForCoordinate`**
Replace the boolean `busy` flag with a cancellation token:
```ts
let currentToken = 0;
const project = async () => {
  const token = ++currentToken;
  const pts = await Promise.all(groups.map(g => map.pointForCoordinate(g)));
  if (token !== currentToken) return;  // stale
  setPositions(pts);
};
```
Prevents old requests from overwriting newer results on fast map moves.

**#32 — Use `requestAnimationFrame` for NavIndicator updates**
Replace `setInterval(update, 50)` with `requestAnimationFrame`:
```ts
const tick = () => {
  if (!cancelled) {
    project().then(() => rafRef.current = requestAnimationFrame(tick));
  }
};
rafRef.current = requestAnimationFrame(tick);
```
RAF is budget-aware and pauses automatically when the screen is off or the tab is backgrounded.

**#33 — Refcount-based busy guard for ReportLayer**
Replace `let busy = false` with a pending request counter to correctly handle burst projection calls during rapid map movement.

**#34 — Exponential backoff if map not ready**
```ts
let backoff = 50;
const tryProject = async () => {
  if (!mapRef.current) {
    setTimeout(tryProject, backoff = Math.min(backoff * 2, 2000));
    return;
  }
  backoff = 50;  // reset on success
  project();
};
```
Prevents the tight-loop retry pattern on slow device startup.

**#35 — O(n) ReportLayer clustering via spatial hash**
Same approach as StopsLayer suggestion #25 — replace the O(n²) `clusterReports()` with a 30 m spatial hash grid. Particularly impactful during accident/traffic events when report density spikes.

---

### NavigationEngine

**#36 — Step-boundary lookup table for O(1) advancement**
In the constructor, pre-compute:
```ts
this.stepBoundaries = steps.map(step => ({
  enterDist: step.offset - STEP_REACH_M,
  exitDist:  step.offset + STEP_REACH_M * 2,
}));
```
`update()` then does a binary search instead of a linear scan.

**#37 — Spatial grid index for local projection**
Divide the route into 200 m grid cells. Store which segment indices fall in each cell. Local search then only scans segments in the 3×3 grid cells around the user's position — O(1) lookup instead of O(window).

**#38 — Pre-compute and cache segment bearings**
```ts
this.segBearing = coords.slice(0, -1).map((c, i) =>
  Math.atan2(coords[i+1][0] - c[0], coords[i+1][1] - c[1])
);
```
`routeBearing` lookup becomes O(1) instead of recomputing `atan2` every frame.

**#39 — Replace dual EMA with a Kalman filter**
A constant-velocity Kalman filter (position + velocity state vector, GPS noise covariance ~10 m²) would give better position estimates than chained EMAs, especially during GPS dropout recovery. The velocity state also provides a clean speed estimate without a separate EMA.

**#40 — Polyline densification for coarse GTFS shapes**
GTFS data sometimes has straight-line segments > 50 m between stops on curved roads. Detect these in the constructor and insert interpolated midpoints every 20 m. Improves bearing smoothness on turns and reduces the projection error that triggers full-scan fallback.

**#41 — Clamp `speedMps` in `deadReckon()`**
```ts
const clampedSpeed = Math.min(speedMps, 30);  // 108 km/h max
const advance = clampedSpeed * elapsedSecs;
```
Prevents a stale speed value (e.g. last known 120 km/h highway speed) from teleporting the dead-reckoned position by kilometers during a long GPS outage.

**#42 — Add `onStepChange` callback to `NavigationEngine`**
```ts
constructor(coords, steps, { onStepChange }: NavigationEngineOptions) {
  this.onStepChange = onStepChange;
}
// Inside update():
if (newStepIdx !== prevStepIdx) this.onStepChange?.(newStepIdx, prevStepIdx);
```
Removes the need for callers to poll status changes; decouples navigation events from the GPS update frequency.

---

### VoiceGuide

**#43 — Move audio mode setup to app startup**
Call `setAudioModeAsync()` once in `app/_layout.tsx` rather than lazily on first announcement. Eliminates ~30 ms latency before the first cue during navigation start.

**#44 — Priority queue (depth-2) replacing depth-1 queue**
```ts
let _urgentPending: string | null = null;
let _normalPending: string | null = null;

function announce(text, priority: 'urgent' | 'normal' = 'normal') {
  if (priority === 'urgent') _urgentPending = text;
  else _normalPending = text;
  drain();
}
// drain() plays urgent first, then normal
```
Step-change cues (`urgentAnnounce`) preempt approach-phase cues (`announce`) without discarding both.

**#45 — Swahili locale support**
```ts
Speech.speak(text, { language: navHints.locale ?? 'en' })
```
Add a `locale` field to `prefsStore.prefs` with fallback to `'en'`. Nairobi users can receive cues in Swahili where translation strings are available.

---

### Caching & Network

**#46 — Pre-fetch route at walk-leg start**
When `approachPhase === 'imminent'` on the first walk step (user is < 100 m from the bus stop), pre-warm the OTP route cache:
```ts
// In handleLocationUpdate when approaching boarding stop:
if (phase === 'imminent' && stepIndex === 0 && !prefetchedRef.current) {
  prefetchedRef.current = true;
  RouteService.calculateJourney(from, to, { preload: true });
}
```

**#47 — Optimistic stop search results**
Show cached stops immediately when the search query matches anything in `_allStopsCache`, then append/replace with network results. Eliminates the loading spinner for common searches.

**#48 — Background stops refresh on `AppState` active**
```ts
AppState.addEventListener('change', state => {
  if (state === 'active' && Date.now() - lastFetchAt > 6 * 3600 * 1000) {
    StopService.getAllStops({ forceRefresh: true });
  }
});
```
Keeps stop data fresh across multi-day sessions without requiring app restart.

**#49 — Cache decoded polyline coordinates by route hash**
If the backend sends Google Polyline5 strings, decode them once and store the `[lat, lng][]` array keyed by a hash of the encoded string. Skips re-decoding when the same route is fetched after cache expiry.

**#50 — `If-Modified-Since` on stop/report API requests**
Send `If-Modified-Since: {lastFetchAt}` header. The Laravel API can return `304 Not Modified` when data is unchanged, saving bandwidth and parse time.

**#51 — `placeholderData` for Console analytics range changes**
In `AnalyticsPage.tsx`, pass `placeholderData: previousData` to each `useQuery`. When the user switches from 30d → 7d, charts show stale 30d data while 7d loads rather than flashing empty.

---

### Zustand & State

**#52 — Structural equality in `journeyStore.updateRoute()`**
```ts
updateRoute: (route) => set((s) => {
  if (s.activeJourney?.route?.id === route.id) return s;  // skip if same
  return { activeJourney: { ...s.activeJourney!, route } };
}),
```
Prevents re-renders for no-op reroute responses.

**#53 — Use `subscribeWithSelector` in `useHeadingTracker`**
Zustand's `subscribeWithSelector` middleware provides type-safe isolated subscriptions. Currently heading updates use a raw `getState()` call; switching to subscriptions makes the pattern explicit and easier to audit.

**#54 — Consolidate `map.tsx` activeJourney reads into one selector**
```ts
const { activeJourney, tripStatus, clearJourney } = useJourneyStore(
  useShallow((s) => ({ activeJourney: s.activeJourney, tripStatus: s.tripStatus, clearJourney: s.clearJourney }))
);
```
`useShallow` (Zustand utility) does a shallow equality check — prevents re-renders when the same journey object reference is returned.

**#55 — Split `prefsStore` reads into atomic selectors**
```ts
const navView = usePrefsStore((s) => s.prefs.navView);
const navHints = usePrefsStore((s) => s.prefs.navHints);
```
Component only re-renders when `navView` or `navHints` individually change, not on any pref change.

**#56 — `AbortController` for `savedStore.refresh()`**
```ts
refresh: async () => {
  if (pendingAbort) pendingAbort.abort();
  const controller = new AbortController();
  pendingAbort = controller;
  const journeys = await fetchSavedJourneys({ signal: controller.signal });
  ...
}
```
Prevents a slow previous refresh from overwriting a newer one.

**#57 — `initializing` flag in `authStore.initialize()`**
```ts
initialize: async () => {
  if (get().initializing) return;
  set({ initializing: true });
  try { /* ... */ } finally { set({ initializing: false }); }
}
```

---

### General Architecture

**#58 — `React.Profiler` around map screen in dev mode**
```tsx
if (__DEV__) {
  return (
    <Profiler id="MapScreen" onRender={(id, phase, actualDuration) => {
      if (actualDuration > 16) console.warn(`MapScreen slow render: ${actualDuration}ms`);
    }}>
      <MapScreen />
    </Profiler>
  );
}
```
Surfaces re-renders that exceed one frame budget (16 ms).

**#59 — `LayoutAnimation` for `StopQuickCard` entry**
```ts
LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
setSelectedStop(stop);
```
Simpler than `Animated.spring` for a simple show/hide transition, and runs on the UI thread.

**#60 — Parse `map_style.json` once at module level**
```ts
import RAW_STYLE from '@/lib/map_style.json';
const MAP_STYLE = JSON.stringify(RAW_STYLE);  // module-level constant
// Inside component: customMapStyle={MAP_STYLE}
```
Avoids JSON import being re-processed on every MapView mount.

**#61 — Batch `mapRef.current.setCamera()` calls**
If camera properties (heading, center, zoom) are updated at different points in the interval tick, accumulate them into a single object and call `setCamera` once. Avoids multiple native bridge crossings per frame.

**#62 — Replace `RouteStepsList` ScrollView with `FlashList`**
`@shopify/flash-list` virtualizes list items. A 20-step route with expandable sub-steps (~50 items) currently renders everything upfront. FlashList renders only visible rows.

**#63 — `expo-haptics` on step advance**
```ts
// Inside handleLocationUpdate, on step change:
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
```
Subtle feedback when the step index advances — especially useful in noisy environments where audio is missed.

**#64 — Log `NavigationEngine.update()` timing in `__DEV__`**
```ts
if (__DEV__) {
  const t = performance.now();
  const result = this._update(lng, lat, speedMps, stepIdx);
  const elapsed = performance.now() - t;
  if (elapsed > 5) console.warn(`Engine.update slow: ${elapsed.toFixed(1)}ms`);
  return result;
}
```
Surfaces O(n) full-scan events during development before they hit production.

---

## 11. Quick Wins (Implement First)

| Priority | Suggestion | Expected Impact |
|----------|------------|----------------|
| 1 | **#19** — `useRouteOverlay` → `useReducer` | Reduces 8 re-renders to 1 on every route selection |
| 2 | **#30** — Replace ReportLayer/NavIndicator polling with `onRegionChangeComplete` | Eliminates 40 Hz background work during idle |
| 3 | **#5** — Approach phase hysteresis bands | Stops voice announcement oscillation at GPS noise boundaries |
| 4 | **#3** — Cache `prefs.navView` in a ref | Fixes silent pref-change bug during active navigation |
| 5 | **#16** — Store + cancel `TrackedNodeMarker` animation ref | Fixes potential memory leak on rapid reroute |

---

## 12. File Index

| File | Role |
|------|------|
| `app/(tabs)/map.tsx` | Main map screen: all state, camera interval, location handling |
| `hooks/useNavigation.ts` | Navigation lifecycle: GPS, interpolation, dead reckoning, session |
| `services/navigationEngine.ts` | Core projection algorithm, step advancement, ETA, off-route |
| `services/voiceGuide.ts` | TTS queue, announcement formatting |
| `services/backgroundLocation.ts` | GPS subscription, foreground service |
| `hooks/useRouteOverlay.ts` | Route → renderable data translation |
| `hooks/useMapCamera.ts` | MapView camera animation wrapper |
| `hooks/useHeadingTracker.ts` | Compass sensor → headingStore (no re-renders) |
| `components/map/RouteOverlay.tsx` | Polylines, node markers, intermediate stop dots |
| `components/map/RouteMarkers.tsx` | Pin components: SquarePin, DestinationPin, TrackedNodeMarker |
| `components/map/NavIndicator.tsx` | User position dot + directional cone (RN overlay) |
| `components/map/ReportLayer.tsx` | Incident report pins with O(n²) clustering (RN overlay) |
| `components/app/StopsLayer.tsx` | Stop pins with zoom-adaptive clustering |
| `components/map/types.ts` | Shared types + `projectOntoPolyline` utility |
| `components/map/MapLayersSheet.tsx` | Layer toggle bottom sheet |
| `components/map/IntermStopInfoCard.tsx` | Tapped intermediate stop info card |
| `services/offlineTiles.ts` | Offline tile download + local filesystem serving |
| `store/navSessionStore.ts` | Nav session persistence (2h TTL) |
| `store/journeyStore.ts` | Active journey + TripStatus global state |
| `store/headingStore.ts` | Compass heading (imperative-only, no re-render) |
| `lib/map_style.json` | Google Maps custom style (hides POIs, transit stations) |

---

## 13. Navigation UX — Current Issues & Google Maps / Waze Parity Roadmap

> This section was added after device testing revealed four concrete UX regressions in navigation mode. Each issue is root-caused to specific code locations, followed by 30 recommendations for bringing the walking experience to Google Maps quality and the vehicle/transit experience to Waze quality.

---

### 13.1 Root-Cause Diagnosis

---

#### Issue 1 — NavIndicator dot lags behind real movement

**Symptom:** The user position dot visibly trails the user's actual position when moving, especially in vehicle mode. The dot "catches up" in jerks rather than flowing continuously.

**Root cause:** `pointForCoordinate()` is asynchronous — it requires a native→JS bridge round-trip, which takes 10–30 ms on a real device. The NavIndicator polls this every 50 ms (20 Hz). The camera animates for 80 ms per cycle at a 130 ms interval. At any given polling moment the map is mid-animation, so `pointForCoordinate` returns the screen coordinate *for the map's current position mid-animation*, not for where the camera will be when the animation completes. The next poll fires 50 ms later, but by then the map has moved again, and the async result is 10–30 ms stale. The dot is perpetually chasing a moving target.

> `components/map/NavIndicator.tsx` — lines 85–97: the `async update()` + `setInterval(update, 50)` pattern
> `app/(tabs)/map.tsx` — lines 287–369: camera interval runs at 130 ms with 80 ms animation duration

**Consequence in vehicle mode:** Camera moves fast, offset ahead. Dot is not at screen center (it's behind), so the positional error from async lag is visually amplified.

---

#### Issue 2 — Vehicle mode chevron is large and visually messy

**Symptom:** In transit/vehicle mode the white Waze-style chevron occupies 1/3 of the screen width and looks heavy. Its visual direction does not match the user's actual bearing when the map is north-up.

**Root cause 1 (size):** Canvas is `SZ = 120` dp (`components/map/NavIndicator.tsx` line 33). At 360 dp screen width, this is 33% of the screen — twice the size of Google Maps' or Waze's own indicator.

**Root cause 2 (orientation):** The chevron always points strictly UP (line 122–128 — no `transform` applied to the chevron path). In heading-up mode this is correct (camera rotates to face the user). But if the map is north-up and the user is heading East, the chevron points north visually while the user is going right — deeply confusing.

**Root cause 3 (style):** White-gradient fill + orange border + shadow creates a heavy multi-element design. Google Maps uses a single flat blue filled teardrop. Waze uses a single-color filled chevron at ~40–50 dp.

> `components/map/NavIndicator.tsx` lines 33, 52–55, 111–131

---

#### Issue 3 — Map auto-relocks after 5 seconds, fighting the user

**Symptom:** During navigation, if the user pans the map to look ahead (e.g., to preview an upcoming turn), the map snaps back to the user position after 5 seconds. This makes exploration during navigation unusable.

**Root cause:** `useEffect` at `map.tsx` lines 251–258 starts a `setTimeout(() => setFollowMe(true), 5000)` whenever `navigating && !followMe`. This fires regardless of whether the user is still interacting with the map.

```ts
// map.tsx lines 251-258 — the auto-relock timer
useEffect(() => {
  if (!navigating || followMe) {
    if (relockRef.current) { clearTimeout(relockRef.current); relockRef.current = null; }
    return;
  }
  relockRef.current = setTimeout(() => setFollowMe(true), 5000);
  return () => { if (relockRef.current) clearTimeout(relockRef.current); };
}, [navigating, followMe]);
```

The compass/recenter button (`map.tsx` line 712) calls `setFollowMe(true)` explicitly, but the timer fires even when the user never presses it.

---

#### Issue 4 — Bearing is always-on; map constantly rotates

**Symptom:** In navigation mode the map always rotates to face the direction of travel. Even tiny compass twitches (sub-degree noise) cause the map to spin. The user cannot see north-up during navigation. There is no toggle.

**Root cause:** The camera interval unconditionally includes `heading: committed` when the heading delta ≥ 2°:

```ts
// map.tsx lines 365–368
const sendHdg = hdgDelta >= 2.0;
if (sendHdg) lastSentHdgRef.current = committed;
camera.animateTo({
  ...(sendHdg ? { heading: committed } : {}),
  ...
});
```

`committed` is always the sensor-fused heading — there is no north-up mode. The 2° dead-zone helps with micro-jitter but does not address the user's need for a stable north-up map.

---

### 13.2 Fix Proposals

---

#### Fix 1 — Eliminate async lag: compute NavIndicator position synchronously

The camera interval in `map.tsx` already knows every parameter needed to place the dot on screen precisely — without any native call. At the end of the camera tick, compute and broadcast the dot's screen coordinate:

```ts
// Inside camera setInterval (map.tsx ~line 360), after computing centerLat/centerLng:
const userPixelsBehind = netOffsetM / mpp;   // meters ÷ m/px = pixels
// With pitch, the vertical component is foreshortened:
const pitchRad = (pitch * Math.PI) / 180;
const userScreenY = SH / 2 + userPixelsBehind * Math.cos(pitchRad);
const userScreenX = SW / 2;
setNavIndicatorPos({ x: userScreenX, y: userScreenY });   // state or ref, passed as prop
```

In `NavIndicator`, add an optional `fixedPos` prop. When provided (nav mode), skip the `useEffect`/`setInterval`/`pointForCoordinate` entirely:

```ts
// NavIndicator.tsx
export function NavIndicator({ latitude, longitude, mapRef, navigating, isVehicleMode, fixedPos }) {
  const [polledPos, setPolledPos] = useState<{x,y}|null>(null);
  // ... existing polling effect, but only when !fixedPos ...
  const pos = fixedPos ?? polledPos;
  ...
}
```

Result: zero async lag in navigation mode. Position is derived from the same tick that moves the camera — atomically synced.

---

#### Fix 2 — Smaller, cleaner, direction-aware indicator

Reduce canvas from 120 dp to **56 dp** (matching Google Maps walking dot size). Drop the gradient chevron entirely for vehicle mode. Two options:

**Option A (recommended) — Native user location dot:** In vehicle mode, simply set `showsUserLocation={true}` on MapView and hide the custom NavIndicator. React Native Maps' built-in user location indicator is rendered natively, has zero async lag, and is battle-tested. Style via `userLocationAnnotationTitle=""` and the platform default blue dot. No custom rendering needed at all.

**Option B — Slim custom indicator:** Reduce canvas to 56 dp, draw a solid **flat blue** filled circle with white border (walk mode) or a **solid blue filled teardrop** pointing up (vehicle mode, rotated to match `committed` heading). Apply `transform` directly so heading is encoded in the SVG rotation, not the camera.

```ts
// NavIndicator.tsx — vehicle chevron, 56dp canvas, rotated to heading
<Path
  d="M 28 4 L 50 52 Q 28 40 6 52 Z"   // 56dp canvas, scaled path
  fill="#4285F4"                          // Google Maps blue
  transform={`rotate(${committed}, 28, 28)`}
/>
```

Either option eliminates the "big and messy" problem.

---

#### Fix 3 — Remove auto-relock; make compass button the sole re-lock trigger

Delete `map.tsx` lines 251–258 (the `relockRef` / 5-second `setTimeout`). After this change:
- Panning during navigation → `setFollowMe(false)` (already handled at line 482)
- Compass button → `setFollowMe(true)` (already at line 712)
- No timer ever interferes

Additionally, make the compass/recenter button more prominent when `!followMe`: show it with an orange background or "pulsing" border so the user knows follow is disabled and can re-engage it consciously. Google Maps uses a grey compass when map is locked to heading and a blue icon when north-up.

---

#### Fix 4 — North-up default + heading-up toggle via compass button

Add `headingUp` boolean state (`default: false`) to `map.tsx`. Camera interval sends:

```ts
...(followMe && headingUp ? { heading: committed } : followMe ? { heading: 0 } : {}),
```

Compass button behavior:
- **Tap when `!followMe`:** → `setFollowMe(true)`, keep current `headingUp` state (re-center, don't change mode)
- **Tap when `followMe && !headingUp`:** → `setHeadingUp(true)` (engage heading-up; map rotates to face travel direction)
- **Tap when `followMe && headingUp`:** → `setHeadingUp(false)` (back to north-up)

This three-state cycle mirrors Google Maps' compass button behavior exactly. Display:
- `!followMe`: compass icon (unrotated) with orange ring → "tap to re-center"
- `followMe && !headingUp`: north-up arrow (N at top), no ring → "tap for heading-up"
- `followMe && headingUp`: compass rotated to current heading, filled blue → "tap for north-up"

When `headingUp` is active, the sensor fusion heading tracking is already reliable (GPS anchor + compass delta, EMA α=0.88 for walk, 0.75 for vehicle). No additional work needed — the heading quality is already Google Maps grade; it just wasn't user-controllable.

---

### 13.3 — 30 Recommendations: Google Maps Walking + Waze Vehicle Parity

#### Indicator & Camera (6)

**G1 — Synchronous NavIndicator position (from Fix 1)**
Compute screen position from camera tick parameters. Zero async lag. Single highest-impact fix for "dot doesn't follow me" perception.

**G2 — Three-state compass button (from Fix 4)**
North-up → heading-up → free pan, cycled by tapping the compass button. Matches Google Maps UX exactly. State persists per session but resets to north-up on navigation start.

**G3 — Delete the 5-second auto-relock (from Fix 3)**
Panning should be a conscious user action with no forced timeout. Compass button is the only re-lock. Google Maps and Waze both follow this pattern.

**G4 — Speed-sensitive dot size**
Scale the NavIndicator dot between 10 dp (stationary) and 14 dp (moving). Google Maps grows the dot slightly during movement to communicate speed. Implement with a smoothed scale value derived from EMA speed.

**G5 — Accuracy ring around user dot**
Draw a translucent circle around the user dot scaled to `GPS.accuracy` meters. This is the pale blue disc Google Maps shows when accuracy is low (e.g., urban canyon). Reassures users that the dot's position is approximate. Use `pointForCoordinate` to convert accuracy radius to screen pixels OR approximate from zoom+mpp.

**G6 — Dot heading indicator in walk mode**
In walking mode, add a thin directional triangle above the dot (not a full cone) pointing in the direction of travel. Reduce cone to 20° half-angle and 30 dp radius. This matches the compact Google Maps walking indicator.

---

#### Walking UX (8)

**W1 — North-up walking default**
Walking in a city requires landmark recognition. Google Maps defaults to north-up during walking navigation. Implement via Fix 4 (`headingUp = false` by default). No map rotation, streets stay horizontal.

**W2 — Persistent turn-by-turn banner**
The `MapFloatingUI` nav banner already shows the current instruction. Enhance it with: distance badge (e.g., "In 80 m") + maneuver icon (left-arrow, right-arrow) rendered in orange. Currently the distance is not shown prominently on the banner.

**W3 — Pre-announcement "in 500 m"**
Add a `PHASE_ANNOUNCE_M = 500` threshold before `PHASE_NEAR_M = 300`. Trigger a background voice cue at 500 m so the user is primed. Google Maps uses a 3-stage system: 500 m → 200 m → 30 m.

**W4 — Sub-step progress rail**
Below the current instruction, show a horizontal progress rail: small dots for each sub-step (turn within a walk segment). Completed sub-steps are filled orange, remaining are grey. Gives the user a sense of progress within a walk leg.

**W5 — Maneuver preview card (next step)**
When within 200 m of a turn, show a small preview of the NEXT step below the current instruction ("then turn right"). Google Maps shows this as a secondary row in the banner.

**W6 — "Arrived" micro-interaction**
On arrival, the banner should morph into a full-width green card with a checkmark animation and the destination name. Current implementation calls `setTripStatus(ARRIVED)` but the UX feedback is minimal. Add a 1.5s celebration animation before clearing the journey.

**W7 — Step-advance haptic feedback (#63 from Section 10)**
`Haptics.impactAsync(ImpactFeedbackStyle.Light)` on every step index change. Tactile confirmation that the app recognized the turn — especially useful with earbuds when audio is missed.

**W8 — Off-route UX — prominent red banner**
Current off-route state sets `offrRoute = true` and the `MapFloatingUI` shows a red banner, but it's easy to miss. When off-route:
- Full-width bright red card at top (not a small banner)
- Dismiss X → keep off-route (user knows what they're doing)
- "Recalculate" button → immediate reroute
- Pulse the border 3 times to draw attention

---

#### Vehicle & Transit UX (9)

**V1 — User dot pinned to bottom-third of screen in vehicle mode**
In vehicle mode, always position the user at 70% screen height (not camera center). Compute:
```ts
const targetScreenY = SH * 0.70;
const offsetM = (SH/2 - targetScreenY) * mpp; // negative = camera behind user
```
Override `netOffsetM` with this computed value. Camera looks further ahead; user dot is consistently in the lower portion, just like Waze.

**V2 — Speed prominently displayed**
Show current speed (`speed * 3.6` km/h) in a large pill at bottom-left (inside `MapFloatingUI`). 28–32 dp font, bold, orange when above nearby street speed. Waze shows speed at all times during vehicle nav.

**V3 — ETA + arrival time always visible**
Bottom banner in vehicle mode should always show:
- Large: time remaining (already in `etaSecs`)  
- Small: arrival clock time (already via `arrivalTime()` in JourneyDetailsSheet)  
- Show both simultaneously, not one or the other

**V4 — Transit leg color on route line**
The route polyline already uses `route_color` for each segment. In vehicle/transit mode, thicken the current active leg to 8 dp (vs 5 dp for past/future). This matches Google Maps' "bold active leg" pattern.

**V5 — Matatu line badge on banner**
In the banner during a transit leg, show the matatu line badge (route short name, route color background) next to the instruction text. Waze shows the route number of the vehicle being ridden. Currently only the text shows — the line color/name is not visible during navigation.

**V6 — Upcoming stop counter badge**
"Next: Kenyatta Ave (3 stops)" — show the next stop name + remaining stops as a subtle row below the main instruction banner during transit legs. The data is already in `stepsLeft` and `lastStopName`. Just needs a UI row.

**V7 — Incident overlay priority during transit**
When a report (accident, police check, road blocked) is within 500 m ahead on the current route segment, auto-expand it as a card that slides up from the bottom. Waze slides in road hazard cards during drive. Currently reports are only visible as tappable map pins — passive discovery, not proactive.

**V8 — Higher zoom-out at speed**
Current zoom formula (`19.0` at low speed → `16.5` at 80 kph) is good but the transition is linear. Use an eased curve (ease-in-out) so fast speed transitions don't snap the zoom visually. Also increase max zoom-out to `15.5` at >100 km/h to match Waze's highway zoom.

**V9 — Boarding animation**
When `tripStatus` transitions from `WAITING_FOR_BUS → IN_TRANSIT`, trigger:
1. Camera zoom-in briefly (19→18→19 over 1s) — visual "we've boarded" feedback
2. Blue pulse ring on the NavIndicator dot
3. Voice: "Boarding now" (already via VoiceGuide if step advances)

---

#### Map Visuals (5)

**MV1 — Night mode: automatic dark map style**
Watch `Appearance.getColorScheme()` and switch between light and dark Mapbox styles for offline tiles. For online mode, switch `customMapStyle` to a dark variant. Currently `dark` offline tiles exist but the online map style is always the same.

**MV2 — Route line above street labels**
Google Maps draws its route line at high z-order so it appears above street-fill but the street name labels remain visible. Adjust `zIndex` on the transit/walk `<Polyline>` components to ensure they render above intersection markers but labels stay legible. React Native Maps supports `zIndex` on `<Polyline>`.

**MV3 — Semi-transparent route trail (traveled portion)**
Past transit legs currently render at 28% opacity. Change to 15% + dashed pattern for traveled walk legs and a thin grey (1 dp) for traveled transit legs. Creates a clear visual distinction between "done" and "upcoming" without cluttering the map.

**MV4 — Animated route draw on journey start**
When a new journey is set, animate the route polyline drawing from origin to destination over 600 ms (stroke-dasharray animation). This is a small delight detail that Google Maps uses on route selection. React Native SVG supports `strokeDasharray` animation via `Animated` or Reanimated.

**MV5 — Speed limit display (if available in GTFS)**
If route data includes speed limit metadata, show a speed limit badge (Waze-style circular sign) in the bottom-left during vehicle nav. Even without metadata, the badge can be shown as blank until data is available.

---

#### Input & Gestures (2)

**IG1 — Double-tap recenter + heading-up**
Single-tap compass = re-center (north-up). Double-tap compass = re-center + toggle heading-up. This mirrors Google Maps exactly and is faster than long-press for users who want heading-up frequently.

**IG2 — Pinch during navigation: temporary zoom without breaking follow**
Currently any gesture sets `followMe = false`. Instead, allow pinch-zoom gestures to change zoom level WITHOUT disabling `followMe`. Only pan/drag gestures should disable follow. Detect gesture type in `onRegionChangeComplete`:

```ts
// map.tsx onRegionChangeComplete:
if (details?.isGesture) {
  const isPinch = Math.abs(newZoom - prevZoom) > 0.3 && 
                  Math.abs(newCenter.lat - prevCenter.lat) < 0.0001;
  if (!isPinch) setFollowMe(false);  // only disable on pan, not pinch
}
```

This lets users zoom in/out to read street names during navigation without losing camera follow.
