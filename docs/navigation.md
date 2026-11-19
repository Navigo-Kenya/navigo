# Navigation: how it works today, and the plan for every mode

Status: the first half describes the app as of November 2026 (after app #26–#28). The second half is the plan. Built so far: the 3D models, per-mode camera, time-of-day light, terrain and route glow (app #30); Phase 0, turn-by-turn on every street leg, and driver or passenger guidance (see "Driver or passenger").

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

Most of this is fixed now: see the note under the table.

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

Fixed since: every vehicle has its own model, bundled in the app (app #30); vehicle mode comes from the leg only; a reroute replans in the trip's mode and keeps its option (No tolls, Safest, Step-free…); car, boda and bicycle legs reroute and get the wrong-way check; the instructions follow who is in control (below). Still open: matatus aren't tinted in their route's colour yet, and trains have no navigation profile of their own (their lines follow the real track since the API's shape matching).

Two more bugs found and fixed on the way:

- **The banner ran a step behind after the first ride.** The engine counts one step per leg, the step list two per ride (board, alight), and the banner looked one up with the other's index: on the matatu it said "Board Line 45K", on the last walk "Alight at…". Steps now carry their leg (`segIndex`).
- **A reroute could end the trip.** Every new route got the saved session's progress back, measured on the old route. Past the new route's length, the engine "arrived" at once. Saved progress is now applied once, when resuming that session.

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

### Driver or passenger

**Built.** Whether the user controls the vehicle changes what navigation is for. A driver needs turn-by-turn by voice, timed to their speed, with nothing to read at length. A passenger needs to know where they are and when to act: get off, tell the rider where to turn, notice the car is heading the wrong way. `services/navProfile.ts` gives every leg a kind (from the planned mode, never the speed) and a role:

| Leg | Role | Default |
|---|---|---|
| Walk, bicycle | In control | Always |
| Car | Driver or passenger | Driver (`prefs.carRole`) |
| Boda | Passenger or rider | Passenger (`prefs.bodaRole`) |
| Matatu, bus, train, ferry | Passenger | Always |

Car and boda legs show a strip under the banner ("You're driving · I'm a passenger"): one tap switches, and the choice is remembered for the next trip.

| | In control | Passenger |
|---|---|---|
| **Banner** | Big turn arrow, the distance, the instruction with its landmark, "Then:" when the next turn follows within 300 m | Car: "Next: turn left onto Ngong Road", quieter, and the destination. Boda: the rider card |
| **Voice** | Turn cues timed to the mode: on foot at 60 m and 15 m, on a bike at 150 m and 35 m, in a vehicle about 18 s and 5 s ahead (250–800 m and 50–200 m), plus a one-minute warning above 60 km/h. Two close turns are spoken together ("Turn left, then turn right"). "Concise" keeps the turn itself, plus one heads-up on wheels | None for turns: the driver is someone else |
| **Haptics** | On foot and on a bike: two taps for left, one strong for right. A rider (phone in a pocket) too | Boda: two buzzes when a turn is near (time to tap the rider), one at the turn |
| **Off the route** | "Route recalculated", in the same mode | Replans quietly: "Following your driver's way" |
| **Wrong way** | On foot or bike: "Turn around". Driving: "Make a U-turn when it's safe" (6 samples, not 4: a road bends at junctions) | "Heading away from Sarit Centre": the car or boda has carried them 350 m further from the destination within two minutes. Clears once it has been getting closer for 20 s |
| **Camera** | The mode's chase camera | Higher and further back (10° less pitch, 0.7 zoom out): where they're being taken, not the next metres |

**The rider card** (boda passenger): white, high contrast, readable at arm's length in the sun. One big word and where: "Left · after Total", "Roundabout · 2nd exit onto Ngong Road", with the distance and the turn after.

**Turn-by-turn** (`services/maneuvers.ts`): each street leg's manoeuvres (`walk_steps`) are placed along the leg once, in metres from its start (taking the right pass when a route loops past the same corner). The engine's progress then gives the next turn and the distance to it *along the road*. The old banner picked the manoeuvre nearest as the crow flies, and it jumped between turns. Turns count as made a few metres early (6 m on foot, 15 m in a vehicle), because smoothed progress trails the user.

**Rerouting** keeps the trip's mode (`journeyModeOf(route)`) and its preference (`pickReroute`: No tolls, Safest, Flattest, Step-free, Safer streets; "Fastest" and alternatives aren't preferences). At most one reroute every 12 s, because each is a routing call (and TomTom for cars).

### Immersive 3D, like Google's new navigation

What makes Google's immersive view feel real is mostly **the world**, not the puck: 3D buildings, landmarks, lighting that matches the hour, lanes at junctions. With Mapbox we can get most of it:

1. **Mapbox Standard style** (`mapbox://styles/mapbox/standard`): 3D buildings, landmark models where Mapbox has them, and `lightPreset` `dawn | day | dusk | night`. Our `@rnmapbox/maps` 10.3.1 has `StyleImport`, so we can set the preset from the Nairobi clock (dusk at ~18:30) and turn POI labels down to show ours. Our custom style (`EXPO_PUBLIC_MAPBOX_STYLE_URL`) would move onto Standard's config (colours, fonts) instead of a separate style.
2. **Terrain** (Mapbox `terrain-dem` source + `setTerrain`): the Ngong Hills, the Rift Valley escarpment on the Nakuru road and the SGR line look real at 45–65° pitch.
3. **Our own landmarks in 3D**: the POIs we already pass in navigation ("after Sarit Centre") get a raised 3D label / billboard as they approach, so the instruction and the city match.
4. **Route as a ribbon**: wider line with a soft glow and chevrons moving in the direction of travel; the next manoeuvre highlighted on the road.
5. **Lanes and junction views for cars**: Valhalla can return lane information for maneuvers; render a lane strip under the next-turn banner. (To verify on Nairobi's OSM data; lane tags are patchy.)

Turn this off automatically on low-end Android phones (a "Simple map" setting, defaulted from `expo-device`'s device year class): 3D buildings and terrain are the heavy part, not the puck.

### Do we build a 3D model per mode?

**Built (November 2026).** Navigo's own models, generated from code in the
`navigo-models` repo (Blender, headless) and bundled in `assets/models/`. That
covers a matatu, a nganya 33-seater, a car, a boda with rider and passenger, a
bicycle with rider, SGR and commuter trains (drawn car by car along the line), the
Likoni ferry, a plane and the walking marker. They replace the Tokyo `bus.glb`, whose
licence (CC-BY-NC) didn't allow a commercial app.

In the app, `components/map/nav3d.ts` picks the model per leg, keeps it the same
size on screen at every zoom, frames the camera per mode, and sets Mapbox
Standard's light: like the phone by default (light mode: day, dark mode: night),
or from the sun's position (Settings → Map light when navigating: Time of day).
While navigating, `map.tsx` adds terrain and `RouteOverlay` makes the route ahead glow.

Two things learned on the first phone test:

- **Mapbox draws nothing if `model-scale` depends on the zoom and the source is GeoJSON.** The scale is worked out in JS for the current zoom (`modelScaleArr`) and passed as a plain value.
- **The models are copied to local files before Mapbox gets them** (`useModelUris`, expo-asset). The bundled asset's own URL fails in several cases: Android drops the dev server URL's query, iOS keeps it when there's no port, and an Android release build gives a resource name.

The original recommendation, kept for reference:

- **Six low-poly models in one style** (the same flat, friendly look as our mode icons): matatu, bus/coach, train, car, boda with rider, bicycle with rider (+ ferry later). Walking keeps the flat dot.
- **Small and bundled**: 50–150 KB `.glb` each (Draco-compressed), shipped in the app (`assets/models/`), not downloaded. Today's `bus.glb` alone is 1.4 MB and remote.
- **Tinted, not duplicated**: one matatu model, coloured with `modelColor` / `modelColorMixIntensity` per route (the 45K in its route colour), and the route number as a roof decal or a small floating label. One car model, tinted with the user's chosen colour.
- **Same scale rules for all**: the zoom-keyed `modelScale` curve already tuned for the bus, with a per-model factor.
- **Board / alight transitions**: the ~500 ms crossfade between walk dot and vehicle model already designed in `mobile/docs/3d-vehicle-model.md`.
- **Who makes them**: a 3D artist from one brief (style frame + poly budget + six models) is better than mixing Sketchfab assets of different styles and licences. A Kenyan matatu with graffiti-style livery is a strong brand moment; the brief should ask for that.

One model per mode costs little at runtime: Mapbox renders a `ModelLayer` on the GPU, and only one model is on screen in navigation.

### Accurate detection

**Built, from GPS and the route (`services/legPhase.ts`).** Navigation tracks which part of the trip the user is in, its *phase*:

| Phase | Means | Map |
|---|---|---|
| `walk` | On foot | Walking marker |
| `wait` | At the stage, waiting for the ride | Walking marker, "Wait for the 45K · At Kencom · next in 4 min", **I'm on board** |
| `ride` | On board a matatu, bus or train | The vehicle, stops and alight cues, **I got off** near the stop |
| `pickup` | Waiting for a boda or a taxi | Walking marker. Boda: the rider card shows the destination and the usual fare. **We're off** |
| `go` | Moving in a car, on a bike, on the boda | The vehicle, turn-by-turn per role |

A leg starts in the phase its plan implies: a ride starts in `wait`, a car you drive in `go`, a boda you're a passenger on in `pickup`. Riding carries over a leg change. The phase then moves only on evidence, judged over a 12 s window of 1 Hz fixes and held for a few seconds, never on one reading:

| Change | Conditions (all of them) |
|---|---|
| **Vehicle motion** (used below) | Median speed ≥ 4.5 m/s (16 km/h, faster than anyone runs for 12 s), or ≥ 2.5 m/s with a burst ≥ 6 m/s (crawling traffic). ≥ 80% of fixes within 35 m of the line. Course within 60° of the line's direction |
| `walk` → `wait` | Next leg is a ride. Within 40 m of its stop. Median speed ≤ 1.5 m/s for 5 s |
| `wait` → `ride` | Vehicle motion for 8 s, and 60 m from where they waited |
| `walk` → `ride` | Next leg is a ride. Vehicle motion along the walk for 10 s (boarded at an earlier stage on the same road) |
| `ride` → `walk` | Within 80 m of the alight stop (or at the leg's end), and median speed ≤ 1.8 m/s for 8 s, or walking away from the line (30 m) |
| `ride` → `wait` | A false start: within 150 m of the boarding stop, under 100 m along, slow for 60 s |
| Missed stop | Still in vehicle motion 250 m past the alight stop: "You've passed Kencom. Get off at the next stop", once |
| `pickup` → `go` | Median speed ≥ 4 m/s for 6 s (the rider picks the road, so no line condition) |

What doesn't fool it (each is a test): a jogger at 3 m/s, a single 15 m/s GPS spike, a matatu standing in a jam for 5 minutes (stays on board), stopping at a red light 200 m before the stage, a vehicle on another road or going the other way.

**The user has the last word.** Each automatic change is announced ("On board the 45K. I'll tell you when to get off.") and shown under the banner with **Undo** for 15 s. Undoing "Off at Kencom" puts the trip back on the ride where it was. Each change can also be made by hand, which is final: **I'm on board** (near the stop or while waiting), **I got off** (within 400 m of the alight stop), **We're off** (waiting for a boda or a taxi).

**Smoother:**
- The walking marker and the vehicle crossfade (600 ms) when boarding or getting off.
- The camera eases from the walking view to the vehicle's.
- While waiting at the stage, the walk's guidance stops: no reroute or "wrong way" while standing.
- Boarded early, the walk to the stage no longer applies.
- Moving like a vehicle on a walk (a lift, a boda after all), navigation doesn't replan a walk.

**Still to add**, as the table below plans: the phone's own activity recognition (a native module) and the step counter. They would make the same decisions faster and in more places (an underground platform, a jam with GPS gone), without changing the phases.

The original plan, kept for reference: use the plan as the prior and confirm it with evidence:

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
| **0. Fixes** | **Built.** Reroute keeps the trip's mode. Vehicle mode from the leg's mode only (no speed trigger), so cyclists stay cyclists. Off-route + wrong-way for car, boda, bicycle. The models are bundled. | 1 app PR |
| **1. Mode profiles** | **Built,** as `LegProfile` (`services/navProfile.ts`), with the driver or passenger role: turn-by-turn, the boda "show the rider" card, passenger alerts. Still to do: bicycle gradient warnings. | 1–2 app PRs |
| **2. Immersive map** | Mapbox Standard + `lightPreset` by time of day, terrain, route ribbon, 3D landmark labels, "Simple map" fallback on low-end phones. | 1–2 app PRs, design work on the style |
| **3. Models** | Brief → six low-poly models → tinted ModelLayers per mode, board/alight transitions. | Artist work + 1 app PR |
| **4. Detection** | **Built from GPS and the route:** the phase tracker above, with Undo and manual overrides. Still to do: the activity-recognition native module and the step counter. | 1 native module + 1 app PR |
| **5. Trains** | Rail shapes from OSM, calendar fixes, past-midnight trips, export + OTP rebuild, train profile. | api + navigo-otp + app |
| **6. Drivers** | TomTom incident alerts on the remaining route with "reroute?", lane hints, speed limits. | api + app |

Phase 0 is worth doing first regardless of the rest: it fixes real bugs (a driver rerouted onto matatus).

### Open questions

- **Look of the models**: realistic or stylised like our icons? (Recommendation: stylised, matching the icon family.)
- **Who makes them**: commission an artist, or start from licensed assets?
- **Style**: OK to move the map onto Mapbox Standard (our colours re-applied through its config)?
- **Boda**: is the user usually the passenger (show-the-rider card) or sometimes the rider (turn-by-turn)? Possibly both, as a toggle.
