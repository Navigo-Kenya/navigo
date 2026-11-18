# Navigation: how it works today, and the plan for every mode

Status: the first half describes the app as of November 2026 (after app #26–#28). The second half is a proposal, not built yet.

Navigation was designed for one case: a passenger walking to a matatu stage, riding, and walking from the last stop. The route planner now also offers car, boda, bicycle, walking-only and (soon) train trips, but navigation still treats all of them as "walk or matatu". This doc records what exists, where it breaks for the new modes, and how to rebuild it as an immersive 3D experience adapted to each mode.

---

## Part 1 — Today

### The pieces

| Piece | File | Role |
|---|---|---|
| Engine | `services/navigationEngine.ts` | Projects each GPS fix onto the route, tracks progress (high-water mark, so it never goes backwards), current step, off-route strikes, dead reckoning when GPS drops. Golden-trace tests are the spec. |
| Session hook | `hooks/useNavigation.ts` | Location subscription (1 s / 3 m in a trip, 10 s / 5 m otherwise), smoothing (EMA), voice cues, alight warnings ("2 stops", "next stop", "now"), wrong-direction detection, boarding detection, reroute, session save/restore, OS geofence backup for the alight stop. |
| Steps | `hooks/useRouteOverlay.ts` | Turns a route's segments into steps (walk sub-steps, "Board 45K at…", ride, alight) and the map overlay. |
| Map + camera | `app/(tabs)/map.tsx` | Follow camera with speed-adaptive zoom and pitch, heading-up / north-up, the 3D bus, the user dot and beam. |
| Puck | `components/map/NavIndicator.tsx`, `user-*` layers in `map.tsx` | Orange dot + direction beam (walking), hidden in vehicle mode. |
| 3D vehicle | `ModelLayer` `nav-model-bus` in `map.tsx`, model `https://files.navigo.co.ke/bus.glb` (1.4 MB) | Shown at the rider's position in vehicle mode. |
| AR | `components/ar/ARWalkView.tsx` | Camera + compass arrow for walking legs (no real AR tracking). |
| Steps UI | `components/app/RouteStepsList.tsx`, `JourneyDetailsSheet.tsx` | Leg-by-leg list, now with matatu traffic notes. |

### Trip states

`WAITING_FOR_BUS` → `IN_TRANSIT` → arrived, with `PAUSED`. Boarding is detected when the rider is more than 40 m from the boarding stop and moving faster than 2.2 m/s (8 km/h), or manually with **I'm on board** (shown within reach of the stop, because GPS boarding detection lags).

### "Vehicle mode" and the 3D bus

```ts
// map.tsx
const isVehicleMode = navigating && (
  (navState?.currentSegmentMode != null && navState.currentSegmentMode !== "WALK")
  || (me?.speed ?? 0) > 4.0
);
```

In vehicle mode the camera pitches to 65°, zooms to ~17.2, follows the course instead of the compass, hides the dot, and draws `bus.glb` at the rider's position, rotated to the course.

### Where it breaks now that we have more modes

| Problem | Effect |
|---|---|
| **Every vehicle is a matatu.** Vehicle mode always draws `bus.glb`. | A car trip, a boda ride, a train and a cyclist all show a bus. |
| **Speed alone triggers vehicle mode** (> 4 m/s = 14.4 km/h). | A cyclist, a jogger downhill, or a GPS jump turns the walker into a bus. |
| **Reroute forgets the mode.** `RouteService.calculateJourney(from, to, maxWalk)` with no mode = transit. | A driver who leaves the route gets a matatu itinerary. |
| **Off-route is ignored on every non-walk leg.** | Fine on a matatu (the driver chooses the road), wrong for car, boda and bicycle: they never reroute. |
| **Wrong-direction check runs only on walk legs.** | Same: no "you passed your turn" for drivers or cyclists. |
| **Instructions are written for passengers.** | A boda passenger needs something to *show the rider* ("Left after Total, then right"), a driver needs lanes and distances, a train passenger needs "next station / platform". |
| **The bus model is downloaded from `files.navigo.co.ke`** (1.4 MB) on first use. | No bus offline or on a slow first load; data cost for riders. |
| **The model is a generic bus**, not a matatu, and not tinted by route colour. | Doesn't feel like Navigo or like Nairobi. |
| **Train legs are timetable-only.** Rail shapes are hand-drawn: 3–13 points for routes up to 431 km (one trip has a proper 2,290-point shape). | A train would cut straight across the map; GPS snapping to a straight line fails. |

---

## Part 2 — The proposal: one navigation, a profile per mode

### Principle

Keep **one** engine and session (they work, and their tests are the spec), and drive everything mode-specific from a **mode profile**: what the puck looks like, how the camera behaves, what counts as off-route, what the instructions say, and when to switch to the next leg. The mode comes from the **planned leg**, confirmed by **detection**, never from speed alone.

```ts
type NavMode = "walk" | "matatu" | "bus" | "train" | "car" | "boda" | "bicycle" | "ferry";

interface ModeProfile {
  puck: { model?: ModelId; tintFromRoute?: boolean; flat?: "dot" | "chevron" };
  camera: { pitch: number; zoom: [min: number, max: number]; follow: "compass" | "course"; lookAheadM: number };
  offRoute: { enabled: boolean; toleranceM: number; reroute: boolean };
  guidance: "turns" | "stops" | "stations" | "show-the-rider";
  wrongWay: boolean;
}
```

### Per mode

| Mode | Puck | Camera | Guidance | Off-route |
|---|---|---|---|---|
| **Walk** | Flat dot + beam (Google does the same: a model hides the junction) | 50° pitch, z 18.5–19, compass heading | Turns with landmarks; AR arrow at junctions | Yes, 25 m, reroute in the *same* mode |
| **Matatu / bus** | 3D **matatu** tinted with the route colour, with the route number on the roof | Chase cam, 60°, z 16–17, look ahead to the next stop | Stops, not turns: "3 stops · alight at Kencom, after Hilton". Traffic note on the leg. Alight cues as today. | No (the driver picks the road). Only "missed your stop" |
| **Train** | 3D **train** (SGR loco + coach, or commuter set) on the rail line | Higher and farther (45°, z 13–15): trains are fast and the view is the line ahead | Next station, platform, minutes to arrival from the timetable; progress keeps moving through GPS gaps | No. Snap to the rail shape |
| **Car** | 3D **car** (user's colour) | Chase cam, 65°, speed-adaptive zoom 15–18 | Turn-by-turn with distances, lane hints, speed limit, live traffic and incident alerts | Yes, 40 m, reroute by car (Valhalla + TomTom) |
| **Boda** | 3D **motorbike with rider** | Like car, slightly closer | "**Show the rider**" card: big arrow + landmark ("Left after Total"), large text, voice optional. Fare range reminder on arrival. | Yes, reroute by motorbike (keeps off the Expressway) |
| **Bicycle** | 3D **bike + rider** | 55°, z 17–18 | Turns, gradient warnings ("steep climb 300 m"), from the elevation we already compute | Yes, reroute by bike |
| **Ferry** (Likoni) | Ferry model | Overview | Departure / crossing time | No |

### Immersive 3D, like Google's new navigation

What makes Google's immersive view feel real is mostly **the world**, not the puck: 3D buildings, landmarks, lighting that matches the hour, lanes at junctions. With Mapbox we can get most of it:

1. **Mapbox Standard style** (`mapbox://styles/mapbox/standard`): 3D buildings, landmark models where Mapbox has them, and `lightPreset` `dawn | day | dusk | night`. Our `@rnmapbox/maps` 10.3.1 has `StyleImport`, so we can set the preset from the Nairobi clock (dusk at ~18:30) and turn POI labels down to show ours. Our custom style (`EXPO_PUBLIC_MAPBOX_STYLE_URL`) would move onto Standard's config (colours, fonts) instead of a separate style.
2. **Terrain** (Mapbox `terrain-dem` source + `setTerrain`): the Ngong Hills, the Rift Valley escarpment on the Nakuru road and the SGR line look real at 45–65° pitch.
3. **Our own landmarks in 3D**: the POIs we already pass in navigation ("after Sarit Centre") get a raised 3D label / billboard as they approach, so the instruction and the city match.
4. **Route as a ribbon**: wider line with a soft glow and chevrons moving in the direction of travel; the next manoeuvre highlighted on the road.
5. **Lanes and junction views for cars**: Valhalla can return lane information for maneuvers; render a lane strip under the next-turn banner. (To verify on Nairobi's OSM data; lane tags are patchy.)

Turn this off automatically on low-end Android phones (a "Simple map" setting, defaulted from `expo-device`'s device year class): 3D buildings and terrain are the heavy part, not the puck.

### Do we build a 3D model per mode?

**Yes, but as one small family, not one-offs.** Recommendation:

- **Six low-poly models in one style** (the same flat, friendly look as our mode icons): matatu, bus/coach, train, car, boda with rider, bicycle with rider (+ ferry later). Walking keeps the flat dot.
- **Small and bundled**: 50–150 KB `.glb` each (Draco-compressed), shipped in the app (`assets/models/`), not downloaded. Today's `bus.glb` alone is 1.4 MB and remote.
- **Tinted, not duplicated**: one matatu model, coloured with `modelColor` / `modelColorMixIntensity` per route (the 45K in its route colour), and the route number as a roof decal or a small floating label. One car model, tinted with the user's chosen colour.
- **Same scale rules for all**: the zoom-keyed `modelScale` curve already tuned for the bus, with a per-model factor.
- **Board / alight transitions**: the ~500 ms crossfade between walk dot and vehicle model already designed in `mobile/docs/3d-vehicle-model.md`.
- **Who makes them**: a 3D artist from one brief (style frame + poly budget + six models) is better than mixing Sketchfab assets of different styles and licences. A Kenyan matatu with graffiti-style livery is a strong brand moment; the brief should ask for that.

One model per mode costs little at runtime: Mapbox renders a `ModelLayer` on the GPU, and only one model is on screen in navigation.

### Accurate detection

Speed alone can't tell a cyclist from a matatu or a stuck matatu from a walker. Use the plan as the prior and confirm it with evidence:

| Signal | Source | Use |
|---|---|---|
| Planned leg mode | the route | The default answer |
| Distance to the boarding / alighting stop | GPS | Boarding allowed only near the stop; alighting near the stop |
| Speed profile (not one sample) | GPS, 10–20 s window | Moving vs stopped; > 25 km/h sustained = not walking or cycling |
| On-route vs off-route geometry | engine projection | Matatu leg: are we on the matatu's road? Train: are we on the rail line? |
| **Activity recognition** | Android Activity Recognition API, iOS Core Motion (`CMMotionActivity`) | Walking / cycling / in vehicle / still, from the phone's motion chip, cheap on battery. Needs a small native module (we already have `modules/` for native code). |
| Steps | pedometer (`expo-sensors`) | Confirms alighting: steps resume after a ride |
| Timetable | GTFS | Trains: expected position when GPS drops |

A small **state machine per leg** (`approaching → waiting → on board → arriving → alighted`) combines these with hysteresis (e.g. "on board" needs in-vehicle activity *or* sustained speed *and* being on the route, for 15 s). The manual **I'm on board** button stays as the override. This also fixes the cyclist-becomes-a-bus problem: on a bicycle leg, speed means cycling.

### Trains (`navigo-otp` and the API)

The data is mostly there: 11 Kenya Railways routes (Madaraka Express day / inter-county / night, Suswa, five Nairobi commuter lines, Nanyuki and Kisumu safari trains), 23 trips, 49 stations. To route on them:

1. **Real rail shapes.** Replace the hand-drawn shapes with the OSM railway lines (`railway=rail`, SGR and metre gauge are both in the Kenya extract): a script that map-matches each shape's stations along the rail network and writes the geometry. Without this the train draws straight lines and GPS snapping fails.
2. **Clean the calendars.** `NCR Ruiru` uses both `weekdays` and `WEEKDAYS`; check every service ID exists in `calendar.txt`.
3. **Trips past midnight.** The night train and the Kisumu safari train arrive at 27:35 and 30:35; departures still ignore the previous day's service for 24:xx times (already in Idea.md).
4. **Export and build.** Rail is in the database but not in the OTP graph: the graph was built from `nairobi-urban.gtfs.zip` (August) with route type 3 only. Export the rail routes (in the same feed or a `kenya-rail` feed), rebuild the graph, check OTP returns SGR itineraries (e.g. Nairobi Terminus → Mombasa Terminus, CBD → Syokimau).
5. **Station access.** SGR terminals are far from town (Syokimau, Miritini): walking legs must use the station entrances, and the commuter link train (NCR Syokimau / SGR Link) should be offered for the transfer. GTFS `pathways` exist in the schema for station layouts.
6. **App:** the planner's rail sub-tab and icons exist (app #23). Navigation needs the train profile above.

### Phases

| Phase | What | Size |
|---|---|---|
| **0. Fixes** | Reroute keeps the trip's mode. Vehicle mode from the leg's mode only (no speed trigger), so cyclists stay cyclists. Off-route + wrong-way for car, boda, bicycle. Until models exist: flat chevron for car / boda / bicycle, bus only for matatu. Bundle `bus.glb` locally. | 1 app PR |
| **1. Mode profiles** | `ModeProfile` table; camera, puck, guidance and off-route read from it. Boda "show the rider" card. Bicycle gradient warnings. | 1–2 app PRs |
| **2. Immersive map** | Mapbox Standard + `lightPreset` by time of day, terrain, route ribbon, 3D landmark labels, "Simple map" fallback on low-end phones. | 1–2 app PRs, design work on the style |
| **3. Models** | Brief → six low-poly models → tinted ModelLayers per mode, board/alight transitions. | Artist work + 1 app PR |
| **4. Detection** | Activity-recognition native module, per-leg state machine, pedometer confirmation. | 1 native module + 1 app PR |
| **5. Trains** | Rail shapes from OSM, calendar fixes, past-midnight trips, export + OTP rebuild, train profile. | api + navigo-otp + app |
| **6. Drivers** | TomTom incident alerts on the remaining route with "reroute?", lane hints, speed limits. | api + app |

Phase 0 is worth doing first regardless of the rest: it fixes real bugs (a driver rerouted onto matatus).

### Open questions

- **Look of the models**: realistic or stylised like our icons? (Recommendation: stylised, matching the icon family.)
- **Who makes them**: commission an artist, or start from licensed assets?
- **Style**: OK to move the map onto Mapbox Standard (our colours re-applied through its config)?
- **Boda**: is the user usually the passenger (show-the-rider card) or sometimes the rider (turn-by-turn)? Possibly both, as a toggle.
